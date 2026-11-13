# SyuraDocs

Sistem dokumen mesyuarat tanpa kertas untuk Institut Kanser Negara (dahulu dinamakan "e-Mesyuarat IKN" dalam dokumen 01-06).

Sistem mesyuarat tanpa kertas. Frontend static (vanilla HTML/CSS/JS, tiada build) di Cloudflare Pages; backend Google Apps Script; data dalam Google Sheets; fail dalam Google Drive. Rujuk dokumen 01-PRD hingga 06-IPD.

**Status: Fasa 0 hingga 4 dan Fasa 6 siap dibina** (Fasa 3 dalam bentuk "upload sahaja"). Fasa 5 (Minit dan Tindakan) ditangguh menunggu keputusan; Fasa 7 (ujian penuh, pilot, serahan) belum bermula.

## Struktur

```
index.html, config.js, _headers, favicon.svg
css/styles.css          token DBD, cerah/gelap, responsif, cetak
js/                     app, api, auth, router, shell, ui, icons
js/views/               login (S-01), dashboard (S-02), meetings (S-03), meeting-detail (S-04), meeting-form (S-05),
                        meeting-agenda (S-06), material-viewer (S-08), meeting-mode (S-09), users (S-13), audit (S-14), placeholder
sw.js, manifest.webmanifest, icons/  PWA; js/pwa.js (banner pasang), js/offline.js (agenda luar talian); tools/make-icons.js
js/comments-panel.js    S-10 Komen & Cadangan (digunakan dalam S-04, S-08, S-09); js/notes.js nota peribadi (localStorage)
js/materials-panel.js   S-07 Bahan (dalam tab Bahan S-04); js/upload.js muat naik base64 dengan kemajuan
apps-script/            Code, Auth, Users, Meetings, Agenda, Materials, Feedback, State, Notify, Settings, Backup, DriveSync, Audit, Setup, Utils, appsscript.json
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

Jika Cloudflare tidak membina selepas push: Workers & Pages > projek > Settings > Builds > Git repository > Manage (reconnect GitHub), atau tekan New deployment dan pilih branch. Semak tab Deployments bahawa commit terkini muncul. Tab "Trigger events" bukan untuk build (ia untuk cron dan tidak terpakai pada static assets).

Uji setempat: `python3 -m http.server 8080` dari folder repo, buka `http://localhost:8080`.

## Ujian automatik

```bash
node tests/backend.test.js      # logik Apps Script dengan mock servis Google
node tests/meetings.test.js     # Fasa 2: mesyuarat, ahli, Drive, kehadiran
node tests/frontend.smoke.js    # perlukan Playwright; CSP sebenar dari _headers dikenakan
node tests/materials.test.js    # Fasa 3: agenda, bahan, folder terhad
node tests/frontend.phase2.js   # S-02 hingga S-05
node tests/feedback.test.js     # Fasa 4: komen, visibiliti, item semasa, pollState (baca cache sahaja)
node tests/frontend.phase3.js   # borang baharu, gambar, agenda, bahan, penonton
node tests/frontend.phase4.js   # Mod Mesyuarat: 3 pelayar serentak, polling, komen, nota, talian terputus
node tests/notify.test.js       # Fasa 6: emel (jemputan, digest, peringatan, kuota), audit, tetapan, backup
node tests/frontend.phase6.js   # S-14, PWA (manifest, service worker, luar talian, banner pasang)
node tests/cors-live.js         # BUKAN mock: panggil Apps Script sebenar (API_URL dalam config.js) melalui kod app
```

Ujian ini guna mock untuk Google (GIS dan tokeninfo) dan Apps Script. Ia **tidak** menggantikan ujian dengan akaun Google sebenar di bawah. Mock tidak menguatkuasakan CORS; sebab itu `cors-live.js` wujud: jalankan ia setiap kali kod `api.js` / `upload.js` berubah.

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

## Penyelesaian masalah: "Ralat dalaman" pada log masuk / "Sambungan gagal" pada halaman log masuk

Jika **ping pun gagal** dengan "Ralat dalaman", penghala Apps Script tidak dapat membina senarai action: sekurang-kurangnya satu fail `.gs` belum ditampal atau masih versi lama. Dari versi **0.6.1**, satu fail tertinggal tidak lagi merosakkan semua action; ping melaporkan fail yang hilang dan halaman log masuk memaparkannya.

**Projek Apps Script mesti ada 15 fail `.gs`** (dan `appsscript.json`):
`Agenda, Audit, Auth, Backup, Code, DriveSync, Feedback, Materials, Meetings, Notify, Settings, Setup, State, Users, Utils`.

Langkah:
1. Ganti **Code.gs** dengan versi 0.6.1 dan pastikan semua 15 fail wujud dan versi terkini (terutama `Audit.gs`, `Settings.gs`, `Backup.gs`, `Notify.gs`, `Feedback.gs`, `State.gs`).
2. Deploy > Manage deployments > pensil > **Version: New version** > Deploy (deployment yang sama; menyimpan fail sahaja tidak mengemas kini web app).
3. Muat semula halaman log masuk: ia akan menyenaraikan fail yang masih hilang.
4. Jika masih "Ralat dalaman": Apps Script > **Executions** > klik pelaksanaan yang gagal; mesej (cth. `ReferenceError: apiSettingsGet_ is not defined`) menyebut function yang hilang.
5. Semak dari terminal: `curl -sL -H 'Content-Type: text/plain' -d '{"action":"ping"}' <API_URL>`. Nilai `version` mesti sepadan dengan versi terkini dan tiada `missing`.

## Fasa 6 (versi 0.6.0): Notifikasi emel, Audit, Tetapan, Backup, PWA

**Naik taraf**
1. Apps Script: tampal `Notify.gs`, `Settings.gs`, `Backup.gs` baharu; ganti `Code.gs`, `Audit.gs`, `Meetings.gs`, `Setup.gs`, `Utils.gs`.
2. **Run `setupSystem()`** (wajib kali ini). Ia: menambah tetapan `app_url`; memasang trigger **digest (setiap jam)**, **peringatan (harian 08:00)** dan **backup (Ahad 02:00)**; dan **mengalihkan folder Backup keluar daripada folder akar** (lihat bawah). Terima kebenaran jika diminta. Ringkasan akan menyenaraikan "Trigger dipasang" dan nota pengalihan folder.
3. Deploy **New version** pada deployment yang sama. Push frontend, tunggu Cloudflare, hard refresh.
4. **Login Admin > Audit & Tetapan > Tetapan**: tekan "Guna alamat semasa" (atau taip alamat https sistem) dan Simpan. Tanpa ini, emel dihantar tanpa pautan.

**Notifikasi emel (F-11)**: hanya tajuk, tarikh/masa dan pautan (tiada kandungan bahan, komen atau Bahan Bicara).
- **Jemputan**: semasa Terbitkan (jika "Hantar emel jemputan" ditanda) dan kepada ahli yang ditambah selepas terbit.
- **Digest**: satu emel setiap ahli, maksimum sekali sejam, menyenaraikan bahan baharu selepas terbit. Larian pertama hanya menetapkan garis dasar. Boleh dimatikan dalam Tetapan.
- **Peringatan**: harian 08:00, sekali bagi setiap ahli. Lalai 24 jam = sehari sebelum ("esok"); mesyuarat hari ini yang belum bermula turut diingatkan.
- Semua direkod dalam **Log Emel**. Jika kuota harian habis, baki dilangkau dan direkod "Dilangkau" (baki kuota dipaparkan). Kuota Gmail biasa ialah ~100 penerima sehari (anggaran, belum disahkan).
- Belum ada (menunggu Fasa 5): emel minit untuk semakan/disahkan dan tindakan tertunggak.

**Audit & Tetapan (S-14, Admin sahaja)**: Audit Log (tapis emel, tindakan, tarikh), Log Emel, Tetapan (nama sistem, alamat sistem, nama mesyuarat, peringatan, digest, had muat naik, bilangan backup) dan Backup. Audit log tiada API untuk ubah atau padam.

**Backup**: salinan Sheet ke folder **"SyuraDocs Backup"** (nama `DB-YYYY-MM-DD`, simpan 8 terkini). **Penting (keselamatan)**: folder ini kini berada di Drive pemilik **di luar** folder "e-Mesyuarat IKN", kerana folder akar dikongsi kepada Setiausaha dan salinan memuatkan senarai pengguna dan audit log. Pemasangan lama yang meletakkannya di bawah folder akar diperbetulkan oleh `setupSystem()`. Fail Drive (bahan mesyuarat) tidak disalin oleh sistem: Admin disyorkan menyalin folder "Mesyuarat" secara manual setiap suku tahun.

**PWA (F-13)**: app boleh dipasang (banner pada Dashboard; iOS: arahan Kongsi > Tambah ke Skrin Utama). Service worker menggunakan **rangkaian dahulu**, jadi kod baharu sentiasa diambil bila ada talian; simpanan hanya sandaran. Agenda mesyuarat yang pernah dibuka (tajuk, tarikh, agenda sahaja) disimpan dalam peranti untuk bacaan luar talian dan **dipadam bila log keluar**. Bahan, komen dan kehadiran memerlukan internet. Jika senarai fail dalam `js/` berubah, kemas kini `SHELL` dalam `sw.js` (ujian akan gagal jika ada fail tertinggal).

**Senarai semak pengesahan Fasa 6 (akaun sebenar)**
- [ ] `setupSystem()`: ringkasan menyebut trigger dipasang dan Folder Backup dialihkan; dalam Drive, "SyuraDocs Backup" berada di My Drive (bukan di bawah "e-Mesyuarat IKN")
- [ ] Tetapan > Alamat sistem disimpan (https)
- [ ] Terbitkan mesyuarat: setiap ahli menerima satu emel jemputan dengan pautan yang membuka mesyuarat itu; Log Emel menunjukkan "Dihantar"
- [ ] Muat naik 2 bahan selepas terbit; selepas satu jam (atau run `sendDigest_` dua kali dari editor), setiap ahli menerima SATU emel digest
- [ ] Run `sendReminders_` dari editor untuk mesyuarat esok: ahli menerima peringatan; run semula tidak menghantar lagi
- [ ] Bahan Bicara tidak disebut dalam mana-mana emel
- [ ] Backup sekarang: salinan muncul; run 9 kali: hanya 8 kekal
- [ ] Ahli biasa dan Setiausaha tidak boleh membuka Audit & Tetapan; Setiausaha tidak boleh membuka folder "SyuraDocs Backup"
- [ ] Pasang app pada telefon dan komputer; matikan internet selepas buka agenda: agenda masih boleh dibaca dan bar luar talian muncul

## Fasa 4 (versi 0.5.0): Mod Mesyuarat, Komen & Cadangan, Nota Saya

**Naik taraf**: tampal `Feedback.gs` dan `State.gs` baharu; ganti `Code.gs`, `Meetings.gs`, `Agenda.gs`, `Materials.gs`, `Utils.gs`. Tiada lajur baharu dalam Sheet (tab `feedback` sedia ada sejak `setupSystem()` Fasa 0). Deploy **New version** pada deployment yang sama; push frontend; hard refresh.

**Aliran semasa mesyuarat**
1. Semua ahli buka mesyuarat dan tekan **Mod Mesyuarat** (butang muncul bila status Dijadualkan atau Sedang Berlangsung). Menu sistem disembunyikan; tiga lajur: agenda, bahan, komen/nota. Pada telefon, agenda dan komen ialah panel gelongsor.
2. Setiausaha, Admin atau **Pengerusi mesyuarat itu** tekan **Mula mesyuarat**, pilih item dan tekan **Jadikan item semasa**. Mereka juga menandakan item Selesai atau Ditangguh, dan **Tamat mesyuarat**.
3. Skrin ahli disegerakkan melalui polling setiap 20 saat (membaca cache sahaja, bukan Sheet). Ahli yang mengikut akan beralih sendiri; ahli yang sedang melayari item lain tidak dipaksa dan nampak butang **Ikut item semasa**.
4. Ahli menulis **Komen & Cadangan** (Komen / Cadangan / Soalan / Bantahan) pada item, bahan atau mesyuarat. Lalai boleh dibaca **semua ahli**; pilihan "Pengerusi & Setiausaha sahaja" ditapis di server. Komen baharu muncul pada skrin orang lain tanpa muat semula.
5. **Nota Saya** disimpan dalam pelayar peranti itu sahaja (tidak dihantar ke server, termasuk Admin tidak boleh baca).
6. Selepas **Tamat**, ruang komen ditutup dan penulis tidak boleh lagi edit atau padam komen mereka (Setiausaha/Admin masih boleh padam, direkod audit).

**Had dan nota**
- Komen hanya boleh ditulis semasa Dijadualkan dan Sedang Berlangsung. Komen pada Minit belum tersedia (Fasa 5).
- Skrin penuh dan Wake Lock bergantung pada sokongan pelayar (Safari/iOS terhad). Sistem tetap berfungsi jika tidak disokong.
- Komen pada Bahan Bicara hanya boleh ditulis oleh Pengerusi mesyuarat itu dan Setiausaha/Admin, dan tidak dipulangkan kepada ahli lain.

**Senarai semak pengesahan Fasa 4 (akaun sebenar, perlu sekurang-kurangnya 3 pelayar/peranti berasingan)**
- [ ] Setiausaha dan 2 ahli buka Mod Mesyuarat pada mesyuarat berstatus Dijadualkan dengan agenda dan bahan
- [ ] Setiausaha tekan Mula mesyuarat dan pilih item semasa: ahli nampak penanda "Item semasa" dalam masa kurang 30 saat
- [ ] Pengerusi (bukan Setiausaha) boleh mula/tamat dan pilih item semasa (jika Pengerusi bukan role Admin/Setiausaha)
- [ ] Ahli tulis cadangan: muncul pada skrin Setiausaha tanpa muat semula
- [ ] Komen "Pengerusi & Setiausaha sahaja" tidak kelihatan pada ahli lain
- [ ] Matikan wifi pada satu peranti: banner "Talian terputus" muncul, agenda terakhir masih boleh dibaca, banner hilang bila pulih
- [ ] Nota Saya: tulis, muat semula halaman, nota kekal; peranti lain tidak nampak
- [ ] **Ujian beban (IPD)**: semua ahli (~20) dalam Mod Mesyuarat selama 20 minit. Perhatikan sama ada ada ralat kuota atau paparan tersangkut

## Kemas kini 13/11/2026 (versi 0.4.2)

- **Pembetulan "Draf disimpan tetapi gagal diterbitkan: Ralat dalaman"**. `ownerEmail_()` (Session.getEffectiveUser) berada di luar try/catch dan boleh gagal bila manifest menyenaraikan skop secara eksplisit. Kini ia dilindungi dengan sandaran (pemilik folder akar Drive), dan ralat kongsi Drive tidak lagi menggagalkan penerbitan: mesyuarat tetap terbit dan emel yang gagal dikongsi dilaporkan. Jika ada ralat dalaman lain, **Admin** kini nampak sebab ringkas dalam kurungan (tanpa stack); pengguna lain tidak.
- **Tajuk dan Bilangan (permintaan client)**: "Tajuk mesyuarat" ialah senarai nama mesyuarat (tetapan `meeting_series`); medan "Siri" ditukar kepada **Bilangan** (nombor, cth. 1 untuk Bil.1/2026). Lajur `bil` ditambah dalam tab `meetings` (run `setupSystem()`). "Siri" dalaman kini sentiasa sama dengan tajuk, jadi penapis dan arkib kekal berfungsi.
- **Ahli tak nampak mesyuarat**: punca biasa ialah mesyuarat masih **Draf** (hanya diterbitkan baru ahli nampak). Padanan emel ahli kini tidak sensitif huruf besar/ruang kosong. Pada tab Ahli & Kehadiran, staf nampak amaran jika mesyuarat masih Draf atau jika ada ahli yang emelnya belum didaftarkan / tidak aktif.

## Kemas kini 12/11/2026 (versi 0.4.1)

- **Pembetulan muat naik**: "Tidak dapat sambung ke server" semasa muat naik. Punca: pendengar kemajuan XHR memaksa preflight CORS yang Apps Script tolak. Kini guna `fetch` biasa; bar kemajuan diganti bar "sedang memuat naik" tanpa peratus.
- **Nama sistem: SyuraDocs.** `setupSystem()` menukar `app_name` lama ("e-Mesyuarat IKN") kepada SyuraDocs; nama lain yang Admin tetapkan tidak ditimpa. Folder Drive akar tidak dinamakan semula (sistem merujuk folder melalui ID, jadi selamat dinamakan semula sendiri dalam Drive jika mahu).
- **Akses Ahli / Pengerusi**: menu Dashboard dan Mesyuarat sahaja; dalam mesyuarat hanya tab Agenda, Bahan, Ahli & Kehadiran. Admin dan Setiausaha kekal akses penuh. Ruang maklum balas/cadangan ahli (F-07) dibina pada Fasa 4.

## Naik taraf ke Fasa 3 (jika Fasa 2 sudah live)

1. Tampal fail baharu `Agenda.gs` dan `Materials.gs`. Ganti `Code.gs`, `Auth.gs`, `Users.gs`, `Meetings.gs`, `DriveSync.gs`, `Setup.gs`, `Utils.gs`. `appsscript.json` tidak berubah daripada Fasa 2.
2. **Run `setupSystem()` sekali lagi.** Ia menambah lajur `photo` (tab `users`) dan `tahun` (tab `meetings`) tanpa menyentuh data sedia ada, menambah tetapan `meeting_series` (3 nama mesyuarat) dan mengemas kini senarai Jenis dokumen. Semak ringkasan: ia akan senaraikan lajur yang ditambah.
3. Deploy > Manage deployments > pensil > Version: New version > Deploy.
4. Push frontend dan tunggu deployment Cloudflare, kemudian hard refresh (Ctrl+Shift+R).

Perubahan daripada maklum balas client (07/11/2026):
- "Jenis mesyuarat" dibuang. "Siri" kini senarai nama mesyuarat (tetapan `meeting_series`, JSON dalam tab `settings`; Admin boleh ubah terus di Sheet sehingga S-14 dibina pada Fasa 6). Medan `Tahun` ditambah.
- Pengerusi boleh dipilih daripada semua pengguna Aktif (tidak lagi terhad kepada role Pengerusi). Kuasa mula/tamat mesyuarat dan (kelak) sahkan minit mengikut Pengerusi mesyuarat itu, bukan role.
- Borang Mesyuarat: lampiran Surat Jemputan dan Memo di bahagian Ahli.
- Pengurusan Pengguna: medan Nama sebelum Emel; gambar profil pilihan.

Jenis dokumen (tab Bahan): Surat Jemputan, Memo, Agenda, Kertas Cadangan, Kertas Makluman, Kertas Laporan, Bahan Bicara, Minit, Maklum Balas, Slaid, Lampiran, Lain-lain. **Bahan Bicara** hanya kelihatan kepada Pengerusi mesyuarat itu dan Admin/Setiausaha; fail disimpan di `e-Mesyuarat IKN/Terhad/<id mesyuarat>/` (di luar folder mesyuarat yang dikongsi kepada ahli).

## Senarai semak pengesahan Fasa 3 (dengan akaun sebenar)

- [ ] `setupSystem()` melaporkan lajur `photo` dan `tahun` ditambah; data mesyuarat lama masih kelihatan
- [ ] Borang: tiada Jenis mesyuarat; Siri = 3 nama; Tahun auto; Pengerusi boleh sesiapa
- [ ] Simpan mesyuarat dengan surat jemputan dan memo: fail muncul di tab Bahan dan dalam folder Drive mesyuarat
- [ ] **Ujian had muat naik (IPD 3.4)**: cuba fail 5 MB, 20 MB dan fail HMI 16 MB (pptx). Catat mana yang berjaya. Jika gagal, letak fail dalam folder Drive dan tekan Imbas folder Drive
- [ ] Pratonton dalam penonton: PDF, PPTX, DOCX, XLSX. Akaun Google lain yang tiada akses tidak boleh buka
- [ ] Bahan Bicara: Setiausaha muat naik; Pengerusi nampak; Ahli tidak nampak (senarai) dan tidak boleh buka folder `Terhad` dalam Drive
- [ ] Editor agenda: tambah, seret/susun, buang; pembentang boleh muat naik untuk item sendiri sahaja
- [ ] Gambar profil: muat naik di S-13, kelihatan pada senarai ahli

## Naik taraf ke Fasa 2 (jika Fasa 1 sudah live)

1. Tampal fail baharu `Meetings.gs` dan `DriveSync.gs`, dan ganti `Code.gs`, `Users.gs`, `Utils.gs`.
2. Ganti isi `appsscript.json`. Ia menambah **Drive Advanced Service (v3)** supaya kongsi folder tidak menghantar emel notifikasi Google kepada setiap ahli. Jika baris `dependencies` tidak dimasukkan, sistem masih berfungsi tetapi Google akan hantar satu emel kongsi setiap ahli.
3. Run `setupSystem()` sekali lagi (selamat, idempotent). Beri kebenaran baharu bila diminta.
4. Deploy > Manage deployments > pensil > Version: New version > Deploy (URL kekal).
5. Push frontend ke GitHub.

## Senarai semak pengesahan Fasa 2 (dengan akaun sebenar)

Perlukan sekurang-kurangnya: 1 Setiausaha, 1 Pengerusi, 2 Ahli, masing-masing emel Google sebenar yang boleh anda log masuk.

- [ ] Setiausaha: Mesyuarat Baharu, simpan Draf. Folder baharu muncul dalam Drive di bawah `e-Mesyuarat IKN/Mesyuarat/`
- [ ] Ahli tidak nampak mesyuarat Draf (senarai kosong; buka pautan terus `#/meetings/<id>` ditolak)
- [ ] Terbitkan: status Dijadualkan; folder Drive dikongsi sebagai Viewer kepada ahli dan Pengerusi (semak Share pada folder); tiada emel notifikasi Google
- [ ] Ahli menjawab kehadiran; semua ahli nampak jawapan masing-masing
- [ ] Ahli yang bukan dijemput tidak nampak mesyuarat dan tidak boleh buka folder Drive
- [ ] Edit mesyuarat, buang seorang ahli: dia hilang mesyuarat serta-merta dan folder Drive tidak lagi boleh dibuka
- [ ] Mesyuarat baharu dengan "Sambung daripada mesyuarat lepas": agenda ada "Pengesahan Minit Mesyuarat Lepas" dan "Perkara Berbangkit"
- [ ] Batalkan mesyuarat: akses folder ahli ditarik balik, kekal dalam tab Arkib
- [ ] Nyahaktif seorang ahli di S-13: akses Drive ditarik; aktifkan semula: dipulihkan
- [ ] Ahli yang emelnya bukan akaun Google: terbitan berjaya tetapi amaran "tidak dapat dikongsi" dipaparkan

## Nota reka bentuk

- Respons API sentiasa HTTP 200; kod `401`/`403` dibawa dalam badan JSON kerana Apps Script tidak boleh set kod HTTP.
- Role dibaca dari Sheet pada setiap panggilan (cache 5 minit, dibuang bila berubah), bukan dari token.
- Semua lajur Sheet berformat Plain text. Medan nombor (`seq`, `version`, dll.) disimpan sebagai teks dan ditukar ke nombor apabila dibaca (Fasa 3 dan seterusnya).
- Mesyuarat Draf tidak dikongsi dalam Drive. Bila diterbitkan, semua ahli dikongsi Viewer pada subfolder mesyuarat itu sahaja. Admin dan Setiausaha Aktif dikongsi pada folder akar.
- Pengerusi mesyuarat dan Setiausaha yang mencipta mesyuarat ditambah sebagai ahli secara automatik.
- Trigger (`sendDigest_` dll.) dipasang oleh `setupSystem()` hanya jika function wujud. Run `setupSystem()` semula selepas Fasa 6.
