// Fasa 7: audit aksesibiliti (axe-core, WCAG 2.1 A/AA) + papan kekunci, dengan backend sebenar dalam harness.
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright');
const { create } = require('./gas-harness');
const ROOT = path.join(__dirname, '..');
const csp = /Content-Security-Policy: (.*)/.exec(fs.readFileSync(path.join(ROOT, '_headers'), 'utf8'))[1];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Security-Policy': csp }); res.end(fs.readFileSync(p));
});
const API = 'https://script.google.com/macros/s/TEST/exec';
const GIS = `window.google={accounts:{id:{initialize(o){window.__cb=o.callback},renderButton(el){const b=document.createElement('button');b.textContent='Sign in';b.id='fake-google';b.onclick=()=>window.__cb({credential:window.__who});el.appendChild(b)},prompt(){},disableAutoSelect(){}}}};`;
const CID = 'c.apps.googleusercontent.com';

const H = create(); const { call, fetchMock, run } = H;
const PAD = 'eyJ' + 'a'.repeat(40) + '.';
const MAP = Object.fromEntries(['admin', 'sec', 'chair', 'a1', 'a2'].map((k) => [PAD + k, k + '@x.com']));
run("ADMIN_EMAIL = 'admin@x.com'"); run('setupSystem()'); run(`PropertiesService.getScriptProperties().setProperty('GOOGLE_CLIENT_ID','${CID}')`);
function backend(b) {
  if (b.action === 'auth.login') { const email = MAP[b.data.idToken]; fetchMock.respond = () => ({ code: 200, body: { aud: CID, iss: 'accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 3600), email, email_verified: 'true' } }); }
  return call(b.action, b.data, b.token);
}
const loginTok = (c) => { const r = backend({ action: 'auth.login', data: { idToken: c } }); assert.ok(r.ok, JSON.stringify(r)); return r.data.token; };
const A = loginTok(PAD + 'admin');
[['sec', 'Setiausaha'], ['chair', 'Ahli'], ['a1', 'Ahli'], ['a2', 'Ahli']].forEach(([n, r]) => assert.ok(call('users.save', { email: n + '@x.com', name: ({ sec: 'Puan Setiausaha', chair: 'Dr Pengerusi', a1: 'Encik Ahli Satu', a2: 'Cik Ahli Dua' })[n], position: 'Pegawai', role: r }, A).ok));
const S = loginTok(PAD + 'sec');
const day = (plus) => new Date(Date.now() + 8 * 3600e3 + plus * 86400e3).toISOString().slice(0, 10);
const M = call('meetings.create', { title: 'MESYUARAT HMI', bil: '1', tahun: '2026', date: day(2), start_time: '09:00', venue: 'Bilik A', pengerusi_email: 'chair@x.com', members: ['a1@x.com', 'a2@x.com'] }, S).data.id;
call('meetings.publish', { id: M }, S);
call('actions.save', { meeting_id: M, title: 'Penambahbaikan pengumuman solat', owner_email: 'a1@x.com', due_date: day(-2) }, S);
call('agenda.save', { meeting_id: M, title: 'Kertas Makluman' }, S);
call('minutes.save', { meeting_id: M, content_md: '# MINIT\n\n## 1. PERUTUSAN\n\nTeks minit contoh yang cukup panjang.' }, S); call('minutes.submit', { meeting_id: M }, S);
call('feedback.add', { meeting_id: M, target_type: 'Mesyuarat', target_id: M, kind: 'Cadangan', visibility: 'Semua', content: 'Cadangan contoh' }, loginTok(PAD + 'a1'));

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const axeSrc = fs.readFileSync(path.join(__dirname, 'vendor/axe.min.js'), 'utf8');
  const browser = await chromium.launch(); const ok = (m) => console.log('  ok  ' + m);
  let failures = 0;
  async function newPage(who, { vp = { width: 1280, height: 900 }, scheme = 'light' } = {}) {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: vp, colorScheme: scheme, bypassCSP: true });
    const page = await ctx.newPage();
    await page.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `export const API_URL='${API}'; export const GOOGLE_CLIENT_ID='${CID}';` }));
    await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GIS }));
    await page.route(API, (r) => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(backend(JSON.parse(r.request().postData()))) }));
    await page.goto(base + '/');
    if (who) { await page.waitForSelector('#fake-google'); await page.evaluate((w) => { window.__who = w; }, who); await page.click('#fake-google'); await page.waitForSelector('.app-header'); }
    return page;
  }
  async function audit(page, label) {
    await page.waitForTimeout(350);
    await page.addScriptTag({ content: axeSrc });
    const res = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] }));
    if (res.violations.length) { failures++; console.error('  GAGAL ' + label); res.violations.forEach((v) => console.error(`     [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) -> ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}\n        ${(v.nodes[0].failureSummary || '').split('\n').slice(0, 3).join(' ')}`)); }
    else ok(label);
  }
  const tab = async (page, name) => { await page.click(`[role=tab]:has-text("${name}")`); await page.waitForTimeout(300); };
  const go = async (page, hash, sel) => { await page.goto(base + '/#' + hash); await page.waitForSelector(sel); };

  const login = await newPage(null); await login.waitForSelector('#fake-google'); await audit(login, 'S-01 Log masuk (cerah)');
  for (const [scheme, vp, tag] of [['light', { width: 1280, height: 900 }, 'cerah'], ['dark', { width: 1280, height: 900 }, 'gelap'], ['light', { width: 375, height: 740 }, 'telefon']]) {
    const sec = await newPage(PAD + 'sec', { vp, scheme });
    await go(sec, '/dashboard', 'h1:has-text("Dashboard")'); await audit(sec, `S-02 Dashboard (${tag})`);
    await go(sec, '/meetings', 'h1:has-text("Mesyuarat")'); await audit(sec, `S-03 Senarai mesyuarat (${tag})`);
    await go(sec, '/meetings/' + M, '[role=tab]');
    for (const t of ['Agenda', 'Bahan', 'Komen & Cadangan', 'Ahli & Kehadiran', 'Minit', 'Tindakan']) { await tab(sec, t); await audit(sec, `S-04 tab ${t} (${tag})`); }
    await go(sec, '/meetings/' + M + '/edit', 'form, .card'); await audit(sec, `S-05 Borang mesyuarat (${tag})`);
    await go(sec, '/meetings/' + M + '/agenda', 'h1'); await audit(sec, `S-06 Editor agenda (${tag})`);
    await go(sec, '/actions', 'h1:has-text("Tindakan Saya")'); await audit(sec, `S-12 Tindakan (${tag})`);
    const adm = await newPage(PAD + 'admin', { vp, scheme });
    await go(adm, '/users', 'h1:has-text("Pengurusan Pengguna")'); await audit(adm, `S-13 Pengguna (${tag})`);
    await go(adm, '/audit', 'h1'); await audit(adm, `S-14 Audit & Tetapan (${tag})`);
    const a1 = await newPage(PAD + 'a1', { vp, scheme });
    await go(a1, '/meetings/' + M + '/live', 'h1, .live-itemtitle, .live'); await audit(a1, `S-09 Mod Mesyuarat (${tag})`);
  }
  // papan kekunci: tab boleh dicapai dengan anak panah; dialog memerangkap fokus dan Escape menutup; skip link wujud
  const k = await newPage(PAD + 'sec'); await go(k, '/meetings/' + M, '[role=tab]');
  await k.focus('#tab-agenda'); await k.keyboard.press('ArrowRight'); assert.strictEqual(await k.getAttribute('#tab-materials', 'aria-selected'), 'true'); ok('papan kekunci: anak panah menukar tab');
  await tab(k, 'Tindakan'); await k.click('button:has-text("Tambah tindakan")'); await k.waitForSelector('.modal');
  for (let i = 0; i < 12; i++) await k.keyboard.press('Tab');
  assert.ok(await k.evaluate(() => document.querySelector('.modal').contains(document.activeElement)), 'fokus terperangkap dalam dialog'); ok('dialog memerangkap fokus (12 kali Tab)');
  await k.keyboard.press('Escape'); await k.waitForSelector('.modal', { state: 'detached' }); ok('Escape menutup dialog');
  assert.ok(await k.evaluate(() => !!document.querySelector('.skip-link'))); ok('skip link wujud');
  assert.ok(await k.evaluate(() => { const l = document.documentElement.lang; return l === 'ms'; }), 'lang=ms'); ok('lang="ms"');
  await browser.close(); server.close();
  if (failures) { console.error(`\n${failures} halaman ada pelanggaran aksesibiliti.`); process.exit(1); }
  console.log('\nAudit aksesibiliti selesai: tiada pelanggaran WCAG 2.1 A/AA dikesan oleh axe-core.');
})().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
