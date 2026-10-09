// 示範模式（網址加 ?demo）：不連資料庫，用假資料展示介面。資料都是虛構的。
const day = 864e5;
const at = (offsetDays, hhmm) => {
  const tw = new Date(Date.now() + 8 * 3600e3 + offsetDays * day).toISOString().slice(0, 10);
  return new Date(`${tw}T${hhmm}:00+08:00`).toISOString();
};
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ME = uid(1);

function fixtures() {
  // [編號, 名字, 組別, 專長, 身分組, 幹部職位]
  const P = [
    [1, '林小華', '第一組', '活動企劃', ['admin', 'member'], '社長'], [2, '陳柏宇', '第二組', '攝影', ['officer', 'leader', 'member'], '副社'],
    [3, '王語彤', '第三組', '美術設計', ['officer', 'member'], '總務'], [4, '張書維', '第一組', '剪輯', ['leader', 'member'], ''],
    [5, '黃予安', '第三組', '文案', ['leader', 'member'], ''], [6, '李若晴', '第二組', '攝影', ['member'], ''],
    [7, '吳承恩', '第三組', '', ['member'], ''], [8, '周子芸', '第一組', '主持', ['member'], ''],
    [9, '許芷涵', '第二組', '', ['member', 'newbie'], ''], [10, '鄭宇恆', '第一組', '', ['member', 'newbie'], ''],
    [11, '何老師', null, '外聘講師', ['teacher'], ''],
  ];
  const profiles = P.map(([n, name, section, specialty, , title]) => ({ id: uid(n), display_name: name, real_name: name, section, specialty, status: 'active', officer_title: title, avatar_url: null, school: n === 11 ? '範例大學' : '', grade: '', bio: '' }));
  profiles.push({ id: uid(12), display_name: '新朋友', real_name: '', section: null, specialty: '', status: 'pending', officer_title: '', school: '', grade: '', bio: '' });
  const user_roles = P.flatMap(([n, , , , roles]) => roles.map((role) => ({ user_id: uid(n), role })));
  const events = [
    ['e1', ['regular'], '週二社課', -14, '19:00', '21:00', '社辦', null], ['e2', ['sectional'], '第二組小聚', -7, '19:00', '20:30', '社辦', '第二組'],
    ['e3', ['regular'], '週二社課', -1, '19:00', '21:00', '社辦', null], ['e4', ['sectional'], '第一組小聚', 1, '14:00', '15:30', '活動中心 201', '第一組'],
    ['e5', ['officer'], '幹部會議', 2, '12:10', '13:00', '社辦', null], ['e6', ['regular'], '週二社課', 6, '19:00', '21:00', '社辦', null],
    ['e7', ['class'], '新生入門班', 4, '18:00', '19:00', '社辦', null], ['e8', ['regular', 'event'], '期末成果展', 33, '14:00', '18:00', '學生活動中心', null],
  ].map(([id, kinds, title, d, s, e, loc, section]) => ({ id, semester_id: 's1', kind: kinds[0], kinds, title, starts_at: at(d, s), ends_at: at(d, e), location: loc,
    note: id === 'e6' ? '下半場分組討論期末成果展，記得帶筆電。' : '', section, class_id: kinds.includes('class') ? 'c1' : null,
    audience: kinds.includes('officer') ? 'officers' : 'insiders', calendar_key: kinds.includes('officer') ? 'officers' : section ? 'sec:' + section : kinds.includes('class') ? 'class' : 'main',
    counts_attendance: !kinds.includes('officer') }));
  const att = [];
  const mark = (eid, map) => Object.entries(map).forEach(([n, status]) => att.push({ event_id: eid, user_id: uid(+n), status, note: '' }));
  mark('e1', { 1: 'present', 2: 'present', 3: 'late', 4: 'present', 5: 'present', 6: 'absent', 7: 'present', 8: 'early', 9: 'present', 10: 'present' });
  mark('e2', { 2: 'present', 6: 'present', 9: 'late' });
  mark('e3', { 1: 'present', 2: 'present', 3: 'present', 4: 'late', 5: 'present', 6: 'excused', 7: 'present', 8: 'present', 9: 'present' });
  const fmt = (d) => at(d, '12:00').slice(0, 10);
  return {
    profiles, user_roles,
    profile_private: profiles.map((p, i) => ({ user_id: p.id, email: `member${i + 1}@example.com`, google_email: null, phone: '' })),
    semesters: [{ id: 's1', name: '115-1', starts_on: '2026-09-01', ends_on: '2027-01-31', is_current: true }],
    settings: [{ key: 'team_name', value: '範例社團' }, { key: 'attendance_rules', value: { late_weight: 1, early_weight: 1, unexcused_weight: 0.5, excused_mode: 'absent' } },
      { key: 'recruit_open', value: true }, { key: 'hidden_pages', value: [] },
      { key: 'tools', value: [{ name: '社團雲端硬碟', url: 'https://example.com', desc: '活動照片、會議紀錄都在這裡' }, { name: '器材登記表', url: 'https://example.com', desc: '借社團器材前先登記' }] }],
    private_settings: [],
    calendars: [['main', '全體行程', 'insiders', null], ['sec:第一組', '第一組活動', 'section', '第一組'], ['sec:第二組', '第二組活動', 'section', '第二組'], ['class', '教學班', 'class', null], ['officers', '幹部', 'officers', null]]
      .map(([key, name, audience, section], i) => ({ key, name, audience, section, gcal_id: `demo-${i}@group.calendar.google.com`, sort: i })),
    events, attendance: att,
    leave_requests: [{ event_id: 'e3', user_id: uid(6), type: 'leave', reason: '期中考', created_at: at(-3, '10:00') }, { event_id: 'e6', user_id: uid(8), type: 'late', reason: '7 點下課，約 20 分鐘後到', created_at: at(0, '09:00') }],
    announcements: [
      { id: 'n1', channel: 'activity', audience: 'insiders', section: null, mentions: [], title: '期末成果展日期確定', body: '在學生活動中心，13:00 集合布置。', pinned: true, author: uid(1), created_at: at(-2, '21:00') },
      { id: 'n2', channel: 'general', audience: 'insiders', section: null, mentions: [], title: '下週二社課改在活動中心 201', body: '社辦被借走，下週二改到活動中心 201。', pinned: false, author: uid(2), created_at: at(-1, '22:10') },
      { id: 'n3', channel: 'class', audience: 'newbies', section: null, mentions: [], title: '新生入門班第一次上課', body: '帶筆電就好，學長姐會帶大家認識器材。', pinned: false, author: uid(1), created_at: at(-5, '20:00') },
      { id: 'n4', channel: 'general', audience: 'section', section: '第一組', mentions: [ME, uid(8)], title: '第一組週末小聚分工', body: '小華負責借場地，子芸準備簡報。', pinned: false, author: uid(4), created_at: at(-1, '20:00') },
      { id: 'n5', channel: 'share', audience: 'insiders', section: null, mentions: [], title: '校園創意市集', body: '可以去看看別人的攤位設計，想去的可以揪。', venue: '學生活動中心廣場', link: 'https://example.com', event_at: at(9, '13:00'), pinned: false, author: uid(6), created_at: at(-2, '13:00') },
      { id: 'n6', channel: 'alumni', audience: 'insiders', section: null, mentions: [], title: '校友回娘家', body: '12 月底聚餐，歡迎畢業學長姐回來。', pinned: false, author: uid(1), created_at: at(-4, '12:00') },
      { id: 'n7', channel: 'resources', audience: 'insiders', section: null, mentions: [], title: '新手入門影片清單', body: '適合新生的入門教學。', link: 'https://example.com', pinned: false, author: uid(9), created_at: at(-3, '21:00') },
    ],
    announcement_reads: [{ ann_id: 'n3', user_id: ME }],
    tasks: [
      { id: 't1', title: '借成果展場地', description: '課外組表單', due: fmt(3), status: 'doing', audience: 'officers', assignees: [uid(3)], created_by: ME },
      { id: 't2', title: '確認成果展講者', description: '', due: fmt(7), status: 'todo', audience: 'officers', assignees: [uid(1), uid(2)], created_by: ME },
      { id: 't3', title: '印成果展手冊', description: '', due: fmt(25), status: 'todo', audience: 'officers', assignees: [uid(3)], created_by: ME },
      { id: 't4', title: '回填社服尺寸', description: '表單在「表單」頁', due: fmt(5), status: 'todo', audience: 'insiders', assignees: [], created_by: ME },
      { id: 't5', title: '整理器材清單', description: '', due: fmt(-2), status: 'todo', audience: 'assignees', assignees: [uid(4), ME], created_by: ME },
    ],
    forms: [
      { id: 'f1', title: '社服尺寸調查', url: 'https://example.com', description: '這學期的社服要訂了，尺寸表在表單裡。', due: fmt(2), created_at: at(-3, '12:00') },
      { id: 'f2', title: '期末成果展報名', url: 'https://example.com', description: '想上台分享作品的人填這份。', due: fmt(20), created_at: at(-1, '12:00') },
      { id: 'f3', title: '社課意見回饋', url: 'https://example.com', description: '匿名，隨時都可以填。', due: null, created_at: at(-10, '12:00') },
      { id: 'f4', title: '期初迎新報名', url: 'https://example.com', description: '', due: fmt(-12), created_at: at(-30, '12:00') },
    ],
    classes: [{ id: 'c1', semester_id: 's1', name: '新生入門班', topic: '基礎入門', teacher_ids: [uid(6)], note: '每週四晚上，第 3 週開始做第一個作品。' }],
    class_students: [{ class_id: 'c1', user_id: uid(9) }, { class_id: 'c1', user_id: uid(10) }],
    class_milestones: ['認識器材', '基本操作', '完成第一個練習', '期末成果'].map((title, i) => ({ id: 'm' + i, class_id: 'c1', title, sort: i })),
    class_progress: [{ milestone_id: 'm0', user_id: uid(9) }, { milestone_id: 'm1', user_id: uid(9) }, { milestone_id: 'm0', user_id: uid(10) }],
    applications: [
      { id: 'ap1', name: '吳小芸', grade: '資管一', contact: 'IG：@demo_a', experience: 'none', background: '', interests: ['第一組'], want_class: true, message: '想多認識朋友！', status: 'new', officer_note: '', created_at: at(-1, '21:30') },
      { id: 'ap2', name: '林子豪', grade: '經濟二', contact: 'LINE：demo_b', experience: 'basic', background: '高中社團做過一年', interests: ['第二組'], want_class: false, message: '', status: 'contacted', officer_note: '已傳 LINE', created_at: at(-3, '12:10') },
    ],
  };
}

const DB = fixtures();
const singular = (t) => t.replace(/ies$/, 'y').replace(/s$/, '');

function parseSelect(s) {
  const rels = []; let depth = 0, start = -1, name = '', buf = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') { if (depth === 0) { name = buf.trim().split(/[,\s]+/).pop(); start = i + 1; } depth++; }
    else if (c === ')') { depth--; if (depth === 0) { rels.push([name, s.slice(start, i)]); buf = ''; continue; } }
    else if (depth === 0) buf += c;
  }
  return rels;
}
function embed(table, row, sel) {
  const out = { ...row };
  for (const [rel, inner] of parseSelect(sel || '')) {
    const fk = singular(rel) + '_id';
    if (fk in row) { const r = (DB[rel] || []).find((x) => x.id === row[fk]); out[rel] = r ? embed(rel, r, inner) : null; }
    else { const back = singular(table) + '_id'; out[rel] = (DB[rel] || []).filter((x) => x[back] === row.id).map((x) => embed(rel, x, inner)); }
  }
  return out;
}

class Q {
  constructor(t) { this.t = t; this.f = []; this.op = 'select'; this.sel = '*'; this.ord = null; this.lim = null; this.one = null; this.payload = null; this.ret = false; }
  select(s = '*') { if (this.op === 'select') this.sel = s; else this.ret = true; return this; }
  eq(k, v) { this.f.push((r) => r[k] === v); return this; }
  neq(k, v) { this.f.push((r) => r[k] !== v); return this; }
  in(k, v) { this.f.push((r) => v.includes(r[k])); return this; }
  gte(k, v) { this.f.push((r) => r[k] >= v); return this; }
  lte(k, v) { this.f.push((r) => r[k] <= v); return this; }
  lt(k, v) { this.f.push((r) => r[k] < v); return this; }
  contains(k, v) { this.f.push((r) => v.every((x) => (r[k] || [r.kind]).includes(x))); return this; }
  not(k, op, v) { if (op === 'in') { const l = String(v).replace(/[()]/g, '').split(','); this.f.push((r) => !l.includes(r[k])); } else this.f.push((r) => r[k] !== v && r[k] !== undefined); return this; }
  order(k, o = {}) { this.ord = [k, o.ascending !== false]; return this; }
  limit(n) { this.lim = n; return this; }
  range(a, b) { this.off = a; this.lim = b - a + 1; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  insert(rows) { this.op = 'insert'; this.payload = [].concat(rows); return this; }
  upsert(rows) { this.op = 'upsert'; this.payload = [].concat(rows); return this; }
  update(v) { this.op = 'update'; this.payload = v; return this; }
  delete() { this.op = 'delete'; return this; }
  then(res, rej) { return Promise.resolve(this.exec()).then(res, rej); }
  exec() {
    const T = (DB[this.t] ||= []);
    let rows;
    if (this.op === 'upsert') {
      // 依主鍵（key／id）覆蓋，沒有就新增
      rows = this.payload.map((r) => {
        const pk = ['key', 'id'].find((k) => r[k] != null);
        const old = pk ? T.find((x) => x[pk] === r[pk])
          : T.find((x) => ['event_id', 'user_id', 'ann_id', 'milestone_id'].every((k) => !(k in r) || x[k] === r[k]));
        if (old) return Object.assign(old, r);
        const n = { id: r.id || crypto.randomUUID(), created_at: new Date().toISOString(), ...r }; T.push(n); return n;
      });
    } else if (this.op === 'insert') {
      rows = this.payload.map((r) => ({ id: r.id || crypto.randomUUID(), created_at: new Date().toISOString(), ...r }));
      T.push(...rows);
    } else if (this.op === 'update') {
      rows = T.filter((r) => this.f.every((fn) => fn(r))); rows.forEach((r) => Object.assign(r, this.payload));
    } else if (this.op === 'delete') {
      DB[this.t] = T.filter((r) => !this.f.every((fn) => fn(r))); return { data: null, error: null };
    } else {
      rows = T.filter((r) => this.f.every((fn) => fn(r))).map((r) => embed(this.t, r, this.sel));
      if (this.ord) { const [k, asc] = this.ord; rows.sort((a, b) => ((a[k] ?? '') > (b[k] ?? '') ? 1 : -1) * (asc ? 1 : -1)); }
      if (this.lim) rows = rows.slice(this.off || 0, (this.off || 0) + this.lim);
    }
    if (this.one) return { data: rows[0] ?? null, error: this.one === 'single' && !rows[0] ? { message: 'not found' } : null };
    return { data: rows, error: null };
  }
}

// ---------- RPC（簡化版的資料庫函式） ----------
const rolesOf = (id) => DB.user_roles.filter((r) => r.user_id === id).map((r) => r.role);
function expected(e, id) {
  if (!e.counts_attendance) return false;
  const roles = rolesOf(id);
  if (!roles.some((r) => ['admin', 'officer', 'leader', 'member', 'newbie'].includes(r))) return false;
  const p = DB.profiles.find((x) => x.id === id);
  return (e.kinds?.length ? e.kinds : [e.kind]).some((k) =>
    k === 'officer' ? roles.some((r) => r === 'admin' || r === 'officer')
      : k === 'sectional' ? p?.section === e.section
        : k === 'class' ? DB.class_students.some((s) => s.class_id === e.class_id && s.user_id === id)
          : true);
}
function cell(e, id) {
  const a = DB.attendance.find((x) => x.event_id === e.id && x.user_id === id);
  const l = DB.leave_requests.find((x) => x.event_id === e.id && x.user_id === id);
  const marked = DB.attendance.some((x) => x.event_id === e.id);
  return { a, l, marked, status: a?.status ?? (marked && expected(e, id) ? (l?.type === 'leave' ? 'excused' : 'absent') : null) };
}
const RPC = {
  my_mentions() {
    return DB.announcements.filter((a) => (a.mentions || []).includes(ME));
  },
  event_roster({ eid }) {
    const e = DB.events.find((x) => x.id === eid);
    return DB.profiles.filter((p) => p.status === 'active').map((p) => { const c = cell(e, p.id); return { user_id: p.id, expected: expected(e, p.id), status: c.a?.status ?? null, note: '', leave_type: c.l?.type ?? null, leave_reason: c.l?.reason ?? null }; })
      .filter((r) => r.expected || r.status || r.leave_type);
  },
  attendance_detail({ uid: id }) {
    return DB.events.filter((e) => e.counts_attendance).sort((a, b) => (a.starts_at > b.starts_at ? 1 : -1)).map((e) => {
      const c = cell(e, id); return { event_id: e.id, starts_at: e.starts_at, kind: e.kind, title: e.title, expected: expected(e, id), marked: c.marked, status: c.status, note: '', leave_type: c.l?.type ?? null, leave_reason: c.l?.reason ?? null };
    });
  },
  attendance_stats() {
    return DB.profiles.filter((p) => p.status === 'active' && rolesOf(p.id).some((r) => ['admin', 'officer', 'leader', 'member', 'newbie'].includes(r))).map((p) => {
      const cells = DB.events.filter((e) => expected(e, p.id)).map((e) => cell(e, p.id)).filter((c) => c.status !== 'na');
      const n = (s) => cells.filter((c) => c.status === s).length;
      const wt = (c) => c.status === 'present' ? 1 : c.status === 'late' ? (c.l?.type === 'late' ? 1 : 0.5) : c.status === 'early' ? (c.l?.type === 'early' ? 1 : 0.5) : 0;
      const done = cells.filter((c) => c.marked).length, att = cells.reduce((s, c) => s + wt(c), 0);
      return { user_id: p.id, expected_total: cells.length, expected_so_far: done, attended: att, present: n('present'), late: n('late'), early: n('early'), excused: n('excused'), absent: n('absent'),
        current_rate: done ? Math.round((att / done) * 1000) / 10 : null, total_rate: cells.length ? Math.round((att / cells.length) * 1000) / 10 : null };
    });
  },
};

export function createMock() {
  const session = { user: { id: ME, email: 'demo@example.com' } };
  return {
    from: (t) => new Q(t),
    rpc: async (fn, args) => ({ data: RPC[fn] ? RPC[fn](args || {}) : null, error: null }),
    auth: {
      getSession: async () => ({ data: { session } }),
      getUserIdentities: async () => ({ data: { identities: [{ provider: 'email' }, { provider: 'discord', identity_data: { avatar_url: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Crect width=%2240%22 height=%2240%22 fill=%22%235865f2%22/%3E%3C/svg%3E' } }] } }),
      linkIdentity: async () => ({ error: { message: '示範模式不能連結帳號' } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => { location.search = ''; },
      signInWithOAuth: async () => ({ error: null }), signInWithPassword: async () => ({ error: null }), signUp: async () => ({ error: null }),
    },
    functions: { invoke: async () => ({ data: { ok: true }, error: null }) },
  };
}
