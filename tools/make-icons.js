// Jana ikon PWA (PNG) daripada reka bentuk SVG yang sama dengan favicon. Jalankan: node tools/make-icons.js
const { chromium } = require('playwright'); const path = require('path');
const out = path.join(__dirname, '..', 'icons');
const mark = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%"><rect width="32" height="32" fill="#0F4C81"/><g transform="translate(${pad} ${pad}) scale(${(32 - 2 * pad) / 32})"><rect x="5" y="6" width="22" height="21" rx="3" fill="none" stroke="#fff" stroke-width="2"/><path d="M5 12h22M11 4v5M21 4v5" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M10 17h12M10 22h8" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g></svg>`;
(async () => {
  const b = await chromium.launch(); const page = await b.newPage();
  for (const [name, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['maskable-512.png', 512, 5], ['apple-touch-icon.png', 180, 0]]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;overflow:hidden">${mark(pad)}</body></html>`);
    await page.screenshot({ path: path.join(out, name), omitBackground: false });
  }
  await b.close(); console.log('ikon dijana dalam icons/');
})();
