import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  perms, SECTIONS, sectionCalendarKey, eventDefaults, kindsDefaults, kindsLabel, calendarsFor, rateLevel, twParts, twToIso,
  daysFromToday, defaultRollStatus, progressPct, twWeekday, backupDue, toCSV, safeUrl, formStatus, visibleNav, pageAllowed,
} from '../js/logic.js';

test('管理員自動擁有幹部權限', () => {
  const p = perms(['admin']);
  assert.equal(p.officer, true);
  assert.equal(p.staff, true);
  assert.equal(p.insider, true);
});

test('帳號未啟用時沒有任何權限', () => {
  const p = perms(['admin'], false);
  assert.equal(p.admin, false);
  assert.equal(p.insider, false);
});

test('指導老師與校友是社內成員，但不列入出席率', () => {
  assert.equal(perms(['teacher']).insider, true);
  assert.equal(perms(['teacher']).counted, false);
  assert.equal(perms(['alumni']).counted, false);
  assert.equal(perms(['member']).counted, true);
  assert.equal(perms(['newbie']).counted, true);
});

test('分組活動依組別放進對應行事曆', () => {
  assert.equal(sectionCalendarKey(SECTIONS[1]), 'sec:' + SECTIONS[1]);
  assert.equal(eventDefaults('sectional', SECTIONS[1]).calendar_key, 'sec:' + SECTIONS[1]);
  assert.equal(eventDefaults('sectional', null).calendar_key, 'main');
  assert.equal(eventDefaults('officer').audience, 'officers');
  assert.equal(eventDefaults('officer').counts_attendance, false);
  assert.equal(eventDefaults('regular').calendar_key, 'main');
});

test('複選類型：只有幹部會議才限幹部看', () => {
  assert.deepEqual(kindsDefaults(['officer']), { kind: 'officer', calendar_key: 'officers', audience: 'officers', counts: false });
  assert.deepEqual(kindsDefaults(['officer', 'sectional'], SECTIONS[0]),
    { kind: 'sectional', calendar_key: 'sec:' + SECTIONS[0], audience: 'insiders', counts: true });
  assert.equal(kindsLabel({ kinds: ['regular', 'event'], kind: 'regular' }), '例行聚會・大型活動');
  assert.equal(kindsLabel({ kind: 'class' }), '教學班');
});

test('行事曆清單：社員看不到幹部與其他組的行事曆', () => {
  const [a, b] = SECTIONS;
  const cals = [
    { key: 'main', audience: 'insiders', gcal_id: 'x' },
    { key: 'sec:' + a, audience: 'section', section: a, gcal_id: 'y' },
    { key: 'sec:' + b, audience: 'section', section: b, gcal_id: 'z' },
    { key: 'officers', audience: 'officers', gcal_id: 'w' },
    { key: 'class', audience: 'class', gcal_id: null },
  ];
  assert.deepEqual(calendarsFor(cals, perms(['member']), a).map((c) => c.key), ['main', 'sec:' + a]);
  assert.deepEqual(calendarsFor(cals, perms(['officer']), null).map((c) => c.key), ['main', 'sec:' + a, 'sec:' + b, 'officers']);
});

test('出席率分級', () => {
  assert.equal(rateLevel(null), 'none');
  assert.equal(rateLevel(80), 'ok');
  assert.equal(rateLevel(50), 'warn');
  assert.equal(rateLevel(49.9), 'bad');
});

test('台北時間轉換：晚上 19:30 不會跑到隔天', () => {
  const iso = twToIso('2026-11-14', '19:30');
  assert.equal(iso, '2026-11-14T11:30:00.000Z');
  assert.deepEqual([twParts(iso).date, twParts(iso).time], ['2026-11-14', '19:30']);
  assert.equal(twWeekday(iso), '六');
});

test('距今天數用台北日期計算', () => {
  const now = new Date('2026-10-07T17:00:00Z'); // 台北 10/8 01:00
  assert.equal(daysFromToday('2026-10-08T11:30:00Z', now), 0);
  assert.equal(daysFromToday('2026-10-09T11:30:00Z', now), 1);
});

test('點名預設狀態帶入請假', () => {
  assert.equal(defaultRollStatus({ status: 'present', leave_type: 'leave' }), 'present');
  assert.equal(defaultRollStatus({ leave_type: 'leave' }), 'excused');
  assert.equal(defaultRollStatus({ leave_type: 'late' }), 'late');
  assert.equal(defaultRollStatus({}), null);
});

test('教學進度百分比', () => {
  assert.equal(progressPct(0, 0), 0);
  assert.equal(progressPct(2, 3), 67);
});

test('備份提醒：超過 60 天沒備份才提醒；從沒備份過時，學期開始 30 天後才提醒', () => {
  const now = new Date('2026-12-01T00:00:00Z');
  assert.equal(backupDue('2026-11-01T00:00:00Z', '2026-09-01', now), false);
  assert.equal(backupDue('2026-09-15T00:00:00Z', '2026-09-01', now), true);
  assert.equal(backupDue(null, '2026-11-20', now), false);
  assert.equal(backupDue(null, '2026-09-01', now), true);
  assert.equal(backupDue(null, null, now), false);
});

test('CSV：有逗號、引號、換行的欄位會加引號，開頭有 BOM 讓 Excel 正確顯示中文', () => {
  const csv = toCSV([['姓名', '備註'], ['小華', '晚到, "家教"\n下次早點']]);
  assert.equal(csv, '﻿姓名,備註\r\n小華,"晚到, ""家教""\n下次早點"');
});

test('外部連結只接受 http(s)', () => {
  assert.equal(safeUrl('https://forms.gle/abc'), 'https://forms.gle/abc');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl(''), '');
});

test('表單狀態：沒有截止日一直開放；3 天內到期提醒；過期關閉', () => {
  const now = new Date('2026-10-10T04:00:00Z'); // 台北 10/10 中午
  assert.equal(formStatus({}, now), 'open');
  assert.equal(formStatus({ due: '2026-10-20' }, now), 'open');
  assert.equal(formStatus({ due: '2026-10-13' }, now), 'closing');
  assert.equal(formStatus({ due: '2026-10-10' }, now), 'closing');
  assert.equal(formStatus({ due: '2026-10-09' }, now), 'closed');
});

const NAV = [
  { path: '/', label: '首頁' },
  { path: '/events', label: '行程' },
  { path: '/forms', label: '表單' },
  { path: '/members', label: '成員', show: (p) => p.insider },
  { path: '/settings', label: '設定', show: (p) => p.admin },
  { path: '/me', label: '我的設定' },
];

test('選單：管理員隱藏的頁面不出現；首頁、設定、我的設定不能隱藏', () => {
  const hidden = ['/forms', '/settings', '/', '/me'];
  assert.deepEqual(visibleNav(NAV, perms(['member']), hidden).map((n) => n.path), ['/', '/events', '/members', '/me']);
  assert.deepEqual(visibleNav(NAV, perms(['admin']), hidden).map((n) => n.path), ['/', '/events', '/members', '/settings', '/me']);
});

test('被隱藏的頁面：一般成員直接輸入網址也進不去，管理員可以', () => {
  const hidden = ['/forms'];
  assert.equal(pageAllowed('/forms', perms(['member']), hidden), false);
  assert.equal(pageAllowed('/forms/abc', perms(['member']), hidden), false);
  assert.equal(pageAllowed('/forms', perms(['admin']), hidden), true);
  assert.equal(pageAllowed('/events', perms(['member']), hidden), true);
  assert.equal(pageAllowed('/formsx', perms(['member']), hidden), true);
});
