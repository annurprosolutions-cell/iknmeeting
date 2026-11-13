// Smoke test frontend Fasa 2 (S-02..S-05). GIS dan API di-mock; CSP sebenar dikenakan.
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const csp = /Content-Security-Policy: (.*)/.exec(fs.readFileSync(path.join(ROOT, '_headers'), 'utf8'))[1];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Security-Policy': csp }); res.end(fs.readFileSync(p));
});
const API = 'https://script.google.com/macros/s/TEST/exec';
const GIS = `window.google={accounts:{id:{initialize(o){window.__cb=o.callback},renderButton(el){const b=document.createElement('button');b.textContent='Sign in';b.id='fake-google';b.onclick=()=>window.__cb({credential:window.__who||'cred-sec'});el.appendChild(b)},prompt(){},disableAutoSelect(){}}}};`;

const U = [
  ['sec@x.com', 'Puan Sec', 'Setiausaha', 'Setiausaha'], ['chair@x.com', 'Dr Pengerusi', 'Pengerusi', 'Ketua Jabatan'],
  ['ahli@x.com', 'Encik Ahli', 'Ahli', 'Pegawai Perubatan'], ['ahli2@x.com', 'Cik Dua', 'Ahli', 'Jururawat']
].map(([email, name, role, position]) => ({ email, name, role, position, status: 'Aktif', last_login: '' }));
const db = { meetings: [], members: {}, agenda: {}, seq: 0 };
const sessions = {};
function handle(b) {
  const { action, token, data } = b; const ok = (d) => ({ ok: true, data: d }), err = (c, m) => ({ ok: false, error: { code: c, message: m } });
  const settings = { app_name: 'SyuraDocs', meeting_types: [], meeting_series: ['Mesyuarat Jawatankuasa HMI IKN', 'Mesyuarat Pengurusan Kualiti HMI IKN'], max_upload_mb: 20 };
  if (action === 'ping') return ok({ pong: true });
  const pub = (u) => ({ email: u.email, name: u.name, position: u.position, role: u.role });
  if (action === 'auth.login') {
    const u = U.find((x) => x.email === { 'cred-sec': 'sec@x.com', 'cred-ahli': 'ahli@x.com', 'cred-ahli2': 'ahli2@x.com' }[data.idToken]);
    if (!u) return err(403, 'Akaun anda tidak didaftarkan.'); const t = 'tok' + Math.random().toString(36).slice(2).padEnd(40, 'x'); sessions[t] = u; return ok({ token: t, user: pub(u), settings });
  }
  const me = sessions[token]; if (!me) return err(401, 'Sesi tamat.');
  const staff = me.role === 'Setiausaha';
  const access = (m) => staff || (db.members[m.id].some((r) => r.email === me.email) && m.status !== 'Draf');
  const shape = (m) => ({ ...m, pengerusi_name: (U.find((u) => u.email === m.pengerusi_email) || {}).name || '', member_count: db.members[m.id].length, my_attendance: (db.members[m.id].find((r) => r.email === me.email) || {}).attendance || '' });
  if (action === 'me.get') return ok({ user: pub(me), settings });
  if (action === 'users.list') return staff ? ok({ users: U.map((u) => ({ email: u.email, name: u.name, position: u.position, role: u.role })) }) : err(403, 'Dilarang');
  if (action === 'meetings.list') return ok({ meetings: db.meetings.filter(access).map(shape) });
  if (action === 'meetings.get') {
    const m = db.meetings.find((x) => x.id === data.id); if (!m) return err(404, 'Mesyuarat tidak dijumpai.'); if (!access(m)) return err(403, 'Anda tidak dijemput ke mesyuarat ini.');
    const prev = db.meetings.find((x) => x.id === m.prev_meeting_id);
    return ok({ ...shape(m), materials: [], members: db.members[m.id].map((r) => { const u = U.find((x) => x.email === r.email); return { ...r, name: u.name, position: u.position, is_chair: r.email === m.pengerusi_email }; }), agenda: db.agenda[m.id] || [], prev_meeting: prev ? { id: prev.id, title: prev.title, date: prev.date } : undefined });
  }
  if (action === 'meetings.create' || action === 'meetings.update') {
    if (!staff) return err(403, 'Dilarang');
    if (!data.title) return err(400, 'Tajuk wajib diisi.');
    let m = db.meetings.find((x) => x.id === data.id);
    if (!m) { m = { id: 'MTG-' + (++db.seq), status: 'Draf' }; db.meetings.push(m); db.agenda[m.id] = []; db.members[m.id] = []; }
    Object.assign(m, { title: data.title, series: data.title, bil: data.bil, tahun: data.tahun, prev_meeting_id: data.prev_meeting_id, date: data.date, start_time: data.start_time, end_time: data.end_time, venue: data.venue, online_link: data.online_link, pengerusi_email: data.pengerusi_email, notify_on_publish: data.notify_on_publish });
    const emails = new Set([...data.members, data.pengerusi_email, me.email].filter(Boolean));
    db.members[m.id] = [...emails].map((e) => (db.members[m.id].find((r) => r.email === e) || { email: e, attendance: 'Belum Jawab', attendance_at: '' }));
    if (data.prev_meeting_id && !db.agenda[m.id].length) db.agenda[m.id] = [{ id: 'a1', seq: 1, title: 'Pengesahan Minit Mesyuarat Lepas', category: 'Pengesahan', status: 'Belum' }, { id: 'a2', seq: 2, title: 'Perkara Berbangkit', category: 'Makluman', status: 'Belum' }];
    return ok({ id: m.id, driveFailures: [] });
  }
  if (action === 'meetings.publish') { const m = db.meetings.find((x) => x.id === data.id); m.status = 'Dijadualkan'; return ok({ status: m.status, driveFailures: [] }); }
  if (action === 'attendance.set') { const m = db.meetings.find((x) => x.id === data.meeting_id); const r = db.members[m.id].find((x) => x.email === me.email); r.attendance = data.attendance; r.attendance_at = '2026-11-10T09:00:00+08:00'; return ok({ attendance: r.attendance }); }
  return err(404, 'Action tidak dikenali.');
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch();
  const shots = path.join(__dirname, 'shots'); fs.mkdirSync(shots, { recursive: true });
  const ok = (m) => console.log('  ok  ' + m);
  async function newPage(vp) {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: vp || { width: 1280, height: 900 } });
    const page = await ctx.newPage(); const problems = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource|Service Worker registration blocked by Playwright/.test(m.text())) problems.push(m.text()); });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `export const API_URL='${API}'; export const GOOGLE_CLIENT_ID='c.apps.googleusercontent.com';` }));
    await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GIS }));
    await page.route(API, (r) => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(handle(JSON.parse(r.request().postData()))) }));
    return { page, problems };
  }
  async function loginAs(page, who) {
    await page.goto(base + '/'); await page.waitForSelector('#fake-google');
    await page.evaluate((w) => { window.__who = w; }, who); await page.click('#fake-google'); await page.waitForSelector('.app-header');
  }
  let n = 0; const shot = (page, name) => page.screenshot({ path: path.join(shots, `p2-${String(++n).padStart(2, '0')}-${name}.png`), fullPage: true });

  // --- Setiausaha ---
  let { page, problems } = await newPage();
  await loginAs(page, 'cred-sec');
  await page.waitForSelector('text=Tiada mesyuarat akan datang'); ok('S-02 kosong: "Tiada mesyuarat akan datang"');
  await page.click('.sidenav a[data-path="/meetings/new"]'); await page.waitForSelector('#main h1:has-text("Mesyuarat Baharu")');
  await page.click('button:has-text("Simpan & Terbitkan")');
  assert.ok(await page.locator('.field-error:visible').count() >= 2); ok('S-05: validasi (tajuk, siri, tarikh, ...) ditunjuk inline');
  await page.selectOption('label:has-text("Tajuk mesyuarat") + select', { index: 1 }); await page.fill('label:has-text("Bilangan") + input', '1');
  await page.fill('input[type=date]', '2026-12-01');
  await page.fill('input[type=url]', 'http://tak-selamat');
  await page.click('button:has-text("Simpan Draf")');
  assert.ok(await page.locator('.field-error:visible:has-text("https://")').count() === 1); ok('pautan http ditolak di klien');
  await page.fill('input[type=url]', 'https://meet.google.com/abc');
  await page.click('button:has-text("Simpan & Terbitkan")');
  assert.ok(await page.locator('.field-error:visible:has-text("Pilih Pengerusi")').count() === 1); ok('terbit tanpa Pengerusi ditolak di klien');
  await page.selectOption('label:has-text("Pengerusi") + select', 'chair@x.com');
  assert.ok(await page.locator('.picker-row:has-text("Dr Pengerusi") input').isDisabled()); ok('Pengerusi dikunci dalam pemilih ahli');
  await page.click('button:has-text("Simpan & Terbitkan")');
  assert.ok(await page.locator('.picker + .x, .field-error:visible:has-text("sekurang-kurangnya 1 ahli")').count() === 1); ok('terbit tanpa ahli lain ditolak di klien');
  await page.fill('.picker input[type=search]', 'encik');
  assert.strictEqual(await page.locator('.picker-row:visible').count(), 1); ok('carian ahli');
  await page.check('.picker-row:has-text("Encik Ahli") input');
  await shot(page, 'form');
  await page.click('button:has-text("Simpan Draf")');
  await page.waitForSelector('h1:has-text("Mesyuarat Jawatankuasa HMI IKN")');
  assert.ok(await page.locator('.badge:has-text("Draf")').count() >= 1); ok('Draf disimpan -> S-04');
  assert.ok((await page.textContent('.meta')).includes('Dr Pengerusi')); assert.ok((await page.textContent('.meta')).includes('01/12/2026'));
  ok('S-04 papar tarikh DD/MM/YYYY dan Pengerusi');
  await page.click('#tab-members');
  assert.ok((await page.textContent('#tabpanel')).includes('Encik Ahli')); await shot(page, 'detail-members');
  await page.keyboard.press('ArrowRight'); assert.strictEqual(await page.getAttribute('#tab-minutes', 'aria-selected'), 'true'); ok('tab: papan kekunci (anak panah)');
  await page.click('button:has-text("Terbitkan")'); await page.click('.modal .btn-primary');
  await page.waitForSelector('.badge:has-text("Dijadualkan")'); ok('terbit dari S-04 -> Dijadualkan');
  // mesyuarat kedua bersambung
  await page.click('.sidenav a[data-path="/meetings/new"]');
  await page.selectOption('label:has-text("Tajuk mesyuarat") + select', { index: 2 }); await page.fill('label:has-text("Bilangan") + input', '2'); await page.fill('input[type=date]', '2027-01-05');
  await page.selectOption('label:has-text("Sambung daripada") + select', { index: 1 });
  await page.click('button:has-text("Simpan Draf")'); await page.waitForSelector('h1:has-text("Mesyuarat Pengurusan Kualiti HMI IKN")');
  assert.ok((await page.textContent('#tabpanel')).includes('Pengesahan Minit Mesyuarat Lepas')); assert.ok((await page.textContent('.meta')).includes('Bersambung daripada'));
  ok('sambung mesyuarat lepas: agenda automatik + pautan'); await shot(page, 'detail-agenda');
  await page.click('.sidenav a[data-path="/meetings"]'); await page.waitForSelector('.mcard');
  assert.strictEqual(await page.locator('.mcard').count(), 2);
  await page.fill('input[type=search]', 'kualiti'); assert.strictEqual(await page.locator('.mcard').count(), 1); ok('S-03: senarai + carian');
  await page.fill('input[type=search]', ''); await page.click('.seg-btn:has-text("Lepas")'); await page.waitForSelector('text=Tiada mesyuarat dijumpai'); ok('S-03: tab Lepas kosong');
  await page.click('.seg-btn:has-text("Akan Datang")'); await shot(page, 'list');
  await page.click('a[data-path="/dashboard"]'); await page.waitForSelector('text=Draf anda'); ok('S-02: bahagian "Draf anda" untuk staf');
  await page.goto(base + '/#/meetings/MTG-1/edit'); await page.waitForSelector('h1:has-text("Edit Mesyuarat")');
  assert.strictEqual(await page.inputValue('label:has-text("Tajuk mesyuarat") + select'), 'Mesyuarat Jawatankuasa HMI IKN');
  assert.strictEqual(await page.locator('button:has-text("Simpan & Terbitkan")').count(), 0); ok('edit mesyuarat diterbitkan: tiada butang terbit');
  assert.deepStrictEqual(problems, [], problems.join('\n')); ok('tiada ralat konsol / CSP (Setiausaha)');

  // --- Ahli ---
  ({ page, problems } = await newPage());
  await loginAs(page, 'cred-ahli');
  await page.waitForSelector('.mcard'); assert.strictEqual(await page.locator('.mcard').count(), 1);
  assert.ok((await page.textContent('.mcard')).includes('Belum Jawab')); assert.ok(!(await page.textContent('#main')).includes('Draf anda'));
  ok('Ahli: nampak mesyuarat diterbitkan sahaja, "Belum Jawab" ditonjolkan');
  await page.click('.mcard'); await page.waitForSelector('h1:has-text("Mesyuarat Jawatankuasa HMI IKN")');
  assert.strictEqual(await page.locator('button:has-text("Edit"), button:has-text("Batalkan"), button:has-text("Terbitkan")').count(), 0); ok('Ahli: tiada butang edit/terbit/batal');
  await page.click('#tab-members'); await page.click('.seg-btn:has-text("Hadir") >> nth=0'); await page.waitForSelector('.toast-success');
  await page.waitForSelector('.seg-btn.is-on:text-is("Hadir")'); ok('Ahli menjawab kehadiran');
  await page.goto(base + '/#/meetings/MTG-2'); await page.waitForSelector('text=Anda tidak dijemput ke mesyuarat ini'); ok('Ahli: mesyuarat Draf ditolak, mesej jelas');
  await page.goto(base + '/#/meetings/new'); await page.waitForSelector('text=Tiada akses'); ok('Ahli: /meetings/new = Tiada akses');
  assert.deepStrictEqual(problems, [], problems.join('\n'));

  // --- Telefon ---
  const ph = await newPage({ width: 390, height: 844 });
  await loginAs(ph.page, 'cred-sec');
  for (const [hash, sel] of [['#/meetings', '.mcard'], ['#/meetings/MTG-1', '.meta'], ['#/meetings/new', '.picker'], ['#/dashboard', '.mcard']]) {
    await ph.page.goto(base + '/' + hash); await ph.page.waitForSelector(sel);
    const over = await ph.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 0, hash + ' skrol mendatar ' + over);
    const small = await ph.page.$$eval('button, a.nav-link, .icon-btn, input:not([type=checkbox]), select, .tab', (els) => els.filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return [e.textContent.trim().slice(0, 20) || e.className, Math.round(r.width), Math.round(r.height)]; }).filter(([, w, h]) => h < 44 || w < 44));
    if (small.length) console.log('  AMARAN ' + hash + ' sentuh < 44px: ' + JSON.stringify(small.slice(0, 5)));
    await shot(ph.page, 'phone' + hash.replace(/[#/]/g, '-'));
  }
  ok('telefon: tiada skrol mendatar pada S-02, S-03, S-04, S-05');
  await browser.close(); server.close(); console.log('\nSmoke test Fasa 2 selesai.');
})().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
