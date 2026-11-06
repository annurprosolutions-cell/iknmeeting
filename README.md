# e-Mesyuarat IKN

Sistem mesyuarat tanpa kertas. Frontend static (vanilla HTML/CSS/JS, tiada build) di Cloudflare Pages; backend Google Apps Script; data dalam Google Sheets; fail dalam Google Drive. Rujuk dokumen 01-PRD hingga 06-IPD.

**Status: Fasa 0 dan Fasa 1 siap dibina.** Fasa 2 hingga 7 belum bermula (menunggu pengesahan Fasa 1).

## Struktur

```
index.html, config.js, _headers, favicon.svg
css/styles.css          token DBD, cerah/gelap, responsif, cetak
js/                     app, api, auth, router, shell, ui, icons
js/views/               login (S-01), dashboard (S-02 kerangka), users (S-13), placeholder
apps-script/            Code, Auth, Users, Audit, Setup, Utils, appsscript.json
tests/                  ujian backend (mock Apps Script) dan smoke test frontend
```

## Setup (buat sekali, ikut urutan; ringkasan IPD seksyen 7)

1. **Sheet**: Google Drive > New > Google Sheets, namakan `e-Mesyuarat IKN - DB`.
2. **Apps Script**: dalam Sheet, Extensions > Apps Script, namakan projek `e-Mesyuarat IKN API`. Tampal setiap fail dalam `apps-script/` (satu fail satu tab; `appsscript.json` melalui Project Settings > "Show appsscript.json manifest file").
3. **Admin**: dalam `Setup.gs`, tukar `ADMIN_EMAIL` kepada emel Google anda.
4. **Run `setupSystem`**, beri kebenaran ("Advanced" > "Go to ... (unsafe)"). Semak 11 tab dan folder `e-Mesyuarat IKN` dalam Drive. Run sekali lagi, pastikan tiada data pendua.
5. **Deploy API**: Deploy > New deployment > Web app. Execute as: **Me**. Who has access: **Anyone**. Salin URL (`.../exec`).
6. **OAuth Client ID**: console.cloud.google.com, cipta project, OAuth consent screen (External, skop `openid` `email` `profile` sahaja, tetapkan **In production**), Credentials > OAuth client ID > Web application. Authorised JavaScript origins: `http://localhost:8080`. Salin Client ID.
7. **Script Property**: Project Settings > Script Properties, tambah `GOOGLE_CLIENT_ID` = Client ID tadi.
8. **config.js**: isi `API_URL` (langkah 5) dan `GOOGLE_CLIENT_ID` (langkah 6). Commit dan push.
9. **Cloudflare Pages**: Create > Pages > Connect to Git, pilih repo ini. Build command kosong, output directory `/`. Salin URL `*.pages.dev`.
10. **Tambah origin**: Google Cloud > Credentials > Client ID > Authorised JavaScript origins > tambah URL `*.pages.dev`.
11. **Uji**: buka URL `*.pages.dev`, login dengan emel Admin.

Bila kod Apps Script berubah: Deploy > Manage deployments > ikon pensil > Version: New version > Deploy (URL kekal). Frontend: push ke GitHub, Cloudflare deploy sendiri.

Uji setempat: `python3 -m http.server 8080` dari folder repo, buka `http://localhost:8080`.

## Ujian automatik

```bash
node tests/backend.test.js      # logik Apps Script dengan mock servis Google
node tests/frontend.smoke.js    # perlukan Playwright; CSP sebenar dari _headers dikenakan
```

Ujian ini guna mock untuk Google (GIS dan tokeninfo) dan Apps Script. Ia **tidak** menggantikan ujian dengan akaun Google sebenar di bawah.

## Senarai semak pengesahan Fasa 1 (dengan akaun sebenar)

- [ ] Halaman login papar "Sambungan berjaya"
- [ ] Login dengan emel Admin masuk ke Dashboard
- [ ] Login dengan akaun Google lain ditolak dengan mesej jelas; baris `login_gagal` muncul dalam tab `audit_log`
- [ ] `curl -X POST -H 'Content-Type: text/plain' -d '{"action":"users.list"}' <API_URL>` pulang `{"ok":false,"error":{"code":401,...}}`
- [ ] S-13: tambah Setiausaha, Pengerusi, Ahli (guna emel Google sebenar); login setiap satu, menu betul
- [ ] Ahli / Setiausaha tidak nampak menu Pengguna dan `users.save` ditolak 403
- [ ] Nyahaktif Ahli: sesi Ahli itu ditolak pada panggilan seterusnya
- [ ] Tiada ralat CSP dalam Console pelayar semasa login (laras `_headers` jika ada sumber Google disekat)
- [ ] Tutup tab, buka semula: diminta login; biarkan sesi tamat: login senyap atau kembali ke S-01

## Nota reka bentuk

- Respons API sentiasa HTTP 200; kod `401`/`403` dibawa dalam badan JSON kerana Apps Script tidak boleh set kod HTTP.
- Role dibaca dari Sheet pada setiap panggilan (cache 5 minit, dibuang bila berubah), bukan dari token.
- Semua lajur Sheet berformat Plain text. Medan nombor (`seq`, `version`, dll.) disimpan sebagai teks dan ditukar ke nombor apabila dibaca (Fasa 3 dan seterusnya).
- Trigger (`sendDigest_` dll.) dipasang oleh `setupSystem()` hanya jika function wujud. Run `setupSystem()` semula selepas Fasa 6.
