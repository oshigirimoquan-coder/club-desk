// 社團標誌：圓角方塊裡放社名第一個字，旁邊是社名。
// 有自己的標誌圖時，把 logo 放進 materials/（或 img/），改這裡輸出 <img>（見 CUSTOMIZE.md）。
import { esc } from './core.js';

export function brand(name, { big = false, text = true } = {}) {
  const n = String(name || '社團').trim() || '社團';
  return `<span class="brand-mark ${big ? 'big' : ''}" role="img" aria-label="${esc(n)}"><span class="seal ${big ? 'big' : ''}" aria-hidden="true">${esc([...n][0])}</span>${text ? `<span class="brand-name" aria-hidden="true">${esc(n)}</span>` : ''}</span>`;
}
