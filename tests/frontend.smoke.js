// Smoke test frontend: server statik + CSP sebenar dari _headers, GIS dan API di-mock.
const http = require('http'), fs = require('fs'), path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const csp = /Content-Security-Policy: (.*)/.exec(fs.readFileSync(path.join(ROOT, '_headers'), 'utf8'))[1];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' });
  res.end(fs.readFileSync(p));
});

const API = 'https://script.google.com/macros/s/TEST/exec';
const GIS = `window.google={accounts:{id:{initialize(o){window.__cb=o.callback},renderButton(el){const b=document.createElement('button');b.textContent='Sign in with Google';b.id='fake-google';b.style.minHeight='44px';b.onclick=()=>window.__cb({credential:window.__who||'cred-admin'});el.appendChild(b)},prompt(n){if(window.__silent){setTimeout(()=>window.__cb({credential:'cred-admin'}),30)}else{n({isNotDisplayed:()=>true,isSkippedMoment:()=>false})}},disableAutoSelect(){}}}};`;

const db = { users: [
  { email: 'admin@contoh.com', name: 'Admin Sistem', position: 'Pentadbir', role: 'Admin', status: 'Aktif', last_login: '2026-11-09T09:30:00+08:00' },
  { email: 'sec@contoh.com', name: 'Puan Setiausaha', position: 'Setiausaha Mesyuarat', role: 'Setiausaha', status: 'Aktif', last_login: '' },
  { email: 'ahli@contoh.com', name: 'Dr Ahli', position: 'Pegawai Perubatan', role: 'Ahli', status: 'Aktif', last_login: '' }] };
const sessions = {};
function handle(body) {
  const { action, token, data } = body;
  const ok = (d) => ({ ok: true, data: d }), err = (code, message) => ({ ok: false, error: { code, message } });
  const sOf = () => sessions[token] && db.users.find((u) => u.email === sessions[token]);
  const pub = (u) => ({ email: u.email, name: u.name, position: u.position, role: u.role });
  const settings = { app_name: 'e-Mesyuarat IKN', meeting_types: ['A'] };
  if (action === 'ping') return ok({ pong: true });
  if (action === 'auth.login') {
    const who = { 'cred-admin': 'admin@contoh.com', 'cred-ahli': 'ahli@contoh.com', 'cred-sec': 'sec@contoh.com' }[data.idToken];
    const u = db.users.find((x) => x.email === who);
    if (!u) return err(403, 'Akaun anda tidak didaftarkan. Hubungi Setiausaha atau Admin.');
    const t = 'tok' + Math.random().toString(36).slice(2).padEnd(40, 'x'); sessions[t] = u.email;
    return ok({ token: t, user: pub(u), settings });
  }
  const u = sOf(); if (!u) return err(401, 'Sesi tamat. Sila log masuk semula.');
  if (action === 'me.get') return ok({ user: pub(u), settings });
  if (action === 'auth.logout') { delete sessions[token]; return ok({}); }
  if (u.role !== 'Admin') return err(403, 'Anda tidak dibenarkan melakukan tindakan ini.');
  if (action === 'users.list') return ok({ users: db.users });
  if (action === 'users.save') {
    const e = db.users.find((x) => x.email === data.email.toLowerCase());
    if (e) Object.assign(e, { name: data.name, position: data.position, role: data.role, status: data.status });
    else db.users.push({ ...data, email: data.email.toLowerCase(), last_login: '' });
    return ok({ created: !e });
  }
  if (action === 'users.deactivate') { db.users.find((x) => x.email === data.email).status = 'Tidak Aktif'; return ok({}); }
  if (action === 'users.import') return ok({ added: 2, skipped: [{ line: 3, reason: 'Sudah wujud: sec@contoh.com' }] });
  return err(404, 'Action tidak dikenali.');
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch();
  const shots = path.join(__dirname, 'shots'); fs.mkdirSync(shots, { recursive: true });
  let n = 0; const ok = (m) => console.log('  ok  ' + m);

  async function newPage(opts = {}) {
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 800 }, colorScheme: opts.scheme || 'light', deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const problems = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource/.test(m.text())) problems.push(m.text()); });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `export const API_URL='${API}'; export const GOOGLE_CLIENT_ID='client.apps.googleusercontent.com';` }));
    await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GIS }));
    await page.route(API, async (r) => {
      const req = r.request();
      if (req.method() !== 'POST') return r.fulfill({ status: 405 });
      assert.strictEqual(req.headers()['content-type'], 'text/plain;charset=utf-8', 'mesti text/plain (tiada preflight)');
      await r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(handle(JSON.parse(req.postData()))) });
    });
    return { page, problems, ctx };
  }
  const shot = (page, name) => page.screenshot({ path: path.join(shots, `${String(++n).padStart(2, '0')}-${name}.png`) });

  // 1. Login Admin
  let { page, problems } = await newPage();
  await page.goto(base + '/');
  await page.waitForSelector('#fake-google');
  assert.ok((await page.textContent('.conn')).includes('Sambungan berjaya')); ok('login: ping -> "Sambungan berjaya"');
  await shot(page, 'login');
  await page.click('#fake-google');
  await page.waitForSelector('.sidenav');
  assert.strictEqual(new URL(page.url()).hash, '#/dashboard');
  const nav = await page.$$eval('.sidenav .nav-link', (a) => a.map((x) => x.textContent));
  assert.deepStrictEqual(nav, ['Dashboard', 'Mesyuarat', 'Tindakan Saya', 'Mesyuarat Baharu', 'Pengguna', 'Audit & Tetapan']); ok('menu Admin lengkap');
  await shot(page, 'dashboard-admin');

  // 2. Muat semula mengekalkan sesi (sessionStorage + me.get)
  await page.reload(); await page.waitForSelector('.sidenav');
  assert.strictEqual(new URL(page.url()).hash, '#/dashboard'); ok('refresh kekal login');

  // 3. S-13 Pengguna
  await page.click('.sidenav a[data-path="/users"]');
  await page.waitForSelector('.table tbody tr');
  assert.strictEqual(await page.locator('.table tbody tr').count(), 3);
  await shot(page, 'users');
  await page.click('text=Tambah Pengguna');
  await page.click('.modal button[type=submit]');
  assert.ok(await page.locator('.field-error').first().isVisible()); ok('validasi borang (ralat inline)');
  await page.fill('.modal input[type=email]', 'baru@contoh.com'); await page.fill('.modal input:not([type=email])', 'Orang Baru');
  await shot(page, 'user-modal');
  await page.click('.modal button[type=submit]');
  await page.waitForSelector('.toast-success');
  await page.waitForFunction(() => document.querySelectorAll('.table tbody tr').length === 4); ok('tambah pengguna');
  await page.fill('#user-q', 'orang baru'); assert.strictEqual(await page.locator('.table tbody tr').count(), 1); ok('carian');
  await page.fill('#user-q', '');
  await page.click('button[aria-label="Nyahaktif Orang Baru"]'); await page.click('.modal .btn-danger');
  await page.waitForSelector('button[aria-label="Aktifkan Orang Baru"]'); ok('nyahaktif dengan pengesahan');
  await page.click('text=Import Senarai'); await page.fill('.modal textarea', 'x@y.com,X'); await page.click('.modal .btn-primary');
  await page.waitForSelector('.skip-list'); await shot(page, 'import'); await page.keyboard.press('Escape');
  assert.strictEqual(await page.locator('.modal').count(), 0); ok('import + Esc tutup modal');

  // 4. Tema gelap
  await page.click('.user-btn'); await page.click('.theme-opt:has-text("Gelap")');
  assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await shot(page, 'users-dark'); ok('mod gelap');

  // 5. Sesi tamat -> pulih senyap
  for (const k of Object.keys(sessions)) delete sessions[k];
  await page.evaluate(() => { window.__silent = true; });
  await page.click('.sidenav a[data-path="/dashboard"]');
  await page.click('.sidenav a[data-path="/users"]');
  await page.waitForSelector('.table tbody tr', { timeout: 5000 }); ok('401 -> login senyap -> data dimuat semula');

  // 6. Sesi tamat tanpa pemulihan -> kembali ke login, ingat skrin terakhir
  for (const k of Object.keys(sessions)) delete sessions[k];
  await page.evaluate(() => { window.__silent = false; });
  await page.reload();
  await page.waitForSelector('#fake-google');
  assert.strictEqual(new URL(page.url()).hash, '#/login'); ok('sesi tamat -> S-01');
  await page.click('#fake-google'); await page.waitForSelector('.sidenav');
  assert.strictEqual(new URL(page.url()).hash, '#/users'); ok('selepas login kembali ke skrin terakhir');

  // 7. Logout
  await page.click('.user-btn'); await page.click('text=Log keluar');
  await page.waitForSelector('#fake-google'); ok('log keluar');
  assert.deepStrictEqual(problems, [], 'Ralat konsol / CSP: ' + problems.join('\n'));
  ok('tiada ralat konsol / pelanggaran CSP');

  // 8. Ahli: menu terhad, /users ditolak di UI, emel tak berdaftar
  ({ page, problems } = await newPage());
  await page.goto(base + '/'); await page.waitForSelector('#fake-google');
  await page.evaluate(() => { window.__who = 'cred-ahli'; }); await page.click('#fake-google'); await page.waitForSelector('.sidenav');
  assert.deepStrictEqual(await page.$$eval('.sidenav .nav-link', (a) => a.map((x) => x.textContent)), ['Dashboard', 'Mesyuarat', 'Tindakan Saya']);
  await page.goto(base + '/#/users'); await page.waitForSelector('text=Tiada akses'); ok('Ahli: menu terhad & /users = Tiada akses');
  await page.goto(base + '/#/tiada'); await page.waitForSelector('text=Halaman tidak dijumpai'); ok('404 halaman');
  ({ page, problems } = await newPage());
  await page.goto(base + '/'); await page.waitForSelector('#fake-google');
  await page.evaluate(() => { window.__who = 'cred-asing'; }); await page.click('#fake-google');
  await page.waitForSelector('.login-msg .banner-danger');
  assert.ok((await page.textContent('.login-msg')).includes('tidak didaftarkan')); ok('emel tak berdaftar: mesej jelas');

  // 9. Telefon
  const ph = await newPage({ viewport: { width: 390, height: 844 }, scheme: 'light' });
  await ph.page.goto(base + '/'); await ph.page.waitForSelector('#fake-google');
  await ph.page.click('#fake-google'); await ph.page.waitForSelector('.bottombar');
  assert.ok(!(await ph.page.locator('.sidenav').isVisible())); ok('telefon: bar bawah, tiada menu sisi');
  await ph.page.goto(base + '/#/users'); await ph.page.waitForSelector('.table tbody tr');
  const overflow = await ph.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, 'skrol mendatar halaman: ' + overflow); ok('telefon: tiada skrol mendatar');
  const small = await ph.page.$$eval('button, a.nav-link, .icon-btn, input, select', (els) => els.filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return [e.className || e.tagName, Math.round(r.width), Math.round(r.height)]; }).filter(([, w, h]) => h < 44 || w < 44));
  console.log(small.length ? '  AMARAN saiz sentuh < 44px: ' + JSON.stringify(small.slice(0, 8)) : '  ok  sasaran sentuh >= 44px');
  await shot(ph.page, 'users-phone');
  await ph.page.click('.bottombar >> text=Lagi'); await shot(ph.page, 'more-phone'); ok('telefon: menu Lagi');

  await browser.close(); server.close();
  console.log('\nSmoke test frontend selesai.');
})().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
