const assert = require('assert');
const { create } = require('./gas-harness');

let passed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('  GAGAL ' + name + '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

const h = create();
const { call, fetchMock, state, run } = h;
const CID = 'client-123.apps.googleusercontent.com';
const FAKE = 'eyJ' + 'a'.repeat(40);
const login = (email) => { fetchMock.respond = () => ({ code: 200, body: { aud: CID, iss: 'accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 3600), email, email_verified: 'true' } }); const r = call('auth.login', { idToken: FAKE }); assert.ok(r.ok, JSON.stringify(r)); return r.data.token; };

run("ADMIN_EMAIL = 'admin@x.com'"); run('setupSystem()');
const A = login('admin@x.com');
const mk = (email, name, role) => assert.ok(call('users.save', { email, name, role, position: 'Pegawai ' + name }, A).ok);
mk('sec@x.com', 'Sec', 'Setiausaha'); mk('chair@x.com', 'Chair', 'Pengerusi'); mk('chair2@x.com', 'Chair Dua', 'Pengerusi');
['a1', 'a2', 'a3', 'outsider'].forEach(n => mk(n + '@x.com', n.toUpperCase(), 'Ahli'));
const S = login('sec@x.com'), C = login('chair@x.com'), C2 = login('chair2@x.com');
const A1 = login('a1@x.com'), A2 = login('a2@x.com'), OUT = login('outsider@x.com');
const root = () => state.folders.find(f => f.name === 'e-Mesyuarat IKN');
const folderOf = (id) => state.folders.find(f => f.id === id);

const SERIES = JSON.parse(run('getSettings_().meeting_series'));
const base = { title: 'Mesyuarat Pengurusan Bil 1/2026', series: SERIES[0], date: '2026-12-01', start_time: '09:00', end_time: '11:00', venue: 'Bilik Mesyuarat', online_link: 'https://meet.google.com/abc', pengerusi_email: 'chair@x.com', members: ['a1@x.com', 'a2@x.com'] };
let M1, F1;

t('akaun Admin/Setiausaha dikongsi folder akar; Ahli/Pengerusi tidak', () => {
  assert.ok(root().viewers.has('sec@x.com'));
  assert.ok(!root().viewers.has('a1@x.com') && !root().viewers.has('chair@x.com'));
});
t('Ahli / Pengerusi tidak boleh cipta mesyuarat (403)', () => {
  [A1, C].forEach(tok => assert.strictEqual(call('meetings.create', base, tok).error.code, 403));
});
t('Setiausaha cipta Draf: folder Drive dicipta, pengerusi + setiausaha auto-ahli', () => {
  const r = call('meetings.create', base, S); assert.ok(r.ok, JSON.stringify(r)); M1 = r.data.id;
  assert.ok(/^MTG-[a-z0-9]{10}$/.test(M1));
  const g = call('meetings.get', { id: M1 }, S).data;
  F1 = g.drive_folder_id; assert.ok(F1);
  assert.strictEqual(g.status, 'Draf');
  assert.deepStrictEqual(g.members.map(m => m.email).sort(), ['a1@x.com', 'a2@x.com', 'chair@x.com', 'sec@x.com']);
  assert.strictEqual(g.members[0].is_chair, true);
  assert.strictEqual(folderOf(F1).name, `2026-12-01 Mesyuarat Pengurusan Bil 1/2026`.replace('/', ' ') + ` [${M1}]`);
  assert.strictEqual(folderOf(F1).parent.name, 'Mesyuarat');
  assert.strictEqual(folderOf(F1).viewers.size, 0, 'Draf tidak dikongsi');
});
t('validasi input ditolak 400', () => {
  const bad = (o) => assert.strictEqual(call('meetings.create', Object.assign({}, base, o), S).error.code, 400, JSON.stringify(o));
  bad({ title: '' }); bad({ date: '2026-13-40' }); bad({ date: '01/12/2026' }); bad({ start_time: '25:00' }); bad({ end_time: '08:00' });
  bad({ online_link: 'http://tak-selamat.com' }); bad({ bil: 'abc' }); bad({ bil: '0' }); bad({ bil: '1234' }); bad({ tahun: '26' }); bad({ pengerusi_email: 'tiada@x.com' });
  bad({ members: ['tiada@x.com'] }); bad({ members: 'a1@x.com' }); bad({ title: 'x'.repeat(201) });
});
t('Draf tersembunyi: Ahli ahli senarai tidak nampak, get ditolak 403; Pengerusi juga', () => {
  assert.strictEqual(call('meetings.list', {}, A1).data.meetings.length, 0);
  assert.strictEqual(call('meetings.get', { id: M1 }, A1).error.code, 403);
  assert.strictEqual(call('meetings.get', { id: M1 }, C).error.code, 403);
  assert.strictEqual(call('meetings.list', {}, C).data.meetings.length, 0);
});
t('Admin dan Setiausaha nampak Draf', () => {
  assert.strictEqual(call('meetings.list', {}, A).data.meetings.length, 1);
  assert.strictEqual(call('meetings.list', {}, S).data.meetings[0].member_count, 4);
});
t('terbit ditolak tanpa pengerusi / tanpa ahli lain', () => {
  const r1 = call('meetings.create', Object.assign({}, base, { pengerusi_email: '', members: ['a1@x.com'] }), A).data.id;
  assert.strictEqual(call('meetings.publish', { id: r1 }, A).error.code, 400);
  const r2 = call('meetings.create', Object.assign({}, base, { members: [] }), A).data.id; // Admin: tiada auto-setiausaha
  const e = call('meetings.publish', { id: r2 }, A); assert.strictEqual(e.error.code, 400); assert.ok(/ahli/.test(e.error.message));
});
t('hanya Admin/Setiausaha boleh terbit', () => {
  assert.strictEqual(call('meetings.publish', { id: M1 }, C).error.code, 403);
  assert.strictEqual(call('meetings.publish', { id: M1 }, A1).error.code, 403);
});
t('terbit: status Dijadualkan, ahli dikongsi Viewer tanpa emel notifikasi, audit', () => {
  const r = call('meetings.publish', { id: M1 }, S); assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data.status, 'Dijadualkan'); assert.deepStrictEqual(Array.from(r.data.driveFailures), []);
  assert.deepStrictEqual([...folderOf(F1).viewers].sort(), ['a1@x.com', 'a2@x.com', 'chair@x.com', 'sec@x.com']);
  assert.ok(state.advancedCalls.length >= 4 && state.advancedCalls.every(c => c.opts.sendNotificationEmail === false));
  assert.ok(state.sheets.audit_log.data.some(r => r[3] === 'meeting.publish'));
  assert.strictEqual(call('meetings.publish', { id: M1 }, S).error.code, 409);
});
t('selepas terbit: ahli dijemput nampak; bukan ahli tidak nampak dan get 403', () => {
  assert.strictEqual(call('meetings.list', {}, A1).data.meetings[0].id, M1);
  assert.strictEqual(call('meetings.list', {}, C).data.meetings.length, 1);
  assert.strictEqual(call('meetings.list', {}, OUT).data.meetings.length, 0);
  assert.strictEqual(call('meetings.get', { id: M1 }, OUT).error.code, 403);
  assert.strictEqual(call('meetings.get', { id: 'MTG-xxxxxxxxxx' }, OUT).ok, false);
  const g = call('meetings.get', { id: M1 }, A1).data; assert.ok(!('drive_folder_id' in g), 'folder ID tidak didedah kepada Ahli');
});
t('kehadiran: ahli set sendiri sahaja; bukan ahli 403; nilai tak sah 400', () => {
  const r = call('attendance.set', { meeting_id: M1, attendance: 'Hadir' }, A1); assert.strictEqual(r.data.attendance, 'Hadir');
  assert.strictEqual(call('meetings.get', { id: M1 }, A2).data.members.find(m => m.email === 'a1@x.com').attendance, 'Hadir');
  assert.strictEqual(call('meetings.get', { id: M1 }, A2).data.members.find(m => m.email === 'a2@x.com').attendance, 'Belum Jawab');
  assert.strictEqual(call('attendance.set', { meeting_id: M1, attendance: 'Mungkin' }, OUT).error.code, 403);
  assert.strictEqual(call('attendance.set', { meeting_id: M1, attendance: 'Hadir' }, A).error.code, 403, 'Admin bukan ahli');
  assert.strictEqual(call('attendance.set', { meeting_id: M1, attendance: 'Ya' }, A1).error.code, 400);
  assert.strictEqual(call('meetings.get', { id: M1 }, A1).data.my_attendance, 'Hadir');
});
t('members.set: tambah ahli dikongsi, buang ahli ditarik balik akses Drive dan mesyuarat', () => {
  assert.strictEqual(call('members.set', { meeting_id: M1, emails: ['a1@x.com', 'a3@x.com'] }, A1).error.code, 403);
  const r = call('members.set', { meeting_id: M1, emails: ['a1@x.com', 'a3@x.com'] }, S); assert.ok(r.ok, JSON.stringify(r));
  assert.deepStrictEqual([r.data.added, r.data.removed], [1, 2]); // a3 masuk; a2 dan sec keluar
  const v = folderOf(F1).viewers; assert.ok(v.has('a3@x.com') && !v.has('a2@x.com') && v.has('chair@x.com'));
  assert.strictEqual(call('meetings.get', { id: M1 }, A2).error.code, 403);
  assert.strictEqual(call('meetings.list', {}, A2).data.meetings.length, 0);
  assert.ok(call('meetings.get', { id: M1 }, login('a3@x.com')).ok);
  call('members.set', { meeting_id: M1, emails: ['a1@x.com', 'a2@x.com', 'sec@x.com'] }, S); // pulihkan; pengerusi sentiasa kekal
  assert.ok(call('meetings.get', { id: M1 }, S).data.members.some(m => m.email === 'chair@x.com'));
});
t('kehadiran yang sedia ada kekal bila ahli lain diubah', () => {
  assert.strictEqual(call('meetings.get', { id: M1 }, A1).data.my_attendance, 'Hadir');
});
t('mula/tamat: Pengerusi mesyuarat itu boleh; pengerusi lain, Ahli tidak; peralihan tidak sah 409', () => {
  assert.strictEqual(call('meetings.setStatus', { id: M1, status: 'Sedang Berlangsung' }, A1).error.code, 403);
  assert.strictEqual(call('meetings.setStatus', { id: M1, status: 'Sedang Berlangsung' }, C2).error.code, 403);
  assert.strictEqual(call('meetings.setStatus', { id: M1, status: 'Selesai' }, C).error.code, 409);
  assert.strictEqual(call('meetings.setStatus', { id: M1, status: 'Draf' }, C).error.code, 400);
  assert.ok(call('meetings.setStatus', { id: M1, status: 'Sedang Berlangsung' }, C).ok);
  assert.strictEqual(call('meetings.cancel', { id: M1 }, S).error.code, 409, 'tak boleh batal semasa berlangsung');
  assert.ok(call('meetings.setStatus', { id: M1, status: 'Selesai' }, S).ok);
  assert.strictEqual(call('attendance.set', { meeting_id: M1, attendance: 'Tidak Hadir' }, A1).error.code, 409);
});
t('mesyuarat Selesai: Setiausaha tidak boleh edit, Admin boleh; folder dinamakan semula bila tarikh berubah', () => {
  assert.strictEqual(call('meetings.update', Object.assign({ id: M1 }, base), S).error.code, 403);
  const r = call('meetings.update', Object.assign({ id: M1 }, base, { date: '2026-12-02', title: 'Bil 1 Pindaan', members: undefined }), A); assert.ok(r.ok, JSON.stringify(r));
  assert.ok(folderOf(F1).name.startsWith('2026-12-02 Bil 1 Pindaan'));
  assert.ok(state.sheets.audit_log.data.some(r => r[3] === 'meeting.update'));
});

// ----- Sambung daripada mesyuarat lepas (2.3) -----
let M2;
t('sambung mesyuarat lepas: item agenda Pengesahan Minit + Perkara Berbangkit dicipta', () => {
  const r = call('meetings.create', Object.assign({}, base, { title: 'Bil 2/2026', date: '2027-01-05', prev_meeting_id: M1 }), S); assert.ok(r.ok, JSON.stringify(r)); M2 = r.data.id;
  const g = call('meetings.get', { id: M2 }, S).data;
  assert.deepStrictEqual(g.agenda.map(a => [a.seq, a.title, a.category]), [[1, 'Pengesahan Minit Mesyuarat Lepas', 'Pengesahan'], [2, 'Perkara Berbangkit', 'Makluman']]);
  assert.strictEqual(g.prev_meeting.id, M1);
  call('meetings.update', Object.assign({ id: M2 }, base, { title: 'Bil 2/2026', date: '2027-01-05', prev_meeting_id: M1 }), S);
  assert.strictEqual(call('meetings.get', { id: M2 }, S).data.agenda.length, 2, 'idempotent');
});
t('prev_meeting_id tidak wujud / diri sendiri ditolak', () => {
  assert.strictEqual(call('meetings.create', Object.assign({}, base, { prev_meeting_id: 'MTG-tiadatiada' }), S).error.code, 404);
  assert.strictEqual(call('meetings.update', Object.assign({ id: M2 }, base, { prev_meeting_id: M2 }), S).error.code, 400);
});
t('tambah prev pada mesyuarat sedia ada dengan agenda: item baharu di awal, seq dinomborkan semula', () => {
  const M3 = call('meetings.create', Object.assign({}, base, { title: 'Bil 3' }), S).data.id;
  state.sheets.agenda_items.data.push(['AGD-existing0', M3, '1', 'Item sedia ada', '', 'Perbincangan', '', '', 'Belum', 'x', '']);
  assert.ok(call('meetings.update', Object.assign({ id: M3 }, base, { title: 'Bil 3', prev_meeting_id: M1 }), S).ok);
  assert.deepStrictEqual(call('meetings.get', { id: M3 }, S).data.agenda.map(a => [a.seq, a.title]), [[1, 'Pengesahan Minit Mesyuarat Lepas'], [2, 'Perkara Berbangkit'], [3, 'Item sedia ada']]);
});

// ----- Batal & akses pengguna -----
t('batal mesyuarat Dijadualkan: akses Drive ditarik balik, kekal kelihatan sebagai Dibatalkan', () => {
  const id = call('meetings.create', Object.assign({}, base, { title: 'Untuk Batal' }), S).data.id;
  const f = call('meetings.get', { id }, S).data.drive_folder_id;
  call('meetings.publish', { id }, S); assert.ok(folderOf(f).viewers.has('a1@x.com'));
  assert.strictEqual(call('meetings.cancel', { id }, A1).error.code, 403);
  assert.ok(call('meetings.cancel', { id }, S).ok);
  assert.strictEqual(folderOf(f).viewers.size, 0);
  assert.strictEqual(call('meetings.get', { id }, A1).data.status, 'Dibatalkan');
  assert.strictEqual(call('meetings.update', Object.assign({ id }, base), S).error.code, 409);
  assert.strictEqual(call('meetings.publish', { id }, S).error.code, 409);
});
t('nyahaktif pengguna: akses folder mesyuarat ditarik; aktif semula: dipulihkan', () => {
  const g = call('meetings.get', { id: M1 }, S).data; const f = folderOf(g.drive_folder_id);
  assert.ok(f.viewers.has('a2@x.com'));
  call('users.deactivate', { email: 'a2@x.com' }, A); assert.ok(!f.viewers.has('a2@x.com'));
  call('users.save', { email: 'a2@x.com', name: 'A2', role: 'Ahli', status: 'Aktif' }, A); assert.ok(f.viewers.has('a2@x.com'));
});
t('Setiausaha diturunkan role: akses folder akar ditarik; dinaikkan: dikongsi', () => {
  call('users.save', { email: 'a3@x.com', name: 'A3', role: 'Setiausaha' }, A); assert.ok(root().viewers.has('a3@x.com'));
  call('users.save', { email: 'a3@x.com', name: 'A3', role: 'Ahli' }, A); assert.ok(!root().viewers.has('a3@x.com'));
});
t('import pengguna Setiausaha dikongsi folder akar', () => {
  call('users.import', { text: 'imp@x.com,Imp,,Setiausaha\nimp2@x.com,Imp2,,Ahli' }, A);
  assert.ok(root().viewers.has('imp@x.com') && !root().viewers.has('imp2@x.com'));
});
t('Drive Advanced Service tiada: jatuh balik ke DriveApp.addViewer', () => {
  h.ctx.Drive = undefined;
  const id = call('meetings.create', Object.assign({}, base, { title: 'Fallback' }), S).data.id;
  const f = folderOf(call('meetings.get', { id }, S).data.drive_folder_id);
  call('meetings.publish', { id }, S); assert.ok(f.viewers.has('a1@x.com'));
});
t('emel Drive gagal dikongsi dilaporkan, penerbitan tidak terhenti', () => {
  const id = call('meetings.create', Object.assign({}, base, { title: 'Gagal Kongsi' }), S).data.id;
  const f = folderOf(call('meetings.get', { id }, S).data.drive_folder_id);
  f.addViewer = (e) => { if (e === 'a2@x.com') throw new Error('bukan akaun Google'); f.viewers.add(e); };
  const r = call('meetings.publish', { id }, S); assert.ok(r.ok); assert.deepStrictEqual(Array.from(r.data.driveFailures), ['a2@x.com']);
});
t('Ahli tidak boleh urus mesyuarat melalui action lain (403)', () => {
  ['meetings.update', 'meetings.cancel', 'meetings.publish'].forEach(a => assert.strictEqual(call(a, Object.assign({ id: M2 }, base), A1).error.code, 403, a));
  assert.strictEqual(call('members.set', { meeting_id: M2, emails: [] }, C).error.code, 403);
});

t('pindaan client: pengerusi boleh sesiapa pengguna Aktif; tiada jenis mesyuarat; tahun lalai dari tarikh', () => {
  const r = call('meetings.create', Object.assign({}, base, { title: 'Pengerusi Ahli', pengerusi_email: 'a1@x.com', members: ['a2@x.com'], tahun: undefined }), S); assert.ok(r.ok, JSON.stringify(r));
  const g = call('meetings.get', { id: r.data.id }, S).data;
  assert.strictEqual(g.pengerusi_email, 'a1@x.com'); assert.strictEqual(g.tahun, '2026'); assert.strictEqual(g.meeting_type, '');
  assert.ok(g.members.find(x => x.email === 'a1@x.com').is_chair);
  call('meetings.publish', { id: r.data.id }, S);
  const tok = login('a1@x.com');
  assert.ok(call('meetings.setStatus', { id: r.data.id, status: 'Sedang Berlangsung' }, tok).ok, 'Ahli yang dilantik pengerusi boleh mula mesyuarat itu');
  assert.strictEqual(call('meetings.setStatus', { id: M2, status: 'Sedang Berlangsung' }, tok).error.code, 403, 'tetapi bukan mesyuarat lain');
  assert.strictEqual(call('meetings.create', Object.assign({}, base, { tahun: '2027' }), S).ok, true);
});
t('tahun boleh dilaraskan dan disimpan', () => {
  const id = call('meetings.create', Object.assign({}, base, { title: 'Tahun Lain', tahun: '2025' }), S).data.id;
  assert.strictEqual(call('meetings.get', { id }, S).data.tahun, '2025');
});

const mkM = (title, extra) => { const r = call('meetings.create', Object.assign({}, base, { title, bil: '1' }, extra), S); assert.ok(r.ok, JSON.stringify(r)); return r.data.id; };
const folder_ = (id) => state.folders.find(f => f.id === id);
const getM = (id, tok) => call('meetings.get', { id }, tok || S).data;
t('Bilangan disimpan; siri = tajuk; Bil.N/Tahun dipulangkan', () => {
  const id = call('meetings.create', Object.assign({}, base, { title: SERIES[1], bil: '3', tahun: '2026' }), S).data.id;
  const g = getM(id); assert.strictEqual(g.bil, '3'); assert.strictEqual(g.series, SERIES[1]); assert.strictEqual(g.title, SERIES[1]);
  assert.ok(call('meetings.update', Object.assign({}, base, { id, title: SERIES[1], bil: '4' }), S).ok); assert.strictEqual(getM(id).bil, '4');
  assert.strictEqual(call('meetings.list', {}, S).data.meetings.find(x => x.id === id).bil, '4');
});
t('ahli dijemput TAPI mesyuarat masih Draf: tak nampak; staf nampak amaran punca; selepas terbit: nampak', () => {
  const id = mkM('Ujian Draf Ahli'); // Draf
  assert.strictEqual(call('meetings.list', {}, A1).data.meetings.some(x => x.id === id), false);
  assert.strictEqual(call('meetings.get', { id }, S).data.status, 'Draf');
  call('meetings.publish', { id }, S);
  assert.strictEqual(call('meetings.list', {}, A1).data.meetings.some(x => x.id === id), true);
});
t('baris ahli disunting manual dalam Sheet (HURUF BESAR + ruang kosong) masih beri akses', () => {
  const id = mkM('Emel Manual'); call('meetings.publish', { id }, S);
  const sh = state.sheets.meeting_members; const col = sh.data[0].indexOf('email');
  const row = sh.data.findIndex((r, i) => i > 0 && r[sh.data[0].indexOf('meeting_id')] === id && r[col] === 'a1@x.com');
  sh.data[row][col] = '  A1@X.COM ';
  assert.strictEqual(call('meetings.list', {}, A1).data.meetings.some(x => x.id === id), true, 'senarai');
  const g = call('meetings.get', { id }, A1); assert.ok(g.ok, JSON.stringify(g)); assert.strictEqual(g.data.my_attendance, 'Belum Jawab');
  assert.ok(call('attendance.set', { meeting_id: id, attendance: 'Hadir' }, A1).ok);
  assert.strictEqual(call('meetings.get', { id }, A1).data.my_attendance, 'Hadir');
  const m = call('meetings.get', { id }, S).data.members.find(x => x.name === 'A1'); assert.ok(m, 'nama dipadankan walaupun emel beza huruf'); assert.strictEqual(m.access, 'ok');
  assert.ok(!('access' in call('meetings.get', { id }, A1).data.members[0]), 'medan diagnostik hanya untuk staf');
});
t('staf nampak ahli yang emelnya tiada dalam senarai pengguna / tidak aktif', () => {
  const id = mkM('Diagnostik'); call('meetings.publish', { id }, S);
  const sh = state.sheets.meeting_members; sh.data.push(['MEM-gantung01', id, 'orang.luar@x.com', 'Belum Jawab', '', 'x', '']);
  call('users.deactivate', { email: 'a2@x.com' }, A);
  const mem = call('meetings.get', { id }, S).data.members;
  assert.strictEqual(mem.find(x => x.email === 'orang.luar@x.com').access, 'tidak_berdaftar'); assert.strictEqual(mem.find(x => x.email === 'a2@x.com').access, 'tidak_aktif');
  call('users.save', { email: 'a2@x.com', name: 'A2', role: 'Ahli', status: 'Aktif' }, A);
});

t('REGRESI 12/11: Session.getEffectiveUser gagal (skop manifest) -> terbit TETAP berjaya dan Drive dikongsi', () => {
  state.sessionBroken = true; run('ownerEmailCache_ = null');
  const id = mkM('Terbit Tanpa Session'); const r = call('meetings.publish', { id }, S);
  assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(getM(id).status, 'Dijadualkan'); assert.deepStrictEqual(Array.from(r.data.driveFailures), []);
  assert.ok(folder_(getM(id).drive_folder_id).viewers.has('a1@x.com'), 'Drive dikongsi melalui pemilik folder akar sebagai sandaran');
  assert.strictEqual(run('ownerEmail_()'), 'owner@gmail.com', 'sandaran: pemilik folder akar, huruf kecil');
  state.sessionBroken = false; run('ownerEmailCache_ = null');
});
t('REGRESI 12/11: ralat Drive semasa kongsi tidak menggagalkan terbit; dilaporkan dalam driveFailures', () => {
  const id = mkM('Drive Rosak'); const f = folder_(getM(id).drive_folder_id);
  f.addViewer = () => { throw new Error('Drive down'); };
  h.ctx.Drive = undefined;
  const r = call('meetings.publish', { id }, S); assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(getM(id).status, 'Dijadualkan');
  assert.ok(r.data.driveFailures.length >= 2);
});
t('ralat dalaman: Admin nampak sebab ringkas (tanpa stack); Setiausaha / Ahli tidak', () => {
  run("var __orig = getRoutes_; getRoutes_ = function(){ return { boom: { fn: function(){ throw new Error('Skop tiada: userinfo.email'); } } }; }");
  const a = call('boom', {}, A), s2 = call('boom', {}, S), m1 = call('boom', {}, A1);
  run('getRoutes_ = __orig');
  assert.strictEqual(a.error.code, 500); assert.strictEqual(a.error.detail, 'Skop tiada: userinfo.email'); assert.ok(!/at |\.gs:/.test(a.error.detail));
  assert.ok(!('detail' in s2.error) && !('detail' in m1.error)); assert.strictEqual(s2.error.message, 'Ralat dalaman. Sila cuba lagi.');
});

console.log(`\n${passed} ujian lulus` + (process.exitCode ? ', ADA YANG GAGAL' : ''));
