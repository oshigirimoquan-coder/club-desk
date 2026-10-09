// 公告與行程異動通知
// body: { type: "announcement", id } | { type: "event", id?, change: "created"|"updated"|"deleted", title?, starts_at? }
// 管道由 settings.notify.channel 決定，目前只做了 "discord"（"email" 留給需要的社團自己接）
// Discord webhook 存在 private_settings.discord = { announce, officers, sections: { 組名: url }, channels: { 公告分類: url } }
import { admin, callerIs, cors, discord, json, kindsOf, kindText, officerOnly, twTime } from "../_shared/common.ts";

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
