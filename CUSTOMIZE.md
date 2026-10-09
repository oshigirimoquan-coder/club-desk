# CUSTOMIZE.md — AI 照需求表改造網站的步驟

給 AI 的工作流程。人要做的只有：fork 這個 repo、填 `club.md`、把素材放進 `materials/`，然後對 AI 說「照 `club.md` 和 `CUSTOMIZE.md` 改造」。

**原則**
- 確定不要的功能**直接刪程式**（頁面、資料表、權限、測試、假資料），不要用設定開關藏起來；死程式碼會讓下一個 AI 看不懂。
- 只是「這學期先不用」的頁面不必刪：上線後管理員在「設定 → 要顯示的頁面」取消勾選就好。
- 一次改一件事，每件事改完都跑 `npm test`。

---

## 0. 開工前

1. 讀 `club.md`、`AGENTS.md`、本檔。
2. `npm install && npm test`，確認起點全綠。起點就壞了先回報，不要開始改。
3. 開新分支：`git checkout -b customize`。網站已經上線在用的話，**絕不直接改 main**。
4. 把 `club.md` 裡留空、寫「不確定」、或互相矛盾的地方列出來，一次問清楚再動手。常見要問的：
   - 分組名稱？有沒有分組？
   - 出席率怎麼算（晚到、請假）？
   - 標誌只有 PNG 時，要直接用圖片還是用社名第一個字？
5. 列出改造計畫（要改哪些名稱、刪哪些功能、新增什麼），給人確認後再做。

## 1. 換成這個社團的樣子

| 改什麼 | 在哪 |
|---|---|
| 網站標題、favicon、theme-color | `index.html` |
| 預設社名 | `supabase/schema.sql` 的 `settings` 種子資料 `team_name`、`js/mock.js` 的示範資料（上線後管理員也能在設定頁改） |
| 標誌 | `js/mark.js`：預設是「社名第一個字＋社名」。有 SVG／PNG 標誌就放到 `img/`，改 `brand()` 輸出 `<img>`；`index.html` 的開機畫面與 favicon 一起換 |
| 顏色 | `css/app.css` 開頭的變數：亮色一組、暗色**兩組**（`@media` 那組和 `[data-theme="dark"]` 那組要一樣）。改完確認文字和背景對比夠（一般文字至少 4.5:1） |
| 字型 | `index.html` 的 Google Fonts 連結、`css/app.css` 的 `--f-head`／`--f-body` |
| Supabase 連線 | `config.js`：填這個社團自己的專案網址與 publishable key（見 `docs/SETUP.md`） |
| 欄位名稱 | 例如「專長」要改成「相機型號」：只改畫面上的文字（`me.js`、`members.js`、備份 CSV 標題），資料庫欄位 `specialty` 不用改名 |
| 示範資料 | `js/mock.js`：改成符合這個社團的虛構資料（**不要用真實成員**） |
| 給 AI 的工作習慣 | `CLAUDE.md` |
| 授權 | `LICENSE` 保留原本的著作權行，可以在下面加一行自己的 |

## 2. 調整清單：組別、身分組、行程類型、公告分類

這四種清單同時寫在前端、資料庫、後端函式，對照表在 `AGENTS.md` §4「跨檔案的清單」。**一定要全部一起改**，改完跑測試。

- **組別**：改 `js/logic.js` 的 `SECTIONS` 和 `schema.sql` 的 `section_list()`，兩邊順序一樣。顏色依順序用 `--s-1`～`--s-6`；超過 6 組要在 `css/app.css` 加 `--s-7` 和 `.sec-7`、`.cal-sec-7`。每個組別的行事曆會自動建立（`calendars` 的 `sec:組名`）。
  不分組的社團：`SECTIONS` 留空陣列、`section_list()` 回傳空陣列，再拿掉「分組活動」類型和組長身分組（照 §3 的步驟）。
- **身分組**：只改顯示名稱的話，改 `ROLE_LABEL` 就好，**代號不要改**（代號寫在資料庫約束和 policy 裡）。要新增或刪除身分組，照 `AGENTS.md` §5 一起改 `schema.sql`、`perms()`、`nav.js` 的 `show`、`members.js` 的核准按鈕，並補權限測試。
- **行程類型**：`KIND_LABEL`、`eventDefaults`、`schema.sql` 的 `events.kind`／`kinds` 約束、`is_expected`、`supabase/functions/_shared/common.ts` 的 `KIND`。新類型如果「誰要到」跟一般活動不同，要在 `is_expected` 加一個分支並補測試。
- **公告分類**：`announcements.js` 的 `CATS`、`schema.sql` 的 `announcements.channel` 約束與 `ann_share_*` policy（哪些分類成員可以發）、`notify` 函式的 `CH`、`css/app.css` 的 `.atype.c-*` 顏色。

已經上線的資料庫要改清單：先把舊資料改成新名稱（例如 `update profiles set section = '人像組' where section = '第一組'`），再重跑 `schema.sql`。這段 SQL 給管理員執行，不要寫進 `schema.sql`。

## 3. 刪掉不要的功能

### 通用步驟

1. **找出所有痕跡**：用資料表名、頁面檔名、路徑、中文名稱搜尋整個 repo（`grep -rn "關鍵字" --exclude-dir=node_modules .`）。
2. **前端**：刪頁面檔 → 刪 `js/app.js` 的 import → 刪 `js/nav.js` 的項目 → 刪其他頁面裡引用它的區塊與 import → 刪 `js/logic.js` 裡只有它用的東西 → 刪 CSS。
3. **資料庫**：刪 `create table`、只有它用的函式、觸發器、policy → **從 RLS 迴圈的資料表陣列拿掉**（留著的話整份 SQL 會因為找不到表而失敗）→ 其他函式若有引用也要改。
4. **備份**：從 `settings.js` 的 `BACKUP_TABLES` 拿掉。
5. **示範資料**：從 `js/mock.js` 拿掉。
6. **後端函式**：`supabase/functions/` 裡有提到的地方，改完跑 `node scripts/bundle-functions.mjs`。
7. **測試**：刪掉只測這個功能的測試；其他測試的種子資料若用到它，改寫種子資料。
8. **已上線的資料庫**：從零開始的社團不用管。已經有這張表的話，另外給管理員一段 `drop table if exists ... cascade;`，**不要寫進 `schema.sql`**，並說清楚會刪掉哪些資料、建議先在設定頁匯出備份。
9. `npm test` 全過，`?demo` 每一頁點過一次，console 沒有錯誤。

### 範例：刪掉「教學班」

教學班牽涉行程類型、出席規則、行事曆、公告分類、招生表，是很好的練習。

| 步驟 | 動作 |
|---|---|
| 搜尋 | `grep -rnE "class_id\|classes\|class_students\|class_milestones\|class_progress\|'class'\|teaches_class\|in_class\|want_class\|canTeach\|教學班" js supabase tests` |
| 頁面 | 刪 `js/views/teaching.js`；`app.js` 刪 `import './views/teaching.js'`；`nav.js` 刪 `/teaching` |
| 權限 | `logic.js`：`perms()` 刪 `canTeach`；`calendarsFor` 刪 `class` 那行 |
| 行程類型 | `logic.js` 的 `KIND_LABEL` 刪 `class`、`eventDefaults` 刪 `class` 分支；`events.js` 刪「教學班」下拉選單、`class_id` 欄位與檢查；`common.ts` 的 `KIND` 刪 `class` |
| 資料庫 | `schema.sql`：刪 §4 教學班四張表、`teaches_class`、`in_class`、教學班的 policy；`events` 刪 `class_id` 欄位，`kind`／`kinds` 約束拿掉 `'class'`；`is_expected` 刪 `class` 分支；`calendars` 種子資料刪 `class`；`calendars.audience` 約束拿掉 `'class'`；RLS 陣列拿掉四張表 |
| 公告 | 要不要保留「教學班」分類問人。不要的話照 §2 公告分類一起改，`announcements.js` 的 `DEFAULT_AUD` 也刪掉 |
| 招生 | `recruit.js` 刪「想參加新生教學班」勾選與名單上的顯示；`schema.sql` 的 `applications.want_class` 欄位刪掉 |
| 其他頁面 | `attendance.js` 頁首說明文字；`settings.js` 學期說明文字與 `BACKUP_TABLES` |
| 示範資料與測試 | `mock.js` 刪 `classes`、`class_*`、行程 `e7`；`mock.js` 的 `expected()` 刪 `class` 分支；`tests/schema.test.mjs` 刪「教學班只有班上學生」；`tests/logic.test.mjs` 行事曆測試刪 `class` |
| 驗證 | `npm test` 全過；再 grep 一次，只剩刻意保留的字；`?demo` 新增一個行程，類型選項裡沒有教學班 |

## 4. 新增一個功能

### 通用步驟

1. **先寫清楚**：誰用、誰看得到、誰能改、要存哪些欄位。權限講不清楚就先問人。
2. **先寫會失敗的測試**：`tests/schema.test.mjs` 寫「該能做的做得到、不該做的做不到」；有純邏輯就寫 `tests/logic.test.mjs`。跑一次確認是紅的。
3. **資料庫**（`schema.sql`，放在相近的區段）：`create table if not exists` → 加進 RLS 迴圈陣列 → 寫 policy（用現有的身分判斷函式）。
4. **前端**：新增 `js/views/<功能>.js`，照現有頁面寫法；`app.js` 加 import；`nav.js` 加一項（`show` 用 `perms()` 的欄位、寫 `desc`，設定頁的「要顯示的頁面」就會自動出現它）。
5. **周邊**：加進 `BACKUP_TABLES`；`mock.js` 加假資料；CSS 只用現有變數。
6. **文件**：`AGENTS.md` §4 功能表加一列；`club.md` 功能清單加一列。
7. `npm test` 全過；`?demo` 實際操作：新增、修改、刪除；電腦和手機寬度都看。

### 範例：新增「器材借用」

需求（`club.md` 這樣寫）：社員登記借哪件器材、哪天還；本人看得到自己的紀錄；幹部看得到全部、可以標記已歸還；逾期顯示紅色。

**測試先寫**（`tests/schema.test.mjs`）：
- 社員 B 能新增自己的借用；看不到別人的；不能把自己的改成已歸還。
- 管理員 A 看得到全部、能標記歸還。
- 沒有身分組的帳號不能新增。

`tests/logic.test.mjs`：`loanStatus` 已還、逾期、借用中各一個案例。

**資料庫**（`schema.sql`，放在「公告、任務」區段後面）：

```sql
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  item text not null,
  borrowed_on date not null default current_date,
  due_on date not null,
  returned_on date,
  note text not null default '',
  created_at timestamptz not null default now()
);
```

RLS 迴圈陣列加上 `'loans'`，policy 區加：

```sql
-- 器材借用：本人看自己的、可以登記；幹部看全部、可以改與刪
create policy loan_read on public.loans for select using (user_id = auth.uid() or public.is_officer());
create policy loan_insert on public.loans for insert with check (public.is_insider() and user_id = auth.uid());
create policy loan_officer on public.loans for update using (public.is_officer()) with check (public.is_officer());
create policy loan_delete on public.loans for delete using (public.is_officer());
```

**純邏輯**（`js/logic.js`）：

```js
// 借用狀態：已還／逾期／借用中
export function loanStatus(loan, now = new Date()) {
  if (loan.returned_on) return 'returned';
  return daysFromToday(loan.due_on + 'T12:00:00+08:00', now) < 0 ? 'overdue' : 'out';
}
```

**頁面**（`js/views/loans.js`）：照 `tasks.js` 或 `forms.js` 的結構——上方 `pageHead`，成員有「＋ 登記借用」按鈕（`formDialog`，欄位：器材、預計歸還日、備註），清單依 `loanStatus` 顯示 `chip`（逾期用 `bad`），幹部每列多一個「已歸還」按鈕。檔尾 `route('/loans', ...)`。

**接上**：`app.js` 加 `import './views/loans.js'`；`nav.js` 加 `{ path: '/loans', label: '器材', group: '社團', show: (p) => p.insider, desc: '器材借用登記' }`；`BACKUP_TABLES` 加 `'loans'`；`mock.js` 加兩三筆假資料（含一筆逾期）。

**收尾**：`AGENTS.md` §4 加「器材借用｜`loans.js`｜`loans`」；`npm test`；`?demo` 試借、試還、看逾期顏色。

## 5. 交付

1. `npm test` 全過。
2. 告訴人：改了什麼、刪了什麼、新增了什麼，以及**人要手動做的事**（在 Supabase 跑哪段 SQL、設定哪些 Secrets、Discord webhook）。
3. 推到分支，請人用 `?demo` 看過再合併。資料庫已上線的社團：先給 SQL、確認跑完再合併。
