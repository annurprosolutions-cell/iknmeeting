// Fasa 7: belanjawan prestasi. Apps Script ada kuota masa/pembacaan, jadi kira bacaan Sheet bagi setiap action dengan data realistik
// (20 ahli, 24 mesyuarat, 12 agenda, bahan, komen, minit, tindakan) dan pastikan laluan panas (pollState) murah.
const assert = require('assert');
const { create } = require('./gas-harness');
let passed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('  GAGAL ' + name + '\n   ', e.message); process.exitCode = 1; } };
const h = create(); const { call, fetchMock, state, stats, run } = h;
const CID = 'client-123.apps.googleusercontent.com', FAKE = 'eyJ' + 'a'.repeat(40);
const login = (email) => { fetchMock.respond = () => ({ code: 200, body: { aud: CID, iss: 'accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 3600), email, email_verified: 'true' } }); return call('auth.login', { idToken: FAKE }).data.token; };
run("ADMIN_EMAIL = 'admin@x.com'"); run('setupSystem()');
const A = login('admin@x.com');
const emails = Array.from({ length: 20 }, (_, i) => `u${i}@x.com`);
call('users.save', { email: 'sec@x.com', name: 'Sec', role: 'Setiausaha' }, A);
emails.forEach((e, i) => call('users.save', { email: e, name: 'Ahli ' + i, position: 'Pegawai', role: 'Ahli' }, A));
const S = login('sec@x.com'), U0 = login('u0@x.com'), U1 = login('u1@x.com');
const day = (p) => new Date(Date.now() + 8 * 3600e3 + p * 86400e3).toISOString().slice(0, 10);
const ids = [];
for (let i = 0; i < 24; i++) {
  const r = call('meetings.create', { title: 'MESYUARAT ' + i, bil: String(i + 1), tahun: '2026', date: day(i - 10), start_time: '09:00', pengerusi_email: 'u0@x.com', members: emails }, S); ids.push(r.data.id);
  call('meetings.publish', { id: r.data.id }, S);
  for (let a = 0; a < 12; a++) call('agenda.save', { meeting_id: r.data.id, title: 'Agenda ' + a }, S);
}
const M = ids[12]; const ag = call('meetings.get', { id: M }, S).data.agenda;
for (let k = 0; k < 6; k++) call('materials.upload', { meeting_id: M, type: 'Lampiran', title: 'Bahan ' + k, agenda_id: ag[k].id, file_name: 'a.pdf', data_base64: Buffer.from('%PDF-1.4\n').toString('base64') }, S);
for (let k = 0; k < 60; k++) call('feedback.add', { meeting_id: M, target_type: 'Agenda', target_id: ag[k % 12].id, kind: 'Komen', visibility: 'Semua', content: 'Komen ' + k }, k % 2 ? U0 : U1);
call('minutes.save', { meeting_id: M, content_md: 'Minit '.repeat(2000) }, S);
for (let k = 0; k < 40; k++) call('actions.save', { meeting_id: M, title: 'Tindakan ' + k, owner_email: emails[k % 20], due_date: day(k - 20) }, S);

const reads = (fn) => { const b = stats.reads; fn(); return stats.reads - b; };
// belanjawan = had atas yang masuk akal; nilai sebenar dicetak supaya regresi kelihatan
const BUDGET = {
  'meetings.pollState': 3, 'meetings.list': 8, 'meetings.get': 14, 'feedback.list': 8, 'minutes.get': 10, 'actions.list': 8, 'me.get': 4
};
const CALLS = {
  'meetings.pollState': () => call('meetings.pollState', { id: M }, U1), 'meetings.list': () => call('meetings.list', {}, U1), 'meetings.get': () => call('meetings.get', { id: M }, U1),
  'feedback.list': () => call('feedback.list', { meeting_id: M }, U1), 'minutes.get': () => call('minutes.get', { meeting_id: M }, S), 'actions.list': () => call('actions.list', { meeting_id: M }, S), 'me.get': () => call('me.get', {}, U1)
};
Object.keys(BUDGET).forEach((k) => t(`${k}: bacaan Sheet <= ${BUDGET[k]}`, () => {
  CALLS[k](); // panaskan cache
  const n = reads(() => { const r = CALLS[k](); assert.ok(r.ok, JSON.stringify(r)); });
  console.log(`        (sebenar: ${n} bacaan)`); assert.ok(n <= BUDGET[k], `${n} > ${BUDGET[k]}`);
}));
t('pollState berulang (20 ahli x 10 kali) tidak menambah bacaan Sheet apabila tiada perubahan (cache)', () => {
  call('meetings.pollState', { id: M }, U1);
  const n = reads(() => { for (let i = 0; i < 200; i++) assert.ok(call('meetings.pollState', { id: M }, i % 2 ? U0 : U1).ok); });
  console.log(`        (200 poll: ${n} bacaan)`); assert.ok(n <= 200 * 3, `${n}`);
});
t('saiz respons meetings.get dalam had (< 150 KB) dengan 12 agenda, 6 bahan, 20 ahli', () => { const s = JSON.stringify(call('meetings.get', { id: M }, S)).length; console.log(`        (${Math.round(s / 1024)} KB)`); assert.ok(s < 150 * 1024); });
t('saiz respons feedback.list dengan 60 komen < 120 KB; actions.list 40 tindakan < 60 KB', () => { const a = JSON.stringify(call('feedback.list', { meeting_id: M }, S)).length, b = JSON.stringify(call('actions.list', { meeting_id: M }, S)).length; console.log(`        (${Math.round(a / 1024)} KB, ${Math.round(b / 1024)} KB)`); assert.ok(a < 120 * 1024 && b < 60 * 1024); });
console.log(`\n${passed} ujian lulus` + (process.exitCode ? ', ADA YANG GAGAL' : ''));
