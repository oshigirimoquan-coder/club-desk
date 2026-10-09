import { sb, state, me, route, esc, run, toast, formDialog, pageHead, empty, chipPerson, activePeople, nameOf, render, $, $$ } from '../core.js';
import { progressPct } from '../logic.js';

async function editClass(c = null) {
  const people = activePeople();
  const opts = people.map((p) => [p.id, `${nameOf(p.id)}${p.roles.includes('newbie') ? '（新生）' : ''}`]);
  const [{ data: stu }, { data: ms }] = c ? await Promise.all([
    sb.from('class_students').select('user_id').eq('class_id', c.id),
    sb.from('class_milestones').select('*').eq('class_id', c.id).order('sort'),
  ]) : [{ data: [] }, { data: [] }];
  const v = await formDialog({
    title: c ? '編輯教學班' : '新增教學班', danger: c ? '刪除' : null,
    fields: [
      { name: 'name', label: '班名', required: true, value: c?.name, placeholder: '例：新生入門班' },
      { name: 'topic', label: '主題', value: c?.topic, placeholder: '例：基礎攝影' },
      { name: 'teachers', label: '帶課的人', type: 'checks', value: c?.teacher_ids || [], options: opts.filter(([id]) => !state.people.get(id)?.roles.includes('newbie')), full: true },
      { name: 'students', label: '學員', type: 'checks', value: (stu || []).map((x) => x.user_id), options: opts.filter(([id]) => state.people.get(id)?.roles.includes('newbie')), full: true, hint: '只列出有「新生」身分組的人' },
      { name: 'milestones', label: '進度清單（一行一項）', type: 'textarea', rows: 6, full: true, value: (ms || []).map((m) => m.title).join('\n'), placeholder: '認識器材\n基本操作\n完成第一個練習\n期末成果' },
      { name: 'note', label: '備註', type: 'textarea', value: c?.note, full: true },
    ],
  });
  if (!v) return;
  if (v.__danger) { await run(() => sb.from('classes').delete().eq('id', c.id), '已刪除'); return render(); }
  const row = { name: v.name, topic: v.topic, teacher_ids: v.teachers, note: v.note, semester_id: c?.semester_id || state.semester?.id || null };
  const r = await run(() => c ? sb.from('classes').update(row).eq('id', c.id).select().single() : sb.from('classes').insert(row).select().single());
  if (!r) return;
  const cid = r.data.id;
  await sb.from('class_students').delete().eq('class_id', cid);
  if (v.students.length) await sb.from('class_students').insert(v.students.map((u) => ({ class_id: cid, user_id: u })));
  // 進度清單：保留同名項目（不清掉已勾的進度），新增新的，刪除拿掉的
  const want = v.milestones.split('\n').map((s) => s.trim()).filter(Boolean);
  const have = ms || [];
  for (const m of have) if (!want.includes(m.title)) await sb.from('class_milestones').delete().eq('id', m.id);
  for (const [i, t] of want.entries()) {
    const ex = have.find((m) => m.title === t);
    if (ex) await sb.from('class_milestones').update({ sort: i }).eq('id', ex.id);
    else await sb.from('class_milestones').insert({ class_id: cid, title: t, sort: i });
  }
  toast('已儲存', 'ok'); render();
}

async function classesTab() {
  const p = state.p;
  const [{ data: classes }, { data: stu }, { data: ms }, { data: prog }] = await Promise.all([
    sb.from('classes').select('*').order('created_at'),
    sb.from('class_students').select('*'), sb.from('class_milestones').select('*').order('sort'), sb.from('class_progress').select('*'),
  ]);
  const done = new Set((prog || []).map((x) => `${x.milestone_id}|${x.user_id}`));
  setTimeout(() => {
    $('#add-class')?.addEventListener('click', () => editClass());
    $$('[data-class-edit]').forEach((b) => (b.onclick = () => editClass(classes.find((c) => c.id === b.dataset.classEdit))));
    $$('[data-prog]').forEach((cb) => (cb.onchange = async () => {
      const [mid, uid] = cb.dataset.prog.split('|');
      const r = cb.checked ? await run(() => sb.from('class_progress').upsert({ milestone_id: mid, user_id: uid }))
        : await run(() => sb.from('class_progress').delete().eq('milestone_id', mid).eq('user_id', uid));
      if (!r) cb.checked = !cb.checked;
    }));
  });
  const list = classes || [];
  return (p.officer ? '<div class="row-end"><button class="btn pri" id="add-class">＋ 新增教學班</button></div>' : '') +
    (list.length ? list.map((c) => {
      const students = (stu || []).filter((s) => s.class_id === c.id).map((s) => s.user_id);
      const miles = (ms || []).filter((m) => m.class_id === c.id);
      const canCheck = p.officer || c.teacher_ids.includes(me());
      const visible = canCheck ? students : students.filter((u) => u === me());
      return `<section class="card class-card"><div class="card-head"><div><h2>${esc(c.name)}</h2><p class="muted small">${esc(c.topic || '')}${c.teacher_ids.length ? '・帶課：' + c.teacher_ids.map(nameOf).map(esc).join('、') : ''}・學員 ${students.length} 人</p></div>
        ${p.officer ? `<button class="btn sm" data-class-edit="${c.id}">編輯</button>` : ''}</div>
        ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
        ${miles.length && visible.length ? `<div class="tbl-wrap"><table class="prog"><thead><tr><th>學員</th>${miles.map((m) => `<th class="m">${esc(m.title)}</th>`).join('')}<th>進度</th></tr></thead><tbody>
          ${visible.map((u) => { const n = miles.filter((m) => done.has(`${m.id}|${u}`)).length; return `<tr><td>${chipPerson(u)}</td>${miles.map((m) => `<td class="c"><input type="checkbox" aria-label="${esc(nameOf(u))}：${esc(m.title)}" data-prog="${m.id}|${u}" ${done.has(`${m.id}|${u}`) ? 'checked' : ''} ${canCheck ? '' : 'disabled'}></td>`).join('')}
            <td><div class="mini-bar"><i style="width:${progressPct(n, miles.length)}%"></i></div><span class="mono small">${n}/${miles.length}</span></td></tr>`; }).join('')}</tbody></table></div>`
          : `<p class="muted small">${miles.length ? '還沒有學員' : '還沒有設定進度清單'}</p>`}
      </section>`;
    }).join('') : empty('還沒有教學班', p.officer ? '新增教學班，指定帶課的人和新生學員，並列出進度清單。' : ''));
}

route('/teaching', async () => {
  return pageHead('教學班', '新生教學班與進度。帶課的人在這裡勾選學員的進度。') + await classesTab();
});
