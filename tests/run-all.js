#!/usr/bin/env node
// Jalankan semua ujian automatik secara berurutan. Guna: node tests/run-all.js [--no-ui]  (--no-ui melangkau ujian pelayar)
// Perlukan Playwright untuk ujian frontend. cors-live.js TIDAK dijalankan (ia memanggil Apps Script sebenar).
const { spawnSync } = require('child_process'); const path = require('path');
const backend = ['backend', 'meetings', 'materials', 'feedback', 'notify', 'install', 'minutes', 'security', 'perf'].map((n) => `${n}.test.js`);
const ui = ['smoke', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6', 'a11y'].map((n) => `frontend.${n}.js`);
const list = process.argv.includes('--no-ui') ? backend : backend.concat(ui);
let failed = [];
for (const f of list) {
  const t = Date.now(); const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  const last = (r.stdout || '').trim().split('\n').pop();
  console.log(`${r.status === 0 ? 'LULUS' : 'GAGAL'}  ${f.padEnd(28)} ${((Date.now() - t) / 1000).toFixed(1)}s  ${last}`);
  if (r.status !== 0) { failed.push(f); console.log((r.stdout + r.stderr).split('\n').filter((l) => /GAGAL|Error/.test(l)).slice(0, 6).join('\n')); }
}
console.log(failed.length ? `\n${failed.length} suite gagal: ${failed.join(', ')}` : `\nSemua ${list.length} suite lulus.`);
process.exit(failed.length ? 1 : 0);
