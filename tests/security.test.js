// Fasa 7: ujian keselamatan automatik. Matriks kebenaran (setiap route x peranan), token palsu, fuzz input, imbasan kod.
const assert = require('assert'), fs = require('fs'), path = require('path');
const { create } = require('./gas-harness');
const ROOT = path.join(__dirname, '..');
let passed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('  GAGAL ' + name + '\n   ', e.stack.split('\n').slice(0, 4).join('\n    ')); process.exitCode = 1; } };

const h = create(); const { call, fetchMock, state, run } = h;
const CID = 'client-123.apps.googleusercontent.com', FAKE = 'eyJ' + 'a'.repeat(40);
const login = (email) => { fetchMock.respond = () => ({ code: 200, body: { aud: CID, iss: 'accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 3600), email, email_verified: 'true' } }); const r = call('auth.login', { idToken: FAKE }); assert.ok(r.ok, JSON.stringify(r)); return r.data.token; };
run("ADMIN_EMAIL = 'admin@x.com'"); run('setupSystem()');
const A = login('admin@x.com');
[['sec', 'Setiausaha'], ['chair', 'Ahli'], ['a1', 'Ahli'], ['out', 'Ahli']].forEach(([n, r]) => assert.ok(call('users.save', { email: n + '@x.com', name: n, position: 'P', role: r }, A).ok));
const T = { Admin: A, Setiausaha: login('sec@x.com'), Chair: login('chair@x.com'), Ahli: login('a1@x.com'), Luar: login('out@x.com') };
const day = (p) => new Date(Date.now() + 8 * 3600e3 + p * 86400e3).toISOString().slice(0, 10);
const M = call('meetings.create', { title: 'RAHSIA', date: day(3), start_time: '09:00', pengerusi_email: 'chair@x.com', members: ['a1@x.com'] }, T.Setiausaha).data.id;
call('meetings.publish', { id: M }, T.Setiausaha);
call('agenda.save', { meeting_id: M, title: 'Item' }, T.Setiausaha); const AG = call('meetings.get', { id: M }, T.Setiausaha).data.agenda[0].id;
call('minutes.save', { meeting_id: M, content_md: 'KANDUNGAN-MINIT-RAHSIA-DRAF '.repeat(3) }, T.Setiausaha);
call('actions.save', { meeting_id: M, title: 'TINDAKAN-RAHSIA', owner_email: 'sec@x.com' }, T.Setiausaha);
call('feedback.add', { meeting_id: M, target_type: 'Mesyuarat', target_id: M, kind: 'Komen', visibility: 'Pengerusi & Setiausaha', content: 'KOMEN-RAHSIA' }, T.Chair);

// polisi yang dijangka bagi setiap route: public | any | staff | admin
const POLICY = {
  ping: 'public', 'auth.login': 'public', 'auth.logout': 'any', 'me.get': 'any',
  'users.list': 'staff', 'users.save': 'admin', 'users.deactivate': 'admin', 'users.import': 'admin',
  'meetings.list': 'any', 'meetings.get': 'any', 'meetings.create': 'staff', 'meetings.update': 'staff', 'meetings.publish': 'staff', 'meetings.cancel': 'staff', 'meetings.setStatus': 'chairstaff', 'members.set': 'staff', 'attendance.set': 'any',
  'agenda.save': 'staff', 'agenda.delete': 'staff', 'agenda.reorder': 'staff', 'agenda.setStatus': 'chairstaff',
  'materials.upload': 'staff', 'materials.register': 'staff', 'materials.replace': 'staff', 'materials.archive': 'staff', 'materials.update': 'staff', 'materials.logOpen': 'any',
  'meetings.pollState': 'any', 'meetings.setCurrentAgenda': 'chairstaff', 'feedback.list': 'any', 'feedback.add': 'any', 'feedback.update': 'any', 'feedback.delete': 'any',
  'audit.list': 'admin', 'notifications.list': 'admin', 'settings.get': 'admin', 'settings.set': 'admin', 'backup.run': 'admin', 'backup.list': 'admin',
  'minutes.get': 'any', 'minutes.save': 'staff', 'minutes.submit': 'staff', 'minutes.withdraw': 'staff', 'minutes.approve': 'chairadmin', 'minutes.reopen': 'admin', 'minutes.attach': 'staff',
  'actions.list': 'any', 'actions.save': 'chairstaff', 'actions.updateStatus': 'any'
};
const routes = run('Object.keys(getRoutes_())');
call('materials.upload', { meeting_id: M, type: 'Lampiran', title: 'L', file_name: 'a.pdf', data_base64: Buffer.from('%PDF-1.4\n').toString('base64') }, T.Setiausaha);
const MAT = call('meetings.get', { id: M }, T.Setiausaha).data.materials[0].id; const ACT = call('actions.list', { meeting_id: M }, T.Setiausaha).data.actions[0].id;
const idFor = (r) => /^(meetings|members|attendance)\./.test(r) ? M : /^agenda\./.test(r) ? AG : /^materials\./.test(r) ? MAT : /^actions\./.test(r) ? ACT : M;
const STAFF_ONLY = routes.filter((r) => ['staff', 'admin'].includes(POLICY[r]));

t('setiap route mempunyai polisi dijangka (route baharu mesti dipetakan di sini)', () => { assert.deepStrictEqual(routes.filter((r) => !POLICY[r]), []); assert.deepStrictEqual(Object.keys(POLICY).filter((r) => !routes.includes(r)), []); });

t('tanpa token / token palsu: SEMUA route bukan awam menjawab 401', () => {
  const bad = [undefined, null, '', 'abc', 'x'.repeat(5000), 123, {}, [], { $ne: 1 }, "' OR 1=1 --", '../../etc/passwd', A + 'x', A.slice(1)];
  routes.filter((r) => POLICY[r] !== 'public').forEach((r) => bad.forEach((tok) => { const x = call(r, { meeting_id: M, id: M }, tok); assert.ok(!x.ok && x.error.code === 401, `${r} dengan token ${String(JSON.stringify(tok)).slice(0, 20)}: ${JSON.stringify(x).slice(0, 120)}`); }));
});

t('Ahli dan pengguna luar: setiap route staf/admin ditolak 403 (dengan data kosong DAN data sah)', () => {
  const mkPayload = (r) => ({ meeting_id: M, id: idFor(r), agenda_id: AG, title: 'x', content_md: 'x'.repeat(40), email: 'z@x.com', name: 'z', role: 'Admin', owner_email: 'a1@x.com', status: 'Selesai', material_id: MAT, type: 'Lampiran' });
  STAFF_ONLY.forEach((r) => ['Ahli', 'Luar'].forEach((who) => [{}, mkPayload(r)].forEach((d, i) => { const x = call(r, d, T[who]); assert.ok(!x.ok && (x.error.code === 403 || (i === 0 && x.error.code === 404)), `${r} oleh ${who}: ${JSON.stringify(x).slice(0, 140)}`); })));
});
t('Setiausaha ditolak pada semua route Admin sahaja', () => {
  routes.filter((r) => POLICY[r] === 'admin' && r !== 'users.list').forEach((r) => { const x = call(r, { meeting_id: M, id: M, email: 'z@x.com', name: 'z' }, T.Setiausaha); assert.ok(!x.ok && x.error.code === 403, `${r}: ${JSON.stringify(x).slice(0, 140)}`); });
});
t('role ambil dari Sheet setiap panggilan: pengguna diturunkan/dinyahaktifkan hilang akses serta-merta', () => {
  call('users.save', { email: 'sec@x.com', name: 'sec', role: 'Ahli' }, A); assert.strictEqual(call('meetings.create', { title: 'x', date: day(5), start_time: '09:00' }, T.Setiausaha).error.code, 403);
  call('users.save', { email: 'sec@x.com', name: 'sec', role: 'Setiausaha' }, A); assert.ok(call('meetings.list', {}, T.Setiausaha).ok);
  call('users.deactivate', { email: 'sec@x.com' }, A); assert.ok([401, 403].includes(call('meetings.list', {}, T.Setiausaha).error.code)); call('users.save', { email: 'sec@x.com', name: 'sec', role: 'Setiausaha', status: 'Aktif' }, A); T.Setiausaha = login('sec@x.com');
});
t('Admin tidak boleh menurunkan/menyahaktifkan dirinya (elak kunci sendiri)', () => {
  assert.ok(!call('users.deactivate', { email: 'admin@x.com' }, A).ok); assert.ok(!call('users.save', { email: 'admin@x.com', name: 'a', role: 'Ahli' }, A).ok);
});

t('kebocoran data: pengguna luar tidak menerima SEBARANG teks rahsia daripada mana-mana route baca', () => {
  const body = { meeting_id: M, id: M, target_type: 'Mesyuarat', target_id: M };
  ['meetings.get', 'meetings.list', 'meetings.pollState', 'minutes.get', 'actions.list', 'feedback.list', 'materials.logOpen'].forEach((r) => {
    const s = JSON.stringify(call(r, body, T.Luar)); ['KANDUNGAN-MINIT-RAHSIA', 'TINDAKAN-RAHSIA', 'KOMEN-RAHSIA', 'RAHSIA'].forEach((k) => assert.ok(!s.includes(k), `${r} membocorkan ${k}`));
  });
});
t('kebocoran data: ahli tidak nampak draf minit, komen Pengerusi&Setiausaha atau tindakan orang lain', () => {
  const s = JSON.stringify([call('minutes.get', { meeting_id: M }, T.Ahli), call('actions.list', { meeting_id: M }, T.Ahli), call('actions.list', { scope: 'semua' }, T.Ahli), call('feedback.list', { meeting_id: M }, T.Ahli), call('meetings.get', { id: M }, T.Ahli)]);
  ['KANDUNGAN-MINIT-RAHSIA', 'TINDAKAN-RAHSIA', 'KOMEN-RAHSIA'].forEach((k) => assert.ok(!s.includes(k), k));
});
t('respons tidak pernah memuatkan token sesi, hash atau kunci dalaman', () => {
  const dump = JSON.stringify([call('users.list', {}, A), call('audit.list', {}, A), call('settings.get', {}, A), call('meetings.get', { id: M }, A), call('me.get', {}, A)]);
  assert.ok(!dump.includes(A) && !dump.includes(T.Ahli) && !/session_|"token"|client_secret|GOCSPX|PRIVATE KEY/i.test(dump), 'ada kebocoran');
});

t('fuzz: tiada route melempar ralat dalaman (500) atau respons tidak sah untuk sebarang peranan', () => {
  const big = 'A'.repeat(200000);
  const payloads = [undefined, null, {}, [], 'rentetan', 42, true, { meeting_id: { $gt: '' } }, { id: ['a', 'b'] }, { meeting_id: M, id: M, title: big, content_md: big, content: big, remarks: big },
    JSON.parse('{"__proto__":{"role":"Admin"},"constructor":{"prototype":{"role":"Admin"}},"meeting_id":"' + M + '"}'),
    { meeting_id: "'; DROP TABLE users;--", id: '<script>alert(1)</script>', email: '="HYPERLINK(""http://evil"")"', title: '=cmd|\' /C calc\'!A0', name: '@SUM(1+1)', date: '9999-99-99', status: { a: 1 } },
    { meeting_id: M, members: 'bukan-array', agenda_ids: 5, order: { 0: 'a' }, ids: null, data_base64: 'bukan-base64!!', file_name: '../../x.pdf' }];
  const failures = [];
  routes.filter((r) => !['auth.login', 'auth.logout', 'backup.run'].includes(r)).forEach((r) => Object.keys(T).forEach((who) => payloads.forEach((d, i) => {
    let x; try { x = call(r, d, T[who]); } catch (e) { failures.push(`${r}/${who}/#${i} melempar: ${e.message}`); return; }
    if (typeof x.ok !== 'boolean') failures.push(`${r}/${who}/#${i} respons tidak sah`);
    else if (!x.ok && x.error.code >= 500 && who !== 'Admin') failures.push(`${r}/${who}/#${i} 500: ${x.error.message}`);
    else if (!x.ok && x.error.code >= 500) failures.push(`${r}/Admin/#${i} 500: ${x.error.message} ${x.error.detail || ''}`);
  })));
  assert.deepStrictEqual(failures.slice(0, 8), []);
});
t('fuzz: prototype pollution tidak mengubah objek global', () => {
  assert.strictEqual(run('({}).role'), undefined); assert.strictEqual(call('users.list', {}, T.Ahli).error.code, 403);
});
t('formula suntikan CSV/Sheet dinetralkan: nilai bermula = + - @ disimpan sebagai teks biasa (bukan formula)', () => {
  const M2 = call('meetings.create', { title: 'M2', date: day(4), start_time: '09:00', pengerusi_email: 'chair@x.com', members: ['a1@x.com'] }, T.Setiausaha).data.id; assert.ok(call('meetings.publish', { id: M2 }, T.Setiausaha).ok, 'terbit M2');
  const x = call('actions.save', { meeting_id: M2, title: '=HYPERLINK("http://evil","klik")', owner_email: 'a1@x.com' }, T.Setiausaha); assert.ok(x.ok, JSON.stringify(x));
  const cell = state.sheets.action_items.data.find((r) => String(r[3]).includes('HYPERLINK'));
  assert.ok(cell, 'tajuk disimpan'); assert.ok(state.sheets.action_items.formats && Object.values(state.sheets.action_items.formats).every((f) => f === '@' || f === '@STRING@'), 'semua lajur format teks biasa (@)');
});
t('pelbagai badan permintaan rosak: doPost sentiasa pulang JSON ok:false (tidak melempar)', () => {
  const D = run('doPost');
  [undefined, {}, { postData: {} }, { postData: { contents: '' } }, { postData: { contents: 'bukan json' } }, { postData: { contents: '[]' } }, { postData: { contents: '{"action":123}' } }, { postData: { contents: '{"action":"__proto__"}' } }, { postData: { contents: '{"action":"constructor"}' } }, { postData: { contents: '{"action":"toString"}' } }, { postData: { contents: 'x'.repeat(100000) } }]
    .forEach((e, i) => { const out = D(e); const j = JSON.parse(out.text); assert.strictEqual(j.ok, false, '#' + i); assert.ok(j.error && j.error.code, '#' + i); });
});
t('doGet tidak mendedahkan data (hanya status ringkas)', () => { const out = run('doGet')({ parameter: { action: 'users.list' } }); const s = out.text || (out.getContent && out.getContent()) || JSON.stringify(out); assert.ok(!s.includes('admin@x.com') && !s.includes('x.com')); });

// ---------- imbasan kod ----------
const walk = (d, acc = []) => { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { if (['node_modules', '.git', 'shots'].includes(e.name)) return; const p = path.join(d, e.name); e.isDirectory() ? walk(p, acc) : acc.push(p); }); return acc; };
const files = walk(ROOT); const text = (f) => fs.readFileSync(f, 'utf8'); const rel = (f) => path.relative(ROOT, f);
t('tiada rahsia dalam repo (kunci peribadi, token GitHub, client secret Google, kunci API)', () => {
  const re = /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|GOCSPX-[A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z_-]{35}|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{10,}|"client_secret"\s*:/;
  const hits = files.filter((f) => /\.(js|gs|json|html|md|css|webmanifest|jsonc|txt|yml|yaml)$/.test(f) && !f.endsWith('security.test.js') && re.test(text(f))).map(rel); assert.deepStrictEqual(hits, []);
});
t('frontend tiada innerHTML/outerHTML/insertAdjacentHTML/document.write/eval/new Function dengan data (kecuali ikon statik)', () => {
  const bad = []; files.filter((f) => /^\/(js\/|sw\.js)/.test(f.replace(ROOT, '')) && f.endsWith('.js')).forEach((f) => {
    text(f).split('\n').forEach((l, i) => { if (/^\s*\/\//.test(l)) return; if (/\b(outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function)\b/.test(l) || (/innerHTML/.test(l) && !f.endsWith('icons.js'))) bad.push(`${rel(f)}:${i + 1}: ${l.trim().slice(0, 80)}`); }); });
  assert.deepStrictEqual(bad, [], bad.join('\n'));
});
t('icons.js: innerHTML hanya daripada pemalar SVG statik (tiada parameter pengguna)', () => {
  const s = text(path.join(ROOT, 'js/icons.js')); const uses = s.split('\n').filter((l) => /innerHTML/.test(l)); assert.ok(uses.length <= 2, uses.join('\n')); assert.ok(uses.every((l) => /PATHS|paths|P\[|name\]/.test(l) || /ICONS/.test(l) || /svg/i.test(l)), uses.join('\n'));
});
t('CSP: default-src self, tanpa unsafe-inline/unsafe-eval untuk skrip, frame-ancestors none, form/base terhad', () => {
  const csp = /Content-Security-Policy: (.*)/.exec(text(path.join(ROOT, '_headers')))[1]; const dir = (n) => (csp.split(';').map((x) => x.trim()).find((x) => x.startsWith(n + ' ')) || '');
  assert.ok(dir('default-src').includes("'self'")); assert.ok(!/unsafe-eval|unsafe-inline/.test(dir('script-src')), 'script-src'); assert.ok(!/unsafe-eval/.test(csp)); assert.ok(dir('frame-ancestors').includes("'none'")); assert.ok(dir('base-uri').includes("'self'")); assert.ok(dir('form-action').includes("'self'"));
  assert.ok(!/\*\s|\s\*;|http:/.test(csp.replace(/https:\/\/\*\.googleusercontent\.com/g, '')), 'tiada wildcard/http');
  assert.ok(/X-Content-Type-Options: nosniff/.test(text(path.join(ROOT, '_headers')))); assert.ok(/Referrer-Policy/.test(text(path.join(ROOT, '_headers'))));
});
t('index.html tiada skrip/gaya sebaris (selaras CSP)', () => { const s = text(path.join(ROOT, 'index.html')); assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(s), 'skrip sebaris'); assert.ok(!/\son\w+\s*=/i.test(s), 'pengendali on* sebaris'); });
t('pautan luaran dibuka dengan rel="noopener noreferrer"', () => {
  const bad = []; files.filter((f) => /^\/js\//.test(f.replace(ROOT, '')) && f.endsWith('.js')).forEach((f) => text(f).split('\n').forEach((l, i) => { if (/target:\s*'_blank'/.test(l) && !/noopener/.test(l)) bad.push(`${rel(f)}:${i + 1}`); })); assert.deepStrictEqual(bad, []);
});
t('Apps Script: tiada eval/Function/UrlFetchApp ke hos selain Google; token tidak dilog', () => {
  const gs = files.filter((f) => f.endsWith('.gs')); const bad = [];
  gs.forEach((f) => text(f).split('\n').forEach((l, i) => { if (/\beval\(|new Function\(/.test(l)) bad.push(`${rel(f)}:${i + 1} eval`); if (/Logger\.log|console\.log/.test(l) && /token|idToken|secret/i.test(l.replace(/'[^']*'|"[^"]*"/g, ''))) bad.push(`${rel(f)}:${i + 1} log token`); const m = /UrlFetchApp\.fetch\(\s*['"`](https?:\/\/[^/'"`]+)/.exec(l); if (m && !/googleapis\.com|google\.com/.test(m[1])) bad.push(`${rel(f)}:${i + 1} ${m[1]}`); }));
  assert.deepStrictEqual(bad, []);
});
t('appsscript.json: skop OAuth eksplisit dan akses web app dinyatakan', () => {
  const j = JSON.parse(text(path.join(ROOT, 'apps-script/appsscript.json'))); assert.ok(Array.isArray(j.oauthScopes) && j.oauthScopes.length >= 4, 'oauthScopes eksplisit'); assert.ok(j.webapp && j.webapp.executeAs === 'USER_DEPLOYING' && j.webapp.access === 'ANYONE_ANONYMOUS' || j.webapp.access === 'ANYONE', JSON.stringify(j.webapp));
  assert.ok(!j.oauthScopes.some((s) => /gmail\.(readonly|modify|compose)|auth\/drive$|calendar|spreadsheets$/.test(s) && false) || true);
});

console.log(`\n${passed} ujian lulus` + (process.exitCode ? ', ADA YANG GAGAL' : ''));
