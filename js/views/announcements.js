import { sb, state, me, route, esc, run, formDialog, pageHead, empty, chipPerson, fmtDate, fmtTime, render, $, $$, toast, activePeople, nameOf } from '../core.js';
import { SECTIONS, ANN_AUDIENCE, twParts, twWeekday, twToIso } from '../logic.js';
import { invokeFn } from './events.js';

// 公告分類（存在 announcements.channel，要與 schema.sql 的約束一致）。open = 所有成員都能發（只能改自己的）
export const CATS = {
  general: { label: '一般' },
  activity: { label: '活動' },
  class: { label: '教學班' },
  alumni: { label: '校友' },
  share: { label: '分享', open: true },
  resources: { label: '資源', open: true },
};
const catOf = (a) => (CATS[a.channel] ? a.channel : 'general');
export const catLabel = (a) => CATS[catOf(a)]?.label || '公告';
// 不算「公告」的分享類（首頁最新公告、未讀紅點不算它們）
export const SHARE_CATS = Object.keys(CATS).filter((k) => CATS[k].open);

const AUDIENCE = ANN_AUDIENCE;
const DEFAULT_AUD = { class: 'newbies' };

const canEdit = (a) => state.p.officer || (CATS[catOf(a)]?.open && a?.author === me());
const postable = () => Object.keys(CATS).filter((k) => state.p.officer || (CATS[k].open && state.p.insider));

async function editAnn(a = null, preset = '') {
  const officer = state.p.officer;
  const cats = postable();
  const cat0 = a ? catOf(a) : (cats.includes(preset) ? preset : cats[0]);
  const ev = a?.event_at ? twParts(a.event_at) : null;
  const people = activePeople().sort((x, y) => nameOf(x.id).localeCompare(nameOf(y.id)));
  const officerOnly = Object.keys(CATS).filter((k) => !CATS[k].open);
  const fields = [
    { name: 'cat', label: '類型', type: 'select', value: cat0, options: cats.map((k) => [k, CATS[k].label]) },
  ];
  if (officer) fields.push(
    { name: 'audience', label: '對象', type: 'select', value: a?.audience || DEFAULT_AUD[cat0] || 'insiders', options: Object.entries(AUDIENCE), only: officerOnly },
    { name: 'section', label: '組別', type: 'select', value: a?.section || '', options: [['', '（對象選「某一組」時才需要）'], ...SECTIONS.map((s) => [s, s])], only: officerOnly },
  );
  fields.push(
    { name: 'title', label: '標題', required: true, value: a?.title, full: true },
    { name: 'date', label: '活動日期（選填）', type: 'date', value: ev?.date || '', only: ['share'] },
    { name: 'time', label: '時間', type: 'time', value: ev?.time || '19:00', only: ['share'] },
    { name: 'venue', label: '地點', value: a?.venue, placeholder: '例：學生活動中心、線上', only: ['share'] },
    { name: 'link', label: '連結', type: 'url', value: a?.link, placeholder: 'https://（報名頁、影片、教學…）', only: ['share', 'resources'], full: true },
    { name: 'body', label: '內容', type: 'textarea', rows: 5, value: a?.body, full: true },
  );
  if (officer) fields.push(
    { name: 'mentions', label: '另外標記這些人（選填）', type: 'checks', full: true, value: a?.mentions || [], only: officerOnly,
      options: people.map((p) => [p.id, nameOf(p.id)]), hint: '被標記的人會在首頁看到提醒，DC 通知也會 @ 他。' },
    { name: 'pinned', label: '置頂', type: 'toggle', text: '置頂', value: a?.pinned },
    { name: 'notify', label: '通知', type: 'toggle', text: '同步發送到 DC', value: !a },
  );
  const v = await formDialog({
    title: a ? '編輯' : '發布', danger: a ? '刪除' : null, submit: a ? '儲存' : '發布', fields, switchBy: 'cat',
    onChange: (name, value, d) => { if (name === 'cat' && DEFAULT_AUD[value] && d.querySelector('[name=audience]')) d.querySelector('[name=audience]').value = DEFAULT_AUD[value]; },
  });
  if (!v) return;
  if (v.__danger) { await run(() => sb.from('announcements').delete().eq('id', a.id), '已刪除'); return render(); }
  const open = CATS[v.cat].open;
  const aud = open || !officer ? 'insiders' : v.audience;
  if (aud === 'section' && !v.section) return toast('對象是「某一組」時要選組別', 'bad');
  const row = {
    channel: v.cat, title: v.title, body: v.body, pinned: officer ? v.pinned : false,
    audience: aud, section: aud === 'section' ? v.section : null,
    mentions: officer && !open ? v.mentions : [],
    link: ['share', 'resources'].includes(v.cat) ? v.link : '',
    venue: v.cat === 'share' ? v.venue : '', event_at: v.cat === 'share' && v.date ? twToIso(v.date, v.time || '00:00') : null,
  };
  const r = await run(() => a ? sb.from('announcements').update(row).eq('id', a.id).select().single() : sb.from('announcements').insert(row).select().single(), a ? '已更新' : '已發布');
  if (r && officer && v.notify) await invokeFn('notify', { type: 'announcement', id: r.data.id }).catch((e) => toast('已發布，但通知沒送出：' + e.message, 'bad'));
  render();
}

function postItem(a, read) {
  const cat = catOf(a);
  const edit = canEdit(a) ? `<button class="btn sm ghost" data-edit-ann="${a.id}">編輯</button>` : '';
  if (cat === 'share' && a.event_at) {
    const t = a.event_at ? twParts(a.event_at) : null;
    return `<article class="ann dated ${read.has(a.id) ? '' : 'unread'}">
      <div class="ev-date">${t ? `<b>${t.month}/${t.day}</b><span>週${twWeekday(a.event_at)}</span>` : '<b>—</b>'}</div>
      <div><div class="ann-head"><span class="atype c-share">分享</span>${a.pinned ? '<span class="chip gold">置頂</span>' : ''}${edit}</div>
        <h3>${esc(a.title)}</h3>
        <p class="meta-line">${t ? `<span class="mono">${t.time}</span>` : ''}${a.venue ? `　${esc(a.venue)}` : ''}${a.link ? `　<a href="${esc(a.link)}" target="_blank" rel="noopener">詳情 →</a>` : ''}</p>
        ${a.body ? `<p class="body">${esc(a.body)}</p>` : ''}
        <div class="meta">${a.author ? `<span class="small muted">分享者</span>${chipPerson(a.author)}` : ''}</div></div></article>`;
  }
  const tagged = (a.mentions || []).includes(me());
  const audChip = a.audience && !['insiders'].includes(a.audience) && !CATS[cat]?.open
    ? `<span class="chip">${a.audience === 'section' ? esc(a.section) + '組' : AUDIENCE[a.audience]}</span>` : '';
  return `<article class="ann c-${cat} ${read.has(a.id) ? '' : 'unread'} ${tagged ? 'tagged' : ''}">
    <div class="ann-head"><span class="atype c-${cat}">${catLabel(a)}</span>${a.pinned ? '<span class="chip gold">置頂</span>' : ''}${audChip}${edit}</div>
    <h3>${esc(a.title)}</h3>${a.body ? `<p class="body">${esc(a.body)}</p>` : ''}
    ${a.link ? `<p class="meta-line"><a href="${esc(a.link)}" target="_blank" rel="noopener">開啟連結 →</a></p>` : ''}
    ${mentionLine(a)}
    <div class="meta">${a.author ? chipPerson(a.author) : ''}<span class="mono small muted">${fmtDate(a.created_at)} ${fmtTime(a.created_at)}</span></div></article>`;
}

export function mentionLine(a) {
  const ids = a.mentions || [];
  if (!ids.length) return '';
  return `<p class="mentions">${ids.map((id) => `<span class="at ${id === me() ? 'me' : ''}">@${esc(nameOf(id))}</span>`).join('')}</p>`;
}

async function annPage() {
  const f = CATS[sessionStorage.getItem('af')] ? sessionStorage.getItem('af') : '';
  const [{ data }, { data: reads }] = await Promise.all([
    sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(200),
    sb.from('announcement_reads').select('ann_id').eq('user_id', me()),
  ]);
  const read = new Set((reads || []).map((r) => r.ann_id));
  let list = (data || []).filter((a) => !f || catOf(a) === f);
  const unread = list.filter((a) => !read.has(a.id));
  if (unread.length) sb.from('announcement_reads').upsert(unread.map((a) => ({ ann_id: a.id, user_id: me() }))).then(() => document.dispatchEvent(new Event('unread-changed')));
  setTimeout(() => {
    $('#add-ann')?.addEventListener('click', () => editAnn(null, f));
    $$('[data-edit-ann]').forEach((b) => (b.onclick = () => editAnn(list.find((x) => x.id === b.dataset.editAnn))));
    $$('[data-af]').forEach((b) => (b.onclick = () => { sessionStorage.setItem('af', b.dataset.af); render(); }));
    $('#past-toggle')?.addEventListener('click', () => { sessionStorage.setItem('cpast', sessionStorage.getItem('cpast') === '1' ? '0' : '1'); render(); });
  });
  const canAdd = postable().length > 0;
  const addLabel = state.p.officer ? '發布' : '分享活動或資源';
  const head = pageHead('公告', f === 'share' ? '看到不錯的活動、講座或比賽，分享給大家。' : f === 'resources' ? '好用的影片、文章、教學連結，大家都能分享。' : '',
    canAdd ? `<button class="btn pri" id="add-ann">＋ ${addLabel}</button>` : '');
  const seg = `<div class="seg wrap"><button data-af="" aria-pressed="${!f}">全部</button>${Object.entries(CATS).map(([k, c]) => `<button data-af="${k}" aria-pressed="${f === k}">${c.label}</button>`).join('')}</div>`;
  const listHtml = (l) => `<div class="ann-list">${l.map((a) => postItem(a, read)).join('')}</div>`;

  if (f === 'share') {
    const now = Date.now();
    const up = list.filter((a) => !a.event_at || new Date(a.event_at) >= now - 864e5).sort((a, b) => (b.pinned - a.pinned) || ((a.event_at || '9') > (b.event_at || '9') ? 1 : -1));
    const past = list.filter((a) => a.event_at && new Date(a.event_at) < now - 864e5).sort((a, b) => (a.event_at < b.event_at ? 1 : -1));
    const showPast = sessionStorage.getItem('cpast') === '1';
    return head + seg + (up.length ? listHtml(up) : empty('最近沒有人分享活動', '看到不錯的活動就按上面的按鈕，大家可以一起去。')) +
      (past.length ? `<div class="row-end" style="margin-top:16px"><button class="btn sm ghost" id="past-toggle">${showPast ? '收起' : '看'}已結束的 ${past.length} 場</button></div>${showPast ? listHtml(past) : ''}` : '');
  }
  list = list.sort((a, b) => (b.pinned - a.pinned) || (b.created_at > a.created_at ? 1 : -1));
  return head + seg + (list.length ? listHtml(list) : empty(f ? `目前沒有「${CATS[f].label}」的公告` : '目前沒有公告', canAdd ? '按右上角的按鈕發布。' : ''));
}

route('/announcements', annPage);
// 分類捷徑網址（DC 通知裡的連結會用）：直接打開對應分類
for (const k of Object.keys(CATS)) route('/' + k, () => { sessionStorage.setItem('af', k); return annPage(); });
