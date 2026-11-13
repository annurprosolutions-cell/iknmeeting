const assert = require('assert');
const { create } = require('./gas-harness');
let passed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('  GAGAL ' + name + '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

const h = create(); const { call, fetchMock, state, stats, run } = h;
const CID = 'client-123.apps.googleusercontent.com', FAKE = 'eyJ' + 'a'.repeat(40);
const login = (email) => { fetchMock.respond = () => ({ code: 200, body: { aud: CID, iss: 'accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 3600), email, email_verified: 'true' } }); const r = call('auth.login', { idToken: FAKE }); assert.ok(r.ok, JSON.stringify(r)); return r.data.token; };
run("ADMIN_EMAIL = 'admin@x.com'"); run('setupSystem()');
const A = login('admin@x.com');
['sec:Setiausaha', 'chair:Ahli', 'a1:Ahli', 'a2:Ahli', 'a3:Ahli'].forEach(x => { const [n, r] = x.split(':'); assert.ok(call('users.save', { email: n + '@x.com', name: n.toUpperCase(), role: r }, A).ok); });
const S = login('sec@x.com'), C = login('chair@x.com'), A1 = login('a1@x.com');
const myDate = (plus) => { const d = new Date(Date.now() + 8 * 3600e3 + plus * 86400e3); return d.toISOString().slice(0, 10); };
const BODY = { title: 'MESYUARAT JAWATANKUASA HMI IKN', bil: '2', tahun: '2026', date: myDate(10), start_time: '23:59', pengerusi_email: 'chair@x.com', members: ['a1@x.com', 'a2@x.com'] };
const mk = (extra) => { const r = call('meetings.create', Object.assign({}, BODY, extra), S); assert.ok(r.ok, JSON.stringify(r)); return r.data.id; };
const pub = (id) => { const r = call('meetings.publish', { id }, S); assert.ok(r.ok, JSON.stringify(r)); return r; };
const logRows = () => state.sheets.notification_log.data.slice(1).map(r => Object.fromEntries(state.sheets.notification_log.data[0].map((k, i) => [k, r[i]])));
const up = (id, o) => call('materials.upload', Object.assign({ meeting_id: id, type: 'Kertas Makluman', file_name: 'a.pdf', data_base64: Buffer.from('%PDF-1.4\n').toString('base64') }, o), S);
const URL = 'https://syura.contoh.my';
const backdatePublish = (id) => { const sh = state.sheets.audit_log; const H = sh.data[0]; sh.data.forEach((r, i) => { if (i && r[H.indexOf('action')] === 'meeting.publish' && r[H.indexOf('entity_id')] === id) r[H.indexOf('timestamp')] = '2001-01-01T00:00:00+08:00'; }); };

// ----- Tetapan -----
t('settings.get/set: Admin sahaja; kunci baca-sahaja ditolak; nilai disahkan', () => {
  assert.strictEqual(call('settings.get', {}, S).error.code, 403); assert.strictEqual(call('settings.set', { key: 'app_url', value: URL }, S).error.code, 403); assert.strictEqual(call('settings.set', { key: 'app_url', value: URL }, C).error.code, 403);
  const g = call('settings.get', {}, A).data.settings; assert.ok(g.find(x => x.key === 'app_url').editable); assert.ok(!g.find(x => x.key === 'root_folder_id').editable);
  ['root_folder_id', 'backup_folder_id', 'timezone', 'allowed_mime', 'bukan_wujud'].forEach(k => assert.strictEqual(call('settings.set', { key: k, value: 'x' }, A).error.code, 400, k));
  const bad = (k, v) => assert.strictEqual(call('settings.set', { key: k, value: v }, A).error.code, 400, k + '=' + v);
  bad('app_url', 'http://tak-selamat.my'); bad('app_url', 'https://a.my/?x=1'); bad('app_url', 'javascript:alert(1)'); bad('reminder_hours_before', 0); bad('reminder_hours_before', 500); bad('reminder_hours_before', 1.5); bad('backup_keep', 0); bad('max_upload_mb', 99); bad('max_upload_mb', 'abc'); bad('digest_enabled', 'mungkin'); bad('app_name', ''); bad('app_name', 'x'.repeat(61));
  bad('meeting_series', Array.from({ length: 21 }, (_, i) => 'Siri ' + i)); bad('meeting_series', ['x'.repeat(201)]);
});
t('settings.set: simpan, cache dikemas kini serta-merta, audit direkod', () => {
  assert.strictEqual(call('settings.set', { key: 'app_url', value: URL + '/' }, A).data.value, URL, 'garis condong akhir dibuang');
  assert.strictEqual(run('appUrl_()'), URL);
  assert.ok(call('settings.set', { key: 'meeting_series', value: '  Mesyuarat A  \nMesyuarat B\n\nMesyuarat A\n' }, A).ok);
  assert.deepStrictEqual(Array.from(call('me.get', {}, S).data.settings.meeting_series), ['Mesyuarat A', 'Mesyuarat B'], 'tersedia kepada klien melalui me.get');
  call('settings.set', { key: 'meeting_series', value: JSON.parse(run('SETTINGS_SEED[4][1]')) }, A);
  assert.ok(call('settings.set', { key: 'reminder_hours_before', value: '24' }, A).ok);
  assert.ok(state.sheets.audit_log.data.some(r => r[3] === 'settings.set' && r[5] === 'app_url' && r[6] === URL));
});

// ----- Jemputan -----
t('terbit: satu emel jemputan setiap ahli Aktif (tidak pendua); isi hanya tajuk, tarikh dan pautan; direkod', () => {
  const id = mk(); state.mail.length = 0; const r = pub(id);
  assert.deepStrictEqual(state.mail.map(m => m.to).sort(), ['a1@x.com', 'a2@x.com', 'chair@x.com', 'sec@x.com']);
  const m0 = state.mail[0]; assert.strictEqual(m0.name, 'SyuraDocs'); assert.ok(m0.subject.startsWith('Jemputan mesyuarat: MESYUARAT JAWATANKUASA HMI IKN Bil.2/2026'));
  assert.ok(m0.body.includes(URL + '/#/meetings/' + id)); assert.ok(m0.body.includes('23:59')); assert.ok(/Ahad|Isnin|Selasa|Rabu|Khamis|Jumaat|Sabtu/.test(m0.body));
  assert.deepStrictEqual(r.data.invite, { sent: 4, failed: 0, skipped: 0 });
  const rows = logRows().filter(x => x.meeting_id === id); assert.strictEqual(rows.length, 4); assert.ok(rows.every(x => x.type === 'invite' && x.status === 'Dihantar' && /^NTF-/.test(x.id) && /\+08:00$/.test(x.timestamp)));
});
t('notify_on_publish=FALSE: tiada emel; pengguna tidak aktif dilangkau', () => {
  const id = mk({ notify_on_publish: false }); state.mail.length = 0; pub(id); assert.strictEqual(state.mail.length, 0);
  const id2 = mk({ members: ['a1@x.com', 'a2@x.com'] }); call('users.deactivate', { email: 'a2@x.com' }, A); state.mail.length = 0; pub(id2);
  assert.ok(!state.mail.some(m => m.to === 'a2@x.com')); call('users.save', { email: 'a2@x.com', name: 'A2', role: 'Ahli', status: 'Aktif' }, A);
});
t('tanpa app_url: emel tiada pautan tetapi tidak gagal; mengandungi arahan guna senarai Mesyuarat', () => {
  call('settings.set', { key: 'app_url', value: '' }, A); const id = mk(); state.mail.length = 0; pub(id);
  assert.ok(state.mail.length === 4 && state.mail.every(m => !m.body.includes('http')) && state.mail[0].body.includes('senarai Mesyuarat'));
  call('settings.set', { key: 'app_url', value: URL }, A);
});
t('ahli ditambah SELEPAS terbit menerima jemputan; ahli sedia ada tidak diemel semula; Draf tidak', () => {
  const id = mk(); state.mail.length = 0; call('members.set', { meeting_id: id, emails: ['a1@x.com', 'a2@x.com', 'a3@x.com'] }, S); assert.strictEqual(state.mail.length, 0, 'Draf: tiada emel');
  pub(id); state.mail.length = 0; call('members.set', { meeting_id: id, emails: ['a1@x.com', 'a2@x.com', 'a3@x.com', 'chair@x.com', 'sec@x.com', 'admin@x.com'] }, S);
  assert.deepStrictEqual(state.mail.map(m => m.to).sort(), ['admin@x.com', 'sec@x.com'], 'hanya yang baru ditambah (sec dibuang semasa Draf, jadi dikira baharu); a1, a2, a3, chair tidak diemel semula');
});
t('batal / Selesai: tiada jemputan; ralat penghantaran dicatat Gagal tanpa menggagalkan terbit', () => {
  const id = mk(); state.mailFail = (to) => to === 'a1@x.com'; state.mail.length = 0; const r = pub(id); state.mailFail = null;
  assert.deepStrictEqual([r.data.invite.sent, r.data.invite.failed], [3, 1]); const bad = logRows().find(x => x.meeting_id === id && x.status === 'Gagal'); assert.ok(bad.to_email === 'a1@x.com' && /Mail gagal/.test(bad.error));
  assert.strictEqual(call('meetings.get', { id }, S).data.status, 'Dijadualkan');
});

// ----- Kuota -----
t('kuota tidak mencukupi: baki dilangkau dan direkod "Dilangkau"; yang sempat dihantar kekal', () => {
  const id = mk(); state.quota = 2; state.mail.length = 0; const r = pub(id); state.quota = 100;
  assert.deepStrictEqual([r.data.invite.sent, r.data.invite.skipped], [2, 2]); const rows = logRows().filter(x => x.meeting_id === id);
  assert.strictEqual(rows.filter(x => x.status === 'Dihantar').length, 2); const sk = rows.filter(x => x.status === 'Dilangkau'); assert.strictEqual(sk.length, 2); assert.ok(sk.every(x => /Kuota/.test(x.error)));
});
t('emel tidak sah dalam senarai: Gagal, bukan ralat', () => {
  const r = run("sendMailBatch_([{ to: 'bukan-emel', subject: 's', body: 'b', type: 'invite' }])"); assert.strictEqual(r.failed, 1);
});

// ----- Digest -----
let DM;
t('digest: garis dasar pada larian pertama; bahan baharu selepas terbit menghasilkan SATU emel bagi setiap ahli (bukan setiap fail)', () => {
  DM = mk(); pub(DM); backdatePublish(DM); const props = () => state.props.DIGEST_LAST_RUN;
  delete state.props.DIGEST_LAST_RUN; state.mail.length = 0; const first = run('sendDigest_()'); assert.ok(first.baseline); assert.strictEqual(state.mail.length, 0);
  state.props.DIGEST_LAST_RUN = '2000-01-01T00:00:00+08:00';
  assert.ok(up(DM, { title: 'Kertas Satu' }).ok); assert.ok(up(DM, { title: 'Kertas Dua', type: 'Memo' }).ok);
  state.mail.length = 0; const r = run('sendDigest_()');
  assert.deepStrictEqual(state.mail.map(m => m.to).sort(), ['a1@x.com', 'a2@x.com', 'chair@x.com'], 'sec memuat naik sendiri: tidak diemel'); assert.strictEqual(r.sent, 3);
  const b = state.mail.find(m => m.to === 'a1@x.com'); assert.ok(b.subject.includes('(2)') && b.body.includes('Kertas Satu') && b.body.includes('Kertas Dua') && b.body.includes(URL + '/#/meetings/' + DM));
  assert.ok(logRows().filter(x => x.type === 'digest').length >= 3);
});
t('digest: larian seterusnya tidak mengulang; pemuat naik tidak diemel tentang bahan sendiri', () => {
  state.mail.length = 0; run('sendDigest_()'); assert.strictEqual(state.mail.length, 0, 'tiada pendua');
  state.props.DIGEST_LAST_RUN = '2000-01-01T00:00:00+08:00'; state.mail.length = 0; run('sendDigest_()');
  assert.ok(!state.mail.some(m => m.to === 'sec@x.com'), 'Setiausaha memuat naik: tiada emel kepadanya'); assert.ok(state.mail.some(m => m.to === 'a1@x.com'));
});
t('digest: Bahan Bicara TIDAK pernah disebut; bahan semasa Draf dan mesyuarat tidak aktif dikecualikan', () => {
  state.props.DIGEST_LAST_RUN = '2000-01-01T00:00:00+08:00'; const D = mk(); up(D, { title: 'DRAF-RAHSIA' });
  const P = mk(); pub(P); backdatePublish(P); up(P, { type: 'Bahan Bicara', title: 'BICARA-RAHSIA-PENGARAH', file_name: 'b.doc', data_base64: Buffer.from('\xd0\xcf\x11\xe0x', 'latin1').toString('base64') }); up(P, { title: 'KERTAS-BIASA-P' });
  const X = mk(); pub(X); up(X, { title: 'BATAL-BAHAN' }); call('meetings.cancel', { id: X }, S);
  state.mail.length = 0; run('sendDigest_()'); const all = state.mail.map(m => m.subject + m.body).join('\n');
  assert.ok(!all.includes('BICARA-RAHSIA-PENGARAH') && !all.includes('DRAF-RAHSIA') && !all.includes('BATAL-BAHAN'), 'tiada kebocoran'); assert.ok(all.includes('KERTAS-BIASA-P'));
});
t('digest: bahan yang dimuat naik SEBELUM terbit tidak dimaklumkan lagi melalui digest (sudah dalam jemputan)', () => {
  const id = mk(); up(id, { title: 'SEBELUM-TERBIT' }); pub(id); state.props.DIGEST_LAST_RUN = '2000-01-01T00:00:00+08:00'; state.mail.length = 0; run('sendDigest_()');
  assert.ok(!state.mail.map(m => m.body).join('\n').includes('SEBELUM-TERBIT'));
});
t('digest: boleh dimatikan melalui tetapan', () => {
  call('settings.set', { key: 'digest_enabled', value: 'FALSE' }, A); state.props.DIGEST_LAST_RUN = '2000-01-01T00:00:00+08:00'; const id = mk(); pub(id); up(id, { title: 'TIADA-DIGEST' }); state.mail.length = 0;
  const r = run('sendDigest_()'); assert.ok(r.disabled); assert.strictEqual(state.mail.length, 0); call('settings.set', { key: 'digest_enabled', value: 'TRUE' }, A);
});

// ----- Peringatan -----
t('peringatan: esok (lalai 24 jam) dihantar sekali; lusa tidak; larian kedua tidak mengulang', () => {
  const tom = mk({ date: myDate(1), title: 'ESOK' }); pub(tom); const lusa = mk({ date: myDate(2), title: 'LUSA' }); pub(lusa);
  state.mail.length = 0; const r = run('sendReminders_()');
  const to = state.mail.filter(m => m.subject.includes('ESOK')); assert.strictEqual(to.length, 4); assert.ok(to[0].subject.includes('esok') && to[0].body.includes(URL + '/#/meetings/' + tom));
  assert.ok(!state.mail.some(m => m.subject.includes('LUSA')));
  state.mail.length = 0; run('sendReminders_()'); assert.ok(!state.mail.some(m => m.subject.includes('ESOK')), 'sekali sahaja');
});
t('peringatan: tetapan 48 jam = lusa turut diingatkan; Draf, Selesai dan yang sudah bermula tidak', () => {
  call('settings.set', { key: 'reminder_hours_before', value: '48' }, A); state.mail.length = 0; run('sendReminders_()'); assert.ok(state.mail.some(m => m.subject.includes('LUSA') && m.subject.includes('pada')));
  call('settings.set', { key: 'reminder_hours_before', value: '24' }, A);
  const draf = mk({ date: myDate(1), title: 'DRAF-ESOK' }); const sel = mk({ date: myDate(1), title: 'SELESAI-ESOK' }); pub(sel); call('meetings.setStatus', { id: sel, status: 'Sedang Berlangsung' }, S); call('meetings.setStatus', { id: sel, status: 'Selesai' }, S);
  const nowHm = new Date(Date.now() + 8 * 3600e3).toISOString().slice(11, 16); const started = mk({ date: myDate(0), start_time: '00:00', title: 'SUDAH-MULA' }); if (nowHm > '00:00') pub(started);
  state.mail.length = 0; run('sendReminders_()'); const all = state.mail.map(m => m.subject).join('\n'); assert.ok(!/DRAF-ESOK|SELESAI-ESOK|SUDAH-MULA/.test(all));
});
t('peringatan: ahli yang baru ditambah selepas peringatan pertama masih diingatkan', () => {
  const id = mk({ date: myDate(1), title: 'TAMBAH-LEWAT', notify_on_publish: false }); pub(id); state.mail.length = 0; run('sendReminders_()'); assert.strictEqual(state.mail.filter(m => m.subject.includes('TAMBAH-LEWAT')).length, 4);
  call('members.set', { meeting_id: id, emails: ['a1@x.com', 'a2@x.com', 'a3@x.com'] }, S); state.mail.length = 0; run('sendReminders_()'); assert.deepStrictEqual(state.mail.filter(m => m.subject.includes('TAMBAH-LEWAT')).map(m => m.to), ['a3@x.com']);
});
t('emel tidak pernah mengandungi komen, nama bahan terhad atau kandungan lain', () => {
  const id = mk(); pub(id); call('feedback.add', { meeting_id: id, target_type: 'Mesyuarat', target_id: id, content: 'KOMEN-RAHSIA-XYZ' }, C);
  state.props.DIGEST_LAST_RUN = '2000-01-01T00:00:00+08:00'; state.mail.length = 0; run('sendDigest_()'); run('sendReminders_()');
  assert.ok(!state.mail.map(m => m.subject + m.body).join('\n').includes('KOMEN-RAHSIA-XYZ'));
});

// ----- Audit log -----
t('audit.list: Admin sahaja; terbaru dahulu; tapis email/tindakan/tarikh; halaman', () => {
  [S, C, A1].forEach(tok => assert.strictEqual(call('audit.list', {}, tok).error.code, 403)); assert.strictEqual(call('audit.list', {}, undefined).error.code, 401);
  const r = call('audit.list', {}, A).data; assert.ok(r.total > 20 && r.rows.length === 50 && r.actions.includes('meeting.publish') && r.actions.includes('settings.set') && r.actions.includes('login'));
  const ts = r.rows.map(x => x.timestamp); assert.deepStrictEqual(ts, ts.slice().sort().reverse());
  const pubs = call('audit.list', { action: 'meeting.publish' }, A).data; assert.ok(pubs.rows.length > 5 && pubs.rows.every(x => x.action === 'meeting.publish'));
  assert.ok(call('audit.list', { email: 'SEC@x' }, A).data.rows.every(x => x.email.includes('sec@x'))); const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const todayCount = state.sheets.audit_log.data.slice(1).filter(r => r[1].slice(0, 10) === day).length; assert.strictEqual(call('audit.list', { from: day, to: day }, A).data.total, todayCount, 'tapis tarikh'); assert.ok(todayCount > 0 && todayCount < call('audit.list', {}, A).data.total + 1); assert.strictEqual(call('audit.list', { to: '2000-01-01' }, A).data.total, 0);
  const p2 = call('audit.list', { offset: 50, limit: 10 }, A).data; assert.strictEqual(p2.rows.length, 10); assert.notStrictEqual(p2.rows[0].id, r.rows[0].id); assert.strictEqual(call('audit.list', { limit: 9999 }, A).data.limit, 200);
});
t('audit tidak boleh diubah/dipadam melalui API; tindakan sensitif direkod', () => {
  ['audit.delete', 'audit.update', 'audit.save', 'audit.clear'].forEach(a => assert.strictEqual(call(a, { id: 'AUD-x' }, A).error.code, 404));
  fetchMock.respond = () => ({ code: 200, body: { aud: CID, iss: 'accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 3600), email: 'orang.luar@x.com', email_verified: 'true' } }); call('auth.login', { idToken: FAKE });
  const acts = new Set(state.sheets.audit_log.data.slice(1).map(r => r[3]));
  ['login', 'login_gagal', 'user.create', 'user.deactivate', 'meeting.create', 'meeting.publish', 'meeting.cancel', 'meeting.status', 'members.set', 'material.upload', 'settings.set'].forEach(a => assert.ok(acts.has(a), 'tiada audit: ' + a));
});
t('notifications.list: Admin sahaja; tapis jenis/status/penerima; kiraan dan baki kuota', () => {
  [S, C].forEach(tok => assert.strictEqual(call('notifications.list', {}, tok).error.code, 403));
  const r = call('notifications.list', {}, A).data; assert.ok(r.total > 20 && r.counts.Dihantar > 0 && r.counts.Dilangkau >= 2 && r.counts.Gagal >= 1 && typeof r.quota_remaining === 'number');
  assert.ok(call('notifications.list', { type: 'digest' }, A).data.rows.every(x => x.type === 'digest')); assert.ok(call('notifications.list', { status: 'Dilangkau' }, A).data.rows.every(x => x.status === 'Dilangkau'));
  assert.ok(call('notifications.list', { to: 'A1@' }, A).data.rows.every(x => x.to_email.includes('a1@'))); assert.strictEqual(call('notifications.list', { limit: 5 }, A).data.rows.length, 5);
});

// ----- Backup -----
t('backup.run: Admin sahaja; salinan dalam folder Backup (di luar folder akar); nama DB-YYYY-MM-DD; audit', () => {
  [S, C].forEach(tok => assert.strictEqual(call('backup.run', {}, tok).error.code, 403)); assert.strictEqual(call('backup.list', {}, S).error.code, 403);
  const r = call('backup.run', {}, A); assert.ok(r.ok, JSON.stringify(r)); const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); assert.strictEqual(r.data.name, 'DB-' + day);
  const f = state.files.find(x => x.id === r.data.id); assert.strictEqual(f.parent.name, 'SyuraDocs Backup'); assert.ok(!f.parent.parent, 'bukan di bawah folder akar');
  assert.ok(state.sheets.audit_log.data.some(x => x[3] === 'backup.run'));
});
t('backup: run 9+ kali -> hanya 8 salinan terkini kekal (yang lama dibuang); nama tidak bertembung', () => {
  for (let i = 0; i < 9; i++) assert.ok(call('backup.run', {}, A).ok);
  const list = call('backup.list', {}, A).data; assert.strictEqual(list.backups.length, 8); assert.strictEqual(list.keep, 8); assert.strictEqual(new Set(list.backups.map(b => b.name)).size, 8, 'nama unik');
  const times = list.backups.map(b => b.created_at); assert.deepStrictEqual(times, times.slice().sort().reverse(), 'terkini dahulu');
  const trashed = state.files.filter(f => /^DB-/.test(f.name) && f.trashed); assert.ok(trashed.length >= 2);
  const newest = state.files.filter(f => /^DB-/.test(f.name) && !f.trashed).sort((a, b) => b.seq - a.seq).slice(0, 8).map(f => f.id).sort(); assert.deepStrictEqual(list.backups.length && newest.length, 8);
});
t('backup_keep boleh dilaras melalui tetapan', () => { call('settings.set', { key: 'backup_keep', value: '3' }, A); call('backup.run', {}, A); assert.strictEqual(call('backup.list', {}, A).data.backups.length, 3); call('settings.set', { key: 'backup_keep', value: '8' }, A); });
t('backupWeekly_ (trigger): berjaya direkod "sistem"; kegagalan direkod, tidak melempar ralat', () => {
  const before = state.sheets.audit_log.data.length; run('backupWeekly_()'); assert.ok(state.sheets.audit_log.data.slice(before).some(r => r[2] === 'sistem' && r[3] === 'backup.run'));
  const bf = run('getSettings_().backup_folder_id'); run("setSettingValue_('backup_folder_id', 'FOLDER_TIADA'); invalidateSettings_()");
  assert.doesNotThrow(() => run('backupWeekly_()')); assert.ok(state.sheets.audit_log.data.some(r => r[2] === 'sistem' && r[3] === 'backup.gagal'));
  run("setSettingValue_('backup_folder_id', '" + bf + "'); invalidateSettings_()");
});
t('setupSystem mengalihkan folder Backup lama keluar daripada folder akar (Setiausaha tidak boleh baca salinan DB)', () => {
  const root = state.folders.find(f => f.name === 'e-Mesyuarat IKN'); const bk = state.folders.find(f => f.name === 'SyuraDocs Backup');
  bk.parent = root; bk.name = 'Backup'; assert.ok(bk.parent === root);
  const msg = run('setupSystem()'); assert.ok(!bk.parent || bk.parent === state.myRoot, 'dialihkan'); assert.strictEqual(bk.name, 'SyuraDocs Backup'); assert.ok(/dialihkan keluar/.test(msg));
  assert.strictEqual(run('getSettings_().backup_folder_id'), bk.id, 'ID tidak berubah');
});

console.log(`\n${passed} ujian lulus` + (process.exitCode ? ', ADA YANG GAGAL' : ''));
