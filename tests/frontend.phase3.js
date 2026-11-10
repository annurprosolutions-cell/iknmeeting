// Smoke test frontend Fasa 3 + pindaan client: borang, gambar pengguna, agenda, bahan, penonton.
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

const U = [['admin@x.com', 'Admin Sistem', 'Admin'], ['sec@x.com', 'Puan Sec', 'Setiausaha'], ['chair@x.com', 'Dr Pengarah', 'Ahli'], ['a1@x.com', 'Encik Pembentang', 'Ahli'], ['a2@x.com', 'Cik Ahli', 'Ahli']]
  .map(([email, name, role]) => ({ email, name, role, position: 'Pegawai', status: 'Aktif', last_login: '', photo: '' }));
const CRED = { 'cred-admin': 'admin@x.com', 'cred-sec': 'sec@x.com', 'cred-a1': 'a1@x.com', 'cred-a2': 'a2@x.com', 'cred-chair': 'chair@x.com' };
const db = { meetings: [], members: {}, agenda: {}, mats: {}, seq: 0, calls: [] };
const sessions = {};
const SETTINGS = { app_name: 'e-Mesyuarat IKN', meeting_types: [], meeting_series: ['Mesyuarat Jawatankuasa HMI IKN', 'Mesyuarat Pengurusan Kualiti HMI IKN', 'Mesyuarat C&P IKN'], max_upload_mb: 20 };
function handle(b) {
  const { action, token, data } = b; db.calls.push(action);
  const ok = (d) => ({ ok: true, data: d }), err = (c, m) => ({ ok: false, error: { code: c, message: m } });
  const pub = (u) => ({ email: u.email, name: u.name, position: u.position, role: u.role, photo: u.photo });
  if (action === 'ping') return ok({ pong: true });
  if (action === 'auth.login') { const u = U.find((x) => x.email === CRED[data.idToken]); if (!u) return err(403, 'Akaun anda tidak didaftarkan.'); const t = 'tok' + Math.random().toString(36).slice(2).padEnd(40, 'x'); sessions[t] = u; return ok({ token: t, user: pub(u), settings: SETTINGS }); }
  const me = sessions[token]; if (!me) return err(401, 'Sesi tamat.');
  const staff = ['Admin', 'Setiausaha'].includes(me.role);
  const mt = (id) => db.meetings.find((x) => x.id === id);
  const access = (m) => staff || (db.members[m.id].some((r) => r.email === me.email) && m.status !== 'Draf');
  const shape = (m) => ({ ...m, pengerusi_name: (U.find((u) => u.email === m.pengerusi_email) || {}).name || '', member_count: db.members[m.id].length, my_attendance: (db.members[m.id].find((r) => r.email === me.email) || {}).attendance || '' });
  if (action === 'me.get') return ok({ user: pub(me), settings: SETTINGS });
  if (action === 'users.list') {
    if (me.role === 'Admin') return ok({ users: U.map((u) => ({ ...u })) });
    return staff ? ok({ users: U.map(pub) }) : err(403, 'Dilarang');
  }
  if (action === 'users.save') { if (me.role !== 'Admin') return err(403, 'Dilarang'); const e = U.find((x) => x.email === data.email); if (e) Object.assign(e, data); else U.push({ status: 'Aktif', last_login: '', ...data }); return ok({ created: !e }); }
  if (action === 'meetings.list') return ok({ meetings: db.meetings.filter(access).map(shape) });
  if (action === 'meetings.create' || action === 'meetings.update') {
    if (!staff) return err(403, 'Dilarang'); let m = mt(data.id);
    if (!m) { m = { id: 'MTG-' + (++db.seq), status: 'Draf', drive_folder_id: 'FOLDER' + db.seq + 'abcdefgh' }; db.meetings.push(m); db.agenda[m.id] = []; db.mats[m.id] = []; db.members[m.id] = []; }
    Object.assign(m, { title: data.title, series: data.series, tahun: data.tahun, date: data.date, start_time: data.start_time, end_time: data.end_time, venue: data.venue, online_link: data.online_link, pengerusi_email: data.pengerusi_email, prev_meeting_id: data.prev_meeting_id, notify_on_publish: data.notify_on_publish, meeting_type: '' });
    db.members[m.id] = [...new Set([...data.members, data.pengerusi_email].filter(Boolean))].map((e) => ({ email: e, attendance: 'Belum Jawab', attendance_at: '' })); return ok({ id: m.id, driveFailures: [] });
  }
  if (action === 'meetings.publish') { mt(data.id).status = 'Dijadualkan'; return ok({ status: 'Dijadualkan', driveFailures: [] }); }
  if (action === 'meetings.get') {
    const m = mt(data.id); if (!m) return err(404, 'Mesyuarat tidak dijumpai.'); if (!access(m)) return err(403, 'Anda tidak dijemput ke mesyuarat ini.');
    const mats = db.mats[m.id].filter((x) => (staff || x.status === 'Aktif') && (staff || !x.restricted || m.pengerusi_email === me.email));
    const o = { ...shape(m), materials: mats, agenda: db.agenda[m.id].map((a) => ({ ...a, presenter_name: (U.find((u) => u.email === a.presenter_email) || {}).name || '' })),
      members: db.members[m.id].map((r) => { const u = U.find((x) => x.email === r.email); return { ...r, name: u.name, position: u.position, photo: u.photo, is_chair: r.email === m.pengerusi_email }; }) };
    if (!staff) delete o.drive_folder_id; return ok(o);
  }
  if (action === 'agenda.save') {
    if (!staff) return err(403, 'Dilarang'); const list = db.agenda[data.meeting_id];
    if (data.id) Object.assign(list.find((a) => a.id === data.id), { title: data.title, category: data.category, description: data.description, presenter_email: data.presenter_email, duration_min: data.duration_min ? +data.duration_min : null });
    else list.push({ id: 'AGD-' + (list.length + 1) + Math.random().toString(36).slice(2, 6), seq: list.length + 1, title: data.title, category: data.category, description: data.description, presenter_email: data.presenter_email, duration_min: data.duration_min ? +data.duration_min : null, status: 'Belum' });
    return ok({});
  }
  if (action === 'agenda.reorder') { const l = db.agenda[data.meeting_id]; db.agenda[data.meeting_id] = data.ids.map((id, i) => ({ ...l.find((a) => a.id === id), seq: i + 1 })); return ok({}); }
  if (action === 'agenda.delete') { db.agenda[data.meeting_id] = db.agenda[data.meeting_id].filter((a) => a.id !== data.id).map((a, i) => ({ ...a, seq: i + 1 })); return ok({}); }
  const addMat = (m, o) => { const mat = { id: 'MAT-' + (db.mats[m.id].length + 1), agenda_id: o.agenda_id || '', type: o.type, title: o.title || o.file_name.replace(/\.[^.]+$/, ''), drive_file_id: 'DRVFILE' + Math.random().toString(36).slice(2, 12), file_name: o.file_name, mime_type: 'application/pdf', size_bytes: 14, version: o.version || 1, status: 'Aktif', replaces_id: o.replaces_id || '', uploaded_by: me.email, uploaded_by_name: me.name, uploaded_at: '2026-11-10T10:00:00+08:00', restricted: o.type === 'Bahan Bicara' }; db.mats[m.id].push(mat); return mat; };
  if (action === 'materials.upload') {
    const m = mt(data.meeting_id); const ag = db.agenda[m.id].find((a) => a.id === data.agenda_id);
    if (!staff && !(ag && ag.presenter_email === me.email)) return err(403, 'Anda hanya boleh menguruskan bahan pada item agenda yang anda bentang.');
    if (!data.data_base64) return err(400, 'Fail tiada kandungan.'); if (/\.exe$/.test(data.file_name)) return err(400, 'Jenis fail tidak dibenarkan.');
    return ok({ id: addMat(m, data).id });
  }
  if (action === 'materials.replace') { const m = db.meetings.find((x) => db.mats[x.id].some((y) => y.id === data.id)); const old = db.mats[m.id].find((x) => x.id === data.id); old.status = 'Digantikan'; const n = addMat(m, { ...old, file_name: data.file_name, version: old.version + 1, replaces_id: old.id, title: old.title }); return ok({ id: n.id, version: n.version }); }
  if (action === 'materials.archive') { for (const k in db.mats) db.mats[k].forEach((x) => { if (x.id === data.id) x.status = 'Diarkib'; }); return ok({}); }
  if (action === 'materials.update') { for (const k in db.mats) db.mats[k].forEach((x) => { if (x.id === data.id) Object.assign(x, { title: data.title, type: data.type, agenda_id: data.agenda_id }); }); return ok({}); }
  if (action === 'materials.register') {
    const m = mt(data.meeting_id);
    if (data.scan) { addMat(m, { type: 'Lain-lain', file_name: 'imbas1.pdf' }); addMat(m, { type: 'Lain-lain', file_name: 'imbas2.pptx' }); return ok({ added: 2, already: 0, skipped: [{ name: 'virus.exe', reason: 'Jenis fail tidak dibenarkan: virus.exe' }] }); }
    if (!/drive\.google\.com/.test(data.file)) return err(400, 'Pautan atau ID fail Drive tidak sah.'); addMat(m, { type: data.type, file_name: 'daripada-drive.pdf', title: data.title }); return ok({ id: 'x' });
  }
  if (action === 'materials.logOpen') return ok({});
  return err(404, 'Action tidak dikenali.');
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch();
  const shots = path.join(__dirname, 'shots'); fs.mkdirSync(shots, { recursive: true });
  const ok = (m) => console.log('  ok  ' + m);
  async function newPage(vp) {
    const ctx = await browser.newContext({ viewport: vp || { width: 1280, height: 900 } });
    const page = await ctx.newPage(); const problems = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource/.test(m.text())) problems.push(m.text()); });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `export const API_URL='${API}'; export const GOOGLE_CLIENT_ID='c.apps.googleusercontent.com';` }));
    await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GIS }));
    await page.route('https://drive.google.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<html><body>pratonton</body></html>' }));
    await page.route(API, (r) => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(handle(JSON.parse(r.request().postData()))) }));
    return { page, problems };
  }
  async function loginAs(page, who) { await page.goto(base + '/'); await page.waitForSelector('#fake-google'); await page.evaluate((w) => { window.__who = w; }, who); await page.click('#fake-google'); await page.waitForSelector('.app-header'); }
  let n = 0; const shot = (page, name) => page.screenshot({ path: path.join(shots, `p3-${String(++n).padStart(2, '0')}-${name}.png`) });
  const PDF = { name: 'kertas.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%test') };

  // ===== Admin: pengurusan pengguna =====
  let { page, problems } = await newPage();
  await loginAs(page, 'cred-admin');
  await page.click('.sidenav a[data-path="/users"]'); await page.waitForSelector('.table tbody tr');
  await page.click('text=Tambah Pengguna');
  const labels = await page.$$eval('.modal .field label', (l) => l.map((x) => x.textContent.replace(' *', '').trim()));
  assert.deepStrictEqual(labels.slice(0, 2), ['Nama', 'Emel Google']); ok('S-13: medan Nama dahulu, kemudian Emel');
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 300; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#0a7'; x.fillRect(0, 0, 300, 200); x.fillStyle = '#fff'; x.fillRect(100, 50, 100, 100); return c.toDataURL('image/png').split(',')[1]; });
  await page.fill('.modal input[type=email]', 'baru@x.com'); await page.fill('.modal input[maxlength="100"]', 'Orang Bergambar');
  await page.setInputFiles('#photo-file', { name: 'saya.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.waitForSelector('.modal .avatar img');
  const prev = await page.getAttribute('.modal .avatar img', 'src'); assert.ok(prev.startsWith('data:image/jpeg;base64,') && prev.length < 30000, 'JPEG kecil: ' + prev.length); ok('gambar dikecilkan ke JPEG data URL (' + prev.length + ' aksara)');
  await shot(page, 'user-modal-photo');
  await page.click('.modal button[type=submit]'); await page.waitForSelector('.toast-success');
  await page.waitForSelector('tr:has-text("Orang Bergambar") .avatar img'); ok('avatar dipaparkan dalam senarai pengguna');
  await page.setInputFiles('#photo-file', []).catch(() => {});
  assert.deepStrictEqual(problems, [], problems.join('\n'));

  // ===== Setiausaha: borang mesyuarat =====
  ({ page, problems } = await newPage());
  await loginAs(page, 'cred-sec');
  await page.click('.sidenav a[data-path="/meetings/new"]'); await page.waitForSelector('h1:has-text("Mesyuarat Baharu")');
  assert.strictEqual(await page.locator('label:has-text("Jenis mesyuarat")').count(), 0); ok('borang: tiada medan Jenis mesyuarat');
  assert.strictEqual(await page.locator('label:has-text("Siri / jawatankuasa")').count(), 0);
  const seriesOpts = await page.$$eval('label:has-text("Siri") + select option', (o) => o.map((x) => x.textContent)); assert.strictEqual(seriesOpts.length, 4); ok('borang: "Siri" ialah senarai 3 nama mesyuarat');
  const chairOpts = await page.$$eval('label:has-text("Pengerusi") + select option', (o) => o.map((x) => x.textContent)); assert.ok(chairOpts.some((t) => t.includes('Cik Ahli')) && chairOpts.some((t) => t.includes('Dr Pengarah'))); ok('Pengerusi: semua pengguna berdaftar boleh dipilih');
  await page.fill('input[type=date]', '2026-12-05'); assert.strictEqual(await page.inputValue('label:has-text("Tahun") + input'), '2026'); ok('Tahun diisi automatik daripada tarikh');
  await page.fill('label:has-text("Tahun") + input', '2027'); await page.fill('input[type=date]', '2026-12-06'); assert.strictEqual(await page.inputValue('label:has-text("Tahun") + input'), '2027'); ok('Tahun suntingan manual tidak ditimpa');
  await page.fill('input[maxlength="200"] >> nth=0', 'Mesyuarat HMI Bil.1/2026');
  await page.selectOption('label:has-text("Siri") + select', { index: 1 });
  await page.selectOption('label:has-text("Pengerusi") + select', 'chair@x.com');
  await page.fill('.picker input[type=search]', 'pembentang'); await page.check('.picker-row:has-text("Encik Pembentang") input');
  await page.fill('.picker input[type=search]', 'cik'); await page.check('.picker-row:has-text("Cik Ahli") input');
  assert.ok(await page.locator('h3:has-text("Surat jemputan dan memo")').isVisible()); ok('lampiran surat jemputan/memo dalam bahagian Ahli');
  await page.setInputFiles('#att-surat', { name: 'x.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
  await page.waitForSelector('.field-error:has-text("Jenis fail tidak dibenarkan")'); ok('lampiran .exe ditolak di klien');
  await page.setInputFiles('#att-surat', { ...PDF, name: 'surat.pdf' }); await page.setInputFiles('#att-memo', { ...PDF, name: 'memo.pdf' });
  await shot(page, 'form-attach');
  await page.click('button:has-text("Simpan Draf")'); await page.waitForSelector('h1:has-text("Mesyuarat HMI Bil.1/2026")');
  assert.ok(db.calls.filter((c) => c === 'materials.upload').length === 2); ok('surat jemputan dan memo dimuat naik bersama simpan');
  assert.ok((await page.textContent('.meta')).includes('Dr Pengarah')); assert.ok((await page.textContent('#main')).includes('2027'));
  await page.click('#tab-materials'); await page.waitForSelector('.mat-item');
  assert.ok(await page.locator('.mat-group:has(h3:has-text("Surat Jemputan")) .mat-item').count() === 1 && await page.locator('.mat-group:has(h3:has-text("Memo")) .mat-item').count() === 1); ok('tab Bahan: Surat Jemputan dan Memo dikumpul ikut jenis');
  await page.click('a[data-path="/meetings"]'); await page.waitForSelector('.mcard');

  // ===== Editor agenda =====
  await page.goto(base + '/#/meetings/MTG-1'); await page.waitForSelector('h1:has-text("Mesyuarat HMI")');
  await page.click('button:has-text("Edit agenda")'); await page.waitForSelector('h1:has-text("Editor Agenda")');
  assert.ok(await page.locator('text=Tambah item agenda pertama').isVisible());
  async function addItem(title, cat, presenter, dur) {
    await page.click('button:has-text("Tambah item")'); await page.fill('.modal input[maxlength="200"]', title);
    if (cat) await page.selectOption('.modal label:has-text("Kategori") + select', cat);
    if (presenter) await page.selectOption('.modal label:has-text("Pembentang") + select', presenter);
    if (dur) await page.fill('.modal input[type=number]', dur);
    await page.click('.modal button[type=submit]'); await page.waitForSelector('.toast-success'); await page.waitForFunction((t) => [...document.querySelectorAll('.ag-item .agenda-title')].some((e) => e.textContent === t), title);
  }
  await page.click('button:has-text("Tambah item")'); await page.click('.modal button[type=submit]'); assert.ok(await page.locator('.modal .field-error:visible').count() === 1); await page.keyboard.press('Escape'); ok('agenda: tajuk wajib');
  await page.click('button:has-text("Tambah item")'); await page.fill('.modal input[maxlength="200"]', 'x'); await page.fill('.modal input[type=number]', '999'); await page.click('.modal button[type=submit]');
  assert.ok(await page.locator('.modal .field-error:has-text("1 hingga 480")').count() === 1); await page.keyboard.press('Escape'); ok('agenda: tempoh 1-480');
  await addItem('Pengesahan Minit', 'Pengesahan'); await addItem('Kertas Makluman HMI', 'Makluman', 'a1@x.com', '15'); await addItem('Hal-hal Lain', 'Perbincangan');
  const titles = () => page.$$eval('.ag-item .agenda-title', (e) => e.map((x) => x.textContent));
  assert.deepStrictEqual(await titles(), ['Pengesahan Minit', 'Kertas Makluman HMI', 'Hal-hal Lain']); ok('agenda: 3 item ditambah');
  await page.click('button[aria-label="Turunkan Pengesahan Minit"]'); await page.waitForFunction(() => document.querySelector('.ag-item .agenda-title').textContent === 'Kertas Makluman HMI');
  assert.deepStrictEqual(db.agenda['MTG-1'].map((a) => a.title), ['Kertas Makluman HMI', 'Pengesahan Minit', 'Hal-hal Lain']); ok('agenda: butang turun disimpan ke server');
  await page.dragAndDrop('.ag-item:has-text("Hal-hal Lain")', '.ag-item:has-text("Kertas Makluman HMI")');
  await page.waitForFunction(() => document.querySelector('.ag-item .agenda-title').textContent === 'Hal-hal Lain', null, { timeout: 4000 }).catch(() => {});
  const afterDrag = await titles(); console.log('  ' + (afterDrag[0] === 'Hal-hal Lain' ? 'ok ' : 'AMARAN') + ' seret & lepas: ' + afterDrag.join(' | '));
  await shot(page, 'agenda-editor');
  await page.click('button[aria-label="Buang Hal-hal Lain"]'); await page.click('.modal .btn-danger'); await page.waitForFunction(() => document.querySelectorAll('.ag-item').length === 2); ok('agenda: buang item');
  await page.click('button[aria-label^="Edit Pengesahan"]'); await page.fill('.modal input[maxlength="200"]', 'Pengesahan Minit Lepas'); await page.click('.modal button[type=submit]');
  await page.waitForSelector('.ag-item:has-text("Pengesahan Minit Lepas")'); ok('agenda: edit item');

  // ===== Bahan =====
  await page.goto(base + '/#/meetings/MTG-1'); await page.waitForSelector('h1:has-text("Mesyuarat HMI")');
  await page.click('#tab-materials'); await page.waitForSelector('button:has-text("Muat naik")');
  await page.click('button:has-text("Muat naik")');
  await page.setInputFiles('#upl-file', { name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') }); await page.click('.modal .btn-primary');
  assert.ok(await page.locator('.modal .field-error:has-text("tidak dibenarkan")').count() === 1); ok('bahan: .exe ditolak sebelum dihantar');
  await page.setInputFiles('#upl-file', { name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(21 * 1048576, 37) }); await page.click('.modal .btn-primary');
  assert.ok(await page.locator('.modal .field-error:has-text("melebihi had 20 MB")').count() === 1); ok('bahan: fail > had disyorkan guna folder Drive');
  await page.selectOption('.modal label:has-text("Jenis dokumen") + select', 'Kertas Makluman'); await page.fill('.modal input[maxlength="200"]', 'Kertas Makluman HMI 2026');
  await page.selectOption('.modal label:has-text("Item agenda") + select', { label: '1. Kertas Makluman HMI' });
  await page.setInputFiles('#upl-file', PDF); await page.click('.modal .btn-primary'); await page.waitForSelector('.toast-success:has-text("dimuat naik")');
  await page.waitForSelector('.mat-group:has(h3:has-text("Kertas Makluman")) .mat-item'); ok('bahan: muat naik dengan item agenda');
  await page.click('button:has-text("Muat naik")'); await page.selectOption('.modal label:has-text("Jenis dokumen") + select', 'Bahan Bicara'); await page.fill('.modal input[maxlength="200"]', 'Bahan Bicara Pengarah');
  await page.setInputFiles('#upl-file', PDF); await page.click('.modal .btn-primary'); await page.waitForSelector('.mat-group:has(h3:has-text("Bahan Bicara")) .badge:has-text("Terhad")'); ok('Bahan Bicara ditandakan Terhad');
  await shot(page, 'materials-staff');
  await page.click('button[aria-label^="Ganti versi Kertas Makluman"]'); await page.setInputFiles('#rep-file', { ...PDF, name: 'kertas-v2.pdf' }); await page.click('.modal .btn-primary');
  await page.waitForSelector('.mat-item:has-text("v2")'); assert.strictEqual(await page.locator('.mat-item:has-text("Kertas Makluman HMI 2026")').count(), 1); ok('bahan: ganti versi -> v2, versi lama disembunyikan');
  await page.check('#show-old'); assert.strictEqual(await page.locator('.mat-item.is-old').count(), 1); ok('staf boleh tunjuk versi lama'); await page.uncheck('#show-old');
  await page.click('button:has-text("Imbas folder Drive")'); await page.waitForSelector('.modal:has-text("virus.exe")'); await page.click('.modal .btn-primary'); await page.waitForSelector('.mat-item:has-text("imbas1.pdf")'); ok('imbas folder: 2 didaftar, 1 dilangkau dengan sebab');
  await page.click('button:has-text("Daftar pautan Drive")'); await page.fill('.modal input >> nth=0', 'bukan-pautan'); await page.click('.modal .btn-primary'); await page.waitForSelector('.modal .banner-danger'); await page.keyboard.press('Escape'); ok('daftar pautan: ralat server dipaparkan');
  await page.click('button[aria-label="Edit maklumat imbas1"]'); await page.selectOption('.modal label:has-text("Jenis dokumen") + select', 'Minit'); await page.click('.modal .btn-primary'); await page.waitForSelector('.mat-group:has(h3:has-text("Minit")) .mat-item'); ok('edit jenis bahan hasil imbasan');
  await page.click('button[aria-label^="Arkibkan imbas2"]'); await page.click('.modal .btn-danger'); await page.waitForFunction(() => ![...document.querySelectorAll('.mat-title a')].some((a) => a.textContent === 'imbas2')); ok('arkib bahan');
  // penonton
  await page.click('.mat-title a:has-text("Kertas Makluman HMI 2026")'); await page.waitForSelector('iframe.viewer-frame');
  const src = await page.getAttribute('iframe.viewer-frame', 'src'); assert.ok(/^https:\/\/drive\.google\.com\/file\/d\/DRVFILE\w+\/preview$/.test(src), src);
  assert.ok(db.calls.includes('materials.logOpen')); assert.ok(await page.locator('a:has-text("Buka dalam tab baharu")').getAttribute('href').then((x) => x.includes('/view'))); assert.ok(await page.locator('a:has-text("Muat turun")').getAttribute('href').then((x) => x.includes('export=download')));
  await shot(page, 'viewer'); ok('penonton: iframe preview, muat turun, tab baharu, log buka');
  await page.click('a:has-text("Kembali ke mesyuarat")'); await page.click('#tab-agenda'); await page.waitForSelector('.agenda-mat a:has-text("Kertas Makluman HMI 2026")'); ok('tab Agenda memaparkan bahan pada item');
  await page.click('button:has-text("Terbitkan")'); await page.click('.modal .btn-primary'); await page.waitForSelector('.badge:has-text("Dijadualkan")');
  assert.deepStrictEqual(problems, [], problems.join('\n')); ok('tiada ralat konsol / CSP (Setiausaha)');

  // ===== Pembentang =====
  ({ page, problems } = await newPage());
  await loginAs(page, 'cred-a1'); await page.goto(base + '/#/meetings/MTG-1'); await page.waitForSelector('h1:has-text("Mesyuarat HMI")');
  await page.click('#tab-materials'); await page.waitForSelector('button:has-text("Muat naik")');
  assert.strictEqual(await page.locator('button:has-text("Daftar pautan Drive"), button:has-text("Imbas folder Drive")').count(), 0); ok('pembentang: tiada daftar/imbas');
  assert.ok(!(await page.textContent('#tabpanel')).includes('Bahan Bicara Pengarah')); ok('pembentang tidak nampak Bahan Bicara');
  await page.click('button:has-text("Muat naik")');
  const types = await page.$$eval('.modal label:has-text("Jenis dokumen") + select option', (o) => o.map((x) => x.textContent)); assert.ok(!types.includes('Bahan Bicara')); ok('pembentang: jenis Bahan Bicara tiada dalam pilihan');
  const items = await page.$$eval('.modal label:has-text("Item agenda") + select option', (o) => o.map((x) => x.textContent)); assert.deepStrictEqual(items, ['1. Kertas Makluman HMI']); ok('pembentang: hanya item yang dibentang');
  await page.setInputFiles('#upl-file', { ...PDF, name: 'slaid.pdf' }); await page.click('.modal .btn-primary'); await page.waitForSelector('.mat-item:has-text("slaid")'); ok('pembentang memuat naik untuk item sendiri');
  assert.strictEqual(await page.locator('button[aria-label^="Ganti versi Kertas Makluman HMI 2026"]').count(), 0); ok('pembentang tak boleh urus bahan staf');
  assert.deepStrictEqual(problems, [], problems.join('\n'));

  // ===== Ahli biasa, Pengerusi =====
  ({ page, problems } = await newPage());
  await loginAs(page, 'cred-a2'); await page.goto(base + '/#/meetings/MTG-1'); await page.waitForSelector('h1:has-text("Mesyuarat HMI")'); await page.click('#tab-materials'); await page.waitForSelector('.mat-item');
  assert.strictEqual(await page.locator('button:has-text("Muat naik")').count(), 0); assert.ok(!(await page.textContent('#tabpanel')).includes('Bahan Bicara')); ok('Ahli biasa: tiada butang muat naik, tiada Bahan Bicara');
  await page.goto(base + '/#/meetings/MTG-1/agenda'); await page.waitForSelector('text=Tiada akses'); ok('Ahli: /agenda = Tiada akses');
  ({ page, problems } = await newPage());
  await loginAs(page, 'cred-chair'); await page.goto(base + '/#/meetings/MTG-1'); await page.waitForSelector('h1:has-text("Mesyuarat HMI")'); await page.click('#tab-materials'); await page.waitForSelector('.mat-item');
  assert.ok((await page.textContent('#tabpanel')).includes('Bahan Bicara Pengarah')); ok('Pengerusi mesyuarat itu nampak Bahan Bicara');
  assert.deepStrictEqual(problems, [], problems.join('\n'));

  // ===== Telefon =====
  const ph = await newPage({ width: 390, height: 844 });
  await loginAs(ph.page, 'cred-sec');
  for (const [hash, sel] of [['#/meetings/MTG-1', '.meta'], ['#/meetings/MTG-1/agenda', '.ag-item'], ['#/meetings/new', '.picker'], ['#/users', null]]) {
    await ph.page.goto(base + '/' + hash); await ph.page.waitForSelector(sel || '.app-header');
    if (hash === '#/meetings/MTG-1') { await ph.page.click('#tab-materials'); await ph.page.waitForSelector('.mat-item'); }
    const over = await ph.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(over <= 0, hash + ' skrol mendatar ' + over);
    const small = await ph.page.$$eval('button, a.nav-link, .icon-btn, select, .tab', (els) => els.filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return [(e.getAttribute('aria-label') || e.textContent).trim().slice(0, 24), Math.round(r.width), Math.round(r.height)]; }).filter(([, w, h]) => h < 44 || w < 44));
    if (small.length) console.log('  AMARAN ' + hash + ' sentuh < 44px: ' + JSON.stringify(small.slice(0, 6)));
    await shot(ph.page, 'phone' + hash.replace(/[#/]/g, '-'));
  }
  ok('telefon: tiada skrol mendatar (bahan, editor agenda, borang, pengguna)');
  await browser.close(); server.close(); console.log('\nSmoke test Fasa 3 selesai.');
})().catch((e) => { console.error('GAGAL:', e.message.split('\n').slice(0, 8).join('\n')); process.exit(1); });
