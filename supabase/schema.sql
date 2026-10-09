-- =====================================================================
-- 社團管理系統：資料庫結構與權限
-- 用法：Supabase → SQL Editor → New query → 整份貼上 → Run。可重複執行。
-- 第一位登入的人自動成為「管理員」並啟用；之後的人都是「待核准」。
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0. 組別（社團自己定）
-- 改這裡時，js/logic.js 的 SECTIONS 也要改成一樣。
-- 已經上線的資料庫改組別：先把 profiles 等表裡舊組名改掉，再重跑整份。
-- ---------------------------------------------------------------------
create or replace function public.section_list() returns text[] language sql immutable as $$
  select array['第一組','第二組','第三組']
$$;
create or replace function public.valid_section(s text) returns boolean language sql immutable as $$
  select s is null or s = any(public.section_list())
$$;

-- ---------------------------------------------------------------------
-- 1. 成員與身分組
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  real_name text not null default '',
  section text check (public.valid_section(section)),
  specialty text not null default '',       -- 專長（樂器、項目、擅長的事…）
  grade text not null default '',
  school text not null default '',          -- 外校老師或外校成員填校名
  bio text not null default '',
  officer_title text not null default '',   -- 幹部職位標籤：副社、總務、公關…
  avatar_url text,
  status text not null default 'pending' check (status in ('pending','active','inactive')),
  created_at timestamptz not null default now()
);

-- 只有本人與幹部看得到的聯絡資料
create table if not exists public.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email text,
  google_email text,     -- 用來分享 Google 行事曆
  phone text not null default ''
);

create table if not exists public.user_roles (
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin','officer','leader','member','newbie','teacher','alumni')),
  primary key (user_id, role)
);

-- ---------------------------------------------------------------------
-- 2. 學期與設定
-- ---------------------------------------------------------------------
create table if not exists public.semesters (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- 例：115-1
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists one_current_semester on public.semesters (is_current) where is_current;

create table if not exists public.settings (
  key text primary key,
  value jsonb not null
);
insert into public.settings (key, value) values
  ('team_name', '"範例社團"'),
  -- 出席率規則（管理員可在設定頁調整）
  --   late_weight／early_weight：有事先預告的晚到、早退算幾次出席
  --   unexcused_weight：沒預告的晚到、早退算幾次
  --   excused_mode：absent = 請假算缺席；exclude = 請假的場次不列入計算
  ('attendance_rules', '{"late_weight":1,"early_weight":1,"unexcused_weight":0.5,"excused_mode":"absent"}'),
  ('recruit_open', 'false'),
  ('notify', '{"channel":"discord"}'),
  ('tools', '[]'),          -- 「工具」頁的外部連結 [{name,url,desc}]
  ('hidden_pages', '[]')    -- 管理員隱藏的頁面路徑，例：["/tasks"]
on conflict (key) do nothing;

-- 只有管理員與後端看得到的設定（Discord webhook 網址等）
create table if not exists public.private_settings (
  key text primary key,
  value jsonb not null
);

-- ---------------------------------------------------------------------
-- 3. 行事曆：全體一本、每個組別一本、教學班、幹部
-- ---------------------------------------------------------------------
create table if not exists public.calendars (
  key text primary key,
  name text not null,
  audience text not null check (audience in ('insiders','section','class','officers')),
  section text,
  gcal_id text,              -- 由 calendar-sync 函式建立後填入
  sort int not null default 0
);
insert into public.calendars (key, name, audience, section, sort) values
  ('main', '全體行程', 'insiders', null, 1),
  ('class', '教學班', 'class', null, 100),
  ('officers', '幹部', 'officers', null, 101)
on conflict (key) do nothing;
insert into public.calendars (key, name, audience, section, sort)
  select 'sec:' || s, s || '活動', 'section', s, 1 + n::int
  from unnest(public.section_list()) with ordinality as t(s, n)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 4. 教學班
-- ---------------------------------------------------------------------
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid references public.semesters(id) on delete cascade,
  name text not null,
  topic text not null default '',
  teacher_ids uuid[] not null default '{}',
  note text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.class_students (
  class_id uuid references public.classes(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (class_id, user_id)
);
create table if not exists public.class_milestones (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  sort int not null default 0
);
create table if not exists public.class_progress (
  milestone_id uuid references public.class_milestones(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  done_at timestamptz not null default now(),
  checked_by uuid default auth.uid(),
  primary key (milestone_id, user_id)
);

-- ---------------------------------------------------------------------
-- 5. 行程、請假、點名
-- 行程類型：改這裡時，js/logic.js 的 KIND_LABEL 與下面的 is_expected 也要一起改
-- ---------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid references public.semesters(id) on delete set null,
  kind text not null default 'regular'
    check (kind in ('regular','sectional','class','extra','event','officer','other')),
  -- 類型可以複選（例：例行聚會＋大型活動）；kind 自動等於第一個
  kinds text[] not null default '{}'
    check (kinds <@ array['regular','sectional','class','extra','event','officer','other']::text[]),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null default '',
  note text not null default '',
  section text check (public.valid_section(section)),   -- 分組活動的組別
  class_id uuid references public.classes(id) on delete set null,
  audience text not null default 'insiders' check (audience in ('insiders','officers')),
  calendar_key text references public.calendars(key),
  counts_attendance boolean not null default true,
  gcal_event_id text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists events_time on public.events (starts_at);
create or replace function public.events_kinds() returns trigger language plpgsql as $$
begin
  if new.kinds is null or cardinality(new.kinds) = 0 then new.kinds := array[new.kind]; end if;
  new.kind := new.kinds[1];
  return new;
end $$;
drop trigger if exists events_kinds on public.events;
create trigger events_kinds before insert or update on public.events for each row execute function public.events_kinds();

create table if not exists public.leave_requests (
  event_id uuid references public.events(id) on delete cascade,
  user_id uuid default auth.uid() references public.profiles(id) on delete cascade,
  type text not null check (type in ('leave','late','early')),
  reason text not null default '',
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists public.attendance (
  event_id uuid references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  status text not null check (status in ('present','late','early','absent','excused','na')),  -- na = 免出席
  note text not null default '',
  marked_by uuid default auth.uid(),
  marked_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ---------------------------------------------------------------------
-- 6. 公告、任務
-- 公告分類（channel）：general 一般｜activity 活動｜class 教學班｜alumni 校友｜share 分享｜resources 資源
-- share、resources 所有成員都能發（只能改自己的）；其他只有幹部能發
-- ---------------------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'general'
    check (channel in ('general','activity','class','alumni','share','resources')),
  audience text not null default 'insiders' check (audience in ('insiders','section','officers','newbies')),
  section text check (public.valid_section(section)),
  title text not null,
  body text not null default '',
  event_at timestamptz,                       -- 分享的活動日期
  venue text not null default '',
  link text not null default '',
  mentions uuid[] not null default '{}',      -- 被標記的人
  pinned boolean not null default false,
  author uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.announcement_reads (
  ann_id uuid references public.announcements(id) on delete cascade,
  user_id uuid default auth.uid() references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (ann_id, user_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  due date,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  audience text not null default 'officers' check (audience in ('officers','insiders','assignees')),
  assignees uuid[] not null default '{}',
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 表單：Google 表單的連結清單（回覆留在 Google 表單／試算表）
create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null check (url ~* '^https?://'),
  description text not null default '',
  due date,                                   -- 截止日（選填）
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. 招生報名（公開表單，免登入）
-- ---------------------------------------------------------------------
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  grade text not null check (char_length(grade) between 1 and 40),
  contact text not null check (char_length(contact) between 1 and 120),
  experience text not null default 'none' check (experience in ('none','some','basic')),
  background text not null default '' check (char_length(background) <= 120),
  interests text[] not null default '{}',
  want_class boolean not null default false,
  message text not null default '' check (char_length(message) <= 1000),
  status text not null default 'new' check (status in ('new','contacted','joined','declined')),
  officer_note text not null default '',
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 身分判斷函式（RLS 都用這些）
-- =====================================================================
create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active')
$$;
create or replace function public.has_role(r text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active() and exists (select 1 from user_roles where user_id = auth.uid() and role = r)
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$ select public.has_role('admin') $$;
create or replace function public.is_officer() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('admin') or public.has_role('officer')
$$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_officer() or public.has_role('teacher')
$$;
-- 社內成員：任何身分組都算
create or replace function public.is_insider() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active() and exists (select 1 from user_roles where user_id = auth.uid())
$$;
-- 列入出席率的人（與 js/logic.js 的 perms().counted 一致）：指導老師、校友不算
create or replace function public.is_counted(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = uid and status = 'active')
    and exists (select 1 from user_roles where user_id = uid and role in ('admin','officer','leader','member','newbie'))
$$;
create or replace function public.my_section() returns text
language sql stable security definer set search_path = public as $$
  select section from profiles where id = auth.uid()
$$;
-- 組長管自己組的人
create or replace function public.leads_user(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('leader') and exists (select 1 from profiles p where p.id = uid
    and p.section is not null and p.section = public.my_section())
$$;
create or replace function public.teaches_class(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes where id = cid and auth.uid() = any(teacher_ids))
$$;
create or replace function public.in_class(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from class_students where class_id = cid and user_id = auth.uid())
$$;
create or replace function public.can_see_event(e public.events) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_officer() or (e.audience <> 'officers' and public.is_insider())
$$;

-- 某人是否「應出席」某次行程
--   複選類型：符合其中任一種就算
--   幹部會議 → 幹部；分組活動 → 該組；教學班 → 班上學生；其他類型 → 所有列入出席率的人
create or replace function public.is_expected(e public.events, uid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare k text;
begin
  if not e.counts_attendance or not public.is_counted(uid) then return false; end if;
  foreach k in array (case when cardinality(e.kinds) > 0 then e.kinds else array[e.kind] end) loop
    if k = 'officer' then
      if exists (select 1 from user_roles where user_id = uid and role in ('admin','officer')) then return true; end if;
    elsif k = 'sectional' then
      if exists (select 1 from profiles where id = uid and section = e.section) then return true; end if;
    elsif k = 'class' then
      if exists (select 1 from class_students where class_id = e.class_id and user_id = uid) then return true; end if;
    else
      return true;
    end if;
  end loop;
  return false;
end $$;

-- 點名名單：應出席的人 + 已有紀錄的人，附請假與點名狀態
create or replace function public.event_roster(eid uuid)
returns table (user_id uuid, expected boolean, status text, note text, leave_type text, leave_reason text)
language plpgsql stable security definer set search_path = public as $$
declare e events;
begin
  select * into e from events where id = eid;
  if e.id is null or not public.can_see_event(e) then return; end if;
  return query
    select p.id, public.is_expected(e, p.id), a.status, a.note, l.type, l.reason
    from profiles p
    left join attendance a on a.event_id = eid and a.user_id = p.id
    left join leave_requests l on l.event_id = eid and l.user_id = p.id
    where p.status = 'active'
      and (public.is_expected(e, p.id) or a.user_id is not null or l.user_id is not null)
      and (public.is_officer() or p.id = auth.uid() or public.leads_user(p.id));
end $$;

-- 出席率統計（目前／整學期）
-- 晚到／早退：有事先預告（請假系統選了晚到或早退）算 late_weight／early_weight，沒預告算 unexcused_weight
create or replace function public.attendance_stats(sem uuid)
returns table (user_id uuid, expected_total int, expected_so_far int, attended numeric,
  present int, late int, early int, excused int, absent int, current_rate numeric, total_rate numeric)
language plpgsql stable security definer set search_path = public as $$
declare rules jsonb; lw numeric; ew numeric; uw numeric; exclude_excused boolean;
begin
  select value into rules from settings where key = 'attendance_rules';
  lw := coalesce((rules->>'late_weight')::numeric, 1);
  ew := coalesce((rules->>'early_weight')::numeric, 1);
  uw := coalesce((rules->>'unexcused_weight')::numeric, 0.5);
  exclude_excused := coalesce(rules->>'excused_mode', 'absent') = 'exclude';
  return query
  with ev as (
    select e as erow, e.id as eid, exists (select 1 from attendance a where a.event_id = e.id) as marked
    from events e where e.semester_id = sem and e.counts_attendance
  ), cells as (
    select p.id as uid, ev.marked, l.type as lt,
      coalesce(a.status, case when ev.marked then
        case when l.type = 'leave' then 'excused' else 'absent' end end) as st
    from profiles p cross join ev
    left join attendance a on a.event_id = ev.eid and a.user_id = p.id
    left join leave_requests l on l.event_id = ev.eid and l.user_id = p.id
    where p.status = 'active'
      and (public.is_officer() or p.id = auth.uid() or public.leads_user(p.id))
      and public.is_expected(ev.erow, p.id)
      and coalesce(a.status, '') <> 'na'
  ), w as (
    select cells.*, case st
      when 'present' then 1::numeric
      when 'late' then case when lt = 'late' then lw else uw end
      when 'early' then case when lt = 'early' then ew else uw end
      else 0::numeric end as wt
    from cells
  ), agg as (
    select uid,
      count(*)::int as exp_total,
      count(*) filter (where marked and not (exclude_excused and st = 'excused'))::int as exp_now,
      coalesce(sum(wt), 0) as got,
      count(*) filter (where st = 'present')::int as n_present,
      count(*) filter (where st = 'late')::int as n_late,
      count(*) filter (where st = 'early')::int as n_early,
      count(*) filter (where st = 'excused')::int as n_excused,
      count(*) filter (where st = 'absent')::int as n_absent,
      count(*) filter (where not marked and not (exclude_excused and st = 'excused'))::int as future
    from w group by uid
  )
  select uid, exp_total - case when exclude_excused then n_excused else 0 end, exp_now, got,
    n_present, n_late, n_early, n_excused, n_absent,
    case when exp_now > 0 then round(got / exp_now * 100, 1) end,
    case when (exp_now + future) > 0 then round(got / (exp_now + future) * 100, 1) end
  from agg;
end $$;

-- 個人出席明細：每次行程的計算後狀態
create or replace function public.attendance_detail(sem uuid, uid uuid)
returns table (event_id uuid, starts_at timestamptz, kind text, title text, expected boolean, marked boolean, status text, note text, leave_type text, leave_reason text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (uid = auth.uid() or public.is_officer() or public.leads_user(uid)) then return; end if;
  return query
    select e.id, e.starts_at, e.kind, e.title, public.is_expected(e, uid),
      exists (select 1 from attendance x where x.event_id = e.id),
      coalesce(a.status, case when exists (select 1 from attendance x where x.event_id = e.id)
        and public.is_expected(e, uid) then case when l.type = 'leave' then 'excused' else 'absent' end end),
      a.note, l.type, l.reason
    from events e
    left join attendance a on a.event_id = e.id and a.user_id = uid
    left join leave_requests l on l.event_id = e.id and l.user_id = uid
    where e.semester_id = sem and e.counts_attendance
    order by e.starts_at;
end $$;

-- 提到我的公告
create or replace function public.my_mentions()
returns setof public.announcements
language sql stable security definer set search_path = public as $$
  select a.* from announcements a
  where public.is_insider() and auth.uid() = any(a.mentions)
  order by a.created_at desc limit 50
$$;

-- 使用者 → Discord ID（給後端通知 @ 人用；一般登入者不能呼叫）
create or replace function public.discord_ids(uids uuid[])
returns table (user_id uuid, discord_id text)
language sql stable security definer set search_path = public, auth as $$
  select i.user_id, i.provider_id from auth.identities i where i.provider = 'discord' and i.user_id = any(uids)
$$;
revoke execute on function public.discord_ids(uuid[]) from public, anon, authenticated;

-- =====================================================================
-- 觸發器
-- =====================================================================
-- 新帳號：建立個人資料；系統內還沒有管理員時，第一位自動成為管理員
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_admin boolean;
begin
  first_admin := not exists (select 1 from user_roles where role = 'admin');
  insert into profiles (id, display_name, avatar_url, status)
  values (new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name',
             new.raw_user_meta_data->'custom_claims'->>'global_name', split_part(new.email, '@', 1), ''),
    new.raw_user_meta_data->>'avatar_url',
    case when first_admin then 'active' else 'pending' end)
  on conflict (id) do nothing;
  insert into profile_private (user_id, email) values (new.id, new.email) on conflict (user_id) do nothing;
  if first_admin then
    insert into user_roles values (new.id, 'admin'), (new.id, 'member') on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 個人資料：本人只能改基本欄位；狀態與職位只有管理員能改；組別幹部也能改
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.status is distinct from old.status or new.officer_title is distinct from old.officer_title then
    raise exception '只有管理員能變更帳號狀態或職位';
  end if;
  if (new.section is distinct from old.section) and not public.is_officer() then
    raise exception '組別由幹部設定';
  end if;
  return new;
end $$;
drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles
  for each row execute function public.guard_profile();

-- 至少保留一位管理員，避免交接時把自己鎖在外面
create or replace function public.keep_one_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and not exists (select 1 from user_roles where role = 'admin' and user_id <> old.user_id) then
    raise exception '系統至少要有一位管理員';
  end if;
  return old;
end $$;
drop trigger if exists keep_one_admin on public.user_roles;
create trigger keep_one_admin before delete on public.user_roles
  for each row execute function public.keep_one_admin();

create or replace function public.touch_updated() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events for each row execute function public.touch_updated();

-- =====================================================================
-- 存取規則 (RLS)
-- 新增資料表時，一定要加進這個陣列，並在下面寫 policy
-- =====================================================================
do $$ declare t text; p record; begin
  foreach t in array array['profiles','profile_private','user_roles','semesters','settings','private_settings',
    'calendars','classes','class_students','class_milestones','class_progress','events','leave_requests','attendance',
    'announcements','announcement_reads','tasks','forms','applications'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- 成員
create policy prof_read on public.profiles for select using (id = auth.uid() or public.is_active());
create policy prof_update on public.profiles for update using (id = auth.uid() or public.is_officer());
create policy prof_delete on public.profiles for delete using (public.is_admin() and id <> auth.uid());
create policy priv_read on public.profile_private for select using (user_id = auth.uid() or public.is_officer());
create policy priv_write on public.profile_private for update using (user_id = auth.uid() or public.is_admin());
create policy roles_read on public.user_roles for select using (user_id = auth.uid() or public.is_active());
create policy roles_admin on public.user_roles for all using (public.is_admin()) with check (public.is_admin());

-- 學期與設定
create policy sem_read on public.semesters for select using (public.is_active());
create policy sem_admin on public.semesters for all using (public.is_admin()) with check (public.is_admin());
create policy set_read on public.settings for select using (key = 'team_name' or public.is_active());
create policy set_admin on public.settings for all using (public.is_admin()) with check (public.is_admin());
create policy pset_admin on public.private_settings for all using (public.is_admin()) with check (public.is_admin());
create policy cal_read on public.calendars for select using (public.is_active());
create policy cal_admin on public.calendars for all using (public.is_admin()) with check (public.is_admin());

-- 教學班
create policy class_read on public.classes for select using (public.is_insider());
create policy class_write on public.classes for all using (public.is_officer()) with check (public.is_officer());
create policy cstu_read on public.class_students for select using (public.is_insider());
create policy cstu_write on public.class_students for all using (public.is_officer() or public.teaches_class(class_id))
  with check (public.is_officer() or public.teaches_class(class_id));
create policy cms_read on public.class_milestones for select using (public.is_insider());
create policy cms_write on public.class_milestones for all using (public.is_officer() or public.teaches_class(class_id))
  with check (public.is_officer() or public.teaches_class(class_id));
create policy cprog_read on public.class_progress for select using (user_id = auth.uid() or public.is_officer()
  or exists (select 1 from class_milestones m where m.id = milestone_id and public.teaches_class(m.class_id)));
create policy cprog_write on public.class_progress for all using (public.is_officer()
  or exists (select 1 from class_milestones m where m.id = milestone_id and public.teaches_class(m.class_id)))
  with check (public.is_officer()
  or exists (select 1 from class_milestones m where m.id = milestone_id and public.teaches_class(m.class_id)));

-- 行程
create policy ev_read on public.events for select using (public.can_see_event(events));
create policy ev_write on public.events for all using (public.is_officer()) with check (public.is_officer());

-- 請假：本人寫；幹部與組長看得到
create policy leave_read on public.leave_requests for select using (
  user_id = auth.uid() or public.is_officer() or public.leads_user(user_id));
create policy leave_own on public.leave_requests for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_active());

-- 點名：幹部全部；組長點自己組員
create policy att_read on public.attendance for select using (
  user_id = auth.uid() or public.is_officer() or public.leads_user(user_id));
create policy att_write on public.attendance for all using (public.is_officer() or public.leads_user(user_id))
  with check (public.is_officer() or public.leads_user(user_id));

-- 公告
create policy ann_read on public.announcements for select using (
  public.is_officer() or case audience
    when 'insiders' then public.is_insider()
    when 'section' then public.is_insider() and section = public.my_section()
    when 'newbies' then public.has_role('newbie')
    else false end);
create policy ann_write on public.announcements for all using (public.is_officer()) with check (public.is_officer());
-- 分享、資源：成員都能發，只能改或刪自己的
create policy ann_share_insert on public.announcements for insert with check (
  channel in ('share','resources') and public.is_insider() and author = auth.uid() and audience = 'insiders' and not pinned);
create policy ann_share_own on public.announcements for update using (channel in ('share','resources') and author = auth.uid())
  with check (channel in ('share','resources') and author = auth.uid() and audience = 'insiders' and not pinned);
create policy ann_share_del on public.announcements for delete using (channel in ('share','resources') and author = auth.uid());
create policy annr_own on public.announcement_reads for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 任務：幹部事項社員看不到
create policy task_read on public.tasks for select using (
  public.is_officer() or auth.uid() = any(assignees) or (audience = 'insiders' and public.is_insider()));
create policy task_insert on public.tasks for insert with check (public.is_officer());
create policy task_update on public.tasks for update using (public.is_officer() or auth.uid() = any(assignees));
create policy task_delete on public.tasks for delete using (public.is_officer());

-- 表單：成員看得到；幹部新增、修改、刪除
create policy form_read on public.forms for select using (public.is_insider());
create policy form_write on public.forms for all using (public.is_officer()) with check (public.is_officer());

-- 招生：開放報名期間任何人都能送出；只有幹部看得到與處理
create policy app_submit on public.applications for insert to anon, authenticated with check (
  status = 'new' and officer_note = ''
  and coalesce((select (value)::text = 'true' from public.settings where key = 'recruit_open'), false));
create policy app_officer on public.applications for select using (public.is_officer());
create policy app_officer_upd on public.applications for update using (public.is_officer()) with check (public.is_officer());
create policy app_officer_del on public.applications for delete using (public.is_officer());
create policy set_read_recruit on public.settings for select to anon using (key = 'recruit_open');
