const assert = require('assert');
const { create } = require('./gas-harness');
let passed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('  GAGAL ' + name + '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

const h = create(); const { call, fetchMock, state, stats, run } = h;
const CID = 'client-123.apps.googleusercontent.com', FAKE = 'eyJ' + 'a'.repeat(40);
const login = (email) => { fetchMock.respond = () => ({ code: 200, body: { aud: CID, iss: 'accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 3600), email, email_verified: 'true' } }); const r = call('auth.login', { idToken: FAKE }); assert.ok(r.ok, JSON.stringify(r)); return r.data.token; };
run("ADMIN_EMAIL = 'admin@x.com'"); run('setupSystem()');
const A = login('admin@x.com');
['sec:Setiausaha', 'chair:Ahli', 'chair2:Ahli', 'a1:Ahli', 'a2:Ahli', 'out:Ahli'].forEach(x => { const [n, r] = x.split(':'); assert.ok(call('users.save', { email: n + '@x.com', name: n.toUpperCase(), role: r }, A).ok); });
const S = login('sec@x.com'), C = login('chair@x.com'), C2 = login('chair2@x.com'), A1 = login('a1@x.com'), A2 = login('a2@x.com'), OUT = login('out@x.com');
const BODY = { title: 'Mesyuarat', bil: '1', date: '2026-12-01', start_time: '09:00', pengerusi_email: 'chair@x.com', members: ['a1@x.com', 'a2@x.com'] };
const mk = (title, extra) => { const r = call('meetings.create', Object.assign({}, BODY, { title }, extra), S); assert.ok(r.ok, JSON.stringify(r)); return r.data.id; };
const get = (id, tok) => call('meetings.get', { id }, tok || S).data;
const pdf = Buffer.from('%PDF-1.4\n%x').toString('base64');

const M = mk('Mesyuarat Komen');
const ag = []; ['Pengesahan', 'Kertas Makluman', 'Hal Lain'].forEach((t2, i) => { assert.ok(call('agenda.save', { meeting_id: M, title: t2, category: 'Perbincangan', presenter_email: i === 1 ? 'a1@x.com' : '' }, S).ok); });
const AG = get(M).agenda.map(a => a.id);
call('meetings.publish', { id: M }, S);
const add = (tok, o) => call('feedback.add', Object.assign({ meeting_id: M, target_type: 'Mesyuarat', target_id: M, kind: 'Komen', content: 'Komen ujian', visibility: 'Semua' }, o), tok);
const list = (tok, o) => call('feedback.list', Object.assign({ meeting_id: M }, o), tok);

t('tambah komen: ahli dijemput boleh; penulis, jenis, tarikh direkod; lalai visibiliti Semua', () => {
  const r = call('feedback.add', { meeting_id: M, target_type: 'Agenda', target_id: AG[1], content: '  Cadangan tambah slaid  ', kind: 'Cadangan' }, A1); assert.ok(r.ok, JSON.stringify(r));
  const f = r.data.feedback; assert.strictEqual(f.content, 'Cadangan tambah slaid'); assert.strictEqual(f.visibility, 'Semua'); assert.strictEqual(f.author_email, 'a1@x.com'); assert.strictEqual(f.author_name, 'A1');
  assert.ok(f.mine && f.can_edit && f.can_delete); assert.ok(/^FBK-/.test(f.id)); assert.ok(/\+08:00$/.test(f.created_at));
});
t('visibiliti terhad ditapis di server: Ahli lain TIDAK menerimanya dalam respons; penulis, Pengerusi mesyuarat itu dan staf menerimanya', () => {
  assert.ok(add(A1, { content: 'RAHSIA-KOMEN-TERHAD', visibility: 'Pengerusi & Setiausaha' }).ok);
  assert.ok(!JSON.stringify(list(A2)).includes('RAHSIA-KOMEN-TERHAD'), 'tiada kebocoran kepada ahli lain');
  [A1, C, S, A].forEach(tok => assert.ok(JSON.stringify(list(tok)).includes('RAHSIA-KOMEN-TERHAD')));
  assert.ok(!JSON.stringify(list(C2, {})).includes('RAHSIA'), 'bukan ahli');
});
t('Pengerusi diubah: pengerusi baharu nampak komen terhad, yang lama tidak', () => {
  const M2 = mk('Tukar Pengerusi', { members: ['a1@x.com', 'a2@x.com', 'chair2@x.com'] }); call('meetings.publish', { id: M2 }, S);
  call('feedback.add', { meeting_id: M2, target_type: 'Mesyuarat', target_id: M2, content: 'TERHAD-2', visibility: 'Pengerusi & Setiausaha' }, A1);
  assert.ok(JSON.stringify(call('feedback.list', { meeting_id: M2 }, C)).includes('TERHAD-2'));
  call('meetings.update', Object.assign({ id: M2 }, BODY, { title: 'Tukar Pengerusi', pengerusi_email: 'chair2@x.com', members: ['a1@x.com', 'a2@x.com', 'chair@x.com'] }), S);
  assert.ok(JSON.stringify(call('feedback.list', { meeting_id: M2 }, C2)).includes('TERHAD-2')); assert.ok(!JSON.stringify(call('feedback.list', { meeting_id: M2 }, C)).includes('TERHAD-2'));
});
t('bukan ahli / Draf ditolak 403; tanpa token 401', () => {
  assert.strictEqual(list(OUT).error.code, 403); assert.strictEqual(add(OUT).error.code, 403);
  const D = mk('Draf'); assert.strictEqual(call('feedback.list', { meeting_id: D }, A1).error.code, 403);
  assert.strictEqual(call('feedback.add', { meeting_id: M }, undefined).error.code, 401);
});
t('validasi: kandungan kosong/terlalu panjang, jenis, visibiliti, sasaran', () => {
  assert.strictEqual(add(A1, { content: '   ' }).error.code, 400); assert.strictEqual(add(A1, { content: 'x'.repeat(3001) }).error.code, 400); assert.ok(add(A1, { content: 'x'.repeat(3000) }).ok);
  assert.strictEqual(add(A1, { kind: 'Ugutan' }).error.code, 400); assert.strictEqual(add(A1, { visibility: 'Rahsia' }).error.code, 400);
  assert.strictEqual(add(A1, { target_type: 'Agenda', target_id: 'AGD-tiadatiada' }).error.code, 404);
  assert.strictEqual(add(A1, { target_type: 'Minit', target_id: 'MIN-x' }).error.code, 400); assert.strictEqual(add(A1, { target_type: 'Lain' }).error.code, 400);
});
t('sasaran dalam mesyuarat LAIN ditolak (ubah target_id)', () => {
  const O = mk('Lain'); call('agenda.save', { meeting_id: O, title: 'Item Lain' }, S); const oid = get(O).agenda[0].id;
  assert.strictEqual(add(A1, { target_type: 'Agenda', target_id: oid }).error.code, 404);
});
t('Bahan Bicara: ahli tak boleh komen padanya dan komen padanya tidak dipulangkan kepada ahli; Pengerusi/staf boleh', () => {
  const up = (type) => call('materials.upload', { meeting_id: M, type, title: type + ' ujian', file_name: 'a.pdf', data_base64: pdf }, S);
  assert.ok(up('Bahan Bicara').ok); assert.ok(up('Kertas Makluman').ok);
  const mats = get(M).materials; const bb = mats.find(x => x.type === 'Bahan Bicara').id, km = mats.find(x => x.type === 'Kertas Makluman').id;
  assert.strictEqual(add(A1, { target_type: 'Bahan', target_id: bb }).error.code, 404);
  assert.ok(add(A1, { target_type: 'Bahan', target_id: km, content: 'KOMEN-BAHAN-BIASA' }).ok);
  const cb = add(C, { target_type: 'Bahan', target_id: bb, content: 'PENGERUSI-ATAS-BICARA' }); assert.ok(cb.ok, JSON.stringify(cb));
  assert.ok(!JSON.stringify(list(A2)).includes('PENGERUSI-ATAS-BICARA'), 'tiada kebocoran'); assert.ok(JSON.stringify(list(S)).includes('PENGERUSI-ATAS-BICARA')); assert.ok(JSON.stringify(list(A2)).includes('KOMEN-BAHAN-BIASA'));
  assert.strictEqual(list(A2, { target_type: 'Bahan', target_id: km }).data.feedback.length, 1);
});
t('edit: penulis sahaja (staf pun tidak boleh sunting komen orang lain)', () => {
  const f = add(A1, { content: 'asal' }).data.feedback;
  assert.strictEqual(call('feedback.update', { id: f.id, content: 'pindaan' }, A2).error.code, 403); assert.strictEqual(call('feedback.update', { id: f.id, content: 'pindaan' }, S).error.code, 403); assert.strictEqual(call('feedback.update', { id: f.id, content: 'pindaan' }, A).error.code, 403);
  const u = call('feedback.update', { id: f.id, content: 'pindaan', kind: 'Soalan', visibility: 'Pengerusi & Setiausaha' }, A1); assert.ok(u.ok, JSON.stringify(u));
  assert.deepStrictEqual([u.data.feedback.content, u.data.feedback.kind, u.data.feedback.visibility], ['pindaan', 'Soalan', 'Pengerusi & Setiausaha']);
  assert.strictEqual(call('feedback.update', { id: f.id, content: '' }, A1).error.code, 400); assert.strictEqual(call('feedback.update', { id: f.id, kind: 'X' }, A1).error.code, 400);
});
t('padam: penulis padam sendiri; ahli lain 403; Setiausaha/Admin padam mana-mana + direkod audit; soft delete', () => {
  const f1 = add(A1).data.feedback, f2 = add(A1).data.feedback, f3 = add(A1).data.feedback;
  assert.strictEqual(call('feedback.delete', { id: f1.id }, A2).error.code, 403); assert.strictEqual(call('feedback.delete', { id: f1.id }, C).error.code, 403);
  assert.ok(call('feedback.delete', { id: f1.id }, A1).ok); assert.ok(!list(A1).data.feedback.some(x => x.id === f1.id));
  assert.ok(call('feedback.delete', { id: f2.id }, S).ok); assert.ok(call('feedback.delete', { id: f3.id }, A).ok);
  assert.strictEqual(state.sheets.audit_log.data.filter(r => r[3] === 'feedback.delete').length, 2, 'hanya padam oleh orang lain diaudit');
  assert.strictEqual(call('feedback.delete', { id: f1.id }, A1).error.code, 404);
  const row = state.sheets.feedback.data.find(r => r[0] === f1.id); assert.strictEqual(row[state.sheets.feedback.data[0].indexOf('deleted')], 'TRUE', 'baris kekal (soft delete)');
});
t('tempoh: selepas Selesai penulis tak boleh edit/padam/tambah; staf masih boleh padam', () => {
  const E = mk('Tempoh'); call('meetings.publish', { id: E }, S);
  const f = call('feedback.add', { meeting_id: E, target_type: 'Mesyuarat', target_id: E, content: 'sebelum selesai' }, A1).data.feedback;
  call('meetings.setStatus', { id: E, status: 'Sedang Berlangsung' }, S);
  assert.ok(call('feedback.add', { meeting_id: E, target_type: 'Mesyuarat', target_id: E, content: 'semasa mesyuarat' }, A2).ok, 'boleh semasa berlangsung');
  call('meetings.setStatus', { id: E, status: 'Selesai' }, S);
  assert.strictEqual(call('feedback.update', { id: f.id, content: 'x' }, A1).error.code, 409); assert.strictEqual(call('feedback.delete', { id: f.id }, A1).error.code, 409);
  assert.strictEqual(call('feedback.add', { meeting_id: E, target_type: 'Mesyuarat', target_id: E, content: 'terlambat' }, A1).error.code, 409);
  const l = call('feedback.list', { meeting_id: E }, A1).data; assert.strictEqual(l.can_comment, false); assert.ok(l.feedback.every(x => !x.can_edit));
  assert.ok(call('feedback.delete', { id: f.id }, S).ok);
});
t('senarai: tapis target; susunan ikut masa; can_comment', () => {
  const l = list(A2).data; assert.strictEqual(l.can_comment, true);
  const times = l.feedback.map(x => x.created_at); assert.deepStrictEqual(times, times.slice().sort());
  assert.ok(list(A2, { target_type: 'Agenda', target_id: AG[1] }).data.feedback.every(x => x.target_type === 'Agenda' && x.target_id === AG[1]));
});

// ----- keadaan mesyuarat (Mod Mesyuarat) -----
t('pollState: ahli dijemput boleh; bukan ahli/Draf 403; hanya nilai ringkas dipulangkan', () => {
  const r = call('meetings.pollState', { id: M }, A1); assert.ok(r.ok, JSON.stringify(r));
  assert.deepStrictEqual(Object.keys(r.data).sort(), ['agenda', 'current_agenda_id', 'fbrev', 'server_time', 'status']); assert.strictEqual(r.data.status, 'Dijadualkan'); assert.strictEqual(r.data.current_agenda_id, '');
  assert.strictEqual(call('meetings.pollState', { id: M }, OUT).error.code, 403); assert.strictEqual(call('meetings.pollState', { id: mk('DrafPoll') }, A1).error.code, 403);
  assert.strictEqual(call('meetings.pollState', { id: 'MTG-tiadatiada' }, A1).error.code, 404); assert.strictEqual(call('meetings.pollState', {}, A1).error.code, 400); assert.strictEqual(call('meetings.pollState', { id: M }, undefined).error.code, 401);
});
t('pollState membaca CACHE sahaja: 0 bacaan Sheet bila cache hangat (20 ahli x 3 panggilan)', () => {
  call('meetings.pollState', { id: M }, A1); const before = stats.reads;
  for (let i = 0; i < 20; i++) [A1, A2, C].forEach(tok => assert.ok(call('meetings.pollState', { id: M }, tok).ok));
  assert.strictEqual(stats.reads - before, 0, 'bacaan Sheet: ' + (stats.reads - before));
});
t('cache hilang: dibina semula secara automatik', () => {
  Object.keys(state.cache).filter(k => k.startsWith('mstate_')).forEach(k => delete state.cache[k]);
  const before = stats.reads; assert.ok(call('meetings.pollState', { id: M }, A1).ok); assert.ok(stats.reads > before); const b2 = stats.reads; call('meetings.pollState', { id: M }, A1); assert.strictEqual(stats.reads, b2);
});
t('setCurrentAgenda: perlu Sedang Berlangsung; Pengerusi mesyuarat itu dan staf sahaja; ahli lain / pengerusi mesyuarat lain 403', () => {
  assert.strictEqual(call('meetings.setCurrentAgenda', { id: M, agenda_id: AG[0] }, C).error.code, 409, 'belum mula');
  assert.strictEqual(call('meetings.setStatus', { id: M, status: 'Sedang Berlangsung' }, A1).error.code, 403); assert.ok(call('meetings.setStatus', { id: M, status: 'Sedang Berlangsung' }, C).ok);
  [A1, C2, OUT].forEach(tok => assert.strictEqual(call('meetings.setCurrentAgenda', { id: M, agenda_id: AG[0] }, tok).error.code, 403));
  assert.strictEqual(call('meetings.setCurrentAgenda', { id: M, agenda_id: 'AGD-tiadatiada' }, C).error.code, 404);
  const r = call('meetings.setCurrentAgenda', { id: M, agenda_id: AG[0] }, C); assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.data.current_agenda_id, AG[0]);
});
t('ahli nampak item semasa melalui pollState (cache dikemas kini serta-merta); status item ikut', () => {
  let p = call('meetings.pollState', { id: M }, A2).data; assert.strictEqual(p.status, 'Sedang Berlangsung'); assert.strictEqual(p.current_agenda_id, AG[0]); assert.strictEqual(p.agenda.find(a => a.id === AG[0]).status, 'Sedang Dibincang');
  call('meetings.setCurrentAgenda', { id: M, agenda_id: AG[1] }, S);
  p = call('meetings.pollState', { id: M }, A2).data; assert.strictEqual(p.current_agenda_id, AG[1]);
  assert.deepStrictEqual(p.agenda.map(a => a.status), ['Belum', 'Sedang Dibincang', 'Belum'], 'hanya satu item Sedang Dibincang; item lama yang belum selesai kembali Belum');
  assert.strictEqual(call('meetings.get', { id: M }, S).data.current_agenda_id, AG[1], 'ditulis ke Sheet juga');
});
t('Pengerusi tandakan Selesai / Ditangguh; item semasa lama yang Selesai kekal Selesai', () => {
  const r = call('agenda.setStatus', { meeting_id: M, id: AG[1], status: 'Selesai' }, C); assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(call('meetings.pollState', { id: M }, A1).data.agenda.find(a => a.id === AG[1]).status, 'Selesai');
  call('meetings.setCurrentAgenda', { id: M, agenda_id: AG[2] }, C); assert.strictEqual(call('meetings.pollState', { id: M }, A1).data.agenda.find(a => a.id === AG[1]).status, 'Selesai');
  assert.ok(call('agenda.setStatus', { meeting_id: M, id: AG[2], status: 'Ditangguh' }, C).ok); assert.strictEqual(call('agenda.setStatus', { meeting_id: M, id: AG[2], status: 'Selesai' }, A1).error.code, 403);
  call('meetings.setCurrentAgenda', { id: M, agenda_id: AG[2] }, C); assert.strictEqual(call('meetings.pollState', { id: M }, A1).data.agenda.find(a => a.id === AG[2]).status, 'Sedang Dibincang', 'item ditangguh dibuka semula');
});
t('fbrev naik bila komen ditambah / diedit / dipadam (klien hanya muat semula bila berubah)', () => {
  const r0 = call('meetings.pollState', { id: M }, A1).data.fbrev;
  const f = add(A2, { content: 'rev' }).data.feedback; const r1 = call('meetings.pollState', { id: M }, A1).data.fbrev; assert.ok(r1 > r0);
  call('feedback.update', { id: f.id, content: 'rev2' }, A2); const r2 = call('meetings.pollState', { id: M }, A1).data.fbrev; assert.ok(r2 > r1);
  call('feedback.delete', { id: f.id }, A2); const r3 = call('meetings.pollState', { id: M }, A1).data.fbrev; assert.ok(r3 > r2);
  assert.strictEqual(call('meetings.pollState', { id: M }, A1).data.fbrev, r3, 'stabil bila tiada perubahan');
  assert.strictEqual(list(A1).data.fbrev, r3);
});
t('ahli dibuang: akses pollState ditarik serta-merta; ditambah: diberi', () => {
  assert.ok(call('members.set', { meeting_id: M, emails: ['a1@x.com', 'chair@x.com'] }, S).ok);
  assert.strictEqual(call('meetings.pollState', { id: M }, A2).error.code, 403); assert.ok(call('meetings.pollState', { id: M }, A1).ok);
  call('members.set', { meeting_id: M, emails: ['a1@x.com', 'a2@x.com', 'chair@x.com', 'out@x.com'] }, S); assert.ok(call('meetings.pollState', { id: M }, OUT).ok);
});
t('padam item agenda semasa: item semasa dikosongkan; susun semula dalam state', () => {
  const N = mk('Padam Semasa'); call('agenda.save', { meeting_id: N, title: 'I1' }, S); call('agenda.save', { meeting_id: N, title: 'I2' }, S); const ids = get(N).agenda.map(a => a.id);
  call('meetings.publish', { id: N }, S); call('meetings.setStatus', { id: N, status: 'Sedang Berlangsung' }, S); call('meetings.setCurrentAgenda', { id: N, agenda_id: ids[0] }, S);
  call('agenda.reorder', { meeting_id: N, ids: [ids[1], ids[0]] }, S); assert.deepStrictEqual(call('meetings.pollState', { id: N }, A1).data.agenda.map(a => a.id), [ids[1], ids[0]]);
  call('agenda.delete', { meeting_id: N, id: ids[0] }, S); const p = call('meetings.pollState', { id: N }, A1).data; assert.strictEqual(p.current_agenda_id, ''); assert.strictEqual(p.agenda.length, 1);
});
t('tamat mesyuarat: item semasa dikosongkan, status Selesai kelihatan serta-merta; batal: ahli kehilangan state', () => {
  assert.ok(call('meetings.setStatus', { id: M, status: 'Selesai' }, C).ok);
  const p = call('meetings.pollState', { id: M }, A1).data; assert.strictEqual(p.status, 'Selesai'); assert.strictEqual(p.current_agenda_id, '');
  assert.strictEqual(call('meetings.setCurrentAgenda', { id: M, agenda_id: AG[0] }, C).error.code, 409);
  const B = mk('Batal'); call('meetings.publish', { id: B }, S); assert.ok(call('meetings.cancel', { id: B }, S).ok); assert.strictEqual(call('meetings.pollState', { id: B }, A1).data.status, 'Dibatalkan');
});
t('komen mesyuarat lain tidak muncul dalam senarai mesyuarat ini', () => {
  const O = mk('Lain2'); call('meetings.publish', { id: O }, S);
  const f = call('feedback.add', { meeting_id: O, target_type: 'Mesyuarat', target_id: O, content: 'KOMEN-MESYUARAT-LAIN' }, A1).data.feedback;
  assert.ok(!JSON.stringify(list(A1)).includes('KOMEN-MESYUARAT-LAIN')); assert.ok(JSON.stringify(call('feedback.list', { meeting_id: O }, A1)).includes(f.id));
});

console.log(`\n${passed} ujian lulus` + (process.exitCode ? ', ADA YANG GAGAL' : ''));
