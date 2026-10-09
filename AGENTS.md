# AGENTS.md — 給 AI 看的專案說明

這是一套給學校社團用的管理網站：行程、請假、點名與出席率、公告、表單連結、任務、成員、教學班、招生。
這個 repo 是**範本**：每個社團 fork 之後，照 `club.md`（需求表）和 `CUSTOMIZE.md`（改造步驟）讓 AI 改成自己的版本。

> 開工前依序讀：`club.md`（這個社團要什麼）→ 本檔 → 要改造時讀 `CUSTOMIZE.md`。
> 使用這個網站的人多半沒有程式背景：回報時用白話、先講結論，把需要人手動做的事（在 Supabase 跑 SQL、設定 Secrets）列清楚。

## 1. 兩種「客製」，不要混用

| 方式 | 誰做 | 適用 |
|---|---|---|
| **改程式**（照 `club.md`） | AI | 社名、顏色、標誌、組別、身分組、活動類型、公告分類；拿掉確定不要的功能；新增功能 |
| **設定頁** | 社團管理員，在網站上操作 | 隱藏／顯示頁面、出席率權重、Discord webhook、學期、工具與表單連結 |

確定永遠不要的功能就刪掉程式（頁面、資料表、權限、測試、假資料），不要用設定開關藏起來。
設定頁的「隱藏頁面」是給管理員臨時調整用的，只管選單與網址，**不是權限**：資料庫規則照樣有效。

## 2. 技術架構

| 層 | 用什麼 | 放哪 |
|---|---|---|
| 前端 | 純 HTML／CSS／JavaScript（ES modules），**沒有建置步驟、沒有框架** | GitHub Pages |
| 資料庫與權限 | Supabase Postgres＋RLS | `supabase/schema.sql`（整份可重複執行） |
| 登入 | Supabase Auth（Discord、Email） | Supabase 後台 |
| 後端函式 | Supabase Edge Functions（Deno） | `supabase/functions/*` |
| 行事曆 | Google Calendar 服務帳戶 | `calendar-sync` 函式 |
| 通知 | Discord webhook | `notify`、`daily-reminder` 函式 |
| 排程 | Supabase pg_cron | `supabase/cron.sql` |
| 保活 | GitHub Actions 每 3 天連一次資料庫 | `.github/workflows/keepalive.yml` |

不要在前端引入 npm 套件或 bundler。外部函式庫只能用 CDN 的 ES module（目前只有 supabase-js）。

## 3. 檔案地圖

```
index.html            頁面外殼、網站標題、favicon、字型
config.js             Supabase 網址與 publishable key（公開的，見 §6）
css/app.css           全部樣式；顏色在檔案開頭的變數（亮色一組、暗色兩組）
js/app.js             外框、登入畫面、載入各頁面
js/nav.js             選單：有哪些頁面、誰看得到、放在哪一組
js/core.js            連線、全域 state、表單對話框 formDialog、路由 route()、共用小元件
js/logic.js           純邏輯，沒有畫面也沒有網路，全部有測試；組別、身分組、行程類型的清單也在這裡
js/mark.js            社團標誌
js/mock.js            示範模式（網址加 ?demo）的假資料庫
js/views/*.js         每個頁面一個檔，檔尾用 route('/路徑', fn) 註冊
supabase/schema.sql   資料表、身分判斷函式、出席率計算、觸發器、RLS
supabase/functions/   Edge Functions 原始碼（_shared/common.ts 是共用）
supabase/dashboard/   上面函式的單檔版（自動產生，不要手改）
tests/                logic.test.mjs 測純邏輯；schema.test.mjs 用 PGlite 在本機跑 schema.sql 測權限
materials/            社團放標誌、配色、參考資料的地方
docs/                 給人看的設定、交接、維護手冊
```

## 4. 功能在哪

| 功能 | 頁面 | 資料表／函式 |
|---|---|---|
| 首頁（下一個行程、提醒、最新公告、出席率） | `home.js` | 讀其他表 |
| 行程（類型可複選、同步 Google 日曆）、請假、點名 | `events.js` | `events`, `leave_requests`, `attendance`, `calendars`；`event_roster` |
| 出席率 | `attendance.js` | `is_expected`, `attendance_stats`, `attendance_detail`；設定 `attendance_rules` |
| 表單（Google 表單連結清單，可設截止日） | `forms.js` | `forms` |
| 工具（外部連結） | `tools.js` | `settings.tools` |
| 公告（分類、對象、標記人、已讀；成員可發分享與資源） | `announcements.js` | `announcements`, `announcement_reads`；`my_mentions` |
| 任務 | `tasks.js` | `tasks` |
| 成員、身分組、核准 | `members.js`, `me.js` | `profiles`, `profile_private`, `user_roles` |
| 教學班與進度 | `teaching.js` | `classes`, `class_students`, `class_milestones`, `class_progress` |
| 招生（免登入報名 `#/join`） | `recruit.js` | `applications`；設定 `recruit_open` |
| 設定：社名、隱藏頁面、學期、出席規則、通知、行事曆、備份 | `settings.js` | `settings`, `private_settings`, `semesters` |
| Discord 通知、每日提醒、行事曆同步 | — | `supabase/functions/*` |

### 跨檔案的清單（改一個就要改全部）

| 清單 | 前端 | 資料庫 | 其他 |
|---|---|---|---|
| 組別 | `logic.js` 的 `SECTIONS` | `schema.sql` 的 `section_list()` | CSS 依順序配色 `--s-1`～`--s-6` |
| 身分組 | `logic.js` 的 `ROLE_LABEL`、`perms()` | `user_roles` 的約束、`is_counted`、相關 policy | `members.js` 核准按鈕 |
| 行程類型 | `logic.js` 的 `KIND_LABEL`、`eventDefaults` | `events.kind`／`kinds` 約束、`is_expected` | `supabase/functions/_shared/common.ts` 的 `KIND` |
| 公告分類 | `announcements.js` 的 `CATS` | `announcements.channel` 約束、`ann_share_*` policy | `notify` 函式的 `CH` |
| 頁面 | `nav.js` 的 `NAV`、`app.js` 的 import | — | `logic.js` 的 `ALWAYS_SHOWN`（不能隱藏的頁面） |

## 5. 權限規則

**資料庫的 RLS 才是真正的把關**（`supabase/schema.sql` 後半）。前端 `js/logic.js` 的 `perms()` 只決定畫面顯示什麼。**兩邊必須一致**：改一邊就要改另一邊，並補測試。

| 代號 | 名稱 | 重點 |
|---|---|---|
| `admin` | 管理員 | 全部權限；系統至少保留一位（觸發器 `keep_one_admin`）；第一位登入的人自動成為管理員 |
| `officer` | 幹部 | 管行程、公告、表單、成員組別、點名、招生 |
| `leader` | 組長 | 看自己組員的請假與出席、幫自己組員點名 |
| `teacher` | 指導老師 | 帶教學班；不列入出席率 |
| `member` | 社員 | 一般成員 |
| `newbie` | 新生 | 社員的一種，可收新生公告、可被排進教學班 |
| `alumni` | 校友 | 看得到社內資訊；不列入出席率 |

帳號狀態 `profiles.status`：`pending`（待核准）／`active`（啟用）／`inactive`（停用，紀錄保留）。

SQL 身分判斷函式（policy 一律用這些，不要在 policy 裡重寫判斷）：
`is_active()`、`has_role(r)`、`is_admin()`、`is_officer()`（admin 或 officer）、`is_staff()`（officer 或 teacher）、`is_insider()`（有任何身分組）、`is_counted(uid)`（列入出席率）、`my_section()`、`leads_user(uid)`、`teaches_class(cid)`、`in_class(cid)`、`can_see_event(e)`。

**應出席規則**（`is_expected`）：行程類型可以複選，符合任一種就算。幹部會議 → 幹部；分組活動 → 該組；教學班 → 班上學生；其他類型 → 所有列入出席率的人。

新增資料表時一定要：
1. 加進 `schema.sql`「存取規則」開頭 RLS 迴圈的資料表陣列（漏了的話整份 SQL 會跑失敗，或資料表沒開 RLS）
2. 寫讀、寫的 policy
3. 加進 `js/views/settings.js` 的 `BACKUP_TABLES`
4. `js/mock.js` 加假資料
5. `tests/schema.test.mjs` 至少一個「該看的看得到、不該看的看不到」

## 6. 金鑰規定

- `config.js` **只能放 publishable key**（`sb_publishable_...`）。這把本來就會出現在網頁上，安全靠 RLS。
- **絕不**把 `service_role` / secret key、Google 服務帳戶 JSON、Discord webhook 網址、Bot token 寫進任何檔案或 commit。
- 後端需要的值放 **Supabase → Edge Functions → Secrets**：`GOOGLE_SERVICE_ACCOUNT`、`CRON_SECRET`、`SITE_URL`（`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`SUPABASE_ANON_KEY` 是內建的）。
- Discord webhook 網址存在資料表 `private_settings`（只有管理員與後端讀得到），由管理員在設定頁貼上。
- 每個社團用**自己的** Supabase 專案，不能共用。
- 不要要求使用者把金鑰貼進對話；請他們自己貼到 Supabase 後台。
- 發現金鑰被 commit：立刻到該服務後台作廢重發，再清掉檔案。只刪 commit 不夠。
- 不要把真實成員資料（名單、電話、學號）放進 repo、`materials/` 或測試。

## 7. 改完要做

```bash
npm install          # 第一次
npm test             # 必須全過才算完成
node scripts/bundle-functions.mjs   # 有改 supabase/functions/* 時
python3 -m http.server 8000         # 開 http://localhost:8000/?demo 用假資料看畫面
```

- 改 `js/logic.js` → 補 `tests/logic.test.mjs`。改 `schema.sql` 的表、函式或 policy → 補 `tests/schema.test.mjs`。先寫會失敗的測試，再改程式。
- `schema.sql` 要能**對已上線的資料庫重複執行**：用 `create ... if not exists`、`add column if not exists`、`create or replace`、`drop ... if exists` 再建。測試會連跑兩次確認。
- 已上線的社團改了資料庫：先把要跑的 SQL 給管理員，確認跑完再推網站。刪表、刪欄位這種破壞性改動不要寫進 `schema.sql`，另外給一段 SQL 並說清楚會刪掉什麼。
- 改了資料表 → `js/mock.js` 的假資料也要改，否則 `?demo` 會壞。
- 改了 `supabase/functions/*` → 重新產生 `supabase/dashboard/*`。
- 用 `?demo` 把改到的頁面點過一次，電腦寬度和手機寬度（375px）都要看，瀏覽器 console 不能有錯誤。

## 8. 程式風格

- 介面文字一律繁體中文，白話、短句。
- 新頁面照現有 `js/views/*.js` 的寫法：從 `core.js` import 工具，HTML 用 template string，**所有使用者輸入的內容都要經過 `esc()`**，外部連結經過 `safeUrl()`。
- 共用邏輯放 `logic.js`（不碰畫面、不碰網路），才能測。
- 顏色只用 `css/app.css` 的變數，不要在頁面寫死色碼。
- 時區預設 `Asia/Taipei`（`logic.js` 的 `TZ`、`schema.sql` 與函式裡的時區字串）。
