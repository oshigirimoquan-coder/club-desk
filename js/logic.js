// 純邏輯（沒有畫面、沒有網路），可以單獨測試
export const TZ = 'Asia/Taipei';
// 組別：改這裡時，supabase/schema.sql 的 section_list() 也要一起改
export const SECTIONS = ['第一組', '第二組', '第三組'];
export const ROLE_LABEL = {
  admin: '管理員', officer: '幹部', leader: '組長', member: '社員', newbie: '新生', teacher: '指導老師', alumni: '校友',
};
// 行程類型：改這裡時，supabase/schema.sql 的 events.kind／kinds 約束與 is_expected 也要一起改
export const KIND_LABEL = {
  regular: '例行聚會', sectional: '分組活動', class: '教學班', extra: '加開', event: '大型活動', officer: '幹部會議', other: '其他',
};
export const ATT_LABEL = { present: '出席', late: '晚到', early: '早退', absent: '缺席', excused: '請假', na: '免出席' };
export const LEAVE_LABEL = { leave: '請假', late: '晚到', early: '早退' };
export const ANN_AUDIENCE = { insiders: '全體成員', section: '某一組', officers: '幹部', newbies: '新生' };

// 依身分組判斷權限（與資料庫規則一致，資料庫才是最終把關）
const INSIDER = ['admin', 'officer', 'leader', 'member', 'newbie', 'teacher', 'alumni'];
const COUNTED = ['admin', 'officer', 'leader', 'member', 'newbie'];   // 列入出席率（與 SQL is_counted 一致）
export function perms(roles, active = true) {
  const r = new Set(active ? roles : []);
  const admin = r.has('admin');
  const officer = admin || r.has('officer');
  return {
    admin, officer,
    insider: INSIDER.some((x) => r.has(x)),
    counted: COUNTED.some((x) => r.has(x)),
    staff: officer || r.has('teacher'),
    leader: r.has('leader'),
    newbie: r.has('newbie'),
    canTeach: officer || r.has('teacher') || r.has('leader'),
  };
}

// 每個組別一本行事曆，key 固定是 sec:<組名>（與 schema.sql 的 calendars 種子資料一致）
export const sectionCalendarKey = (section) => 'sec:' + section;

// 行程類型 → 預設行事曆與對象
export function eventDefaults(kind, section) {
  if (kind === 'sectional') return { calendar_key: SECTIONS.includes(section) ? sectionCalendarKey(section) : 'main', audience: 'insiders' };
  if (kind === 'class') return { calendar_key: 'class', audience: 'insiders' };
  if (kind === 'officer') return { calendar_key: 'officers', audience: 'officers', counts_attendance: false };
  return { calendar_key: 'main', audience: 'insiders' };
}

// 某人該加哪幾本行事曆
export function calendarsFor(calendars, p, section) {
  return calendars.filter((c) => {
    if (!c.gcal_id) return false;
    if (c.audience === 'officers') return p.officer;
    if (c.audience === 'section') return p.officer || c.section === section;
    if (c.audience === 'class') return p.newbie || p.canTeach;
    return true;
  });
}

// 出席率顯示等級
export function rateLevel(rate) {
  if (rate == null) return 'none';
  if (rate >= 80) return 'ok';
  if (rate >= 50) return 'warn';
  return 'bad';
}

// 把 Date 轉成台北時區的 yyyy-mm-dd 與 HH:MM
export function twParts(d) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' });
  const o = Object.fromEntries(f.formatToParts(new Date(d)).map((x) => [x.type, x.value]));
  return { date: `${o.year}-${o.month}-${o.day}`, time: `${o.hour === '24' ? '00' : o.hour}:${o.minute}`, month: +o.month, day: +o.day };
}
const WK = '日一二三四五六';
export function twWeekday(d) {
  const { date } = twParts(d);
  return WK[new Date(date + 'T12:00:00Z').getUTCDay()];
}
// 台北時間的日期＋時間 → ISO（UTC）
export function twToIso(date, time) {
  return new Date(`${date}T${time || '00:00'}:00+08:00`).toISOString();
}
// 距今天幾天（台北日期）
export function daysFromToday(d, now = new Date()) {
  const a = new Date(twParts(d).date + 'T00:00:00Z');
  const b = new Date(twParts(now).date + 'T00:00:00Z');
  return Math.round((a - b) / 864e5);
}

// 點名時的預設狀態：有請假就帶入請假類型
export function defaultRollStatus(row) {
  if (row.status) return row.status;
  if (row.leave_type === 'leave') return 'excused';
  if (row.leave_type === 'late') return 'late';
  if (row.leave_type === 'early') return 'early';
  return null;
}

// 教學班進度百分比
export function progressPct(doneCount, total) {
  if (!total) return 0;
  return Math.round((doneCount / total) * 100);
}

// 備份提醒：上次備份超過 60 天；從沒備份過的話，學期開始滿 30 天才提醒
export function backupDue(lastIso, semesterStart, now = new Date()) {
  const days = (d) => (now - new Date(d)) / 864e5;
  if (lastIso) return days(lastIso) > 60;
  if (!semesterStart) return false;
  return days(semesterStart + 'T00:00:00+08:00') >= 30;
}

// 轉成 Excel 打得開的 CSV（開頭加 BOM，中文才不會亂碼）
export function toCSV(rows) {
  const cell = (v) => {
    const s = v == null ? '' : Array.isArray(v) ? v.join('、') : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

// 行程類型顯示文字（可複選，例：例行聚會・大型活動）
export function kindsLabel(e) {
  const ks = e.kinds?.length ? e.kinds : [e.kind];
  return ks.map((k) => KIND_LABEL[k] || k).join('・');
}

// 複選類型 → 主要類型（照 KIND_LABEL 的順序取第一個）、行事曆、可見對象、預設是否計出席
export function kindsDefaults(kinds, section) {
  const order = Object.keys(KIND_LABEL);
  const ks = [...kinds].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const kind = ks[0];
  const onlyOfficer = ks.every((k) => k === 'officer');
  return {
    kind,
    calendar_key: eventDefaults(kind, section).calendar_key,
    audience: onlyOfficer ? 'officers' : 'insiders',
    counts: !onlyOfficer,
  };
}

// 外部連結只接受 http(s)，避免 javascript: 之類的網址
export const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');

// 表單狀態：沒有截止日一直開放；截止日當天到 3 天前是「快截止」；過了截止日是「已截止」
export function formStatus(form, now = new Date()) {
  if (!form.due) return 'open';
  const d = daysFromToday(form.due + 'T12:00:00+08:00', now);
  if (d < 0) return 'closed';
  return d <= 3 ? 'closing' : 'open';
}

// 頁面隱藏：管理員在設定頁勾掉的頁面。這幾頁不能隱藏，否則會把自己鎖在外面
export const ALWAYS_SHOWN = ['/', '/settings', '/me'];
const hiddenSet = (hidden) => new Set((hidden || []).filter((h) => !ALWAYS_SHOWN.includes(h)));
export function visibleNav(nav, p, hidden = []) {
  const h = hiddenSet(hidden);
  return nav.filter((n) => (!n.show || n.show(p)) && !h.has(n.path));
}
// 被隱藏的頁面一般成員不能進（直接打網址也一樣）；管理員可以進去檢查
export function pageAllowed(path, p, hidden = []) {
  if (p.admin) return true;
  for (const h of hiddenSet(hidden)) if (path === h || path.startsWith(h + '/')) return false;
  return true;
}
