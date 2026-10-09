// 表單：幹部貼上 Google 表單的連結，成員點了開新分頁去填；回覆留在 Google 表單／試算表
import { sb, state, route, esc, run, toast, formDialog, pageHead, empty, render, $, $$ } from '../core.js';
import { safeUrl, formStatus, daysFromToday } from '../logic.js';

const ST = { open: '', closing: '快截止', closed: '已截止' };

async function editForm(f = null) {
  const v = await formDialog({
    title: f ? '編輯表單' : '新增表單', danger: f ? '刪除' : null,
    fields: [
      { name: 'title', label: '名稱', required: true, value: f?.title, full: true, placeholder: '例：期末成發報名、社服尺寸調查' },
      { name: 'url', label: '表單網址', type: 'url', required: true, value: f?.url, full: true, placeholder: 'https://forms.gle/…',
        hint: '在 Google 表單按「傳送」→ 連結圖示，複製網址貼到這裡。' },
      { name: 'description', label: '說明（選填）', type: 'textarea', rows: 3, value: f?.description, full: true },
      { name: 'due', label: '截止日（選填）', type: 'date', value: f?.due || '' },
    ],
  });
  if (!v) return;
  if (v.__danger) { await run(() => sb.from('forms').delete().eq('id', f.id), '已刪除'); return render(); }
  if (!safeUrl(v.url)) return toast('網址要以 https:// 開頭', 'bad');
  const row = { title: v.title, url: v.url, description: v.description, due: v.due || null };
  await run(() => (f ? sb.from('forms').update(row).eq('id', f.id) : sb.from('forms').insert(row)), '已儲存');
  render();
}

function dueText(f) {
  if (!f.due) return '';
  const d = daysFromToday(f.due + 'T12:00:00+08:00');
  const [, m, day] = f.due.split('-');
  return d < 0 ? `${+m}/${+day} 截止` : d === 0 ? '今天截止' : `${+m}/${+day} 截止・還有 ${d} 天`;
}

route('/forms', async () => {
  const p = state.p;
  const { data } = await sb.from('forms').select('*').order('created_at', { ascending: false });
  const list = (data || []).map((f) => ({ ...f, st: formStatus(f) }));
  const open = list.filter((f) => f.st !== 'closed').sort((a, b) => (a.due || '9') > (b.due || '9') ? 1 : -1);
  const closed = list.filter((f) => f.st === 'closed');
  setTimeout(() => {
    $('#add-form')?.addEventListener('click', () => editForm());
    $$('[data-form-edit]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); editForm(list.find((f) => f.id === b.dataset.formEdit)); }));
  });
  const card = (f) => `<a class="tool form-${f.st}" href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer">
    <h3>${esc(f.title)}${ST[f.st] ? ` <span class="chip ${f.st === 'closing' ? 'warn' : ''}">${ST[f.st]}</span>` : ''}</h3>
    ${f.description ? `<p class="small muted">${esc(f.description)}</p>` : ''}
    <span class="go">${f.due ? `<span class="mono small">${dueText(f)}</span>　` : ''}填寫 ↗</span>
    ${p.officer ? `<button class="btn sm ghost" data-form-edit="${f.id}">編輯</button>` : ''}</a>`;
  return pageHead('表單', '報名、調查、意見回饋。點了會開新分頁到 Google 表單填寫。', p.officer ? '<button class="btn pri" id="add-form">＋ 新增表單</button>' : '') +
    (open.length ? `<div class="tool-grid">${open.map(card).join('')}</div>` : empty('目前沒有要填的表單', p.officer ? '在 Google 表單建好後，按「新增表單」把連結貼上來。' : '幹部新增後會出現在這裡。')) +
    (closed.length ? `<h2 class="month-h" style="margin-top:28px">已截止</h2><div class="tool-grid">${closed.map(card).join('')}</div>` : '');
});
