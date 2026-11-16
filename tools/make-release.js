#!/usr/bin/env node
// Menghasilkan zip serahan untuk client: fail yang dijejaki git sahaja, dengan nilai milik pemaju dikosongkan.
// Guna: node tools/make-release.js   ->  dist/syuradocs-<versi>-client.zip
// Corak imbasan dibaca daripada nilai sebenar dalam config.js dan Setup.gs (tiada nilai peribadi ditulis dalam skrip ini).
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const version = /APP_VERSION_\s*=\s*'([^']+)'/.exec(read('apps-script/Utils.gs'))[1];

// 1. nilai milik pemaju (diambil daripada fail sendiri)
const cfg = read('config.js');
const api = (/API_URL\s*=\s*'([^']*)'/.exec(cfg) || [])[1] || '', cid = (/GOOGLE_CLIENT_ID\s*=\s*'([^']*)'/.exec(cfg) || [])[1] || '';
const admin = (/ADMIN_EMAIL\s*=\s*'([^']*)'/.exec(read('apps-script/Setup.gs')) || [])[1] || '';
const secrets = [api, cid, admin, admin.split('@')[0], (/macros\/s\/([^/]+)\//.exec(api) || [])[1], cid.split('-')[0]].filter((x) => x && x.length >= 6 && !/^GANTI/.test(x));

// 2. senarai fail: hanya yang dijejaki git, tanpa tools/make-release.js dan tests/shots
const files = cp.execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
  .filter((f) => f !== 'tools/make-release.js' && !f.startsWith('tests/shots/') && !f.startsWith('dist/'));

const WRANGLER = `{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "syuradocs",
  "compatibility_date": "2026-01-01",
  "assets": { "directory": "./" }
}
`;
const ASSETSIGNORE = ['apps-script', 'tests', 'tools', 'docs', 'README.md', '.gitignore', '.assetsignore', 'wrangler.jsonc', ''].join('\n');
const BLANK_CONFIG = `// Konfigurasi awam (bukan rahsia). Diisi pada langkah pemasangan (lihat docs/PANDUAN-PEMASANGAN.md).
export const API_URL = '';          // URL Web App Apps Script (berakhir dengan /exec)
export const GOOGLE_CLIENT_ID = ''; // OAuth Client ID (Web application)
`;

const out = path.join(ROOT, 'dist', `syuradocs-${version}-client`);
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
for (const f of files) {
  const dst = path.join(out, f); fs.mkdirSync(path.dirname(dst), { recursive: true });
  let buf = fs.readFileSync(path.join(ROOT, f));
  if (f === 'config.js') buf = BLANK_CONFIG;
  else if (f === 'apps-script/Setup.gs') buf = buf.toString('utf8').replace(/var ADMIN_EMAIL = '[^']*';/, "var ADMIN_EMAIL = 'GANTI_DENGAN_EMEL_ANDA@gmail.com';");
  else if (f === '.assetsignore') buf = ASSETSIGNORE;
  fs.writeFileSync(dst, buf);
}
fs.writeFileSync(path.join(out, 'wrangler.jsonc'), WRANGLER);
if (!files.includes('.assetsignore')) fs.writeFileSync(path.join(out, '.assetsignore'), ASSETSIGNORE);

// 3. imbas semua fail keluaran untuk nilai milik pemaju (gagal jika jumpa)
const hits = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { walk(p); continue; }
  if (/\.(png|ico|jpg|zip)$/.test(e.name)) continue; const s = fs.readFileSync(p, 'utf8'); secrets.forEach((x) => { if (s.includes(x)) hits.push(`${path.relative(out, p)} mengandungi nilai peribadi (${x.slice(0, 6)}…)`); }); } })(out);
if (hits.length) { console.error('GAGAL: nilai pemaju masih ada dalam keluaran:\n  ' + hits.join('\n  ')); process.exit(1); }
if (!/GANTI_DENGAN_EMEL_ANDA@gmail\.com/.test(fs.readFileSync(path.join(out, 'apps-script/Setup.gs'), 'utf8'))) { console.error('GAGAL: ADMIN_EMAIL tidak diganti'); process.exit(1); }

const zip = path.join(ROOT, 'dist', `syuradocs-${version}-client.zip`); fs.rmSync(zip, { force: true });
cp.execSync(`zip -qr "${zip}" .`, { cwd: out });
console.log(`Siap: ${path.relative(ROOT, zip)} (${files.length + 1} fail, versi ${version}). Imbasan nilai peribadi: bersih (${secrets.length} corak disemak).`);
