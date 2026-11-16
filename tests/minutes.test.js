const assert = require('assert');
const { create } = require('./gas-harness');
let passed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('  GAGAL ' + name + '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

const h = create(); const { call, fetchMock, state, run } = h;
const CID = 'client-123.apps.googleusercontent.com', FAKE = 'eyJ' + 'a'.repeat(40);
const login = (email) => { fetchMock.respond = () => ({ code: 200, body: { aud: CID, iss: 'accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 3600), email, email_verified: 'true' } }); const r = call('auth.login', { idToken: FAKE }); assert.ok(r.ok, JSON.stringify(r)); return r.data.token; };
run("ADMIN_EMAIL = 'admin@x.com'"); run('setupSystem()');
const A = login('admin@x.com');
['sec:Setiausaha', 'chair:Ahli', 'chair2:Ahli', 'a1:Ahli', 'a2:Ahli', 'out:Ahli'].forEach(x => { const [n, r] = x.split(':'); assert.ok(call('users.save', { email: n + '@x.com', name: n.toUpperCase(), position: 'Jawatan ' + n, role: r }, A).ok); });
const S = login('sec@x.com'), C = login('chair@x.com'), C2 = login('chair2@x.com'), A1 = login('a1@x.com'), A2 = login('a2@x.com'), OUT = login('out@x.com');
run("setSettingValue_('app_url', 'https://syura.contoh.my'); invalidateSettings_()");
const myDate = (plus) => new Date(Date.now() + 8 * 3600e3 + plus * 86400e3).toISOString().slice(0, 10);
const BODY = { title: 'MESYUARAT HMI', bil: '1', tahun: '2026', date: myDate(1), start_time: '09:00', pengerusi_email: 'chair@x.com', members: ['a1@x.com', 'a2@x.com'] };
const mk = (extra) => { const r = call('meetings.create', Object.assign({}, BODY, extra), S); assert.ok(r.ok, JSON.stringify(r)); return r.data.id; };
const pub = (id) => assert.ok(call('meetings.publish', { id }, S).ok);
const get = (id, tok) => call('meetings.get', { id }, tok || S).data;
const logRows = () => state.sheets.notification_log.data.slice(1).map(r => Object.fromEntries(state.sheets.notification_log.data[0].map((k, i) => [k, r[i]])));
const CONTENT = '# MINIT MESYUARAT\n\n1. PERUTUSAN PENGERUSI\n\nPengerusi menyampaikan ucapan alu-aluan.';
const mg = (id, tok) => call('minutes.get', { meeting_id: id }, tok);

// ===================== MINIT =====================
const M = mk(); const D = mk({ title: 'DRAF' });
t('minit tidak boleh disediakan untuk mesyuarat Draf; hanya Admin/Setiausaha boleh simpan', () => {
  assert.strictEqual(call('minutes.save', { meeting_id: D, content_md: CONTENT }, S).error.code, 409); pub(M);
  [A1, C, C2, OUT].forEach(tok => assert.strictEqual(call('minutes.save', { meeting_id: M, content_md: CONTENT }, tok).error.code, 403));
  assert.strictEqual(call('minutes.save', { meeting_id: M, content_md: CONTENT }, undefined).error.code, 401);
});
t('simpan draf: versi 1, is_current; kemas kini; had 45,000 aksara', () => {
  const r = call('minutes.save', { meeting_id: M, content_md: CONTENT }, S); assert.ok(r.ok, JSON.stringify(r)); assert.deepStrictEqual([r.data.minute.version, r.data.minute.status, r.data.minute.prepared_by], [1, 'Draf', 'sec@x.com']);
  assert.ok(call('minutes.save', { meeting_id: M, content_md: CONTENT + '\n\nTambahan.' }, A).ok); assert.strictEqual(state.sheets.minutes.data.filter(x => x[1] === M).length, 1, 'satu baris sahaja (kemas kini, bukan baris baharu)');
  assert.ok(call('minutes.save', { meeting_id: M, content_md: 'x'.repeat(45000) }, S).ok); assert.strictEqual(call('minutes.save', { meeting_id: M, content_md: 'x'.repeat(45001) }, S).error.code, 400);
  call('minutes.save', { meeting_id: M, content_md: CONTENT }, S);
});
t('Draf: hanya Admin/Setiausaha nampak (Pengerusi, ahli dan bukan ahli tidak; tiada kebocoran dalam respons)', () => {
  assert.strictEqual(mg(M, S).data.minute.status, 'Draf'); assert.strictEqual(mg(M, A).data.minute.status, 'Draf');
  [C, A1, A2].forEach(tok => { const r = mg(M, tok); assert.ok(r.ok); assert.strictEqual(r.data.minute, null); assert.ok(!JSON.stringify(r).includes('PERUTUSAN')); });
  assert.strictEqual(mg(M, OUT).error.code, 403); assert.strictEqual(mg(M, C2).error.code, 403);
  assert.strictEqual(get(M, S).minute_status, 'Draf'); assert.strictEqual(get(M, C).minute_status, null); assert.strictEqual(get(M, A1).minute_status, null);
});
t('hantar untuk semakan: kandungan terlalu pendek ditolak; emel HANYA kepada Pengerusi (bukan ahli)', () => {
  call('minutes.save', { meeting_id: M, content_md: 'pendek' }, S); assert.strictEqual(call('minutes.submit', { meeting_id: M }, S).error.code, 400); call('minutes.save', { meeting_id: M, content_md: CONTENT }, S);
  assert.strictEqual(call('minutes.submit', { meeting_id: M }, A1).error.code, 403); assert.strictEqual(call('minutes.submit', { meeting_id: M }, C).error.code, 403);
  state.mail.length = 0; const r = call('minutes.submit', { meeting_id: M }, S); assert.ok(r.ok, JSON.stringify(r)); assert.deepStrictEqual([r.data.minute.status, r.data.minute.version], ['Untuk Semakan', 1]);
  assert.deepStrictEqual(state.mail.map(m => m.to), ['chair@x.com']); assert.ok(state.mail[0].subject.startsWith('Minit untuk semakan:') && state.mail[0].body.includes('https://syura.contoh.my/#/meetings/' + M)); assert.ok(!state.mail[0].body.includes('PERUTUSAN'), 'emel tiada kandungan minit');
  assert.ok(logRows().some(x => x.type === 'minute_review' && x.to_email === 'chair@x.com'));
  assert.strictEqual(call('minutes.submit', { meeting_id: M }, S).error.code, 409);
});
t('Untuk Semakan: Pengerusi mesyuarat itu nampak; ahli, pengerusi mesyuarat lain tidak; tidak boleh disunting', () => {
  const r = mg(M, C); assert.strictEqual(r.data.minute.status, 'Untuk Semakan'); assert.ok(r.data.minute.content_md.includes('PERUTUSAN')); assert.ok(r.data.caps.can_approve && !r.data.caps.can_edit && r.data.caps.can_comment);
  [A1, A2].forEach(tok => { assert.strictEqual(mg(M, tok).data.minute, null); }); assert.strictEqual(mg(M, C2).error.code, 403); assert.strictEqual(get(M, C).minute_status, 'Untuk Semakan'); assert.strictEqual(get(M, A1).minute_status, null);
  assert.strictEqual(call('minutes.save', { meeting_id: M, content_md: 'ubah' }, S).error.code, 409);
});
t('komen semakan minit: hanya staf dan Pengerusi menulis; ahli tidak nampak walaupun visibiliti Semua; tiada kebocoran', () => {
  const c = state.sheets.minutes.data.find(x => x[1] === M)[0];
  const add = (tok, o) => call('feedback.add', Object.assign({ meeting_id: M, target_type: 'Minit', target_id: c, content: 'MINTA-PINDAAN-PERENGGAN-2', visibility: 'Semua' }, o), tok);
  assert.strictEqual(add(A1).error.code, 404, 'ahli tidak boleh'); assert.strictEqual(add(C2).error.code, 403, 'bukan ahli'); assert.strictEqual(add(C, { target_id: 'MIN-tiadatiada' }).error.code, 404);
  const ok = add(C); assert.ok(ok.ok, JSON.stringify(ok)); assert.ok(add(S, { content: 'balas setiausaha' }).ok);
  const l = (tok) => call('feedback.list', { meeting_id: M, target_type: 'Minit', target_id: c }, tok);
  assert.strictEqual(l(C).data.feedback.length, 2); assert.strictEqual(l(S).data.feedback.length, 2); assert.ok(l(C).data.can_comment && l(S).data.can_comment);
  assert.ok(!JSON.stringify(l(A1)).includes('MINTA-PINDAAN') && !JSON.stringify(call('feedback.list', { meeting_id: M }, A1)).includes('MINTA-PINDAAN'), 'ahli tidak menerima komen minit');
  assert.ok(JSON.stringify(call('feedback.list', { meeting_id: M }, C)).includes('MINTA-PINDAAN'));
});
t('tarik balik -> Draf -> hantar semula: versi naik ke 2; Draf tidak boleh ditarik balik', () => {
  assert.strictEqual(call('minutes.withdraw', { meeting_id: M }, A1).error.code, 403); assert.strictEqual(call('minutes.withdraw', { meeting_id: M }, C).error.code, 403);
  const w = call('minutes.withdraw', { meeting_id: M }, S); assert.strictEqual(w.data.minute.status, 'Draf'); assert.strictEqual(call('minutes.withdraw', { meeting_id: M }, S).error.code, 409);
  assert.strictEqual(mg(M, C).data.minute, null, 'Draf: Pengerusi tidak nampak lagi');
  const c = state.sheets.minutes.data.find(x => x[1] === M)[0]; assert.strictEqual(call('feedback.add', { meeting_id: M, target_type: 'Minit', target_id: c, content: 'x' }, C).error.code, 404, 'komen ditutup ketika Draf');
  call('minutes.save', { meeting_id: M, content_md: CONTENT + '\n\nPindaan selepas komen.' }, S); state.mail.length = 0;
  const r = call('minutes.submit', { meeting_id: M }, S); assert.strictEqual(r.data.minute.version, 2); assert.strictEqual(state.mail.length, 1);
});
t('pengesahan: hanya Pengerusi mesyuarat itu atau Admin; Setiausaha, ahli, pengerusi lain ditolak; emel kepada ahli + penyedia', () => {
  [S, A1, A2, C2].forEach(tok => assert.ok([403].includes(call('minutes.approve', { meeting_id: M }, tok).error.code))); assert.strictEqual(call('minutes.approve', { meeting_id: M }, OUT).error.code, 403);
  state.mail.length = 0; const r = call('minutes.approve', { meeting_id: M }, C); assert.ok(r.ok, JSON.stringify(r)); assert.deepStrictEqual([r.data.minute.status, r.data.minute.approved_by, r.data.minute.approved_by_name], ['Disahkan', 'chair@x.com', 'CHAIR']); assert.ok(/\+08:00$/.test(r.data.minute.approved_at));
  assert.deepStrictEqual(state.mail.map(m => m.to).sort(), ['a1@x.com', 'a2@x.com', 'chair@x.com', 'sec@x.com']); assert.ok(state.mail.every(m => m.subject.startsWith('Minit disahkan:') && !m.body.includes('PERUTUSAN')));
  assert.strictEqual(call('minutes.approve', { meeting_id: M }, C).error.code, 409);
});
t('Disahkan: semua ahli nampak; dikunci (tidak boleh simpan/hantar/tarik balik); komen semakan kekal tersembunyi daripada ahli dan tidak boleh disunting', () => {
  [A1, A2, C, S].forEach(tok => assert.strictEqual(mg(M, tok).data.minute.status, 'Disahkan')); assert.strictEqual(get(M, A1).minute_status, 'Disahkan'); assert.strictEqual(mg(M, OUT).error.code, 403);
  const ro = mg(M, A1).data.caps; assert.ok(!ro.can_edit && !ro.can_submit && !ro.can_approve && !ro.can_reopen && !ro.can_attach && !ro.can_comment);
  assert.strictEqual(call('minutes.save', { meeting_id: M, content_md: 'ubah' }, S).error.code, 409); assert.strictEqual(call('minutes.submit', { meeting_id: M }, S).error.code, 409); assert.strictEqual(call('minutes.withdraw', { meeting_id: M }, S).error.code, 409);
  assert.ok(!JSON.stringify(call('feedback.list', { meeting_id: M }, A1)).includes('MINTA-PINDAAN'));
  const c = state.sheets.minutes.data.find(x => x[1] === M)[0]; const fb = call('feedback.list', { meeting_id: M, target_type: 'Minit', target_id: c }, C).data;
  assert.ok(fb.feedback.every(x => !x.can_edit), 'tempoh edit tamat'); assert.strictEqual(call('feedback.update', { id: fb.feedback[0].id, content: 'x' }, C).error.code, 409); assert.strictEqual(fb.can_comment, false);
});
t('buka semula: Admin sahaja (Setiausaha, Pengerusi tidak); kembali Draf; audit direkod; ahli tidak nampak lagi', () => {
  [S, C, A1].forEach(tok => assert.strictEqual(call('minutes.reopen', { meeting_id: M }, tok).error.code, 403));
  const r = call('minutes.reopen', { meeting_id: M }, A); assert.ok(r.ok); assert.deepStrictEqual([r.data.minute.status, r.data.minute.approved_by], ['Draf', '']);
  assert.strictEqual(mg(M, A1).data.minute, null); assert.strictEqual(call('minutes.reopen', { meeting_id: M }, A).error.code, 409);
  const acts = state.sheets.audit_log.data.map(r => r[3]); ['minute.submit', 'minute.withdraw', 'minute.approve', 'minute.reopen'].forEach(a => assert.ok(acts.includes(a), a));
  call('minutes.submit', { meeting_id: M }, S); call('minutes.approve', { meeting_id: M }, A); assert.strictEqual(mg(M, A1).data.minute.status, 'Disahkan', 'Admin boleh mengesahkan');
});
t('lampirkan PDF bertandatangan: hanya bahan jenis Minit Aktif dalam mesyuarat itu; staf sahaja', () => {
  const up = (mid, type) => call('materials.upload', { meeting_id: mid, type, title: 'Minit TT', file_name: 'm.pdf', data_base64: Buffer.from('%PDF-1.4\n').toString('base64') }, S);
  const O = mk({ title: 'LAIN' }); pub(O); assert.ok(up(O, 'Minit').ok); assert.ok(up(M, 'Lampiran').ok); assert.ok(up(M, 'Minit').ok);
  const mats = get(M).materials, ok = mats.find(x => x.type === 'Minit').id, wrong = mats.find(x => x.type === 'Lampiran').id, other = get(O).materials[0].id;
  assert.strictEqual(call('minutes.attach', { meeting_id: M, material_id: wrong }, S).error.code, 400); assert.strictEqual(call('minutes.attach', { meeting_id: M, material_id: other }, S).error.code, 400, 'bahan mesyuarat lain'); assert.strictEqual(call('minutes.attach', { meeting_id: M, material_id: ok }, A1).error.code, 403);
  const r = call('minutes.attach', { meeting_id: M, material_id: ok }, S); assert.ok(r.ok, JSON.stringify(r)); assert.ok(r.data.minute.final_file_id.startsWith('FILE_')); assert.strictEqual(mg(M, A1).data.minute.final_file_id, r.data.minute.final_file_id);
  assert.strictEqual(call('minutes.attach', { meeting_id: O, material_id: other }, S).error.code, 409, 'belum ada minit');
});
t('minit mesyuarat lepas: maklumat pautan untuk "Pengesahan Minit" (hanya jika boleh diakses)', () => {
  const N = mk({ title: 'SETERUSNYA', prev_meeting_id: M }); pub(N);
  const p = mg(N, A1).data.prev; assert.deepStrictEqual([p.meeting_id, p.minute_status, p.accessible], [M, 'Disahkan', true]);
  const NA = mk({ title: 'SETERUSNYA2', prev_meeting_id: D, members: ['out@x.com'] }); pub(NA); const pp = mg(NA, OUT).data.prev; assert.strictEqual(pp.accessible, false, 'bukan ahli mesyuarat lepas'); assert.strictEqual(pp.minute_status, null);
});

// ===================== TINDAKAN =====================
const AM = mk({ title: 'TINDAKAN' }); const AD = mk({ title: 'DRAF TINDAKAN' }); pub(AM);
const addA = (tok, o, mid) => call('actions.save', Object.assign({ meeting_id: mid || AM, title: '5.1 Penambahbaikan Pengumuman Waktu Solat', owner_email: 'sec@x.com', due_date: myDate(7) }, o), tok);
const agId = (() => { call('agenda.save', { meeting_id: AM, title: 'Hal-hal Lain' }, S); return get(AM).agenda[0].id; })();
t('cipta tindakan: Admin, Setiausaha dan Pengerusi mesyuarat itu; ahli dan pengerusi mesyuarat lain ditolak', () => {
  const r = addA(S, { agenda_id: agId }); assert.ok(r.ok, JSON.stringify(r)); assert.ok(/^ACT-/.test(r.data.id)); assert.ok(addA(C, { owner_email: 'a1@x.com', title: 'Tindakan Pengerusi' }).ok); assert.ok(addA(A, { owner_email: 'a2@x.com', title: 'Admin' }).ok);
  [A1, A2, OUT, C2].forEach(tok => assert.ok([403].includes(addA(tok).error.code))); assert.strictEqual(addA(S, {}, AD).error.code, 409, 'mesyuarat Draf'); assert.strictEqual(addA(undefined).error.code, 401);
  const row = state.sheets.action_items.data.find(x => x[0] === r.data.id); assert.deepStrictEqual([row[6], row[11]], ['Baharu', '']);
});
t('validasi tindakan', () => {
  const bad = (o) => assert.strictEqual(addA(S, o).error.code, o.agenda_id ? 404 : 400, JSON.stringify(o).slice(0, 60));
  bad({ title: '' }); bad({ title: 'x'.repeat(301) }); bad({ owner_email: 'tiada@x.com' }); bad({ owner_email: 'bukan-emel' }); bad({ due_date: '2026-02-30' }); bad({ due_date: '01/12/2026' }); bad({ remarks: 'x'.repeat(1001) }); bad({ status: 'Ganjil' });
  assert.strictEqual(addA(S, { agenda_id: 'AGD-tiadatiada' }).error.code, 404); call('users.deactivate', { email: 'out@x.com' }, A); assert.strictEqual(addA(S, { owner_email: 'out@x.com' }).error.code, 400); call('users.save', { email: 'out@x.com', name: 'OUT', role: 'Ahli', status: 'Aktif' }, A);
  assert.ok(addA(S, { due_date: '', title: 'Tanpa tarikh' }).ok); assert.ok(addA(S, { remarks: 'x'.repeat(1000), title: 'Maklum balas penuh' }).ok);
});
t('senarai: staf dan Pengerusi nampak semua tindakan mesyuarat; ahli HANYA yang dia milik', () => {
  assert.ok(call('actions.list', { meeting_id: AM }, S).data.actions.length >= 5); assert.strictEqual(call('actions.list', { meeting_id: AM }, C).data.actions.length, call('actions.list', { meeting_id: AM }, S).data.actions.length);
  const mine = call('actions.list', { meeting_id: AM }, A1).data.actions; assert.ok(mine.length >= 1 && mine.every(x => x.owner_email === 'a1@x.com')); assert.ok(!JSON.stringify(mine).includes('sec@x.com'));
  assert.strictEqual(call('actions.list', { meeting_id: AM }, OUT).error.code, 403); assert.strictEqual(call('actions.list', { meeting_id: AD }, A1).error.code, 403); assert.strictEqual(get(AM, A1).my_action_count, mine.length); assert.strictEqual(get(AM, A2).my_action_count, 1);
  const x = call('actions.list', { meeting_id: AM }, S).data.actions[0]; assert.deepStrictEqual([x.meeting_title, x.bil, x.owner_name], ['TINDAKAN', '1', 'SEC']);
});
t('tertunggak dikira (bukan disimpan); Selesai/Dibatalkan tidak tertunggak; skop saya/tertunggak/semua; mesyuarat Dibatalkan dikecualikan', () => {
  const o1 = addA(S, { title: 'LEWAT-SATU', due_date: myDate(-3), owner_email: 'a1@x.com' }).data.id, o2 = addA(S, { title: 'LEWAT-SIAP', due_date: myDate(-3), owner_email: 'a1@x.com' }).data.id, o3 = addA(S, { title: 'LEWAT-BATAL', due_date: myDate(-3), owner_email: 'a1@x.com' }).data.id, ok1 = addA(S, { title: 'HARI-INI', due_date: myDate(0), owner_email: 'a1@x.com' }).data.id;
  call('actions.updateStatus', { id: o2, status: 'Selesai' }, A1); call('actions.updateStatus', { id: o3, status: 'Dibatalkan' }, S);
  const od = call('actions.list', { scope: 'tertunggak' }, S).data; const titles = od.actions.map(x => x.title); assert.ok(titles.includes('LEWAT-SATU') && !titles.includes('LEWAT-SIAP') && !titles.includes('LEWAT-BATAL') && !titles.includes('HARI-INI'));
  assert.ok(od.actions.every(x => x.overdue) && od.counts.overdue === od.actions.length); assert.ok(!state.sheets.action_items.data[0].includes('overdue'), 'tidak disimpan');
  const mine = call('actions.list', { scope: 'tertunggak' }, A1).data.actions; assert.deepStrictEqual(mine.map(x => x.title), ['LEWAT-SATU']); assert.strictEqual(call('actions.list', { scope: 'saya' }, S).data.actions.every(x => x.owner_email === 'sec@x.com'), true);
  const X = mk({ title: 'BATAL-TINDAKAN' }); pub(X); addA(S, { title: 'DALAM-BATAL', due_date: myDate(-5) }, X); call('meetings.cancel', { id: X }, S); assert.ok(!call('actions.list', { scope: 'semua' }, S).data.actions.some(x => x.title === 'DALAM-BATAL'));
  assert.strictEqual(call('actions.list', { scope: 'semua' }, OUT).data.actions.length, 0, 'bukan pemilik: kosong');
});
t('kemas kini: pemilik (status Baharu/Dalam Tindakan/Selesai + maklum balas); bukan pemilik 403; pemilik tidak boleh Dibatalkan; staf semua status', () => {
  const id = addA(S, { title: 'KEMASKINI', owner_email: 'a1@x.com' }).data.id; const up = (tok, o) => call('actions.updateStatus', Object.assign({ id }, o), tok);
  assert.strictEqual(up(A2, { status: 'Selesai' }).error.code, 403); assert.strictEqual(up(OUT, { remarks: 'x' }).error.code, 403); assert.strictEqual(up(C2, { status: 'Selesai' }).error.code, 403); assert.strictEqual(up(undefined, { status: 'Selesai' }).error.code, 401);
  assert.strictEqual(up(A1, { status: 'Dibatalkan' }).error.code, 400); assert.strictEqual(up(A1, { status: 'Ganjil' }).error.code, 400); assert.strictEqual(up(A1, {}).error.code, 400); assert.strictEqual(up(A1, { remarks: 'x'.repeat(1001) }).error.code, 400);
  let r = up(A1, { status: 'Dalam Tindakan', remarks: 'Sedang dirujuk kepada AWC.' }); assert.ok(r.ok, JSON.stringify(r)); assert.deepStrictEqual([r.data.action.status, r.data.action.remarks, r.data.action.completed_at], ['Dalam Tindakan', 'Sedang dirujuk kepada AWC.', '']);
  r = up(A1, { status: 'Selesai' }); assert.ok(/\+08:00$/.test(r.data.action.completed_at)); r = up(A1, { status: 'Dalam Tindakan' }); assert.strictEqual(r.data.action.completed_at, '', 'dibuka semula: tarikh selesai dikosongkan');
  assert.strictEqual(up(S, { status: 'Dibatalkan' }).data.action.status, 'Dibatalkan'); assert.strictEqual(up(C, { status: 'Baharu' }).data.action.status, 'Baharu', 'Pengerusi mesyuarat itu');
});
t('pemilik yang BUKAN ahli mesyuarat masih boleh melihat dan mengemas kini tindakannya sahaja', () => {
  const id = addA(S, { title: 'PEMILIK-LUAR', owner_email: 'out@x.com' }).data.id;
  const l = call('actions.list', {}, OUT).data.actions; assert.deepStrictEqual(l.map(x => x.title), ['PEMILIK-LUAR']); assert.ok(call('actions.updateStatus', { id, status: 'Selesai', remarks: 'Siap' }, OUT).ok);
  assert.strictEqual(call('actions.list', { meeting_id: AM }, OUT).error.code, 403, 'tetap tidak boleh melihat mesyuarat'); assert.strictEqual(call('meetings.get', { id: AM }, OUT).error.code, 403);
});
t('edit tindakan oleh pengurus: pemilik, tarikh, maklum balas dan status; milik mesyuarat lain tidak boleh disunting melalui meeting_id lain', () => {
  const id = addA(S, { title: 'EDIT-ASAL', owner_email: 'a1@x.com' }).data.id;
  const r = call('actions.save', { meeting_id: AM, id, title: 'EDIT-BARU', owner_email: 'a2@x.com', due_date: myDate(9), remarks: 'UHEI berpandangan...', status: 'Dalam Tindakan' }, C); assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.data.created, false);
  const x = call('actions.list', { meeting_id: AM }, S).data.actions.find(a => a.id === id); assert.deepStrictEqual([x.title, x.owner_email, x.status, x.remarks], ['EDIT-BARU', 'a2@x.com', 'Dalam Tindakan', 'UHEI berpandangan...']);
  const O = mk({ title: 'MESYUARAT LAIN' }); pub(O); assert.strictEqual(call('actions.save', { meeting_id: O, id, title: 'LOMPAT', owner_email: 'a1@x.com' }, S).error.code, 404, 'id tindakan milik mesyuarat lain');
});
t('"Perkara Berbangkit": tindakan belum selesai mesyuarat lepas dipulangkan kepada ahli mesyuarat berikutnya (tanpa maklum balas)', () => {
  const o = addA(S, { title: 'BELUM-SELESAI-LEPAS', owner_email: 'a1@x.com', remarks: 'MAKLUMBALAS-PERSENDIRIAN' }).data.id; const dn = addA(S, { title: 'SUDAH-SELESAI-LEPAS', owner_email: 'a1@x.com' }).data.id; call('actions.updateStatus', { id: dn, status: 'Selesai' }, S);
  const N = mk({ title: 'MESYUARAT SETERUSNYA', prev_meeting_id: AM, members: ['a2@x.com'] }); pub(N);
  const co = get(N, A2).carry_over; const titles = co.map(x => x.title); assert.ok(titles.includes('BELUM-SELESAI-LEPAS') && !titles.includes('SUDAH-SELESAI-LEPAS') && !titles.includes('LEWAT-BATAL'));
  assert.ok(!JSON.stringify(co).includes('MAKLUMBALAS-PERSENDIRIAN') && !('remarks' in co[0]), 'maklum balas tidak dikongsi'); assert.ok(co.every(x => x.owner_name && x.status));
  assert.strictEqual(get(AM, S).carry_over.length, 0)
});

// ===================== Emel tindakan tertunggak =====================
t('sendOverdueActions_: satu emel setiap pemilik tertunggak; tiada emel jika tiada; pengguna tidak aktif dan mesyuarat batal dilangkau; tiada maklum balas dalam emel', () => {
  state.mail.length = 0; const r = run('sendOverdueActions_()'); assert.ok(r.sent >= 1);
  const to = state.mail.map(m => m.to); assert.strictEqual(new Set(to).size, to.length, 'satu emel setiap pemilik'); const a1 = state.mail.find(m => m.to === 'a1@x.com'); assert.ok(a1.subject.startsWith('Tindakan tertunggak (') && a1.body.includes('LEWAT-SATU') && a1.body.includes('https://syura.contoh.my/#/actions'));
  assert.ok(!state.mail.map(m => m.body).join('\n').includes('MAKLUMBALAS-PERSENDIRIAN')); assert.ok(!state.mail.map(m => m.body).join('\n').includes('DALAM-BATAL')); assert.ok(logRows().some(x => x.type === 'action_overdue'));
  call('users.deactivate', { email: 'a1@x.com' }, A); state.mail.length = 0; run('sendOverdueActions_()'); assert.ok(!state.mail.some(m => m.to === 'a1@x.com')); call('users.save', { email: 'a1@x.com', name: 'A1', role: 'Ahli', status: 'Aktif' }, A);
  state.sheets.action_items.data.slice(1).forEach(r => { r[6] = 'Selesai'; }); state.mail.length = 0; assert.strictEqual(JSON.stringify(run('sendOverdueActions_()')), JSON.stringify({ sent: 0, failed: 0, skipped: 0 })); assert.strictEqual(state.mail.length, 0);
});
t('setupSystem memasang trigger mingguan tindakan tertunggak kini function wujud', () => { run('setupSystem()'); assert.deepStrictEqual(state.triggers.map(x => x.fn).sort(), ['backupWeekly_', 'sendDigest_', 'sendOverdueActions_', 'sendReminders_']); });

console.log(`\n${passed} ujian lulus` + (process.exitCode ? ', ADA YANG GAGAL' : ''));
