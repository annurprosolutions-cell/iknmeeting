// Ujian CORS dengan Apps Script SEBENAR (bukan mock). Mock Playwright tidak menguatkuasakan preflight CORS,
// jadi pepijat "Tidak dapat sambung ke server" semasa muat naik (12/11/2026) terlepas daripada ujian mock.
// Guna: node tests/cors-live.js [folder_root_frontend]   (lalai: folder repo; API_URL dibaca dari config.js)
// Lulus bila semua panggilan sampai ke server dan dibalas JSON (401 tanpa token = betul), bukan ralat rangkaian.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((q, r) => {
  const p = path.join(ROOT, q.url === '/' ? 'index.html' : q.url.split('?')[0]);
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'text/plain' }); r.end(fs.readFileSync(p));
});
(async () => {
  await new Promise((r) => srv.listen(0, r));
  const px = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch(px ? { proxy: { server: px, bypass: 'localhost,127.0.0.1' } } : {});
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
  await page.goto(`http://localhost:${srv.address().port}/favicon.svg`).catch(() => {});
  const r = await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const out = {};
    const run = async (name, fn) => { try { out[name] = { ok: true, data: await fn() }; } catch (e) { out[name] = { ok: false, code: e.code, message: e.message }; } };
    await run('ping (api)', () => api.api('ping', {}, { noAuth: true }));
    await run('materials.upload (apiUpload, tanpa token)', () => api.apiUpload('materials.upload', { meeting_id: 'x', file_name: 'a.pdf', data_base64: 'JVBERi0xLjQ=' }, () => {}));
    // Tiru juga laluan aplikasi sepenuhnya (upload.js -> sendFile) dengan fail sebenar
    const up = await import('/js/upload.js').catch(() => null);
    if (up) await run('sendFile (laluan aplikasi)', () => up.sendFile('materials.upload', { meeting_id: 'x', type: 'Lain-lain' }, new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' }), () => {}));
    return out;
  });
  let fail = 0;
  for (const [k, v] of Object.entries(r)) {
    const reached = v.ok || (v.code && v.code !== 0);
    if (!reached) fail++;
    console.log(`  ${reached ? 'ok   ' : 'GAGAL'} ${k}: ${v.ok ? 'JSON ok' : `kod ${v.code}: ${v.message}`}`);
  }
  await browser.close(); srv.close();
  console.log(fail ? '\nGAGAL: panggilan tidak sampai ke server (CORS / rangkaian).' : '\nLulus: semua panggilan sampai ke Apps Script sebenar.');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ralat ujian:', e.message); process.exit(1); });
