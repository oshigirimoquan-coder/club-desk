// 資料庫規則測試：用 PGlite（瀏覽器版 Postgres）在本機跑 schema.sql，模擬不同身分的人
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const A = '00000000-0000-0000-0000-00000000000a'; // 第一位註冊 → 管理員
const B = '00000000-0000-0000-0000-00000000000b'; // 社員（第一組）
const T = '00000000-0000-0000-0000-00000000000c'; // 指導老師
const S = '11111111-1111-1111-1111-111111111111';
const E = (n) => `55555555-5555-5555-5555-55555555555${n}`;
const G1 = '第一組', G2 = '第二組';

async function as(uid, sql) {
  await db.exec(`reset role; select set_config('test.uid','${uid}',false); set role authenticated;`);
  try { const r = await db.exec(sql); return { rows: r[r.length - 1]?.rows ?? [] }; }
  catch (e) { return { error: e.message }; }
  finally { await db.exec('reset role'); }
}

before(async () => {
  await db.exec(`
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create table auth.identities (user_id uuid, provider text, provider_id text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
    create role authenticated; create role anon;
    grant usage on schema public, auth, storage to authenticated, anon;
    alter default privileges in schema public grant all on tables to authenticated, anon;
    alter default privileges in schema public grant execute on functions to authenticated, anon;
    grant all on all tables in schema storage to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;`);
  const sql = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8').replace(/create extension[^;]+;/, '');
  await db.exec(sql);
  await db.exec(sql); // 可以重複執行
  await db.exec(`insert into auth.users values ('${A}','a@x','{"full_name":"社長"}'),('${B}','b@x','{"name":"小明"}'),('${T}','t@x','{}')`);
  await as(A, `update profiles set status='active', section='${G1}' where id='${B}'; insert into user_roles values ('${B}','member');
    update profiles set status='active' where id='${T}'; insert into user_roles values ('${T}','teacher');
    insert into semesters (id,name,starts_on,ends_on,is_current) values ('${S}','115-1','2026-09-01','2027-01-31',true);
    insert into events (id,semester_id,kinds,title,starts_at,ends_at,calendar_key) values
      ('${E(1)}','${S}',array['regular'],'社課','2026-09-22 19:00+08','2026-09-22 21:00+08','main'),
      ('${E(2)}','${S}',array['regular'],'社課','2026-09-29 19:00+08','2026-09-29 21:00+08','main'),
      ('${E(4)}','${S}',array['regular'],'社課','2026-12-01 19:00+08','2026-12-01 21:00+08','main');
    insert into events (id,semester_id,kinds,section,title,starts_at,ends_at,calendar_key) values
      ('${E(3)}','${S}',array['sectional'],'${G2}','第二組小聚','2026-10-06 19:00+08','2026-10-06 21:00+08','sec:${G2}');
    insert into events (id,semester_id,kinds,title,starts_at,ends_at,calendar_key,audience,counts_attendance) values
      ('${E(5)}','${S}',array['officer'],'幹部會議','2026-10-01 12:00+08','2026-10-01 13:00+08','officers','officers',false);
    insert into attendance (event_id,user_id,status) values ('${E(1)}','${B}','late'),('${E(1)}','${A}','present'),('${E(2)}','${A}','present'),('${E(3)}','${A}','present');`);
  await as(B, `insert into leave_requests (event_id,type,reason) values ('${E(2)}','leave','考試')`);
});


const L = '00000000-0000-0000-0000-0000000000d1'; // 第一組組長（需要時才建立）
const C = '00000000-0000-0000-0000-0000000000d2'; // 第二組社員
async function addLeaderAndOther() {
  if ((await db.query(`select 1 from profiles where id='${L}'`)).rows.length) return;
  await db.exec(`insert into auth.users values ('${L}','l@x','{}'),('${C}','c@x','{}')`);
  await as(A, `update profiles set status='active', section='${G1}' where id='${L}'; insert into user_roles values ('${L}','member'),('${L}','leader');
    update profiles set status='active', section='${G2}' where id='${C}'; insert into user_roles values ('${C}','member');`);
}
const expectedMap = async (eid) => Object.fromEntries((await as(A,
  `select p.id, public.is_expected(e, p.id) as ok from events e, profiles p where e.id='${eid}'`)).rows.map((x) => [x.id, x.ok]));

test('第一位註冊的人自動成為啟用中的管理員，之後的人待核准', async () => {
  const r = await db.query(`select id, status from profiles order by id`);
  assert.equal(r.rows[0].status, 'active');
  const roles = await db.query(`select role from user_roles where user_id='${A}' order by role`);
  assert.deepEqual(roles.rows.map((x) => x.role), ['admin', 'member']);
});

test('社員不能自己升成管理員，也不能改自己的帳號狀態或組別', async () => {
  assert.match((await as(B, `insert into user_roles values ('${B}','admin')`)).error, /row-level security/);
  assert.match((await as(B, `update profiles set status='inactive' where id='${B}'`)).error, /只有管理員/);
  assert.match((await as(B, `update profiles set section='${G2}' where id='${B}'`)).error, /組別由幹部設定/);
});

test('不能移除最後一位管理員', async () => {
  assert.match((await as(A, `delete from user_roles where user_id='${A}' and role='admin'`)).error, /至少要有一位管理員/);
});

test('組別只能填 section_list() 裡的名稱；每個組別自動有一本行事曆', async () => {
  assert.ok((await as(A, `update profiles set section='不存在的組' where id='${B}'`)).error);
  const cals = (await as(A, `select key from calendars where audience='section' order by sort`)).rows.map((r) => r.key);
  assert.deepEqual(cals, ['sec:第一組', 'sec:第二組', 'sec:第三組']);
});

test('出席率：沒預告的晚到算 0.5、請假算缺席、別組的分組活動不算', async () => {
  const { rows } = await as(A, `select * from attendance_stats('${S}')`);
  const b = rows.find((r) => r.user_id === B);
  assert.equal(b.expected_total, 3);      // E1、E2、E4（E3 是第二組的）
  assert.equal(b.expected_so_far, 2);     // 已點名的 E1、E2
  assert.equal(b.late, 1);
  assert.equal(b.excused, 1);
  assert.equal(Number(b.attended), 0.5);
  assert.equal(Number(b.current_rate), 25);
});

test('事先預告晚到的話，晚到算 1 次出席', async () => {
  await as(B, `insert into leave_requests (event_id,type,reason) values ('${E(1)}','late','家教')`);
  const b = (await as(A, `select * from attendance_stats('${S}')`)).rows.find((r) => r.user_id === B);
  assert.equal(Number(b.attended), 1);
  assert.equal(Number(b.current_rate), 50);
});

test('出席規則改成「請假不列入」後重新計算', async () => {
  await as(A, `update settings set value = jsonb_set(value, '{excused_mode}', '"exclude"') where key='attendance_rules'`);
  const { rows } = await as(A, `select * from attendance_stats('${S}')`);
  assert.equal(Number(rows.find((r) => r.user_id === B).current_rate), 100);
  await as(A, `update settings set value = jsonb_set(value, '{excused_mode}', '"absent"') where key='attendance_rules'`);
});

test('社員只看得到自己的出席率', async () => {
  const { rows } = await as(B, `select user_id from attendance_stats('${S}')`);
  assert.deepEqual(rows.map((r) => r.user_id), [B]);
});

test('應出席：一般活動是所有列入出席率的人；指導老師不算', async () => {
  const ok = await expectedMap(E(1));
  assert.equal(ok[A], true);
  assert.equal(ok[B], true);
  assert.equal(ok[T], false);
});

test('應出席：複選類型符合其中一種就算（幹部會議＋第一組活動）', async () => {
  await as(A, `insert into events (id,semester_id,kinds,section,title,starts_at,ends_at,calendar_key) values
    ('${E(6)}','${S}',array['officer','sectional'],'${G1}','幹部＋第一組','2026-10-20 12:00+08','2026-10-20 13:00+08','officers')`);
  const ok = await expectedMap(E(6));
  assert.equal(ok[A], true);   // 幹部
  assert.equal(ok[B], true);   // 第一組
  assert.equal(ok[T], false);
  assert.equal((await as(A, `select kind from events where id='${E(6)}'`)).rows[0].kind, 'officer'); // 主要類型取第一個
});

test('應出席：教學班只有班上學生', async () => {
  const CL = '66666666-6666-6666-6666-666666666661';
  await as(A, `insert into classes (id,semester_id,name,teacher_ids) values ('${CL}','${S}','入門班',array['${T}']::uuid[]);
    insert into class_students values ('${CL}','${B}');
    insert into events (id,semester_id,kinds,class_id,title,starts_at,ends_at,calendar_key) values
      ('${E(7)}','${S}',array['class'],'${CL}','入門班第一堂','2026-10-21 19:00+08','2026-10-21 21:00+08','class')`);
  const ok = await expectedMap(E(7));
  assert.equal(ok[B], true);
  assert.equal(ok[A], false);
});

test('行程：社員看不到幹部會議；指導老師看得到一般行程', async () => {
  const kinds = (await as(B, `select title from events where id in ('${E(1)}','${E(3)}','${E(5)}') order by starts_at`)).rows.map((r) => r.title);
  assert.deepEqual(kinds, ['社課', '第二組小聚']);
  assert.equal((await as(T, `select 1 from events where id='${E(1)}'`)).rows.length, 1);
  assert.equal((await as(T, `select 1 from events where id='${E(5)}'`)).rows.length, 0);
});

test('組長看得到自己組員的請假、可以幫他們點名；看不到別組', async () => {
  await addLeaderAndOther();
  assert.equal((await as(L, `select 1 from leave_requests where user_id='${B}'`)).rows.length > 0, true);
  assert.equal((await as(L, `insert into attendance (event_id,user_id,status) values ('${E(4)}','${B}','present')`)).error, undefined);
  assert.ok((await as(L, `insert into attendance (event_id,user_id,status) values ('${E(4)}','${C}','present')`)).error);
  await as(A, `delete from attendance where event_id='${E(4)}'`);
});

test('幹部事項社員看不到', async () => {
  await as(A, `insert into tasks (title,audience) values ('幹部事','officers'),('大家事','insiders')`);
  assert.deepEqual((await as(B, `select title from tasks`)).rows.map((r) => r.title), ['大家事']);
});

test('公告分類：社員可以發「分享」「資源」，不能發一般、活動、教學班、校友', async () => {
  for (const ch of ['share', 'resources']) assert.equal((await as(B, `insert into announcements (channel,title) values ('${ch}','B 的${ch}')`)).error, undefined, ch);
  for (const ch of ['general', 'activity', 'class', 'alumni']) {
    assert.match((await as(B, `insert into announcements (channel,title) values ('${ch}','x')`)).error, /row-level security/, ch);
  }
  assert.equal((await as(A, `insert into announcements (channel,title) values ('activity','期末成發')`)).error, undefined);
});

test('公告分類：社員只能刪自己的分享，幹部都能刪', async () => {
  await as(A, `insert into announcements (channel,title) values ('share','幹部分享的')`);
  await as(B, `delete from announcements where title='幹部分享的'`);
  assert.equal((await as(A, `select 1 from announcements where title='幹部分享的'`)).rows.length, 1);
  await as(B, `delete from announcements where title='B 的share'`);
  assert.equal((await as(A, `select 1 from announcements where title='B 的share'`)).rows.length, 0);
});

test('公告對象：某一組只有那組看得到；新生公告只有新生', async () => {
  await addLeaderAndOther();
  await as(A, `insert into announcements (channel,audience,section,title) values ('general','section','${G2}','第二組注意'),('general','newbies',null,'新生注意')`);
  assert.equal((await as(B, `select 1 from announcements where title='第二組注意'`)).rows.length, 0);
  assert.equal((await as(C, `select 1 from announcements where title='第二組注意'`)).rows.length, 1);
  assert.equal((await as(B, `select 1 from announcements where title='新生注意'`)).rows.length, 0);
});

test('標記：被標記的人查得到提到自己的公告', async () => {
  await as(A, `insert into announcements (channel,title,mentions) values ('general','小明請回覆',array['${B}']::uuid[])`);
  assert.deepEqual((await as(B, `select title from my_mentions()`)).rows.map((r) => r.title), ['小明請回覆']);
  assert.equal((await as(T, `select 1 from my_mentions()`)).rows.length, 0);
});

test('社員不能發一般公告', async () => {
  assert.match((await as(B, `insert into announcements (title) values ('x')`)).error, /row-level security/);
});

test('招生：開放報名時，沒登入的人可以送出，但看不到別人的報名', async () => {
  await as(A, `update settings set value = 'true' where key='recruit_open'`);
  const ins = await as('', `set role anon; insert into applications (name, grade, contact) values ('新同學','資管一','IG: abc')`);
  assert.equal(ins.error, undefined);
  assert.equal((await as('', `set role anon; select * from applications`)).rows.length, 0);
  assert.equal((await as(B, `select * from applications`)).rows.length, 0);
  assert.equal((await as(A, `select name from applications`)).rows[0].name, '新同學');
});

test('招生：關閉報名後不能送出', async () => {
  await as(A, `update settings set value = 'false' where key='recruit_open'`);
  assert.match((await as('', `set role anon; insert into applications (name, grade, contact) values ('晚來的','企管一','x')`)).error, /row-level security/);
});

test('表單：幹部可以新增，社員看得到但不能新增或修改', async () => {
  assert.equal((await as(A, `insert into forms (title,url,due) values ('期末成發報名','https://forms.gle/abc','2026-12-01')`)).error, undefined);
  assert.deepEqual((await as(B, `select title from forms`)).rows.map((r) => r.title), ['期末成發報名']);
  assert.match((await as(B, `insert into forms (title,url) values ('x','https://forms.gle/x')`)).error, /row-level security/);
  await as(B, `update forms set title='被改了'`);
  assert.equal((await as(A, `select title from forms`)).rows[0].title, '期末成發報名');
  assert.ok((await as(A, `insert into forms (title,url) values ('壞連結','javascript:alert(1)')`)).error);
});

test('工具、隱藏頁面設定：預設是空的；社員看得到但不能改，管理員可以改', async () => {
  for (const k of ['tools', 'hidden_pages']) {
    assert.deepEqual((await as(B, `select value from settings where key='${k}'`)).rows[0].value, [], k);
  }
  await as(B, `update settings set value='["/tasks"]' where key='hidden_pages'`);
  assert.deepEqual((await as(A, `select value from settings where key='hidden_pages'`)).rows[0].value, []);
  await as(A, `update settings set value='["/tasks"]' where key='hidden_pages'`);
  assert.deepEqual((await as(B, `select value from settings where key='hidden_pages'`)).rows[0].value, ['/tasks']);
});

test('Discord ID 對照只有後端能查，一般登入者不能呼叫', async () => {
  assert.match((await as(B, `select * from discord_ids(array['${B}']::uuid[])`)).error, /permission denied/);
});

test('別人看不到我的手機與信箱', async () => {
  assert.equal((await as(B, `select * from profile_private where user_id='${A}'`)).rows.length, 0);
});
