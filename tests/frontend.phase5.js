// Ujian frontend Fasa 5 (Minit + Tindakan) dengan BACKEND SEBENAR (Apps Script dijalankan dalam harness), bukan mock tulisan tangan.
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

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch(); const shots = path.join(__dirname, 'shots'); fs.mkdirSync(shots, { recursive: true });
  const ok = (m) => console.log('  ok  ' + m); const pages = []; let n = 0;
  async function newPage(who, vp) {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: vp || { width: 1280, height: 900 } });
    const page = await ctx.newPage(); const problems = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource|net::ERR_FAILED|Service Worker registration blocked by Playwright/.test(m.text())) problems.push(m.text()); });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `export const API_URL='${API}'; export const GOOGLE_CLIENT_ID='${CID}';` }));
    await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GIS }));
    await page.route(API, (r) => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(backend(JSON.parse(r.request().postData()))) }));
    await page.goto(base + '/'); await page.waitForSelector('#fake-google'); await page.evaluate((w) => { window.__who = w; }, who); await page.click('#fake-google'); await page.waitForSelector('.app-header');
    pages.push({ page, problems }); return page;
  }
  const shot = (page, name) => page.screenshot({ path: path.join(shots, `p5-${String(++n).padStart(2, '0')}-${name}.png`) });
  const tab = async (page, name) => { await page.click(`[role=tab]:has-text("${name}")`); await page.waitForTimeout(250); };
  const open = async (page) => { await page.goto(base + '/#/meetings/' + M); await page.waitForSelector('[role=tab]'); };

  const sec = await newPage(PAD + 'sec'), chair = await newPage(PAD + 'chair'), a1 = await newPage(PAD + 'a1'), a2 = await newPage(PAD + 'a2');

  // ===== Setiausaha: sediakan minit =====
  await open(sec); assert.deepStrictEqual(await sec.$$eval('[role=tab]', (t) => t.map((x) => x.textContent)), ['Agenda', 'Bahan', 'Komen & Cadangan', 'Ahli & Kehadiran', 'Minit', 'Tindakan']); ok('Setiausaha: enam tab');
  await tab(sec, 'Minit'); await sec.waitForSelector('textarea.minute-editor');
  const tpl = await sec.inputValue('textarea.minute-editor');
  assert.ok(/# MINIT MESYUARAT MESYUARAT HMI BIL\. 1\/2026/.test(tpl) && tpl.includes('## 1. PERUTUSAN PENGERUSI') && tpl.includes('## 3. PERKARA BERBANGKIT') && tpl.includes('## 6. PENUTUP') && tpl.includes('Lokasi: Bilik A'), tpl.slice(0, 200)); ok('templat minit ikut format IKN (diisi daripada data mesyuarat)');
  await sec.fill('textarea.minute-editor', '# MINIT MESYUARAT\n\n## 1. PERUTUSAN PENGERUSI\n\nPengerusi mengalu-alukan **semua ahli**.\n\n1. Perkara pertama\n2. Perkara kedua <img src=x onerror=alert(1)>');
  await sec.click('button:has-text("Simpan draf")'); await sec.waitForSelector('text=Draf disimpan'); ok('simpan draf');
  await sec.click('button:has-text("Pratonton")');
  assert.strictEqual(await sec.$$eval('.minute-preview strong', (e) => e.map((x) => x.textContent).join()), 'semua ahli'); assert.strictEqual(await sec.$$eval('.minute-preview img', (e) => e.length), 0, 'HTML tidak dirender');
  assert.ok((await sec.textContent('.minute-preview')).includes('<img src=x onerror=alert(1)>'), 'dipaparkan sebagai teks'); assert.strictEqual(await sec.$$eval('.minute-preview ol li', (e) => e.length), 2); ok('pratonton Markdown selamat (HTML disuntik hanya teks)');
  await sec.click('button:has-text("Sunting")');

  // ===== Draf tidak nampak oleh Pengerusi/ahli =====
  await open(chair); await tab(chair, 'Minit'); await chair.waitForSelector('text=Minit belum tersedia'); await open(a1); await tab(a1, 'Minit'); await a1.waitForSelector('text=Minit belum tersedia'); ok('Draf: Pengerusi dan ahli tidak nampak');
  assert.strictEqual(await a1.$$eval('textarea', (e) => e.length), 0);

  // ===== Hantar untuk semakan =====
  await sec.click('button:has-text("Hantar untuk semakan Pengerusi")'); await sec.click('.modal button:has-text("Hantar")'); await sec.waitForSelector('text=Dihantar kepada Pengerusi'); await sec.waitForSelector('.badge:has-text("Untuk Semakan")');
  assert.strictEqual(await sec.$$eval('textarea.minute-editor', (e) => e.length), 0, 'dikunci'); ok('hantar semakan: editor dikunci');
  await open(chair); await tab(chair, 'Minit'); await chair.waitForSelector('.minute-doc'); assert.ok((await chair.textContent('.minute-doc')).includes('mengalu-alukan'));
  assert.ok(await chair.$('button:has-text("Sahkan minit")')); ok('Pengerusi nampak minit + butang Sahkan');
  await open(a1); await tab(a1, 'Minit'); await a1.waitForSelector('text=Minit belum tersedia'); ok('Untuk Semakan: ahli belum nampak');
  // komen semakan
  await chair.fill('.cmt-form textarea', 'Sila semak perenggan 1.'); await chair.click('.cmt-form button:has-text("Hantar")'); await chair.waitForSelector('.cmt-item:has-text("Sila semak perenggan 1.")'); ok('Pengerusi menulis komen semakan');
  await open(sec); await tab(sec, 'Minit'); await sec.waitForSelector('.cmt-item:has-text("Sila semak perenggan 1.")'); ok('Setiausaha nampak komen semakan');
  await open(a1); await tab(a1, 'Komen & Cadangan'); await a1.waitForTimeout(400); assert.ok(!(await a1.textContent('body')).includes('Sila semak perenggan 1.')); ok('komen semakan tidak bocor kepada ahli');

  // ===== Pengesahan =====
  await chair.click('button:has-text("Sahkan minit")'); await chair.click('.modal button:has-text("Sahkan")'); await chair.waitForSelector('.badge:has-text("Disahkan")'); await chair.waitForSelector('.sign-block');
  assert.ok((await chair.textContent('.sign-block')).includes('Dr Pengerusi')); ok('Pengerusi sahkan: blok tandatangan dipaparkan');
  await open(a1); await tab(a1, 'Minit'); await a1.waitForSelector('.minute-doc'); assert.ok(await a1.$('.badge:has-text("Disahkan")')); assert.strictEqual(await a1.$$eval('textarea, button:has-text("Sahkan minit"), button:has-text("Buka semula")', (e) => e.length), 0); ok('ahli nampak minit Disahkan (baca sahaja)');
  await shot(a1, 'ahli-minit');
  await open(sec); await tab(sec, 'Minit'); await sec.waitForSelector('.badge:has-text("Disahkan")'); assert.strictEqual(await sec.$$eval('button:has-text("Buka semula")', (e) => e.length), 0, 'Setiausaha tiada Buka semula'); ok('Setiausaha: tiada butang Buka semula (Admin sahaja)');

  // ===== Tindakan =====
  await tab(sec, 'Tindakan'); await sec.waitForSelector('.actions-table'); assert.ok((await sec.textContent('.actions-table')).includes('Penambahbaikan pengumuman solat') && (await sec.textContent('.actions-table')).includes('Tertunggak'));
  await sec.click('button:has-text("Tambah tindakan")'); await sec.fill('.modal input[type=text]', 'Kemas kini jadual penyelenggaraan'); await sec.selectOption('.modal select >> nth=0', 'a2@x.com'); await sec.fill('.modal input[type=date]', day(10));
  await sec.click('.modal button:has-text("Simpan")'); await sec.waitForSelector('.actions-table :text("Kemas kini jadual penyelenggaraan")'); ok('Setiausaha tambah tindakan');
  await sec.click('button:has-text("Tertunggak")'); await sec.waitForTimeout(400); assert.strictEqual(await sec.$$eval('.actions-table tbody tr', (r) => r.length), 1); ok('penapis Tertunggak');
  await shot(sec, 'tindakan-staf');
  await open(a1); assert.ok(await a1.$('[role=tab]:has-text("Tindakan")'), 'ahli yang ada tindakan nampak tab'); await tab(a1, 'Tindakan'); await a1.waitForSelector('.actions-table');
  assert.ok(!(await a1.textContent('.actions-table')).includes('Kemas kini jadual'), 'ahli hanya nampak tindakan sendiri'); assert.strictEqual(await a1.$$eval('button:has-text("Tambah tindakan")', (e) => e.length), 0);
  await a1.click('button:has-text("Kemas kini")'); await a1.selectOption('.modal select', 'Selesai'); await a1.fill('.modal textarea', 'Telah dilaksanakan.'); await a1.click('.modal button:has-text("Simpan")'); await a1.waitForSelector('text=Tindakan dikemas kini'); ok('ahli kemas kini status + maklum balas tindakan sendiri');
  await a1.click('button:has-text("Semua")'); await a1.waitForSelector('.actions-table :text("Telah dilaksanakan.")'); ok('maklum balas dipaparkan');
  await open(a2); await tab(a2, 'Tindakan'); await a2.waitForSelector('.actions-table'); assert.ok((await a2.textContent('.actions-table')).includes('Kemas kini jadual')); ok('a2 hanya nampak tindakan sendiri');
  await a2.goto(base + '/#/actions'); await a2.waitForSelector('h1:has-text("Tindakan Saya")'); await a2.waitForSelector('.actions-table'); assert.ok(await a2.$('.actions-table a:has-text("MESYUARAT HMI")')); ok('ahli: halaman /actions (menu staf sahaja)');
  await chair.goto(base + '/#/meetings/' + M); await chair.waitForSelector('[role=tab]'); await tab(chair, 'Tindakan'); await chair.waitForSelector('button:has-text("Tambah tindakan")'); ok('Pengerusi mesyuarat boleh tambah tindakan');
  await sec.goto(base + '/#/dashboard'); await sec.waitForSelector('h2:has-text("Tindakan tertunggak")'); await sec.waitForTimeout(500); ok('dashboard: widget tindakan tertunggak');

  // ===== Cetak =====
  await open(sec); await tab(sec, 'Minit'); await sec.waitForSelector('.minute-doc'); await sec.emulateMedia({ media: 'print' });
  assert.strictEqual(await sec.isVisible('.tabs'), false); assert.ok(await sec.isVisible('.sign-block')); await sec.emulateMedia({ media: 'screen' }); ok('cetak: tab disembunyikan, blok tandatangan kekal');

  // ===== Telefon =====
  const ph = await newPage(PAD + 'sec', { width: 375, height: 740 }); await open(ph); await tab(ph, 'Minit'); await ph.waitForSelector('.minute-doc'); await tab(ph, 'Tindakan'); await ph.waitForSelector('.actions-table');
  assert.ok(await ph.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); await shot(ph, 'telefon'); ok('telefon: tiada skrol mendatar (Minit, Tindakan)');

  for (const { page, problems } of pages) assert.deepStrictEqual(problems, [], problems.join('\n')); ok('tiada ralat konsol / pelanggaran CSP');
  await browser.close(); server.close(); console.log('\nSmoke test Fasa 5 selesai.');
})().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
