// Ujian frontend Fasa 6: S-14 (audit, log emel, tetapan, backup), PWA (manifest, service worker, luar talian, banner pasang).
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const csp = /Content-Security-Policy: (.*)/.exec(fs.readFileSync(path.join(ROOT, '_headers'), 'utf8'))[1];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const API = 'https://script.google.com/macros/s/TEST/exec';
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const hdr = (t) => ({ 'Content-Type': t, 'Content-Security-Policy': csp });
  if (u === '/config.js') { res.writeHead(200, hdr('text/javascript')); return res.end(`export const API_URL='${API}'; export const GOOGLE_CLIENT_ID='c.apps.googleusercontent.com';`); }
  const p = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, hdr(MIME[path.extname(p)] || 'application/octet-stream')); res.end(fs.readFileSync(p));
});
const GIS = `window.google={accounts:{id:{initialize(o){window.__cb=o.callback},renderButton(el){const b=document.createElement('button');b.textContent='Sign in';b.id='fake-google';b.onclick=()=>window.__cb({credential:window.__who});el.appendChild(b)},prompt(){},disableAutoSelect(){}}}};`;
const U = [['admin@x.com', 'Admin Sistem', 'Admin'], ['sec@x.com', 'Puan Setiausaha', 'Setiausaha'], ['a1@x.com', 'Encik Ahli', 'Ahli']].map(([email, name, role]) => ({ email, name, role, position: 'Pegawai', photo: '' }));
const CRED = { 'c-admin': 'admin@x.com', 'c-sec': 'sec@x.com', 'c-a1': 'a1@x.com' };
const day = (n) => new Date(Date.now() + 8 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);
const ACTIONS = ['login', 'meeting.publish', 'material.upload', 'settings.set', 'login_gagal'];
const db = { calls: [], settings: { app_name: 'SyuraDocs', app_url: '', meeting_series: JSON.stringify(['Mesyuarat A', 'Mesyuarat B', 'Mesyuarat C']), reminder_hours_before: '24', digest_enabled: 'TRUE', max_upload_mb: '20', backup_keep: '8', timezone: 'Asia/Kuala_Lumpur', allowed_mime: 'pdf,docx' },
  audit: Array.from({ length: 120 }, (_, i) => ({ id: 'AUD-' + i, timestamp: day(i % 6) + 'T' + String(10 + (i % 10)).padStart(2, '0') + ':00:00+08:00', email: i % 2 ? 'sec@x.com' : 'admin@x.com', action: ACTIONS[i % 5], entity: 'meetings', entity_id: 'MTG-' + i, detail: 'butiran ' + i })).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
  emails: Array.from({ length: 30 }, (_, i) => ({ id: 'NTF-' + i, timestamp: day(0) + 'T09:' + String(i).padStart(2, '0') + ':00+08:00', to_email: 'ahli' + i + '@x.com', type: ['invite', 'digest', 'reminder'][i % 3], meeting_id: 'MTG-1', subject: 'Jemputan mesyuarat ' + i, status: i < 24 ? 'Dihantar' : (i < 27 ? 'Gagal' : 'Dilangkau'), error: i >= 24 ? 'ralat ' + i : '' })),
  backups: ['2026-11-09', '2026-11-02'].map((d, i) => ({ name: 'DB-' + d, created_at: d + 'T02:00:00+08:00', size_bytes: 40960 + i })), nBackup: 0 };
const MEET = { id: 'MTG-1', title: 'MESYUARAT JAWATANKUASA HMI IKN', bil: '1', tahun: '2026', status: 'Dijadualkan', date: '2026-12-01', start_time: '09:00', end_time: '11:00', venue: 'Bilik Mesyuarat Utama', series: 'x', pengerusi_email: 'a1@x.com', pengerusi_name: 'Encik Ahli', online_link: '', prev_meeting_id: '', current_agenda_id: '', notify_on_publish: true, member_count: 2, my_attendance: 'Belum Jawab', materials: [], my: '',
  agenda: [{ id: 'A1', seq: 1, title: 'Pengesahan Minit', category: 'Pengesahan', description: '', presenter_name: '', duration_min: null, status: 'Belum' }, { id: 'A2', seq: 2, title: 'Kertas Makluman HMI', category: 'Makluman', description: 'Pelaksanaan program 2026', presenter_name: 'Dr Pembentang', duration_min: 15, status: 'Belum' }],
  members: [{ email: 'a1@x.com', name: 'Encik Ahli', position: 'Pegawai', photo: '', attendance: 'Belum Jawab', attendance_at: '', is_chair: true }] };
const sessions = {};
function handle(b) {
  const { action, token, data } = b; db.calls.push(action);
  const ok = (d) => ({ ok: true, data: d }), err = (c, m) => ({ ok: false, error: { code: c, message: m } });
  const pub = (u) => ({ email: u.email, name: u.name, position: u.position, role: u.role, photo: '' });
  const settingsPublic = () => ({ app_name: db.settings.app_name, meeting_types: [], meeting_series: JSON.parse(db.settings.meeting_series), max_upload_mb: Number(db.settings.max_upload_mb) });
  if (action === 'ping') return ok({ pong: true });
  if (action === 'auth.login') { const u = U.find((x) => x.email === CRED[data.idToken]); const t = 'tok' + Math.random().toString(36).slice(2).padEnd(40, 'x'); sessions[t] = u; return ok({ token: t, user: pub(u), settings: settingsPublic() }); }
  const me = sessions[token]; if (!me) return err(401, 'Sesi tamat.');
  const admin = me.role === 'Admin';
  if (action === 'me.get') return ok({ user: pub(me), settings: settingsPublic() });
  if (action === 'meetings.list') return ok({ meetings: [MEET] });
  if (action === 'meetings.get') return ok({ ...MEET, current_agenda_id: '' });
  if (action === 'auth.logout') return ok({});
  if (!admin) return err(403, 'Anda tidak dibenarkan melakukan tindakan ini.');
  if (action === 'audit.list') {
    let rows = db.audit.filter((r) => (!data.email || r.email.includes(String(data.email).toLowerCase())) && (!data.action || r.action === data.action) && (!data.from || r.timestamp.slice(0, 10) >= data.from) && (!data.to || r.timestamp.slice(0, 10) <= data.to));
    return ok({ total: rows.length, offset: data.offset || 0, limit: data.limit, actions: ACTIONS.slice().sort(), rows: rows.slice(data.offset || 0, (data.offset || 0) + data.limit) });
  }
  if (action === 'notifications.list') {
    const rows = db.emails.filter((r) => (!data.type || r.type === data.type) && (!data.status || r.status === data.status) && (!data.to || r.to_email.includes(data.to)));
    return ok({ total: rows.length, counts: { Dihantar: 24, Gagal: 3, Dilangkau: 3 }, quota_remaining: 71, rows: rows.slice(data.offset || 0, (data.offset || 0) + data.limit) });
  }
  if (action === 'settings.get') return ok({ settings: Object.entries(db.settings).map(([key, value]) => ({ key, value, description: '', editable: !['timezone', 'allowed_mime'].includes(key) })) });
  if (action === 'settings.set') {
    const { key, value } = data;
    if (key === 'app_url' && value && !/^https:\/\//.test(value)) return err(400, 'Alamat sistem mesti bermula dengan https://');
    if (key === 'reminder_hours_before' && !(Number(value) >= 1 && Number(value) <= 168)) return err(400, 'Peringatan (jam) mesti nombor bulat antara 1 dan 168.');
    if (key === 'meeting_series') { const l = String(value).split('\n').map((x) => x.trim()).filter(Boolean); if (l.length > 20) return err(400, 'Maksimum 20 nama mesyuarat.'); db.settings[key] = JSON.stringify(l); return ok({}); }
    db.settings[key] = String(value); return ok({ key, value });
  }
  if (action === 'backup.list') return ok({ keep: Number(db.settings.backup_keep), backups: db.backups.slice() });
  if (action === 'backup.run') { const name = 'DB-2026-11-13' + (db.nBackup++ ? '-' + db.nBackup : ''); db.backups.unshift({ name, created_at: '2026-11-13T12:00:00+08:00', size_bytes: 50000 }); return ok({ name, removed: 0 }); }
  return err(404, 'Action tidak dikenali.');
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch();
  const shots = path.join(__dirname, 'shots'); fs.mkdirSync(shots, { recursive: true });
  const ok = (m) => console.log('  ok  ' + m);
  const all = [];
  async function newPage(who, opts = {}) {
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 860 }, serviceWorkers: opts.sw ? 'allow' : 'block', userAgent: opts.ua });
    const page = await ctx.newPage(); const problems = []; page.__offline = false; page.__ctx = ctx;
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource|net::ERR_|Service Worker registration blocked by Playwright/.test(m.text())) problems.push(m.text()); });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GIS }));
    await page.route('https://drive.google.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<html><body>x</body></html>' }));
    await page.route(API, (r) => { if (page.__offline) return r.abort('failed'); return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(handle(JSON.parse(r.request().postData()))) }); });
    await page.goto(base + '/'); await page.waitForSelector('#fake-google'); await page.evaluate((w) => { window.__who = w; }, who); await page.click('#fake-google'); await page.waitForSelector('.app-header');
    all.push({ page, problems }); return page;
  }
  let n = 0; const shot = (page, name) => page.screenshot({ path: path.join(shots, `p6-${String(++n).padStart(2, '0')}-${name}.png`) });
  const rowsOf = (p) => p.locator('.table tbody tr').count();

  // ===== S-14: Admin =====
  const ad = await newPage('c-admin');
  await ad.click('.sidenav a[data-path="/audit"]'); await ad.waitForSelector('.table tbody tr');
  assert.deepStrictEqual(await ad.$$eval('.sys-tabs [role=tab]', (t) => t.map((x) => x.textContent)), ['Audit Log', 'Log Emel', 'Tetapan', 'Backup']); ok('S-14: empat tab');
  assert.strictEqual(await rowsOf(ad), 50); assert.ok((await ad.textContent('.pager')).includes('Halaman 1 / 3 (120 rekod)')); ok('audit: 50 baris sehalaman, 120 rekod, 3 halaman');
  const first = await ad.textContent('.table tbody tr:first-child td:nth-child(6)'); await ad.click('.pager button:has-text("Seterusnya")'); await ad.waitForFunction(() => (document.querySelector('.pager') || { textContent: '' }).textContent.includes('Halaman 2'));
  assert.notStrictEqual(await ad.textContent('.table tbody tr:first-child td:nth-child(6)'), first); ok('audit: halaman seterusnya');
  await ad.selectOption('select[aria-label="Tapis tindakan"]', 'login_gagal'); await ad.waitForFunction(() => (document.querySelector('.pager') || { textContent: '' }).textContent.includes('24 rekod'));
  assert.strictEqual(await rowsOf(ad), 24); assert.ok(await ad.locator('.table .badge-danger:has-text("login_gagal")').count() === 24); ok('audit: tapis tindakan (login_gagal ditanda merah)');
  await ad.fill('input[aria-label="Cari emel pengguna"]', 'SEC'); await ad.press('input[aria-label="Cari emel pengguna"]', 'Enter'); await ad.waitForFunction(() => !(document.querySelector('.pager') || { textContent: '' }).textContent.includes('24 rekod'));
  assert.ok((await ad.$$eval('.table tbody tr td:nth-child(2)', (t) => t.map((x) => x.textContent))).every((e) => e.includes('sec@'))); ok('audit: tapis emel');
  await ad.click('button:has-text("Set semula")'); await ad.waitForFunction(() => (document.querySelector('.pager') || { textContent: '' }).textContent.includes('120 rekod'));
  await ad.fill('input[aria-label="Dari tarikh"]', day(0)); await ad.fill('input[aria-label="Hingga tarikh"]', day(0)); await ad.press('input[aria-label="Hingga tarikh"]', 'Enter'); await ad.dispatchEvent('input[aria-label="Hingga tarikh"]', 'change');
  await ad.waitForFunction((t) => document.querySelector('.pager') && Number(/\((\d+) rekod/.exec((document.querySelector('.pager') || { textContent: '' }).textContent)[1]) < t, 120); ok('audit: tapis tarikh');
  await shot(ad, 'audit');
  await ad.click('#sys-email'); await ad.waitForSelector('.stat'); const stats = await ad.$$eval('.stat', (s) => s.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  assert.deepStrictEqual(stats, ['24Dihantar', '3Gagal', '3Dilangkau', '71Baki kuota emel hari ini']); ok('log emel: kiraan dan baki kuota');
  await ad.selectOption('select[aria-label="Tapis status"]', 'Gagal'); await ad.waitForFunction(() => document.querySelectorAll('.table tbody tr').length === 3); assert.ok(await ad.locator('.badge-danger:has-text("Gagal")').count() === 3); ok('log emel: tapis status'); await shot(ad, 'log-emel');
  await ad.click('#sys-settings'); await ad.waitForSelector('.settings-form');
  assert.ok(await ad.locator('.banner-danger:has-text("Alamat sistem belum ditetapkan")').isVisible()); ok('tetapan: amaran bila alamat sistem belum ditetapkan');
  await ad.click('button:has-text("Guna alamat semasa")'); assert.strictEqual(await ad.inputValue('label:has-text("Alamat sistem") + input'), base); ok('tetapan: "Guna alamat semasa"');
  assert.strictEqual((await ad.inputValue('label:has-text("Nama mesyuarat") + textarea')).split('\n').length, 3); ok('tetapan: senarai nama mesyuarat satu baris satu nama');
  await ad.fill('label:has-text("Peringatan sebelum") + input', '0'); await ad.fill('label:has-text("Alamat sistem") + input', 'http://tak-selamat.my'); await ad.click('button:has-text("Simpan tetapan")');
  await ad.waitForSelector('.field-error:has-text("antara 1 dan 168")'); assert.ok(await ad.locator('.field-error:has-text("https://")').count() === 1); ok('tetapan: ralat server dipaparkan pada medan berkenaan');
  await ad.fill('label:has-text("Peringatan sebelum") + input', '48'); await ad.fill('label:has-text("Alamat sistem") + input', 'https://syura.contoh.my'); await ad.fill('label:has-text("Nama mesyuarat") + textarea', 'Mesyuarat A\nMesyuarat B\nMesyuarat Baharu');
  await ad.click('button:has-text("Simpan tetapan")'); await ad.waitForSelector('.toast'); await ad.waitForSelector('.toast-success:has-text("3 tetapan disimpan")');
  assert.strictEqual(db.settings.reminder_hours_before, '48'); assert.strictEqual(db.settings.app_url, 'https://syura.contoh.my'); assert.ok(db.settings.meeting_series.includes('Mesyuarat Baharu')); assert.ok(!(await ad.locator('.banner-danger:has-text("belum ditetapkan")').isVisible())); ok('tetapan: disimpan; amaran alamat hilang');
  assert.ok(db.calls.includes('me.get'), 'tetapan awam dimuat semula selepas simpan'); await shot(ad, 'tetapan');
  await ad.click('#sys-backup'); await ad.waitForSelector('.table tbody tr'); assert.strictEqual(await rowsOf(ad), 2); assert.ok((await ad.textContent('#main')).includes('di luar folder yang dikongsi kepada Setiausaha')); ok('backup: senarai salinan + nota folder di luar kongsi');
  await ad.click('button:has-text("Backup sekarang")'); await ad.waitForSelector('.toast-success:has-text("DB-2026-11-13")'); await ad.waitForFunction(() => document.querySelectorAll('.table tbody tr').length === 3); ok('backup: Backup sekarang menambah salinan'); await shot(ad, 'backup');
  // Setiausaha dan Ahli
  const sc = await newPage('c-sec'); await sc.goto(base + '/#/audit'); await sc.waitForSelector('text=Tiada akses'); assert.ok(!db.calls.slice(-3).includes('audit.list')); ok('Setiausaha: /audit = Tiada akses (tiada panggilan API)');
  assert.deepStrictEqual(await sc.$$eval('.sidenav .nav-link', (a) => a.map((x) => x.textContent)), ['Dashboard', 'Mesyuarat', 'Tindakan Saya', 'Mesyuarat Baharu']);

  // ===== PWA =====
  const pw = await newPage('c-a1', { sw: true });
  const man = await pw.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); const r = await fetch(l.href); return { type: r.headers.get('content-type'), json: await r.json(), href: l.getAttribute('href') }; });
  assert.ok(/manifest\+json/.test(man.type)); assert.deepStrictEqual([man.json.name, man.json.short_name, man.json.display, man.json.theme_color, man.json.lang], ['SyuraDocs', 'SyuraDocs', 'standalone', '#0F4C81', 'ms']); ok('manifest: nama, display standalone, warna tema');
  for (const ic of man.json.icons) { const dim = await pw.evaluate(async (src) => { const b = await (await fetch(src)).blob(); const bm = await createImageBitmap(b); return [b.type, bm.width, bm.height]; }, ic.src); assert.deepStrictEqual(dim, ['image/png', ...ic.sizes.split('x').map(Number)]); }
  assert.ok(man.json.icons.some((i) => i.purpose === 'maskable') && man.json.icons.some((i) => i.sizes === '192x192') && man.json.icons.some((i) => i.sizes === '512x512')); ok('manifest: ikon 192, 512 dan maskable wujud dengan saiz betul');
  assert.ok(await pw.evaluate(() => !!document.querySelector('link[rel=apple-touch-icon]') && !!document.querySelector('meta[name=theme-color]'))); ok('apple-touch-icon dan theme-color');
  await pw.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller === null ? navigator.serviceWorker.getRegistration().then((r) => !!(r && r.active)) : true);
  await pw.evaluate(() => navigator.serviceWorker.ready); await pw.reload(); await pw.waitForSelector('.app-header');
  assert.ok(await pw.evaluate(() => !!navigator.serviceWorker.controller)); ok('service worker aktif dan mengawal halaman');
  const cached = await pw.evaluate(async () => (await (await caches.open('syuradocs-shell-v1')).keys()).map((r) => new URL(r.url).pathname));
  assert.ok(cached.includes('/js/app.js') && cached.includes('/css/styles.css') && cached.includes('/index.html') || cached.includes('/')); ok('shell dicache (' + cached.length + ' fail)');
  const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'); const jsFiles = [];
  (function walk(d) { for (const f of fs.readdirSync(path.join(ROOT, d))) { const rel = d + '/' + f; if (fs.statSync(path.join(ROOT, rel)).isDirectory()) walk(rel); else if (f.endsWith('.js')) jsFiles.push(rel); } })('js');
  const missing = jsFiles.filter((f) => !swSrc.includes("'" + f + "'")); assert.deepStrictEqual(missing, [], 'fail JS tiada dalam senarai sw.js: ' + missing); ok('sw.js: semua fail js/ disenaraikan untuk precache');
  // luar talian: buka mesyuarat dahulu (salin agenda), kemudian putuskan talian
  await pw.goto(base + '/#/meetings/MTG-1'); await pw.waitForSelector('h1:has-text("MESYUARAT JAWATANKUASA HMI IKN")');
  const saved = await pw.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('emi_offline:')).map((k) => JSON.parse(localStorage.getItem(k)))); assert.strictEqual(saved.length, 1);
  const copy = JSON.stringify(saved[0]); assert.ok(copy.includes('Kertas Makluman HMI') && !/members|materials|content|photo|a1@x.com/.test(copy.replace(/pengerusi_name/g, ''))); ok('agenda disimpan dalam peranti (tiada ahli, bahan, komen atau emel)');
  await pw.goto(base + '/#/dashboard'); await pw.waitForSelector('.mcard');
  pw.__offline = true; await pw.__ctx.setOffline(true); await pw.reload(); await pw.waitForSelector('.app-header', { timeout: 8000 }); ok('luar talian: app dibuka daripada simpanan (service worker)');
  await pw.waitForSelector('.offline-bar:visible'); await pw.waitForSelector('text=Tersedia luar talian'); ok('luar talian: bar amaran dan senarai "Tersedia luar talian"');
  await pw.click('.offline-list a'); await pw.waitForSelector('.banner:has-text("Luar talian. Memaparkan salinan agenda terakhir")');
  assert.ok((await pw.textContent('#main')).includes('Pengesahan Minit') && (await pw.textContent('#main')).includes('Kertas Makluman HMI') && (await pw.textContent('#main')).includes('Dr Pembentang')); ok('luar talian: agenda terakhir boleh dibaca'); await shot(pw, 'luar-talian');
  pw.__offline = false; await pw.__ctx.setOffline(false); await pw.click('button:has-text("Cuba semula")'); await pw.waitForSelector('[role=tab]'); await pw.waitForSelector('.offline-bar', { state: 'hidden' }); ok('talian pulih: paparan penuh dan bar hilang');
  await pw.click('.user-btn'); await pw.click('text=Log keluar'); await pw.waitForSelector('#fake-google');
  assert.strictEqual(await pw.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('emi_offline:')).length), 0); ok('log keluar memadam salinan agenda luar talian');
  // banner pasang
  const ip = await newPage('c-a1', { sw: false }); await ip.goto(base + '/#/dashboard'); await ip.waitForSelector('.mcard'); assert.strictEqual(await ip.locator('.install-banner').count(), 0); ok('banner pasang: tiada sebelum pelayar menawarkan');
  await ip.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = async () => { window.__prompted = 1; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
  await ip.waitForSelector('.install-banner'); await shot(ip, 'pasang'); await ip.click('.install-banner button:has-text("Pasang")'); await ip.waitForSelector('.install-banner', { state: 'detached' });
  assert.strictEqual(await ip.evaluate(() => window.__prompted), 1); ok('banner pasang: butang Pasang memanggil dialog pelayar');
  const dp = await newPage('c-a1'); await dp.goto(base + '/#/dashboard'); await dp.waitForSelector('.mcard');
  const fire = () => dp.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = async () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); });
  await fire(); await dp.waitForSelector('.install-banner'); await dp.click('.install-banner button:has-text("Tutup")'); await dp.waitForSelector('.install-banner', { state: 'detached' });
  await dp.reload(); await dp.waitForSelector('.mcard'); await fire(); await dp.waitForTimeout(300); assert.strictEqual(await dp.locator('.install-banner').count(), 0); ok('banner pasang: ditutup, tidak muncul semula');
  const ios = await newPage('c-a1', { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', viewport: { width: 390, height: 844 } });
  await ios.goto(base + '/#/dashboard'); await ios.waitForSelector('.install-banner'); assert.ok((await ios.textContent('.install-banner')).includes('Tambah ke Skrin Utama')); assert.strictEqual(await ios.locator('.install-banner button:has-text("Pasang")').count(), 0); ok('iOS: arahan "Tambah ke Skrin Utama" (tiada butang Pasang)');
  assert.ok((await ios.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0); await shot(ios, 'pasang-ios');

  // ===== Halaman log masuk: pemasangan backend tidak lengkap =====
  for (const [label, body, expect] of [
    ['fail hilang dilaporkan', { ok: true, data: { pong: true, missing: ['Backup.gs', 'Settings.gs'] } }, /Backup\.gs, Settings\.gs/],
    ['ralat dalaman diberi petunjuk', { ok: false, error: { code: 500, message: 'Ralat dalaman. Sila cuba lagi.' } }, /Executions/]]) {
    const ctx = await browser.newContext({ serviceWorkers: 'block' }); const lp = await ctx.newPage();
    await lp.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GIS }));
    await lp.route(API, (r) => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) }));
    await lp.goto(base + '/'); await lp.waitForSelector('.conn.conn-bad'); assert.ok(expect.test(await lp.textContent('.conn')), label); if (body.ok) assert.ok(await lp.locator('.login-msg .banner-danger').isVisible());
    await shot(lp, 'login-' + (body.ok ? 'tak-lengkap' : 'ralat')); ok('log masuk: ' + label); await ctx.close();
  }

  // ===== Telefon: S-14 =====
  const ph = await newPage('c-admin', { viewport: { width: 390, height: 844 } }); await ph.goto(base + '/#/audit'); await ph.waitForSelector('.table tbody tr');
  assert.ok((await ph.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, 'skrol mendatar audit'); assert.ok(await ph.locator('.table td[data-label="Tindakan"]').first().isVisible()); await shot(ph, 'audit-telefon');
  await ph.click('#sys-settings'); await ph.waitForSelector('.settings-form'); assert.ok((await ph.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0); ok('telefon: S-14 audit (kad) dan tetapan tiada skrol mendatar');

  for (const { problems } of all) assert.deepStrictEqual(problems, [], problems.join('\n')); ok('tiada ralat konsol / pelanggaran CSP (termasuk service worker)');
  await browser.close(); server.close(); console.log('\nSmoke test Fasa 6 selesai.');
})().catch((e) => { console.error('GAGAL:', e.message.split('\n').slice(0, 12).join('\n')); process.exit(1); });
