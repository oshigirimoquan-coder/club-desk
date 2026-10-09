// 選單：網站有哪些頁面、誰看得到、放在哪一組
//   main：手機版底部列（最多 4 個）；group：電腦版分段、手機版「更多」分組；mgr：收進「幹部」下拉選單
//   show(p)：依身分決定看不看得到（p 來自 js/logic.js 的 perms）
//   desc：設定頁「要顯示的頁面」裡的說明
// 管理員可以在設定頁隱藏頁面（存在 settings.hidden_pages）；首頁、設定、我的設定不能隱藏（logic.js 的 ALWAYS_SHOWN）
// 新增頁面：在這裡加一項，再到 js/app.js import 頁面檔（見 CUSTOMIZE.md）
export const NAV = [
  { path: '/', label: '首頁', main: true },
  { path: '/events', label: '行程', main: true, group: '活動', desc: '行程、請假、點名，同步 Google 行事曆' },
  { path: '/attendance', label: '出席', group: '活動', show: (p) => p.counted || p.officer || p.leader, desc: '出席率與個人明細' },
  { path: '/forms', label: '表單', main: true, group: '活動', desc: 'Google 表單的連結清單' },
  { path: '/tools', label: '工具', group: '活動', desc: '常用外部網頁的連結' },
  { path: '/announcements', label: '公告', main: true, badge: 'main', group: '社團', desc: '公告、活動分享、資源' },
  { path: '/tasks', label: '任務', group: '社團', desc: '分派工作、追蹤進度' },
  { path: '/members', label: '成員', group: '社團', show: (p) => p.insider, desc: '名冊；管理員在這裡核准新成員' },
  { path: '/teaching', label: '教學班', group: '幹部', mgr: true, show: (p) => p.canTeach, desc: '新生教學班與進度' },
  { path: '/recruit', label: '招生', group: '幹部', mgr: true, show: (p) => p.officer, desc: '免登入報名表與報名名單' },
  { path: '/settings', label: '設定', group: '幹部', mgr: true, show: (p) => p.admin },
  { path: '/me', label: '我的設定', mobileOnly: true, group: '個人' },
];
