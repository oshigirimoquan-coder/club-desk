# club-desk 社團管理網站範本

給學校社團用的管理網站：行程與 Google 日曆同步、請假、點名與出席率、公告、Google 表單連結、任務、成員名冊、新生教學班、免登入招生報名，並可以發 Discord 通知。

這是一個**範本**。每個社團 fork 一份，填好需求表，讓 AI（Claude Code、Codex 等）照你們的需求改。

- 免費：網站放 GitHub Pages，資料放 Supabase 免費方案
- 不用寫程式：改造交給 AI，日常管理在網站的設定頁完成
- 沒有建置步驟：純 HTML／CSS／JavaScript

**先看看長什麼樣子**：下載後在資料夾執行 `python3 -m http.server 8000`，打開 <http://localhost:8000/?demo>（示範模式，資料都是虛構的，不用連資料庫）。

## 怎麼用

1. 按 **Use this template**（或 Fork）建立你們社團自己的 repo。
2. 填 `club.md`（社團名稱、顏色、身分組、組別、活動類型、要／不要的功能）。標誌、配色參考放進 `materials/`。
3. 對 AI 說：「照 `club.md` 和 `CUSTOMIZE.md` 改造這個網站」。
4. 照 `docs/SETUP.md` 設定 Supabase、Discord 登入、Google 行事曆，網站就上線了。
5. 上線後，管理員可以在 **設定 → 要顯示的頁面** 隨時隱藏或打開頁面。

## 文件

| 文件 | 給誰 | 內容 |
|---|---|---|
| `club.md` | 社團 | 需求表（附虛構範例） |
| `AGENTS.md` | AI | 架構、每個功能在哪、權限規則、金鑰規定、改完要跑的測試 |
| `CUSTOMIZE.md` | AI | 照需求表改造的步驟，附「刪掉一個功能」和「新增一個功能」範例 |
| `docs/SETUP.md` | 社團 | 第一次上線的設定步驟 |
| `docs/HANDOVER.md` | 社團 | 帳號轉移與換屆交接 |
| `docs/MAINTENANCE.md` | 社團 | 長期維護：自動檢查、定期工作、出問題怎麼辦 |

## 測試

```bash
npm install
npm test   # 純邏輯測試＋資料庫權限規則測試（PGlite，本機 Postgres）
```

## 結構

```
index.html, config.js, css/app.css
js/app.js        外框、登入流程
js/nav.js        選單
js/core.js       連線、狀態、表單對話框、路由
js/logic.js      純邏輯（有測試）
js/mock.js       示範模式的假資料
js/views/*.js    各頁面
supabase/schema.sql            資料表、權限、出席率計算
supabase/functions/*           Edge Functions 原始碼
supabase/dashboard/*.ts        可直接貼到 Supabase 後台的單檔版
tests/                         node:test 測試
```

## 授權

MIT，見 `LICENSE`。可以自由使用、修改、再分享，保留原本的著作權聲明即可。
