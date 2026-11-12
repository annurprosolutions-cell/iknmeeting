const assert = require('assert');
const { create } = require('./gas-harness');
let passed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('  GAGAL ' + name + '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

const h = create(); const { call, fetchMock, state, run } = h;
const CID = 'client-123.apps.googleusercontent.com', FAKE = 'eyJ' + 'a'.repeat(40);
const login = (email) => { fetchMock.respond = () => ({ code: 200, body: { aud: CID, iss: 'accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 3600), email, email_verified: 'true' } }); const r = call('auth.login', { idToken: FAKE }); assert.ok(r.ok, JSON.stringify(r)); return r.data.token; };
run("ADMIN_EMAIL = 'admin@x.com'"); run('setupSystem()');
const A = login('admin@x.com');
['sec:Setiausaha', 'chair:Pengerusi', 'chair2:Pengerusi', 'a1:Ahli', 'a2:Ahli', 'out:Ahli'].forEach(x => { const [n, r] = x.split(':'); assert.ok(call('users.save', { email: n + '@x.com', name: n.toUpperCase(), role: r }, A).ok); });
const S = login('sec@x.com'), C = login('chair@x.com'), A1 = login('a1@x.com'), A2 = login('a2@x.com'), OUT = login('out@x.com');
const SERIES = JSON.parse(run('getSettings_().meeting_series'))[0];
const folder = (id) => state.folders.find(f => f.id === id);
const b64 = (s) => Buffer.from(s, 'latin1').toString('base64');
const PDF = b64('%PDF-1.4\n%test'), PPTX = b64('PK\x03\x04rest'), DOC = b64('\xd0\xcf\x11\xe0xxxx'), EXE = b64('MZ\x90\x00');
let CUR = null;
const up = (tok, o) => call('materials.upload', Object.assign({ meeting_id: CUR, file_name: 'kertas.pdf', data_base64: PDF, type: 'Kertas Makluman' }, o), tok);

const mk = (title, extra) => { const r = call('meetings.create', Object.assign({ title, bil: '1', date: '2026-12-01', start_time: '09:00', pengerusi_email: 'chair@x.com', members: ['a1@x.com', 'a2@x.com'] }, extra), S); assert.ok(r.ok, JSON.stringify(r)); return r.data.id; };
const get = (id, tok) => call('meetings.get', { id }, tok || S).data;
const M = mk('Mesyuarat Bahan'); CUR = M; const MF = get(M).drive_folder_id;
let ag = [];
t('agenda: Setiausaha tambah item; pembentang mesti ahli; validasi', () => {
  const add = (o, tok) => call('agenda.save', Object.assign({ meeting_id: M, title: 'Item', category: 'Perbincangan' }, o), tok || S);
  assert.ok(add({ title: 'Kertas Makluman HMI', category: 'Makluman', presenter_email: 'a1@x.com', duration_min: 15 }).ok);
  assert.ok(add({ title: 'Hal-hal Lain' }).ok); assert.ok(add({ title: 'Penutup', category: 'Makluman' }).ok);
  ag = get(M).agenda; assert.deepStrictEqual(ag.map(a => a.seq), [1, 2, 3]); assert.strictEqual(ag[0].presenter_name, 'A1'); assert.strictEqual(ag[0].duration_min, 15);
  assert.strictEqual(add({ presenter_email: 'out@x.com' }).error.code, 400, 'pembentang bukan ahli');
  assert.strictEqual(add({ title: '' }).error.code, 400); assert.strictEqual(add({ category: 'Lain' }).error.code, 400);
  assert.strictEqual(add({ duration_min: 0 }).error.code, 400); assert.strictEqual(add({ duration_min: 481 }).error.code, 400); assert.strictEqual(add({ duration_min: 1.5 }).error.code, 400);
  assert.strictEqual(add({ title: 'x'.repeat(201) }).error.code, 400);
  [A1, C].forEach(tok => assert.strictEqual(add({}, tok).error.code, 403));
});
t('agenda: kemas kini, susun semula (naik/turun), id tak sepadan ditolak', () => {
  assert.ok(call('agenda.save', { meeting_id: M, id: ag[1].id, title: 'Hal-hal Lain (pindaan)', category: 'Perbincangan' }, S).ok);
  assert.ok(call('agenda.reorder', { meeting_id: M, ids: [ag[2].id, ag[0].id, ag[1].id] }, S).ok);
  assert.deepStrictEqual(get(M).agenda.map(a => a.title), ['Penutup', 'Kertas Makluman HMI', 'Hal-hal Lain (pindaan)']);
  assert.strictEqual(call('agenda.reorder', { meeting_id: M, ids: [ag[0].id, ag[1].id] }, S).error.code, 400);
  assert.strictEqual(call('agenda.reorder', { meeting_id: M, ids: [ag[0].id, ag[0].id, ag[1].id] }, S).error.code, 400);
  assert.strictEqual(call('agenda.reorder', { meeting_id: M, ids: ['x', 'y', 'z'] }, S).error.code, 400);
  assert.strictEqual(call('agenda.reorder', { meeting_id: M, ids: [ag[0].id, ag[1].id, ag[2].id] }, A1).error.code, 403);
  ag = get(M).agenda; // [Penutup, Kertas Makluman, Hal-hal]
});
t('agenda.setStatus: Pengerusi mesyuarat itu / staf sahaja (Draf: ahli tiada akses)', () => {
  call('meetings.publish', { id: M }, S);
  assert.ok(call('agenda.setStatus', { meeting_id: M, id: ag[0].id, status: 'Selesai' }, C).ok);
  assert.strictEqual(call('agenda.setStatus', { meeting_id: M, id: ag[0].id, status: 'Selesai' }, A1).error.code, 403);
  assert.strictEqual(call('agenda.setStatus', { meeting_id: M, id: ag[0].id, status: 'Ganjil' }, C).error.code, 400);
  assert.strictEqual(get(M, A1).agenda.find(a => a.id === ag[0].id).status, 'Selesai');
});

t('muat naik: PDF/PPTX/DOC lulus, fail dinamakan ikut konvensyen, simpan dalam folder mesyuarat', () => {
  const kmId = ag.find(a => a.title === 'Kertas Makluman HMI').id;
  const r = up(S, { agenda_id: kmId, title: 'Kertas Makluman HMI 2026' }); assert.ok(r.ok, JSON.stringify(r));
  const f = state.files[state.files.length - 1];
  assert.strictEqual(f.name, '02_Kertas Makluman_Kertas Makluman HMI 2026_v1.pdf'); assert.strictEqual(f.parent.id, MF);
  assert.ok(up(S, { file_name: 'slaid.pptx', data_base64: PPTX, type: 'Slaid' }).ok); assert.ok(up(S, { file_name: 'bicara.doc', data_base64: DOC, type: 'Lain-lain' }).ok);
  const mats = get(M).materials; assert.strictEqual(mats.length, 3);
  assert.strictEqual(mats[0].mime_type, 'application/pdf'); assert.strictEqual(mats[0].size_bytes, 14); assert.strictEqual(mats[0].file_name, 'kertas.pdf');
  assert.ok(state.sheets.audit_log.data.some(r => r[3] === 'material.upload'));
});
t('muat naik ditolak: .exe, .exe dinamakan .pdf, base64 rosak, kosong, jenis tak sah, besar', () => {
  assert.strictEqual(up(S, { file_name: 'x.exe', data_base64: EXE }).error.code, 400);
  const disg = up(S, { file_name: 'x.pdf', data_base64: EXE }); assert.strictEqual(disg.error.code, 400); assert.ok(/tidak sepadan/.test(disg.error.message));
  assert.strictEqual(up(S, { data_base64: '***' }).error.code, 400); assert.strictEqual(up(S, { data_base64: '' }).error.code, 400);
  assert.strictEqual(up(S, { type: 'Rahsia' }).error.code, 400); assert.strictEqual(up(S, { file_name: 'noext', data_base64: PDF }).error.code, 400);
  run("setSettingValue_('max_upload_mb', '0.00002')"); run('invalidateSettings_()');
  const big = up(S, { data_base64: b64('%PDF' + 'x'.repeat(100)) }); assert.strictEqual(big.error.code, 400); assert.ok(/Imbas folder Drive/.test(big.error.message));
  run("setSettingValue_('max_upload_mb', '20')"); run('invalidateSettings_()');
  assert.strictEqual(get(M).materials.length, 3);
});
t('hak: Ahli biasa 403; pembentang hanya pada item sendiri; bukan jenis terhad; bukan ahli 403', () => {
  const mine = ag.find(a => a.presenter_email === 'a1@x.com').id, other = ag.find(a => !a.presenter_email).id;
  assert.strictEqual(up(A2, { agenda_id: mine }).error.code, 403);
  assert.strictEqual(up(A1, { agenda_id: other }).error.code, 403); assert.strictEqual(up(A1, {}).error.code, 403, 'tanpa item');
  assert.strictEqual(up(A1, { agenda_id: mine, type: 'Bahan Bicara' }).error.code, 403);
  assert.strictEqual(up(OUT, { agenda_id: mine }).error.code, 403);
  const ok = up(A1, { agenda_id: mine, title: 'Slaid Pembentang' }); assert.ok(ok.ok, JSON.stringify(ok));
  const mats = get(M, A1).materials; assert.ok(mats.some(x => x.id === ok.data.id));
});
let verId;
t('ganti versi: v2 Aktif, v1 Digantikan; Ahli nampak v2 sahaja, staf nampak kedua-dua; pembentang urus bahan sendiri sahaja', () => {
  const mine = get(M, A1).materials.find(x => x.title === 'Slaid Pembentang');
  assert.strictEqual(call('materials.replace', { id: mine.id, file_name: 'slaid2.pdf', data_base64: PDF }, A2).error.code, 403);
  const r = call('materials.replace', { id: mine.id, file_name: 'slaid2.pdf', data_base64: PDF }, A1); assert.ok(r.ok, JSON.stringify(r)); verId = r.data.id;
  assert.strictEqual(r.data.version, 2); assert.ok(/_v2\.pdf$/.test(state.files[state.files.length - 1].name));
  assert.deepStrictEqual(get(M, A2).materials.filter(x => x.title === 'Slaid Pembentang').map(x => x.version), [2]);
  assert.deepStrictEqual(get(M, S).materials.filter(x => x.title === 'Slaid Pembentang').map(x => [x.version, x.status]), [[1, 'Digantikan'], [2, 'Aktif']]);
  assert.strictEqual(call('materials.replace', { id: mine.id, file_name: 'x.pdf', data_base64: PDF }, S).error.code, 409, 'v1 bukan Aktif');
  const staffMat = get(M).materials.find(x => x.title === 'Kertas Makluman HMI 2026');
  assert.strictEqual(call('materials.replace', { id: staffMat.id, file_name: 'x.pdf', data_base64: PDF }, A1).error.code, 403, 'bahan staf bukan milik pembentang');
});
t('arkib: hilang daripada paparan Ahli; pembentang boleh arkib bahan sendiri', () => {
  assert.ok(call('materials.archive', { id: verId }, A1).ok);
  assert.ok(!get(M, A2).materials.some(x => x.id === verId));
  assert.strictEqual(get(M, S).materials.find(x => x.id === verId).status, 'Diarkib');
  assert.strictEqual(call('materials.archive', { id: get(M).materials[0].id }, A2).error.code, 403);
});
t('kemas kini maklumat bahan: staf sahaja; ahli 403', () => {
  const x = get(M).materials.find(y => y.file_name === 'bicara.doc');
  assert.strictEqual(call('materials.update', { id: x.id, title: 'Nota' }, A1).error.code, 403);
  assert.ok(call('materials.update', { id: x.id, title: 'Surat Jemputan Bil 1', type: 'Surat Jemputan', agenda_id: '' }, S).ok);
  assert.strictEqual(get(M).materials.find(y => y.id === x.id).type, 'Surat Jemputan');
  assert.strictEqual(call('materials.update', { id: x.id, type: 'Bahan Bicara' }, S).error.code, 400);
});

// ----- Bahan Bicara (terhad) -----
let BB;
t('Bahan Bicara disimpan di akar/Terhad/<id>, BUKAN dalam folder mesyuarat yang dikongsi kepada ahli', () => {
  const r = up(S, { type: 'Bahan Bicara', title: 'Bahan Bicara Pengarah', file_name: 'bicara.doc', data_base64: DOC }); assert.ok(r.ok, JSON.stringify(r)); BB = r.data.id;
  const f = state.files[state.files.length - 1];
  assert.notStrictEqual(f.parent.id, MF); assert.strictEqual(f.parent.name, M); assert.strictEqual(f.parent.parent.name, 'Terhad'); assert.strictEqual(f.parent.parent.parent.name, 'e-Mesyuarat IKN');
  assert.ok(f.parent.viewers.has('chair@x.com'), 'mesyuarat sudah terbit: pengerusi dikongsi');
  ['a1@x.com', 'a2@x.com', 'out@x.com'].forEach(e => assert.ok(!f.parent.viewers.has(e)));
  assert.strictEqual(folder(MF).viewers.has('chair@x.com'), true);
});
t('Bahan Bicara kelihatan kepada Pengerusi mesyuarat itu dan staf sahaja; ditapis di server', () => {
  assert.ok(get(M, C).materials.some(x => x.id === BB)); assert.ok(get(M, S).materials.some(x => x.id === BB));
  [A1, A2].forEach(tok => assert.ok(!get(M, tok).materials.some(x => x.id === BB)));
  assert.ok(!JSON.stringify(call('meetings.get', { id: M }, A1)).includes('Bahan Bicara'), 'tiada kebocoran dalam respons Ahli');
  assert.strictEqual(call('materials.logOpen', { id: BB }, A1).error.code, 403); assert.ok(call('materials.logOpen', { id: BB }, C).ok);
  assert.strictEqual(call('materials.archive', { id: BB }, A1).error.code, 403); assert.strictEqual(call('materials.replace', { id: BB, file_name: 'x.pdf', data_base64: PDF }, A1).error.code, 403);
});
t('Bahan Bicara dimuat naik semasa Draf: dikongsi kepada pengerusi hanya selepas terbit; tukar pengerusi alih akses; batal tarik balik', () => {
  const D = mk('Draf Bicara'); up(S, { meeting_id: D, type: 'Bahan Bicara', file_name: 'b.doc', data_base64: DOC, title: 'BB' });
  const tf = state.files[state.files.length - 1].parent; assert.strictEqual(tf.viewers.size, 0, 'Draf: tiada siapa dikongsi');
  call('meetings.publish', { id: D }, S); assert.ok(tf.viewers.has('chair@x.com') && !tf.viewers.has('a1@x.com'));
  const g = get(D);
  assert.ok(call('meetings.update', { id: D, title: 'Draf Bicara', series: SERIES, date: '2026-12-01', start_time: '09:00', pengerusi_email: 'chair2@x.com', members: ['a1@x.com'] }, S).ok);
  assert.ok(tf.viewers.has('chair2@x.com') && !tf.viewers.has('chair@x.com'));
  call('meetings.cancel', { id: D }, S); assert.strictEqual(tf.viewers.size, 0);
});
t('pengguna dinyahaktif / diaktif: akses folder terhad pengerusi turut dilaraskan', () => {
  const tf = state.files.find(f => f.id === state.files.find(x => x.name.includes('bicara')).id).parent;
  const bbFolder = folder(state.files.find(f => f.parent.name === M && f.parent.parent.name === 'Terhad').parent.id);
  call('users.deactivate', { email: 'chair@x.com' }, A); assert.ok(!bbFolder.viewers.has('chair@x.com'));
  call('users.save', { email: 'chair@x.com', name: 'CHAIR', role: 'Pengerusi', status: 'Aktif' }, A); assert.ok(bbFolder.viewers.has('chair@x.com'));
});

// ----- Daftar & imbas -----
t('imbas folder: 3 fail dalam folder mesyuarat didaftar sebagai Lain-lain, tiada pendua, jenis haram dilangkau', () => {
  const E = mk('Imbas'); const EF = get(E).drive_folder_id;
  ['a.pdf', 'b.pptx', 'c.docx', 'virus.exe'].forEach(n => folder(EF).createFile({ name: n, bytes: [37, 80, 68, 70] }));
  assert.strictEqual(call('materials.register', { meeting_id: E, scan: true }, A1).error.code, 403);
  const r = call('materials.register', { meeting_id: E, scan: true }, S); assert.ok(r.ok, JSON.stringify(r));
  assert.deepStrictEqual([r.data.added, r.data.already, r.data.skipped.length], [3, 0, 1]);
  const again = call('materials.register', { meeting_id: E, scan: true }, S).data; assert.strictEqual(again.added, 0); assert.strictEqual(again.skipped.length, 1);
  const mats = get(E).materials; assert.strictEqual(mats.length, 3); assert.ok(mats.every(x => x.type === 'Lain-lain'));
  assert.deepStrictEqual(mats.map(x => x.title).sort(), ['a', 'b', 'c']); assert.strictEqual(new Set(mats.map(x => x.drive_file_id)).size, 3);
});
t('daftar satu fail melalui pautan: mesti dalam folder mesyuarat; duplikat 409; ID/pautan tak sah 400', () => {
  const E = mk('Daftar'); const EF = get(E).drive_folder_id;
  const inside = folder(EF).createFile({ name: 'laporan.xlsx', bytes: [80, 75] }), outside = folder(MF).createFile({ name: 'luar.pdf', bytes: [37] });
  const link = (f) => `https://drive.google.com/file/d/${f.id.replace('_', 'x')}/view`; // ID mock tidak mengandungi '_'? gunakan terus ID
  assert.strictEqual(call('materials.register', { meeting_id: E, file: 'bukan pautan!', type: 'Kertas Laporan' }, S).error.code, 400);
  assert.strictEqual(call('materials.register', { meeting_id: E, file: 'https://drive.google.com/file/d/FILE_9999999999/view', type: 'Lain-lain' }, S).error.code, 400);
  const o = call('materials.register', { meeting_id: E, file: `https://drive.google.com/file/d/${outside.id}/view`, type: 'Kertas Laporan' }, S); assert.strictEqual(o.error.code, 400); assert.ok(/folder Drive mesyuarat/.test(o.error.message));
  const ok = call('materials.register', { meeting_id: E, file: `https://drive.google.com/file/d/${inside.id}/view?usp=sharing`, type: 'Kertas Laporan', title: 'Laporan Prestasi' }, S); assert.ok(ok.ok, JSON.stringify(ok));
  assert.strictEqual(call('materials.register', { meeting_id: E, file: inside.id, type: 'Kertas Laporan' }, S).error.code, 409);
  assert.strictEqual(call('materials.register', { meeting_id: E, file: inside.id, type: 'Bahan Bicara' }, S).error.code, 400);
  const m = get(E).materials[0]; assert.deepStrictEqual([m.type, m.title, m.mime_type.includes('spreadsheet')], ['Kertas Laporan', 'Laporan Prestasi', true]);
});
t('Draf: Ahli tidak boleh buka bahan; log buka direkod untuk ahli; bukan ahli 403; mesyuarat batal 409', () => {
  const D = mk('Draf Bahan'); up(S, { meeting_id: D, title: 'Draf Kertas' });
  const mid = get(D).materials[0].id;
  assert.strictEqual(call('meetings.get', { id: D }, A1).error.code, 403); assert.strictEqual(call('materials.logOpen', { id: mid }, A1).error.code, 403);
  call('meetings.publish', { id: D }, S);
  assert.ok(call('materials.logOpen', { id: mid }, A1).ok); assert.strictEqual(call('materials.logOpen', { id: mid }, OUT).error.code, 403);
  assert.ok(state.sheets.audit_log.data.some(r => r[3] === 'material.open' && r[2] === 'a1@x.com'));
  call('meetings.cancel', { id: D }, S); assert.strictEqual(up(S, { meeting_id: D }).error.code, 409);
});
t('tanpa token / bahan tak wujud', () => {
  assert.strictEqual(call('materials.upload', { meeting_id: M }, undefined).error.code, 401);
  assert.strictEqual(call('materials.logOpen', { id: 'MAT-tiadatiada' }, S).error.code, 404);
});
t('agenda.delete: item dibuang, nombor disusun semula, bahan dilepaskan daripada item', () => {
  const a = get(M).agenda; const target = a.find(x => x.presenter_email === 'a1@x.com');
  assert.ok(call('agenda.delete', { meeting_id: M, id: target.id }, S).ok);
  const after = get(M); assert.deepStrictEqual(after.agenda.map(x => x.seq), [1, 2]);
  assert.ok(after.materials.every(x => x.agenda_id !== target.id));
  assert.strictEqual(call('agenda.delete', { meeting_id: M, id: target.id }, S).error.code, 404);
  assert.strictEqual(call('agenda.delete', { meeting_id: M, id: a[0].id }, A1).error.code, 403);
});

console.log(`\n${passed} ujian lulus` + (process.exitCode ? ', ADA YANG GAGAL' : ''));
