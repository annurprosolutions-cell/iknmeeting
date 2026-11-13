const assert = require('assert');
const { create } = require('./gas-harness');

let passed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('  GAGAL ' + name + '\n   ', e.message); process.exitCode = 1; } };

const h = create();
const { call, fetchMock, state, run } = h;

// ----- Setup -----
run("ADMIN_EMAIL = 'Admin@Contoh.com'");
run('setupSystem()');
t('setupSystem cipta 11 tab + seed', () => {
  assert.strictEqual(Object.keys(state.sheets).length, 11);
  assert.strictEqual(state.sheets.users.data[1][0], 'admin@contoh.com');
  assert.strictEqual(state.sheets.users.data[1][3], 'Admin');
  assert.strictEqual(state.sheets.users.data[0][8], 'photo'); assert.strictEqual(state.sheets.meetings.data[0][18], 'tahun');
  assert.ok(state.sheets.settings.data.length >= 11);
  assert.strictEqual(state.sheets.users.formats[1], '@');
  assert.deepStrictEqual(Array.from(state.sheets.users.validations[4].list), ['Admin', 'Setiausaha', 'Pengerusi', 'Ahli']);
});
t('setupSystem cipta folder root, Mesyuarat, Backup & simpan ID', () => {
  assert.deepStrictEqual(state.folders.map(f => f.name), ['e-Mesyuarat IKN', 'Mesyuarat', 'SyuraDocs Backup']);
  const bf = state.folders.find(f => f.name === 'SyuraDocs Backup'); assert.ok(!bf.parent, 'Backup di luar folder akar (tidak diwarisi Setiausaha)');
  const s = run("getSettings_()");
  assert.ok(s.root_folder_id && s.backup_folder_id);
});
t('setupSystem idempotent (run kali 2 tiada pendua)', () => {
  const before = JSON.stringify([state.sheets.users.data, state.sheets.settings.data]);
  run('invalidateSettings_(); invalidateUsers_()'); run('setupSystem()');
  assert.strictEqual(JSON.stringify([state.sheets.users.data, state.sheets.settings.data]), before);
  assert.strictEqual(state.folders.length, 3);
});
t('trigger dipasang untuk function yang wujud (digest, peringatan, backup); tindakan tertunggak dilangkau; idempotent', () => {
  assert.deepStrictEqual(state.triggers.map(x => x.fn).sort(), ['backupWeekly_', 'sendDigest_', 'sendReminders_']);
  run('setupSystem()'); assert.strictEqual(state.triggers.length, 3, 'tiada pendua selepas run semula');
});
t('setupSystem tolak ADMIN_EMAIL placeholder', () => {
  const h2 = create(); assert.throws(() => h2.run('setupSystem()'), /ADMIN_EMAIL/);
});

// ----- Ping, tanpa token -----
t('ping awam berfungsi', () => { const d = call('ping').data; assert.strictEqual(d.pong, true); assert.strictEqual(d.app, 'SyuraDocs API'); });
t('nama sistem: pemasangan baharu SyuraDocs; nilai lama ditukar oleh setupSystem; nama tersuai tidak ditimpa', () => {
  assert.strictEqual(run('getSettings_().app_name'), 'SyuraDocs');
  run("setSettingValue_('app_name', 'e-Mesyuarat IKN'); invalidateSettings_(); setupSystem(); invalidateSettings_()");
  assert.strictEqual(run('getSettings_().app_name'), 'SyuraDocs');
  run("setSettingValue_('app_name', 'SyuraDocs IKN'); invalidateSettings_(); setupSystem(); invalidateSettings_()");
  assert.strictEqual(run('getSettings_().app_name'), 'SyuraDocs IKN');
  run("setSettingValue_('app_name', 'SyuraDocs'); invalidateSettings_()");
});
t('tanpa token ditolak 401', () => { const r = call('users.list', {}); assert.strictEqual(r.ok, false); assert.strictEqual(r.error.code, 401); });
t('token palsu ditolak 401', () => assert.strictEqual(call('me.get', {}, 'x'.repeat(64)).error.code, 401));
t('action tak dikenali 404, ralat JSON rosak 400', () => {
  assert.strictEqual(call('xxx').error.code, 404);
  const out = run('doPost')({ postData: { contents: '{bukan json' } }); assert.strictEqual(JSON.parse(out.text).error.code, 400);
});
t('ralat dalaman tidak dedah stack', () => {
  run("var __orig = getRoutes_; getRoutes_ = function(){ return { boom: { fn: function(){ throw new Error('rahsia-stack'); }, public: true } }; }");
  const r = JSON.parse(run('doPost')({ postData: { contents: JSON.stringify({ action: 'boom' }) } }).text);
  run('getRoutes_ = __orig');
  assert.strictEqual(r.error.code, 500); assert.ok(!/rahsia/.test(JSON.stringify(r)));
});

// ----- Login -----
const CID = 'client-123.apps.googleusercontent.com';
const future = () => String(Math.floor(Date.now() / 1000) + 3600);
function google(email, over = {}) {
  fetchMock.respond = () => ({ code: 200, body: Object.assign({ aud: CID, iss: 'https://accounts.google.com', exp: future(), email, email_verified: 'true' }, over) });
}
const FAKE = 'eyJ' + 'a'.repeat(40);
const login = (email, over) => { google(email, over); return call('auth.login', { idToken: FAKE }); };
const auditActions = () => state.sheets.audit_log.data.slice(1).map(r => r[3]);

let adminTok;
t('login Admin berjaya, token sesi ~64 aksara, last_login & audit direkod', () => {
  const r = login('admin@contoh.com');
  assert.ok(r.ok, JSON.stringify(r)); adminTok = r.data.token;
  assert.strictEqual(adminTok.length, 64);
  assert.strictEqual(r.data.user.role, 'Admin');
  assert.deepStrictEqual(r.data.settings.meeting_types.length, 3);
  assert.ok(/\+08:00$/.test(state.sheets.users.data[1][7]));
  assert.ok(auditActions().includes('login'));
  assert.ok(fetchMock.calls[fetchMock.calls.length - 1].startsWith('https://oauth2.googleapis.com/tokeninfo?id_token='));
});
t('emel tak berdaftar ditolak 403 + audit login_gagal', () => {
  const r = login('orang@luar.com');
  assert.strictEqual(r.error.code, 403); assert.ok(/tidak didaftarkan/.test(r.error.message));
  assert.ok(auditActions().includes('login_gagal'));
});
t('aud salah / iss salah / tamat / email belum sah ditolak 401', () => {
  assert.strictEqual(login('admin@contoh.com', { aud: 'lain' }).error.code, 401);
  assert.strictEqual(login('admin@contoh.com', { iss: 'evil.com' }).error.code, 401);
  assert.strictEqual(login('admin@contoh.com', { exp: String(Math.floor(Date.now() / 1000) - 5) }).error.code, 401);
  assert.strictEqual(login('admin@contoh.com', { email_verified: 'false' }).error.code, 401);
  fetchMock.respond = () => ({ code: 400, body: { error: 'invalid_token' } });
  assert.strictEqual(call('auth.login', { idToken: FAKE }).error.code, 401);
});
t('me.get dengan token sah', () => {
  const r = call('me.get', {}, adminTok); assert.ok(r.ok); assert.strictEqual(r.data.user.email, 'admin@contoh.com');
});

// ----- Pengguna -----
t('users.save cipta pengguna + role tidak sah ditolak + emel tak sah ditolak', () => {
  assert.ok(call('users.save', { email: 'Sec@Contoh.com', name: 'Puan Sec', position: 'Setiausaha', role: 'Setiausaha' }, adminTok).data.created);
  assert.ok(call('users.save', { email: 'ahli@contoh.com', name: 'Encik Ahli', role: 'Ahli' }, adminTok).ok);
  assert.ok(call('users.save', { email: 'pengerusi@contoh.com', name: 'Dr Pengerusi', role: 'Pengerusi' }, adminTok).ok);
  assert.strictEqual(call('users.save', { email: 'a@b.com', name: 'X', role: 'Raja' }, adminTok).error.code, 400);
  assert.strictEqual(call('users.save', { email: 'bukanemel', name: 'X' }, adminTok).error.code, 400);
  assert.strictEqual(call('users.save', { email: 'a@b.com', name: '' }, adminTok).error.code, 400);
  assert.strictEqual(call('users.save', { email: 'a@b.com', name: 'x'.repeat(101) }, adminTok).error.code, 400);
});
let secTok, ahliTok, chairTok;
t('login semua role; role dalam respons betul', () => {
  secTok = login('sec@contoh.com').data.token; ahliTok = login('ahli@contoh.com').data.token; chairTok = login('pengerusi@contoh.com').data.token;
  assert.ok(secTok && ahliTok && chairTok);
});
t('Setiausaha / Ahli / Pengerusi tidak boleh users.save (403 di server)', () => {
  [secTok, ahliTok, chairTok].forEach(tok => {
    assert.strictEqual(call('users.save', { email: 'z@z.com', name: 'Z' }, tok).error.code, 403);
    assert.strictEqual(call('users.deactivate', { email: 'ahli@contoh.com' }, tok).error.code, 403);
    assert.strictEqual(call('users.import', { text: 'a@b.com,A' }, tok).error.code, 403);
  });
});
t('users.list: Admin penuh; Setiausaha subset + role; Pengerusi tanpa role; Ahli ditolak', () => {
  const a = call('users.list', {}, adminTok).data.users; assert.strictEqual(a.length, 4); assert.ok('status' in a[0] && 'created_by' in a[0]);
  const s = call('users.list', {}, secTok).data.users; assert.ok(!('status' in s[0]) && 'role' in s[0]);
  const c = call('users.list', {}, chairTok).data.users; assert.ok(!('role' in c[0]) && !('last_login' in c[0]));
  assert.strictEqual(call('users.list', {}, ahliTok).error.code, 403);
});
t('Admin tunggal tidak boleh dinyahaktif / diturunkan role', () => {
  assert.strictEqual(call('users.deactivate', { email: 'admin@contoh.com' }, adminTok).error.code, 409);
  assert.strictEqual(call('users.save', { email: 'admin@contoh.com', name: 'Admin', role: 'Ahli' }, adminTok).error.code, 409);
  assert.strictEqual(call('users.save', { email: 'admin@contoh.com', name: 'Admin', role: 'Admin', status: 'Tidak Aktif' }, adminTok).error.code, 409);
});
t('nyahaktif pengguna: sesi terus ditolak 401, login baharu ditolak, audit direkod', () => {
  assert.ok(call('users.deactivate', { email: 'ahli@contoh.com' }, adminTok).ok);
  assert.strictEqual(call('me.get', {}, ahliTok).error.code, 401);
  assert.strictEqual(login('ahli@contoh.com').error.code, 403);
  assert.ok(auditActions().includes('user.deactivate'));
});
t('aktifkan semula melalui users.save', () => {
  assert.ok(call('users.save', { email: 'ahli@contoh.com', name: 'Encik Ahli', role: 'Ahli', status: 'Aktif' }, adminTok).ok);
  assert.ok(login('ahli@contoh.com').ok);
});
t('role dibaca semasa: tukar role terus berkesan pada token sedia ada', () => {
  assert.ok(call('users.save', { email: 'pengerusi@contoh.com', name: 'Dr Pengerusi', role: 'Ahli' }, adminTok).ok);
  assert.strictEqual(call('users.list', {}, chairTok).error.code, 403);
});
t('Admin kedua membolehkan Admin pertama dinyahaktif', () => {
  call('users.save', { email: 'admin2@contoh.com', name: 'Admin Dua', role: 'Admin' }, adminTok);
  assert.ok(call('users.deactivate', { email: 'admin@contoh.com' }, adminTok).ok);
  assert.strictEqual(call('me.get', {}, adminTok).error.code, 401);
  adminTok = login('admin2@contoh.com').data.token;
  call('users.save', { email: 'admin@contoh.com', name: 'Admin', role: 'Admin', status: 'Aktif' }, adminTok);
});
t('users.import: tab/koma, tajuk, pendua, role salah, emel salah', () => {
  const text = 'email,nama,jawatan,role\nbaru1@contoh.com,Baru Satu,Pegawai,ahli\nbaru2@contoh.com\tBaru Dua\tKetua\tPengerusi\nbaru1@contoh.com,Pendua,,\nsec@contoh.com,Sudah Ada,,\nrosak,Rosak,,\nbaru3@contoh.com,Baru Tiga,,Raja\nbaru4@contoh.com,Baru Empat';
  const r = call('users.import', { text }, adminTok); assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data.added, 3); assert.strictEqual(r.data.skipped.length, 4);
  const u = state.sheets.users.data.find(x => x[0] === 'baru2@contoh.com'); assert.strictEqual(u[3], 'Pengerusi');
  assert.strictEqual(state.sheets.users.data.find(x => x[0] === 'baru4@contoh.com')[3], 'Ahli');
  assert.strictEqual(call('users.import', { text: '' }, adminTok).error.code, 400);
});
t('logout memadam sesi', () => {
  const tok = login('sec@contoh.com').data.token;
  assert.ok(call('auth.logout', {}, tok).ok); assert.strictEqual(call('me.get', {}, tok).error.code, 401);
});
t('had cubaan: 10 kegagalan satu emel -> 429 walaupun token sah', () => {
  for (let i = 0; i < 10; i++) login('penyerang@luar.com');
  assert.strictEqual(login('penyerang@luar.com').error.code, 429);
  assert.ok(login('sec@contoh.com').ok, 'pengguna lain tidak terjejas');
});
t('had global: 50 kegagalan menyekat semua; tiada audit tambahan bila disekat', () => {
  for (let i = 0; i < 60; i++) login('rawak' + i + '@luar.com');
  const n = state.sheets.audit_log.data.length;
  assert.strictEqual(login('sec@contoh.com').error.code, 429);
  assert.strictEqual(state.sheets.audit_log.data.length, n);
});

t('migrasi setupSystem: tab lama tanpa lajur baharu ditambah, data kekal', () => {
  state.sheets.users.data[0] = state.sheets.users.data[0].slice(0, 8); state.sheets.users.data.forEach((r, i) => { if (i) r.length = 8; });
  state.sheets.meetings.data[0] = state.sheets.meetings.data[0].slice(0, 18);
  const before = state.sheets.users.data[1].slice(0, 8).join('|');
  run('setupSystem()');
  assert.strictEqual(state.sheets.users.data[0][8], 'photo'); assert.strictEqual(state.sheets.meetings.data[0][18], 'tahun');
  assert.strictEqual(state.sheets.users.data[1].slice(0, 8).join('|'), before);
});
t('gambar profil: hanya JPEG data URL kecil; boleh dibuang; tidak masuk cache pengguna', () => {
  Object.keys(state.cache).filter(k => k.startsWith('lf_')).forEach(k => delete state.cache[k]); // reset had cubaan ujian sebelum ini
  const jpg = 'data:image/jpeg;base64,' + 'A'.repeat(400);
  assert.ok(call('users.save', { email: 'sec@contoh.com', name: 'Puan Sec', role: 'Setiausaha', photo: jpg }, adminTok).ok);
  assert.strictEqual(call('users.save', { email: 'sec@contoh.com', name: 'Puan Sec', role: 'Setiausaha', photo: 'data:image/png;base64,AAAA' }, adminTok).error.code, 400);
  assert.strictEqual(call('users.save', { email: 'sec@contoh.com', name: 'Puan Sec', role: 'Setiausaha', photo: '<script>' }, adminTok).error.code, 400);
  assert.strictEqual(call('users.save', { email: 'sec@contoh.com', name: 'Puan Sec', role: 'Setiausaha', photo: 'data:image/jpeg;base64,' + 'A'.repeat(31000) }, adminTok).error.code, 400);
  assert.strictEqual(call('users.list', {}, adminTok).data.users.find(u => u.email === 'sec@contoh.com').photo, jpg);
  assert.strictEqual(call('me.get', {}, login('sec@contoh.com').data.token).data.user.photo, jpg);
  assert.ok(!('photo' in JSON.parse(state.cache['users_v1'].v)[0]), 'cache pengguna tanpa gambar');
  assert.ok(call('users.save', { email: 'sec@contoh.com', name: 'Puan Sec Baharu', role: 'Setiausaha' }, adminTok).ok);
  assert.strictEqual(call('users.list', {}, adminTok).data.users.find(u => u.email === 'sec@contoh.com').photo, jpg, 'tanpa kunci photo = kekal');
  assert.ok(call('users.save', { email: 'sec@contoh.com', name: 'Puan Sec Baharu', role: 'Setiausaha', photo: '' }, adminTok).ok);
  assert.strictEqual(call('users.list', {}, adminTok).data.users.find(u => u.email === 'sec@contoh.com').photo, '');
});

console.log(`\n${passed} ujian lulus` + (process.exitCode ? ', ADA YANG GAGAL' : ''));
