// notify：自動產生的單檔版本（來源 supabase/functions/notify），請勿直接修改
// 共用工具：CORS、身分檢查、Google 存取權杖、Discord 發文
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export const admin = (): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// 以呼叫者身分檢查角色（is_officer / is_admin）
export async function callerIs(req: Request, fn: "is_officer" | "is_admin"): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  if (!auth) return false;
  const c = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data } = await c.rpc(fn);
  return data === true;
}

// ---------- Google 服務帳戶 → 存取權杖 ----------
let cached: { token: string; exp: number } | null = null;
const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b as ArrayBuffer);
  let s = ""; bytes.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export async function googleToken(): Promise<string> {
  if (cached && cached.exp > Date.now() / 1000 + 60) return cached.token;
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT");
  if (!raw) throw new Error("尚未設定 GOOGLE_SERVICE_ACCOUNT");
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${head}.${claim}.${b64url(sig)}`,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("Google 授權失敗：" + JSON.stringify(j));
  cached = { token: j.access_token, exp: now + j.expires_in };
  return j.access_token;
}

export async function gcal(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: { Authorization: `Bearer ${await googleToken()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const j = await res.json().catch(() => null);
  if (!res.ok && !(method === "DELETE" && res.status === 410)) {
    throw new Error(`Google Calendar ${method} ${path}: ${res.status} ${JSON.stringify(j)}`);
  }
  return j;
}

// ---------- Discord ----------
export async function discord(url: string | undefined, content: string, mention: { users?: string[]; roles?: string[] } = {}) {
  if (!url) return false;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: content.slice(0, 1990), allowed_mentions: { parse: [], users: mention.users ?? [], roles: mention.roles ?? [] } }),
  });
  return res.ok;
}

// 行程類型（與 js/logic.js 的 KIND_LABEL 一致）
export const KIND: Record<string, string> = {
  regular: "例行聚會", sectional: "分組活動", class: "教學班", extra: "加開", event: "大型活動", officer: "幹部會議", other: "其他",
};

// 複選類型：例行聚會・大型活動；只有幹部會議時才算幹部行程
export const kindsOf = (e: any): string[] => (e.kinds?.length ? e.kinds : [e.kind]);
export const kindText = (e: any) => kindsOf(e).map((k) => KIND[k] ?? "活動").join("・");
export const officerOnly = (e: any) => kindsOf(e).every((k) => k === "officer");

export const twTime = (iso: string) =>
  new Date(iso).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });

// 公告與行程異動通知
// body: { type: "announcement", id } | { type: "event", id?, change: "created"|"updated"|"deleted", title?, starts_at? }
// 管道由 settings.notify.channel 決定，目前只做了 "discord"（"email" 留給需要的社團自己接）
// Discord webhook 存在 private_settings.discord = { announce, officers, sections: { 組名: url }, channels: { 公告分類: url } }

const SITE = Deno.env.get("SITE_URL") ?? "";
// 公告分類（與 js/views/announcements.js 的 CATS 一致）
const CH: Record<string, string> = { general: "公告", activity: "活動", class: "教學班", alumni: "校友", share: "分享", resources: "資源" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!(await callerIs(req, "is_officer"))) return json({ error: "只有幹部可以發送通知" }, 403);
    const body = await req.json();
    const db = admin();
    const { data: s } = await db.from("settings").select("value").eq("key", "notify").single();
    const channel: string = s?.value?.channel ?? "discord";
    const { data: d } = await db.from("private_settings").select("value").eq("key", "discord").maybeSingle();
    const hooks = d?.value ?? {};
    const sent: string[] = [];

    if (body.type === "announcement") {
      const { data: a } = await db.from("announcements").select("*").eq("id", body.id).single();
      if (!a) return json({ error: "找不到公告" }, 404);
      const url = a.audience === "officers" ? hooks.officers
        : a.audience === "section" ? (hooks.sections?.[a.section] ?? hooks.announce)
        : (hooks.channels?.[a.channel] ?? hooks.announce);
      const head = `**【${CH[a.channel] ?? "公告"}】**`;
      const where = a.channel === "share" ? [a.event_at ? `🗓 ${twTime(a.event_at)}` : "", a.venue ? `📍 ${a.venue}` : "", a.link].filter(Boolean).join("　") : (a.link || "");
      const page = "announcements";
      const text = `${head} ${a.title}${where ? `\n${where}` : ""}\n${a.body}${SITE ? `\n\n${SITE}#/${page}` : ""}`;
      if (channel === "discord" || channel === "both") {
        // 標記：被點名的人用 Discord ID @
        const users: string[] = [];
        if (a.mentions?.length) {
          const { data: ids } = await db.rpc("discord_ids", { uids: a.mentions });
          for (const r of ids ?? []) users.push(r.discord_id);
        }
        const ping = users.map((u) => `<@${u}>`).join(" ");
        if (await discord(url, ping ? `${ping}\n${text}` : text, { users })) sent.push("discord");
      }
      if (channel === "email" || channel === "both") {
        // 需要 Email 通知的社團：在這裡接上寄信服務（Gmail API 或 SMTP），金鑰放 Supabase Secrets
      }
      return json({ ok: true, sent });
    }

    if (body.type === "event") {
      let ev = body;
      if (body.id && body.change !== "deleted") {
        const { data } = await db.from("events").select("*").eq("id", body.id).single();
        if (data) ev = { ...data, change: body.change };
      }
      const verb = body.change === "created" ? "新增行程" : body.change === "deleted" ? "取消行程" : "行程異動";
      const text = `**【${verb}】** [${kindText(ev)}] ${ev.title}\n🕖 ${twTime(ev.starts_at)}${ev.location ? `　📍 ${ev.location}` : ""}${SITE && ev.id && body.change !== "deleted" ? `\n${SITE}#/events/${ev.id}` : ""}`;
      const url = officerOnly(ev) ? hooks.officers : kindsOf(ev).includes("sectional") && kindsOf(ev).length === 1 ? (hooks.sections?.[ev.section] ?? hooks.announce) : hooks.announce;
      if ((channel === "discord" || channel === "both") && await discord(url, text)) sent.push("discord");
      return json({ ok: true, sent });
    }

    return json({ error: "未知的通知類型" }, 400);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
