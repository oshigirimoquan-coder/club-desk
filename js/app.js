import { sb, state, connect, loadMe, loadShared, render, esc, $, $$, toast, errText, me, DEMO, avatar, nameOf } from './core.js';
import { brand } from './mark.js';
import { NAV } from './nav.js';
import { visibleNav } from './logic.js';
import './views/home.js';
import './views/events.js';
import './views/attendance.js';
import './views/announcements.js';
import './views/tasks.js';
import './views/teaching.js';
import './views/members.js';
import './views/settings.js';
import './views/me.js';
import './views/tools.js';
import './views/forms.js';
import { joinScreen } from './views/recruit.js';
import { SHARE_CATS } from './views/announcements.js';

const MGR = NAV.filter((n) => n.mgr).map((n) => n.path);
document.addEventListener('click', (e) => { const d = document.querySelector('.mgr[open]'); if (d && (!d.contains(e.target) || e.target.closest('a'))) d.open = false; });

function tabLinks(list) {
  let prev = null;
  return list.map((n) => { const sep = prev !== null && n.group !== prev ? '<span class="tab-sep" aria-hidden="true"></span>' : ''; prev = n.group || '';
    return `${sep}<a href="#${n.path}" data-nav="${n.path}">${n.label}${n.badge ? `<i class="badge" data-b="${n.badge}" hidden></i>` : ''}</a>`; }).join('');
}
function moreGroups(list) {
  const groups = [...new Set(list.map((n) => n.group))];
  return groups.map((g) => `<div class="more-g"><span>${g}</span>${list.filter((n) => n.group === g).map((n) => `<a href="#${n.path}" data-nav="${n.path}">${n.label}${n.badge === 'tag' ? '<i class="badge" data-b="tag" hidden></i>' : ''}</a>`).join('')}</div>`).join('');
}

function shell() {
  const p = state.p;
  const items = visibleNav(NAV, p, state.settings.hidden_pages);
  const team = state.settings.team_name || '社團';
  document.title = team;
  $('#app').innerHTML = `
    <header class="top"><div class="top-in">
      <a class="brand" href="#/" aria-label="${esc(team)} 首頁">${brand(team)}</a>
      <nav class="tabs" aria-label="主選單">${tabLinks(items.filter((n) => !n.mobileOnly && !n.mgr))}</nav>
      ${items.some((n) => n.mgr) ? `<details class="mgr"><summary>幹部</summary><div class="mgr-menu">${items.filter((n) => n.mgr).map((n) => `<a href="#${n.path}" data-nav="${n.path}">${n.label}</a>`).join('')}</div></details>` : ''}
      <a class="me-link" href="#/me" data-nav="/me"><span>${esc(nameOf(me()))}</span>${avatar(me(), 30)}</a>
    </div></header>
    <main id="main" tabindex="-1"></main>
    <nav class="bottom" aria-label="主選單">
      ${items.filter((n) => n.main).map((n) => `<a href="#${n.path}" data-nav="${n.path}"><i class="dot"></i>${n.label}${n.badge ? `<i class="badge" data-b="${n.badge}" hidden></i>` : ''}</a>`).join('')}
      <button id="more-btn" aria-expanded="false" aria-controls="more"><i class="dot"></i>更多</button>
    </nav>
    <div id="more" class="more" hidden><div class="more-sheet">${moreGroups(items.filter((n) => !n.main))}</div></div>
    ${DEMO ? '<div class="demo-flag">示範模式・資料為虛構</div>' : ''}`;
  const more = $('#more'), btn = $('#more-btn');
  btn.onclick = () => { more.hidden = !more.hidden; btn.setAttribute('aria-expanded', String(!more.hidden)); };
  more.onclick = (e) => { if (e.target === more || e.target.closest('a')) { more.hidden = true; btn.setAttribute('aria-expanded', 'false'); } };
}

async function refreshUnread() {
  const [{ data: anns }, { data: reads }] = await Promise.all([
    sb.from('announcements').select('id').not('channel', 'in', `(${SHARE_CATS.join(',')})`).limit(100), sb.from('announcement_reads').select('ann_id').eq('user_id', me()),
  ]);
  const r = new Set((reads || []).map((x) => x.ann_id));
  const counts = { main: (anns || []).filter((a) => !r.has(a.id)).length };
  $$('.badge').forEach((b) => { const n = counts[b.dataset.b] || 0; b.hidden = !n; b.textContent = n > 9 ? '9+' : n; });
}

document.addEventListener('routed', (e) => {
  const path = e.detail;
  $$('[data-nav]').forEach((a) => {
    const n = a.dataset.nav;
    a.toggleAttribute('aria-current', n === '/' ? path === '/' : path.startsWith(n));
  });
  $('.mgr')?.classList.toggle('on', MGR.some((m) => path.startsWith(m)));
  const cur = () => $('.tabs a[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  cur(); setTimeout(cur, 400); document.fonts?.ready.then(cur);
  window.scrollTo(0, 0);
});
document.addEventListener('unread-changed', () => refreshUnread());
// 設定頁改了社團名稱或要顯示的頁面：重畫外框與選單
document.addEventListener('shell-changed', async () => { shell(); await render(); refreshUnread(); });

// ---------- 登入畫面 ----------
const DISCORD_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 5.5A16 16 0 0 0 15 4.3l-.5 1a15 15 0 0 0-5 0l-.5-1A16 16 0 0 0 5 5.5C2.5 9.3 1.8 13 2.1 16.6A16 16 0 0 0 7 19l1-1.6a10 10 0 0 1-1.6-.8l.4-.3a11.5 11.5 0 0 0 10.4 0l.4.3-1.6.8 1 1.6a16 16 0 0 0 4.9-2.4c.4-4.2-.6-7.9-2.9-11.1zM9 14.5c-.9 0-1.7-.9-1.7-2s.8-2 1.7-2 1.7.9 1.7 2-.8 2-1.7 2zm6 0c-.9 0-1.7-.9-1.7-2s.8-2 1.7-2 1.7.9 1.7 2-.8 2-1.7 2z"/></svg>';
function authHead() {
  return `<div class="auth-mark">${brand(state.settings.team_name, { big: true })}</div>`;
}
function authScreen(mode = 'login') {
  $('#app').innerHTML = `<div class="auth"><div class="auth-card">
    ${authHead()}
    <p class="auth-sub">行程・請假・出席・公告</p>
    <div class="auth-box">
      <button class="btn discord" id="discord">${DISCORD_SVG}用 Discord 登入</button>
      <div class="or"><span>或用 Email ${mode === 'signup' ? '註冊' : '登入'}</span></div>
      <form id="auth-form" class="auth-form">
        ${mode === 'signup' ? '<label>姓名<input name="name" required maxlength="40" autocomplete="name"></label>' : ''}
        <label>Email<input name="email" type="email" required autocomplete="email"></label>
        <label>密碼<input name="pw" type="password" required minlength="6" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}"></label>
        <button class="btn pri">${mode === 'signup' ? '註冊' : '登入'}</button>
      </form>
      <button class="link" id="switch">${mode === 'signup' ? '已經有帳號？登入' : '沒有 Discord？用 Email 註冊'}</button>
    </div>
    <p class="small muted">沒有 Discord 的人（例如外校指導老師）可以用 Email 註冊。註冊後需要管理員核准。</p>
  </div></div>`;
  $('#discord').onclick = () => sb.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: location.origin + location.pathname } }).then((r) => r.error && toast(errText(r.error), 'bad'));
  $('#switch').onclick = () => authScreen(mode === 'signup' ? 'login' : 'signup');
  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target); const b = e.target.querySelector('button'); b.disabled = true;
    const r = mode === 'signup'
      ? await sb.auth.signUp({ email: f.get('email'), password: f.get('pw'), options: { data: { full_name: f.get('name') } } })
      : await sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('pw') });
    b.disabled = false;
    if (r.error) {
      const m = r.error.message;
      return toast(/Invalid login/i.test(m) ? 'Email 或密碼錯誤。' : /already/i.test(m) ? '這個 Email 已經註冊過，請直接登入。' : errText(r.error), 'bad');
    }
    if (!r.data.session) toast('請到信箱點確認信後再登入。');
  };
}

function waitingScreen() {
  const inactive = state.profile?.status === 'inactive';
  $('#app').innerHTML = `<div class="auth"><div class="auth-card">${authHead()}
    <h1>${inactive ? '帳號已停用' : '已送出加入申請'}</h1>
    <p class="muted">${inactive ? '如果這是誤會，請聯絡社長或管理員。' : `${esc(state.profile?.display_name || '')}，管理員核准後就能使用。可以先到 DC 跟幹部說一聲。`}</p>
    <div class="row"><button class="btn" onclick="location.reload()">重新整理</button><button class="btn ghost" id="out">登出</button></div></div></div>`;
  $('#out').onclick = () => sb.auth.signOut();
}

function setupScreen() {
  $('#app').innerHTML = `<div class="auth"><div class="auth-card">${authHead()}<h1>還差一步：連接資料庫</h1>
    <p class="muted">請依照 <code>docs/SETUP.md</code> 建立 Supabase 專案，並把網址與 publishable key 填進 <code>config.js</code>。</p>
    <p><a class="btn" href="?demo">先看示範模式</a></p></div></div>`;
}

// ---------- 啟動 ----------
const isJoin = () => location.hash.startsWith('#/join');
async function boot() {
  if (isJoin()) return joinScreen();
  if (!state.session) {
    const { data } = await sb.from('settings').select('*').eq('key', 'team_name').maybeSingle();
    if (data) state.settings.team_name = data.value;
    return authScreen('login');
  }
  await loadMe();
  if (!state.profile || state.profile.status !== 'active') return waitingScreen();
  await loadShared();
  shell();
  await render();
  refreshUnread();
}

(async () => {
  try {
    if (!(await connect())) return setupScreen();
    const { data } = await sb.auth.getSession();
    state.session = data.session;
    sb.auth.onAuthStateChange((_e, s) => {
      const before = state.session?.user?.id, after = s?.user?.id;
      state.session = s;
      if (before !== after) boot();
    });
    window.addEventListener('hashchange', () => { if (isJoin()) return joinScreen(); if (!$('#main')) return boot(); if (state.profile?.status === 'active') render(); });
    await boot();
  } catch (e) {
    console.error(e);
    $('#app').innerHTML = `<div class="auth"><div class="auth-card"><h1>載入失敗</h1><p class="muted">${esc(errText(e))}</p><button class="btn" onclick="location.reload()">重新整理</button></div></div>`;
  }
})();
