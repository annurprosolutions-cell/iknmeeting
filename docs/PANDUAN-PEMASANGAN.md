# Panduan Pemasangan SyuraDocs di Akaun Client (dari kosong)

Untuk pemaju/vendor yang memasang sistem di bawah akaun Google, GitHub dan Cloudflare milik client. Pemasangan baharu bermula bersih: **tiada data dipindah** daripada sistem ujian pemaju. Anggaran masa: 1.5 hingga 2 jam jika semua akaun sedia.

Versi sistem: 0.7.0. Fail yang diperlukan: `syuradocs-0.7.0-client.zip` (dijana dengan `node tools/make-release.js`; nilai pemaju sudah dikosongkan).

## Bahagian 0: Sebelum mula

### 0.1 Kebenaran dan peranan akaun
- Dapatkan **kebenaran bertulis** (emel atau WhatsApp yang boleh disimpan) daripada Tuan Madya Madon bahawa pemaju dibenarkan memasang sistem menggunakan akaun beliau dan memegang kelayakan itu sementara sehingga serah milik (lihat `AKAUN-DAN-PEMILIKAN.md`).
- Rekod di mana kelayakan disimpan. Jangan simpan kata laluan client dalam chat, fail teks atau repo.

### 0.2 Semak jenis emel client (penting, ubah langkah seterusnya)
Pergi ke `accounts.google.com` dan cuba log masuk dengan emel client.

| Keadaan | Maksud | Tindakan |
|---|---|---|
| Emel Gmail (`@gmail.com`) | Akaun Google biasa | Teruskan. Had emel harian ~100 penerima (lihat 0.4). |
| Emel organisasi pada Google Workspace (cth. `@ikn.gov.my`) | Dasar Admin Workspace boleh menyekat | Semak 3 perkara di 0.3 sebelum mula. Had emel harian 1,500. |
| Emel organisasi, tetapi hos emel Microsoft 365 atau lain | Bukan akaun Google | Pilih: (a) cipta akaun Google baharu "dengan emel sedia ada" (perlu akses peti masuk untuk sahkan), atau (b) cipta Gmail khas projek yang dimiliki client. Saya syorkan (b) kerana tidak bergantung kepada dasar IT organisasi. |

Syor umum: **Gmail khas projek** (cth. `syuradocs.ikn@gmail.com`) yang dicipta dengan nombor telefon dan emel pemulihan client, supaya pemilikan jelas sejak hari pertama.

### 0.3 Jika akaun Google Workspace: tiga sekatan yang membatalkan pemasangan
1. **Web app "Anyone"**: Admin Workspace mesti membenarkan Apps Script web app dikongsi di luar organisasi. Tanda gagal: pilihan "Anyone" tiada semasa Deploy.
2. **Kongsi Drive ke luar domain**: ahli yang menggunakan Gmail/emel luar tidak boleh diberi akses folder jika dasar kongsi luar dimatikan. Tanda gagal: amaran "tidak dapat dikongsi" semasa Terbitkan.
3. **OAuth Client "External"**: projek Google Cloud mungkin dihadkan kepada "Internal". Jika Internal, hanya pengguna domain boleh log masuk.
Jika salah satu disekat, minta Admin IT client melonggarkannya atau gunakan Gmail khas (0.2 pilihan b).

### 0.4 Kuota yang perlu difahami
Gmail percuma: ~100 emel (penerima) sehari melalui Apps Script. Mesyuarat 20 ahli menggunakan ~20 emel jemputan, ~20 peringatan, ditambah digest dan minit. Satu hari sibuk boleh menghampiri had. Sistem melangkau dan merekod emel "Dilangkau" bila kuota habis (kelihatan di Log Emel). Jika kerap, matikan Digest di Tetapan atau gunakan Workspace.

### 0.5 Sediakan persekitaran bersih (elak tersilap guna akaun sendiri)
- Cipta **profil Chrome baharu** bernama "SyuraDocs Client". Semua langkah di bawah dibuat dalam profil ini sahaja. Ini menghalang Apps Script atau Cloudflare ter-deploy ke akaun anda sendiri.
- Aktifkan **2-Step Verification** pada akaun client dan simpan kod sandaran (backup codes). Pada fasa pemasangan, nombor telefon pengesahan boleh jadi milik pemaju; **wajib ditukar kepada milik client semasa serah milik**.
- Unzip `syuradocs-0.7.0-client.zip`. Anda akan menyalin kandungan `apps-script/*.gs` (17 fail) dan fail lain ke GitHub.

## Bahagian A: Google (akaun client)

### A1. Google Sheet
1. `drive.google.com` > New > Google Sheets. Namakan **SyuraDocs - DB**.
2. Jangan tambah tab sendiri. `setupSystem()` mencipta 11 tab: users, meetings, meeting_members, agenda_items, materials, minutes, feedback, action_items, audit_log, notification_log, settings.

### A2. Apps Script
1. Dalam Sheet: Extensions > Apps Script. Namakan projek **SyuraDocs API**.
2. Projek mesti mempunyai **17 fail `.gs`**: Actions, Agenda, Audit, Auth, Backup, Code, DriveSync, Feedback, Materials, Meetings, Minutes, Notify, Settings, Setup, State, Users, Utils. Fail `Code.gs` sedia ada: ganti isinya. Untuk setiap yang lain: tekan **+** > Script > namakan (tanpa `.gs`) > tampal isi fail dalam folder `apps-script/`.
3. Manifest: Project Settings (ikon gear) > tanda **Show "appsscript.json" manifest file in editor**. Buka `appsscript.json` dan ganti seluruh isinya dengan fail dalam folder `apps-script/`. Ia menetapkan zon masa `Asia/Kuala_Lumpur`, skop OAuth, akses web app dan Drive Advanced Service v3.
4. Semak: pada menu fail di kiri, bilangan fail `.gs` = 17. Simpan (Ctrl+S).

### A3. Tetapkan Admin
Dalam `Setup.gs` baris `var ADMIN_EMAIL = 'GANTI_DENGAN_EMEL_ANDA@gmail.com';`, tukar kepada emel Google client yang akan menjadi Admin sistem (akaun yang sedang anda gunakan). Simpan.
> Sistem menolak nilai placeholder, jadi anda tidak boleh terlupa.

### A4. Google Cloud: OAuth Client ID
1. `console.cloud.google.com` (akaun client yang sama). Project > New project > nama **SyuraDocs**.
2. **OAuth consent screen** (menu "Google Auth Platform"): 
   - Audience/User type: **External** (jika Gmail). Jika Workspace dan semua pengguna dalam domain: Internal juga boleh, tetapi ahli luar tidak boleh log masuk.
   - App name `SyuraDocs`, User support email dan Developer contact: emel client.
   - Skop: hanya `openid`, `email`, `profile` (tidak perlu tambah apa-apa lain).
   - **Publishing status: In production** (tekan "Publish app"). Jika dibiarkan "Testing", hanya 100 test user dan sesi tamat cepat.
3. Credentials > Create credentials > OAuth client ID > **Web application**. Nama `SyuraDocs Web`. Authorised JavaScript origins: tambah `http://localhost:8080` sahaja buat masa ini. Authorised redirect URIs: kosongkan.
4. Salin **Client ID** (berakhir `.apps.googleusercontent.com`).

### A5. Script Property
Apps Script > Project Settings > **Script Properties** > Add: `GOOGLE_CLIENT_ID` = Client ID dari A4. Simpan.

### A6. Run `setupSystem`
1. Dalam editor, pilih function **setupSystem** > Run. Beri kebenaran: Review permissions > pilih akaun client > Advanced > "Go to SyuraDocs API (unsafe)" > Allow. (Amaran "unsafe" normal untuk skrip sendiri yang belum disahkan Google.)
2. Lihat Execution log. Mesti ada: tab dicipta, folder dicipta, 4 trigger dipasang, tiada ralat. Jika ada nota AMARAN tentang folder Backup, ikut arahannya.
3. Semak dalam Drive: folder **e-Mesyuarat IKN** (dengan sub-folder Mesyuarat dan Terhad) dan folder **SyuraDocs Backup** berasingan di My Drive (bukan di bawah e-Mesyuarat IKN). Run `setupSystem` sekali lagi: tiada data pendua.
4. Semak Triggers (ikon jam): `sendDigest_` (setiap jam), `sendReminders_` (harian ~08:00), `sendOverdueActions_` (Isnin ~08:30), `backupWeekly_` (Ahad ~02:00).

### A7. Deploy web app
1. Deploy > New deployment > jenis **Web app**. Description `SyuraDocs 0.7.0`. Execute as: **Me**. Who has access: **Anyone**. Deploy; beri kebenaran jika diminta.
2. Salin **Web app URL** (berakhir `/exec`).
3. Uji: tampal URL itu dalam pelayar. Respons mesti `{"ok":true,"data":{"app":"SyuraDocs API",...}}`. Jika diminta log masuk Google, akses bukan "Anyone" (semak 0.3).

## Bahagian B: GitHub (akaun client)

1. Daftar akaun GitHub dengan emel client (`github.com/signup`); sahkan emel; aktifkan 2FA dan simpan recovery codes.
2. New repository: nama **syuradocs**, **Private**, tanpa README/gitignore/licence.
3. Muat naik kandungan zip (bukan zip itu sendiri):
   - **Cara web**: dalam repo kosong tekan "uploading an existing file", seret **semua fail dan folder** dalam folder yang di-unzip (jumlah 93 fail, di bawah had 100 sekali muat naik), Commit changes ke `main`.
   - **Cara terminal** (lebih dipercayai untuk fail tersembunyi):
     ```bash
     cd syuradocs-0.7.0-client
     git init -b main
     git add -A
     git -c user.name="SyuraDocs" -c user.email="emel-client@contoh.my" commit -m "SyuraDocs 0.7.0"
     git remote add origin https://github.com/AKAUN-CLIENT/syuradocs.git
     git push -u origin main
     ```
     (Log masuk dengan akaun client melalui `gh auth login` atau Personal Access Token akaun client. Gunakan `-c user.*` supaya identiti commit bukan akaun peribadi anda.)
4. **Semak** di GitHub bahawa fail tersembunyi wujud: `.assetsignore` dan `wrangler.jsonc` (kedua-duanya wajib; tanpanya Cloudflare gagal atau menerbitkan folder `apps-script` dan `tests` ke awam).
5. Edit `config.js` di GitHub (ikon pensil), isi:
   ```js
   export const API_URL = 'https://script.google.com/macros/s/....../exec';
   export const GOOGLE_CLIENT_ID = '....apps.googleusercontent.com';
   ```
   Commit terus ke `main`. Kedua-dua nilai bukan rahsia.

## Bahagian C: Cloudflare (akaun client)

1. Daftar `dash.cloudflare.com` dengan emel client; sahkan emel; aktifkan 2FA.
2. **Workers & Pages > Create > Import a repository** (Connect to Git). Pasang Cloudflare GitHub App pada akaun client dan beri akses **hanya repo syuradocs**.
3. Tetapan projek:
   - Project/Worker name: **syuradocs** (mesti sama dengan `name` dalam `wrangler.jsonc`).
   - Production branch: `main`. Root directory: `/`.
   - Build command: **kosong**. Deploy command: `npx wrangler deploy`.
4. Deploy. Selepas siap, URL ialah `https://syuradocs.<subdomain>.workers.dev`. Salin.
5. Uji: buka URL. Halaman log masuk dipaparkan dan di bawahnya "Sambungan berjaya" (jika Bahagian D belum selesai, butang Google mungkin belum berfungsi; itu normal).
6. (Pilihan) Domain sendiri, cth. `syura.ikn.gov.my`: Workers > projek > Settings > Domains & Routes > Add custom domain. Perlukan DNS domain di bawah Cloudflare atau CNAME oleh IT client. URL domain ini menjadi "alamat sistem" di D1 dan D3.

> Telah disahkan semasa menyediakan panduan ini: `wrangler deploy` dengan `wrangler.jsonc` dan `.assetsignore` dalam pakej ini hanya menerbitkan fail frontend. `apps-script/`, `tests/`, `tools/`, `docs/` dan README menjawab 404, dan pengepala keselamatan dalam `_headers` dikenakan.

## Bahagian D: Sambung semuanya

### D1. Benarkan URL Cloudflare dalam OAuth
Google Cloud > Credentials > klik `SyuraDocs Web` > Authorised JavaScript origins > Add URI: `https://syuradocs.<subdomain>.workers.dev` (dan domain sendiri jika ada) > Save. Perubahan boleh ambil beberapa minit hingga beberapa jam untuk berkuat kuasa. Jika butang Google beri ralat "origin_mismatch" atau "The given origin is not allowed", tunggu dan cuba semula.

### D2. Log masuk Admin
Buka URL sistem dalam tetingkap baharu (profil Chrome client). Log masuk dengan emel `ADMIN_EMAIL`. Dashboard muncul.

### D3. Alamat sistem
Menu **Audit & Tetapan > Tetapan > Alamat sistem**: tekan "Guna alamat semasa" > Simpan. Tanpa ini, emel dihantar tanpa pautan.

### D4. Cipta pengguna
Menu **Pengguna**: Tambah Pengguna atau Import Senarai (nama, emel, jawatan, peranan). Peranan: Admin, Setiausaha, Pengerusi, Ahli. Setiausaha (Tuan Madya Madon) = peranan **Setiausaha**. Semua emel mesti **akaun Google** yang boleh log masuk. Emel bukan Google tidak boleh membuka fail Drive.

### D5. Uji asap (30 minit, akaun sebenar)
Ikut `UJIAN-PILOT.md` bahagian "Ujian asap hari pertama". Ringkas: cipta mesyuarat, tambah agenda, muat naik satu PDF, terbitkan, semak emel jemputan diterima, log masuk sebagai Ahli (peranti lain), nampak mesyuarat, buka bahan, tulis komen, mula Mod Mesyuarat, sediakan minit, sahkan oleh Pengerusi.

### D6. Backup pertama
Audit & Tetapan > Backup > **Backup sekarang**. Semak salinan `DB-YYYY-MM-DD` dalam folder SyuraDocs Backup.

### D7. Pasang sebagai app (PWA)
Chrome/Edge: ikon pasang pada bar alamat atau banner Dashboard. iPhone: Safari > Kongsi > Tambah ke Skrin Utama.

## Bahagian E: Kemas kini selepas live
- **Apps Script**: tampal fail yang berubah, kemudian Deploy > **Manage deployments** > pensil > Version: **New version** > Deploy. Jangan buat "New deployment" kerana URL akan bertukar dan `config.js` perlu diubah. Jika fail baharu atau lajur baharu, Run `setupSystem()` dahulu.
- **Frontend**: commit ke GitHub `main`; Cloudflare membina sendiri; hard refresh (Ctrl+Shift+R). Jika senarai fail `js/` berubah, kemas kini `SHELL` dalam `sw.js`.
- Uji dahulu pada **persekitaran ujian pemaju** (Sheet, Apps Script, Cloudflare dalam akaun anda sendiri), kemudian salin ke client. Jangan uji perubahan terus pada sistem client.

## Bahagian F: Masalah lazim

| Gejala | Punca biasa | Pembetulan |
|---|---|---|
| Log masuk: "Konfigurasi belum lengkap" | `config.js` masih kosong | Bahagian B langkah 5 |
| Butang Google: `origin_mismatch` | URL Cloudflare belum dalam OAuth | D1, tunggu beberapa minit |
| "Ralat dalaman" / "Sambungan gagal" pada log masuk | Fail `.gs` tertinggal atau deployment lama | Halaman log masuk menyenaraikan fail hilang; tampal, kemudian New version |
| `/exec` minta log masuk Google | Akses bukan Anyone atau disekat Workspace | A7; semak 0.3 |
| Build Cloudflare gagal "Missing entry-point" atau "no config" | `wrangler.jsonc` tiada dalam repo | Bahagian B langkah 4 |
| Build Cloudflare: nama tidak sepadan | Nama projek bukan `syuradocs` | Ubah `name` dalam `wrangler.jsonc` atau nama projek |
| Terbitkan mesyuarat: amaran "tidak dapat dikongsi kepada…" | Emel ahli bukan akaun Google atau dasar kongsi luar | Betulkan emel di Pengguna atau longgarkan dasar (0.3) |
| Emel tidak sampai | Kuota habis atau masuk Spam | Audit & Tetapan > Log Emel (Dihantar/Dilangkau/Gagal) |
| Jemputan sampai tetapi pautan tiada | Alamat sistem belum ditetapkan | D3 |
| Perubahan kod Apps Script tiada kesan | Lupa "New version" | Bahagian E |

## Bahagian G: Selepas serah, asingkan sistem ujian anda
Simpan satu pemasangan ujian pada akaun anda sendiri untuk menguji perubahan akan datang. Jangan guna URL atau Sheet client untuk ujian. Selepas client live, buang mana-mana pengguna atau data client yang pernah anda masukkan ke sistem ujian anda.
