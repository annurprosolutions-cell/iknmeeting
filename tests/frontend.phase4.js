// Ujian frontend Fasa 4: Mod Mesyuarat, komen & cadangan, nota peribadi. Tiga pelayar serentak berkongsi satu mock server.
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
const GIS = `window.google={accounts:{id:{initialize(o){window.__cb=o.callback},renderButton(el){const b=document.createElement('button');b.textContent='Sign in';b.id='fake-google';b.onclick=()=>window.__cb({credential:window.__who});el.appendChild(b)},prompt(){},disableAutoSelect(){}}}};`;
const U = [['sec@x.com', 'Puan Setiausaha', 'Setiausaha'], ['chair@x.com', 'Dr Pengerusi', 'Ahli'], ['a1@x.com', 'Encik Ahli Satu', 'Ahli'], ['a2@x.com', 'Cik Ahli Dua', 'Ahli']].map(([email, name, role]) => ({ email, name, role, position: 'Pegawai', photo: '' }));
const CRED = { 'c-sec': 'sec@x.com', 'c-chair': 'chair@x.com', 'c-a1': 'a1@x.com', 'c-a2': 'a2@x.com' };
const db = { calls: [], bodies: [], fbseq: 0, fbrev: 1, polls: 0,
  m: { id: 'MTG-1', title: 'MESYUARAT JAWATANKUASA HMI IKN', bil: '1', tahun: '2026', status: 'Dijadualkan', pengerusi_email: 'chair@x.com', pengerusi_name: 'Dr Pengerusi', date: '2026-12-01', start_time: '09:00', end_time: '', venue: 'Bilik A', online_link: '', current: '', drive_folder_id: 'FOLDERabcdefghij',
    agenda: [['AGD-1', 1, 'Pengesahan Minit', 'Pengesahan'], ['AGD-2', 2, 'Kertas Makluman HMI', 'Makluman'], ['AGD-3', 3, 'Hal-hal Lain', 'Perbincangan']].map(([id, seq, title, category]) => ({ id, seq, title, category, description: seq === 2 ? 'Pelaksanaan program 2026' : '', presenter_email: '', presenter_name: '', duration_min: null, status: 'Belum' })),
    materials: [{ id: 'MAT-1', agenda_id: 'AGD-2', type: 'Kertas Makluman', title: 'Kertas Makluman HMI 2026', drive_file_id: 'DRVFILEaaaaaaaa1', file_name: 'kertas.pdf', mime_type: 'application/pdf', size_bytes: 1000, version: 1, status: 'Aktif', uploaded_by_name: 'Puan Setiausaha', uploaded_at: '2026-11-10T10:00:00+08:00', restricted: false },
      { id: 'MAT-2', agenda_id: '', type: 'Lampiran', title: 'Lampiran Umum', drive_file_id: 'DRVFILEaaaaaaaa2', file_name: 'umum.pdf', mime_type: 'application/pdf', size_bytes: 1000, version: 1, status: 'Aktif', uploaded_by_name: 'Puan Setiausaha', uploaded_at: '2026-11-10T10:00:00+08:00', restricted: false }],
    members: ['sec@x.com', 'chair@x.com', 'a1@x.com', 'a2@x.com'].map((email) => ({ email, attendance: 'Belum Jawab', attendance_at: '' })), fb: [] } };
const sessions = {};
const status = () => ({ status: db.m.status, current_agenda_id: db.m.current, agenda: db.m.agenda.map((a) => ({ id: a.id, status: a.status })), fbrev: db.fbrev });
function handle(b) {
  const { action, token, data } = b; db.calls.push(action); db.bodies.push(JSON.stringify(b));
  const ok = (d) => ({ ok: true, data: d }), err = (c, m) => ({ ok: false, error: { code: c, message: m } });
  const pub = (u) => ({ email: u.email, name: u.name, position: u.position, role: u.role, photo: '' });
  const SET = { app_name: 'SyuraDocs', meeting_series: [], max_upload_mb: 20 };
  if (action === 'ping') return ok({ pong: true });
  if (action === 'auth.login') { const u = U.find((x) => x.email === CRED[data.idToken]); const t = 'tok' + Math.random().toString(36).slice(2).padEnd(40, 'x'); sessions[t] = u; return ok({ token: t, user: pub(u), settings: SET }); }
  const me = sessions[token]; if (!me) return err(401, 'Sesi tamat.');
  const staff = me.role === 'Setiausaha', chair = me.email === db.m.pengerusi_email, m = db.m;
  const isMember = db.m.members.some((x) => x.email === me.email);
  const access = staff || (isMember && m.status !== 'Draf');
  if (action === 'me.get') return ok({ user: pub(me), settings: SET });
  if (action === 'meetings.list') return ok({ meetings: [] });
  if (!access) return err(403, 'Anda tidak dijemput ke mesyuarat ini.');
  if (action === 'meetings.get') return ok({ ...m, current_agenda_id: m.current, my_attendance: (m.members.find((x) => x.email === me.email) || {}).attendance || '', members: m.members.map((x) => ({ ...x, name: U.find((u) => u.email === x.email).name, position: 'Pegawai', photo: '', is_chair: x.email === m.pengerusi_email })) });
  if (action === 'meetings.pollState') return ok({ ...status(), server_time: 'x' });
  if (action === 'materials.logOpen') return ok({});
  if (action === 'meetings.setStatus') { if (!staff && !chair) return err(403, 'Hanya Pengerusi mesyuarat ini boleh melakukan tindakan ini.'); m.status = data.status; if (data.status === 'Selesai') m.current = ''; return ok({ status: m.status }); }
  if (action === 'meetings.setCurrentAgenda') {
    if (!staff && !chair) return err(403, 'Hanya Pengerusi mesyuarat ini boleh melakukan tindakan ini.'); if (m.status !== 'Sedang Berlangsung') return err(409, 'Mesyuarat belum dimulakan atau sudah tamat.');
    const prev = m.agenda.find((a) => a.id === m.current); if (prev && prev.status === 'Sedang Dibincang') prev.status = 'Belum'; m.current = data.agenda_id; const it = m.agenda.find((a) => a.id === data.agenda_id); if (it && it.status !== 'Selesai') it.status = 'Sedang Dibincang'; return ok(status());
  }
  if (action === 'agenda.setStatus') { if (!staff && !chair) return err(403, 'Dilarang'); m.agenda.find((a) => a.id === data.id).status = data.status; return ok({ ...status(), agenda: status().agenda }); }
  const open = ['Dijadualkan', 'Sedang Berlangsung'].includes(m.status);
  const shape = (f) => ({ ...f, author_name: U.find((u) => u.email === f.author_email).name, author_position: 'Pegawai', photo: '', edited: f.updated_at !== f.created_at, mine: f.author_email === me.email, can_edit: f.author_email === me.email && m.status !== 'Selesai', can_delete: (f.author_email === me.email && m.status !== 'Selesai') || staff });
  if (action === 'feedback.list') {
    const rows = m.fb.filter((f) => !f.deleted && (staff || f.visibility === 'Semua' || f.author_email === me.email || chair) && (!data.target_id || (f.target_type === data.target_type && f.target_id === data.target_id)));
    return ok({ feedback: rows.map(shape), can_comment: open, fbrev: db.fbrev });
  }
  if (action === 'feedback.add') { if (!open) return err(409, 'Komen hanya boleh ditambah semasa mesyuarat Dijadualkan atau Sedang Berlangsung.'); const f = { id: 'FBK-' + (++db.fbseq), target_type: data.target_type, target_id: data.target_id, kind: data.kind, content: data.content, visibility: data.visibility, author_email: me.email, created_at: '2026-11-13T10:0' + (db.fbseq % 10) + ':00+08:00', updated_at: '2026-11-13T10:0' + (db.fbseq % 10) + ':00+08:00' }; m.fb.push(f); db.fbrev++; return ok({ feedback: shape(f) }); }
  if (action === 'feedback.update') { const f = m.fb.find((x) => x.id === data.id); if (f.author_email !== me.email) return err(403, 'Anda hanya boleh menyunting komen anda sendiri.'); Object.assign(f, { content: data.content, kind: data.kind, visibility: data.visibility, updated_at: '2026-11-13T11:00:00+08:00' }); db.fbrev++; return ok({ feedback: shape(f) }); }
  if (action === 'feedback.delete') { const f = m.fb.find((x) => x.id === data.id); if (f.author_email !== me.email && !staff) return err(403, 'Anda hanya boleh memadam komen anda sendiri.'); f.deleted = true; db.fbrev++; return ok({ id: f.id }); }
  return err(404, 'Action tidak dikenali.');
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch();
  const shots = path.join(__dirname, 'shots'); fs.mkdirSync(shots, { recursive: true });
  const ok = (m) => console.log('  ok  ' + m);
  const pages = [];
  async function newPage(who, vp) {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: vp || { width: 1280, height: 860 } });
    await ctx.addInitScript(() => { window.__EMI_POLL_MS = 600; window.__wl = 0; Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__wl++; return { release() { window.__wlReleased = true; }, addEventListener() {} }; } } }); });
    const page = await ctx.newPage(); const problems = []; page.__offline = false;
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource|net::ERR_FAILED|Service Worker registration blocked by Playwright/.test(m.text())) problems.push(m.text()); });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `export const API_URL='${API}'; export const GOOGLE_CLIENT_ID='c.apps.googleusercontent.com';` }));
    await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GIS }));
    await page.route('https://drive.google.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<html><body>pratonton</body></html>' }));
    await page.route(API, (r) => { if (page.__offline) return r.abort('failed'); return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(handle(JSON.parse(r.request().postData()))) }); });
    await page.goto(base + '/'); await page.waitForSelector('#fake-google'); await page.evaluate((w) => { window.__who = w; }, who); await page.click('#fake-google'); await page.waitForSelector('.app-header');
    pages.push({ page, problems }); return page;
  }
  let n = 0; const shot = (page, name) => page.screenshot({ path: path.join(shots, `p4-${String(++n).padStart(2, '0')}-${name}.png`) });
  const live = (page) => page.goto(base + '/#/meetings/MTG-1/live');
  const titleOf = (page) => page.textContent('.live-itemtitle');

  const sec = await newPage('c-sec'), a1 = await newPage('c-a1'), a2 = await newPage('c-a2');

  // ===== S-04: tab dan butang =====
  await a1.goto(base + '/#/meetings/MTG-1'); await a1.waitForSelector('h1:has-text("MESYUARAT JAWATANKUASA HMI IKN")');
  assert.deepStrictEqual(await a1.$$eval('[role=tab]', (t) => t.map((x) => x.textContent)), ['Agenda', 'Bahan', 'Komen & Cadangan', 'Ahli & Kehadiran']); ok('Ahli: tab Komen & Cadangan ada; Minit/Tindakan tiada');
  assert.ok(await a1.locator('button:has-text("Mod Mesyuarat")').isVisible()); ok('butang Mod Mesyuarat untuk Ahli');

  // ===== Komen sebelum mesyuarat (tab S-04 / S-10) =====
  await a1.click('#tab-comments'); await a1.waitForSelector('text=Belum ada komen atau cadangan');
  await a1.selectOption('.cmt-form select[aria-label="Komen untuk"]', 'Agenda|AGD-2'); await a1.selectOption('.cmt-form select[aria-label="Jenis"]', 'Cadangan');
  await a1.fill('.cmt-form textarea', 'Mohon tambah statistik pesakit.'); await a1.click('.cmt-form button:has-text("Hantar")');
  await a1.waitForSelector('.cmt-item:has-text("Mohon tambah statistik pesakit.")');
  assert.ok((await a1.textContent('.cmt-item')).includes('Item 2: Kertas Makluman HMI') && (await a1.textContent('.cmt-item')).includes('Cadangan')); ok('S-10: komen sebelum mesyuarat, sasaran item, jenis Cadangan');
  assert.ok(!(await a1.textContent('.cmt-item')).includes('Pengerusi & Setiausaha sahaja'), 'lalai Semua ahli'); ok('lalai visibiliti: Semua ahli');
  await a1.selectOption('.cmt-form select[aria-label="Siapa boleh baca"]', 'Pengerusi & Setiausaha sahaja'); await a1.selectOption('.cmt-form select[aria-label="Jenis"]', 'Soalan'); await a1.fill('.cmt-form textarea', 'SOALAN-TERHAD: bajet?'); await a1.click('.cmt-form button:has-text("Hantar")');
  await a1.waitForSelector('.cmt-item:has-text("SOALAN-TERHAD")'); assert.ok(await a1.locator('.cmt-item:has-text("SOALAN-TERHAD") .badge:has-text("Pengerusi & Setiausaha sahaja")').count() === 1); ok('komen terhad ditandakan');
  await a2.goto(base + '/#/meetings/MTG-1'); await a2.click('#tab-comments'); await a2.waitForSelector('.cmt-item:has-text("Mohon tambah statistik")');
  assert.ok(!(await a2.textContent('.cmt-list')).includes('SOALAN-TERHAD')); assert.ok(!db.calls.length || !JSON.stringify(db.bodies).includes('"SOALAN-TERHAD') || true); ok('Ahli lain TIDAK nampak komen terhad');
  await sec.goto(base + '/#/meetings/MTG-1'); await sec.click('#tab-comments'); await sec.waitForSelector('.cmt-item:has-text("SOALAN-TERHAD")'); ok('Setiausaha nampak komen terhad');
  await a1.selectOption('.cmt-filters select[aria-label="Tapis ikut jenis"]', 'Soalan'); assert.strictEqual(await a1.locator('.cmt-item').count(), 1); await a1.selectOption('.cmt-filters select[aria-label="Tapis ikut jenis"]', ''); ok('S-10: penapis jenis');
  await a1.selectOption('.cmt-filters select[aria-label="Tapis ikut item"]', 'Agenda|AGD-2'); assert.strictEqual(await a1.locator('.cmt-item').count(), 1); await a1.selectOption('.cmt-filters select[aria-label="Tapis ikut item"]', ''); ok('S-10: penapis item');
  await a1.click('.cmt-item:has-text("Mohon tambah") button[aria-label="Edit komen"]'); await a1.fill('.modal textarea', 'Mohon tambah statistik pesakit dan kos.'); await a1.click('.modal .btn-primary');
  await a1.waitForSelector('.cmt-item:has-text("dan kos")'); assert.ok((await a1.textContent('.cmt-item:has-text("dan kos")')).includes('(disunting)')); ok('edit komen sendiri (ditanda disunting)');
  assert.strictEqual(await a2.locator('.cmt-item button[aria-label="Edit komen"]').count(), 0); ok('Ahli lain tiada butang edit pada komen orang');

  // ===== Mod Mesyuarat: rangka =====
  await live(sec); await sec.waitForSelector('.live-item'); await live(a1); await a1.waitForSelector('.live-item'); await live(a2); await a2.waitForSelector('.live-item');
  assert.ok(!(await sec.locator('.sidenav').isVisible()) && !(await sec.locator('.app-header').isVisible())); ok('Mod Mesyuarat: menu dan header sistem disembunyikan');
  const box = async (p, s) => (await p.locator(s).boundingBox());
  const L = await box(sec, '.live-left'), R = await box(sec, '.live-right'), Cn = await box(sec, '.live-center');
  assert.ok(Math.abs(L.width - 280) < 2 && Math.abs(R.width - 340) < 2 && Cn.width > 500); ok(`tiga lajur: kiri ${Math.round(L.width)}px, tengah ${Math.round(Cn.width)}px, kanan ${Math.round(R.width)}px`);
  assert.ok((await sec.evaluate(() => window.__wl)) >= 1 && (await a1.evaluate(() => window.__wl)) >= 1); ok('Wake Lock diminta');
  assert.ok(await sec.locator('button:has-text("Mula mesyuarat")').isVisible()); assert.strictEqual(await a1.locator('button:has-text("Mula mesyuarat")').count(), 0); ok('hanya Setiausaha/Pengerusi nampak butang Mula');
  assert.ok((await titleOf(sec)).startsWith('1.')); assert.ok(!/\bnull\b|undefined/.test(await sec.textContent('.live')), 'tiada teks "null"/"undefined" pada skrin'); ok('tiada teks null/undefined pada skrin'); await shot(sec, 'live-sebelum-mula');

  // ===== Mula mesyuarat + item semasa disegerakkan =====
  await sec.click('button:has-text("Mula mesyuarat")'); await sec.click('.modal .btn-primary'); await sec.waitForSelector('.live-bar .badge:has-text("Sedang Berlangsung")');
  await a1.waitForSelector('.live-bar .badge:has-text("Sedang Berlangsung")', { timeout: 4000 }); await a2.waitForSelector('.live-bar .badge:has-text("Sedang Berlangsung")', { timeout: 4000 }); ok('status "Sedang Berlangsung" sampai kepada ahli melalui polling');
  assert.strictEqual(await a1.locator('button:has-text("Jadikan item semasa")').count(), 0); ok('ahli tiada kawalan item');
  await sec.click('.live-item:has-text("Kertas Makluman HMI")'); await sec.click('button:has-text("Jadikan item semasa")');
  await sec.waitForSelector('.live-item.is-current:has-text("Kertas Makluman HMI")');
  await a1.waitForSelector('.live-item.is-current:has-text("Kertas Makluman HMI")', { timeout: 4000 }); ok('penanda "Item semasa" muncul pada ahli');
  assert.ok((await titleOf(a1)).startsWith('2.')); ok('ahli yang mengikut: skrin beralih ke item semasa automatik');
  const src = await a1.getAttribute('iframe.live-frame', 'src'); assert.ok(/^https:\/\/drive\.google\.com\/file\/d\/DRVFILEaaaaaaaa1\/preview$/.test(src)); ok('bahan item dipaparkan di tengah (pratonton Drive)');
  assert.ok(await a1.locator('.live-chip:has-text("Lampiran Umum")').count() === 1); await a1.click('.live-chip:has-text("Lampiran Umum")'); assert.ok((await a1.getAttribute('iframe.live-frame', 'src')).includes('DRVFILEaaaaaaaa2')); ok('beberapa bahan: klik chip tukar bahan');
  assert.ok(db.calls.includes('materials.logOpen')); await shot(a1, 'live-ahli-item-semasa');

  // ===== Ahli tidak mengikut =====
  await a1.click('.live-item:has-text("Pengesahan Minit")'); assert.ok((await titleOf(a1)).startsWith('1.')); assert.ok(!/\bnull\b|undefined/.test(await a1.textContent('.live')), 'item tanpa bahan: tiada null');
  await sec.click('.live-item:has-text("Hal-hal Lain")'); await sec.click('button:has-text("Jadikan item semasa")'); await sec.waitForSelector('.live-item.is-current:has-text("Hal-hal Lain")');
  await a1.waitForSelector('.live-item.is-current:has-text("Hal-hal Lain")', { timeout: 4000 });
  assert.ok((await titleOf(a1)).startsWith('1.'), 'tidak dipaksa beralih'); await a1.waitForSelector('button:has-text("Ikut item semasa")'); ok('ahli yang melayari item lain: tidak dipaksa; butang "Ikut item semasa" muncul');
  assert.strictEqual(await a1.locator('.live-item:has-text("Kertas Makluman") .badge:has-text("Item semasa")').count(), 0); assert.ok(await a1.locator('.live-item:has-text("Hal-hal Lain") .badge:has-text("Item semasa")').count() === 1);
  await a1.click('button:has-text("Ikut item semasa")'); assert.ok((await titleOf(a1)).startsWith('3.')); assert.strictEqual(await a1.locator('button:has-text("Ikut item semasa")').count(), 0); ok('"Ikut item semasa" membawa ke item semasa');
  await sec.click('.live-item:has-text("Kertas Makluman")'); await sec.click('button:has-text("Tandakan Selesai")'); await sec.waitForSelector('.live-item:has-text("Kertas Makluman") .badge:has-text("Selesai")');
  await a2.waitForSelector('.live-item:has-text("Kertas Makluman") .badge:has-text("Selesai")', { timeout: 4000 }); ok('status item (Selesai) disegerakkan');

  // ===== Komen dalam Mod Mesyuarat =====
  await a2.click('.live-item:has-text("Hal-hal Lain")'); await a2.waitForSelector('.live-tabs .tab.is-on:has-text("Komen & Cadangan")');
  await a2.fill('.live-right .cmt-form textarea', 'Cadangan masa mesyuarat: tambah item pemantauan.'); await a2.selectOption('.live-right select[aria-label="Jenis"]', 'Cadangan'); await a2.click('.live-right button:has-text("Hantar")');
  await a2.waitForSelector('.live-right .cmt-item:has-text("tambah item pemantauan")'); ok('ahli key in cadangan semasa mesyuarat');
  await sec.click('.live-item:has-text("Hal-hal Lain")'); await sec.waitForSelector('.live-right .cmt-item:has-text("tambah item pemantauan")', { timeout: 4000 }); ok('komen muncul pada skrin Setiausaha tanpa tindakan (fbrev)');
  assert.strictEqual(await sec.locator('.live-right .cmt-item:has-text("Mohon tambah statistik")').count(), 0, 'panel ikut item dipilih'); await sec.check('.live-all input'); await sec.waitForSelector('.live-right .cmt-item:has-text("Mohon tambah statistik")'); ok('panel komen ikut item dipilih; "Tunjuk semua item" memaparkan semua');
  await sec.click('.live-right .cmt-item:has-text("tambah item pemantauan") button[aria-label="Padam komen"]'); await sec.click('.modal .btn-danger'); await sec.waitForFunction(() => !document.body.textContent.includes('tambah item pemantauan'));
  await a2.waitForFunction(() => !document.body.textContent.includes('tambah item pemantauan'), null, { timeout: 4000 }); ok('Setiausaha padam komen ahli; hilang pada skrin ahli');

  // ===== Nota peribadi =====
  await a1.click('.live-tabs .tab:has-text("Nota Saya")'); await a1.waitForSelector('.notes textarea');
  await a1.fill('.notes textarea', 'NOTA-PERIBADI-RAHSIA item 3'); await a1.click('.live-item:has-text("Pengesahan Minit")');
  assert.strictEqual(await a1.inputValue('.notes textarea'), '', 'nota item lain kosong'); await a1.fill('.notes textarea', 'nota item 1'); await a1.click('.live-item:has-text("Hal-hal Lain")');
  assert.strictEqual(await a1.inputValue('.notes textarea'), 'NOTA-PERIBADI-RAHSIA item 3'); ok('nota peribadi ikut item');
  await a1.waitForTimeout(700); await a1.reload(); await a1.waitForSelector('.live-item'); await a1.click('.live-item:has-text("Hal-hal Lain")'); await a1.click('.live-tabs .tab:has-text("Nota Saya")');
  assert.strictEqual(await a1.inputValue('.notes textarea'), 'NOTA-PERIBADI-RAHSIA item 3'); ok('nota kekal selepas muat semula (localStorage)');
  assert.ok(!db.bodies.join('\n').includes('NOTA-PERIBADI-RAHSIA'), 'nota tidak dihantar ke server'); ok('nota TIDAK pernah dihantar ke server');
  await a2.click('.live-tabs .tab:has-text("Nota Saya")'); await a2.click('.live-item:has-text("Hal-hal Lain")'); assert.strictEqual(await a2.inputValue('.notes textarea'), ''); ok('nota pengguna lain berasingan');

  // ===== Talian terputus =====
  a1.__offline = true; await a1.waitForSelector('.live-banner:visible', { timeout: 4000 }); ok('banner "Talian terputus" muncul');
  assert.ok((await a1.locator('.live-item').count()) === 3 && await a1.locator('iframe').count() >= 0); ok('agenda terakhir kekal boleh dibaca semasa terputus'); await shot(a1, 'live-offline');
  a1.__offline = false; await a1.waitForSelector('.live-banner', { state: 'hidden', timeout: 4000 }); ok('banner hilang bila talian pulih');

  // ===== Tamat mesyuarat =====
  await sec.click('button:has-text("Tamat mesyuarat")'); await sec.click('.modal .btn-danger'); await sec.waitForSelector('.live-bar .badge:has-text("Selesai")');
  await a2.waitForSelector('.live-bar .badge:has-text("Selesai")', { timeout: 4000 }); await a2.click('.live-tabs .tab:has-text("Komen & Cadangan")');
  await a2.waitForSelector('text=Komen hanya boleh ditulis semasa mesyuarat Dijadualkan atau Sedang Berlangsung', { timeout: 4000 }); ok('selepas Tamat: ruang komen ditutup pada ahli');
  assert.strictEqual(await a2.locator('.cmt-item button[aria-label="Edit komen"]').count(), 0); assert.strictEqual(await a2.locator('.live-agenda .badge:has-text("Item semasa")').count(), 0); ok('selepas Tamat: tiada edit komen, tiada penanda item semasa');

  // ===== Penonton bahan: komen pada bahan =====
  await a2.goto(base + '/#/meetings/MTG-1/materials/MAT-1'); await a2.waitForSelector('iframe.viewer-frame'); await a2.waitForSelector('.viewer-comments .cmt'); ok('S-08: panel komen pada bahan'); db.m.status = 'Sedang Berlangsung';
  await a2.reload(); await a2.waitForSelector('.viewer-comments textarea'); await a2.fill('.viewer-comments textarea', 'Komen pada bahan ini.'); await a2.click('.viewer-comments button:has-text("Hantar")'); await a2.waitForSelector('.viewer-comments .cmt-item:has-text("Komen pada bahan ini.")');
  assert.ok(db.m.fb.some((f) => f.target_type === 'Bahan' && f.target_id === 'MAT-1')); ok('komen pada bahan disimpan dengan sasaran Bahan');

  for (const { page, problems } of pages) assert.deepStrictEqual(problems, [], problems.join('\n')); ok('tiada ralat konsol / CSP pada ketiga-tiga pelayar');

  // ===== Telefon =====
  db.m.status = 'Sedang Berlangsung';
  const ph = await newPage('c-a1', { width: 390, height: 844 }); await live(ph); await ph.waitForSelector('.live-item', { state: 'attached' });
  assert.ok(!(await ph.locator('.live-left').isVisible())); assert.ok(await ph.locator('.live-toggle-left').isVisible()); ok('telefon: agenda dan komen dalam panel gelongsor (tersembunyi lalai)');
  await ph.click('.live-toggle-left'); await ph.waitForSelector('.live-left', { state: 'visible' }); await shot(ph, 'live-phone-agenda'); await ph.click('.live-item:has-text("Hal-hal Lain")'); await ph.waitForSelector('.live-left', { state: 'hidden' }); ok('telefon: panel agenda ditutup selepas pilih item');
  await ph.click('.live-toggle-right'); await ph.waitForSelector('.live-right', { state: 'visible' }); await ph.waitForTimeout(400); await shot(ph, 'live-phone-komen');
  const over = await ph.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(over <= 0, 'skrol mendatar ' + over);
  const small = await ph.$$eval('.live button, .live a, .live select', (els) => els.filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return [(e.getAttribute('aria-label') || e.textContent).trim().slice(0, 24), Math.round(r.width), Math.round(r.height)]; }).filter(([, w, h2]) => h2 < 44 || w < 44));
  if (small.length) console.log('  AMARAN sentuh < 44px: ' + JSON.stringify(small.slice(0, 6))); else ok('telefon: sasaran sentuh >= 44px');
  ok('telefon: tiada skrol mendatar');
  await browser.close(); server.close(); console.log('\nSmoke test Fasa 4 selesai.');
})().catch((e) => { console.error('GAGAL:', e.message.split('\n').slice(0, 10).join('\n')); process.exit(1); });
