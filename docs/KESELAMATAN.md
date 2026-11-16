# Keselamatan SyuraDocs: kawalan, keputusan ujian dan perkara terbuka (Fasa 7)

Versi 0.7.0. Dokumen ini menyatakan apa yang **telah diuji secara automatik** dan apa yang **belum boleh disahkan tanpa akaun dan persekitaran sebenar**.

## 1. Model akses
| Peranan | Kuasa |
|---|---|
| Admin | Semua; pengguna, Audit, Log Emel, Tetapan, Backup; buka semula minit |
| Setiausaha | Cipta/urus mesyuarat, agenda, bahan, minit (sediakan, hantar), tindakan |
| Pengerusi (per mesyuarat) | Mula/tamat mesyuarat, sahkan minit mesyuarat itu, urus tindakan mesyuarat itu, nampak Bahan Bicara |
| Ahli | Nampak hanya mesyuarat yang dijemput (bukan Draf); kehadiran, komen, bahan, minit Disahkan, tindakan sendiri |

Pelaksanaan: setiap panggilan API menyemak token sesi, kemudian membaca peranan terkini daripada Sheet (bukan daripada token). Menurunkan atau menyahaktifkan pengguna berkuat kuasa pada panggilan seterusnya. Semua semakan dibuat di **server** (Apps Script); frontend hanya menyembunyikan menu.

## 2. Kawalan utama
- **Log masuk**: Google ID token disahkan di server (audience, issuer, tamat tempoh, emel disahkan) dan emel mesti didaftar dan Aktif. Tiada rahsia dalam frontend.
- **Pemisahan data**: Draf mesyuarat dan draf minit tidak dipulangkan kepada ahli; komen "Pengerusi & Setiausaha" dan komen semakan minit ditapis di server; tindakan ahli hanya milik sendiri.
- **Drive**: akses folder dikongsi per mesyuarat (Viewer) tanpa emel notifikasi; Bahan Bicara dalam folder `Terhad` berasingan; folder Backup di luar folder yang dikongsi.
- **Pengepala dan CSP** (`_headers`): `default-src 'self'`, skrip hanya `self` dan Google Identity, tiada `unsafe-inline`/`unsafe-eval` untuk skrip, `frame-ancestors 'none'`, `base-uri`/`form-action` `self`, `nosniff`, Referrer-Policy.
- **Penjanaan DOM selamat**: tiada `innerHTML` dengan data pengguna; minit dipapar melalui pemapar Markdown yang membina DOM (HTML yang ditaip dipaparkan sebagai teks).
- **Sheet**: semua lajur format teks biasa supaya sel bermula `=`/`+`/`-`/`@` tidak ditafsir sebagai formula.
- **Audit**: tindakan sensitif direkod (log masuk gagal, terbit, batal, bahan, padam komen, minit hantar/tarik/sahih/buka semula, tindakan dicipta, backup); tiada API untuk ubah atau padam audit log.
- **Emel**: hanya tajuk, tarikh/masa dan pautan; tiada kandungan bahan, komen, minit atau Bahan Bicara.
- **Had saiz**: minit 45,000 aksara; komen 3,000; muat naik mengikut tetapan (maks 50 MB); input dibersihkan dan dihadkan panjang di server.

## 3. Keputusan ujian automatik (semua lulus pada 0.7.0)
| Suite | Bilangan | Fokus |
|---|---|---|
| `backend`, `meetings`, `materials`, `feedback`, `notify`, `install` | 136 | Logik backend dengan mock Apps Script |
| `minutes` | 22 | Minit dan Tindakan: keterlihatan, versi, kelulusan, emel, tertunggak, perkara berbangkit |
| `security` | 22 | Lihat di bawah |
| `perf` | 10 | Bacaan Sheet setiap action; 200 poll berulang = 0 bacaan |
| Frontend (smoke, fasa 2, 3, 4, 5, 6) | 6 suite | Pelayar sebenar (Playwright), CSP sebenar dikenakan; Fasa 5 menggunakan **backend sebenar** dalam harness |
| `frontend.a11y` | 40 halaman/keadaan | axe-core, WCAG 2.1 A dan AA, cerah/gelap/telefon: **0 pelanggaran** |

`security.test.js` menguji:
1. Setiap route API (49) dipetakan kepada polisi; route baharu tanpa polisi gagalkan ujian.
2. Tanpa token atau token palsu (13 jenis termasuk objek, tatasusunan, suntikan, token diubah) = 401 untuk semua route bukan awam.
3. Ahli dan pengguna luar = 403 pada setiap route staf/admin, dengan data kosong dan data sah (ID sebenar). Setiausaha ditolak pada semua route Admin.
4. Peranan diturunkan atau pengguna dinyahaktif: akses hilang serta-merta.
5. Kebocoran: pengguna luar dan ahli tidak menerima teks rahsia (minit draf, tindakan, komen terhad) daripada mana-mana route baca; respons tidak memuatkan token sesi atau kunci.
6. Fuzz (15 jenis payload × semua route × 5 peranan, termasuk `__proto__`, suntikan formula, rentetan 200 KB): tiada ralat dalaman 500; prototype tidak tercemar.
7. Badan permintaan rosak dan nama action berbahaya (`__proto__`, `constructor`) sentiasa dijawab JSON `ok:false`.
8. Imbasan kod: tiada kunci peribadi/token/rahsia, tiada `innerHTML`/`eval` berbahaya dalam frontend, CSP ketat, tiada skrip sebaris, pautan luar `noopener`, Apps Script tidak memanggil hos selain Google dan tidak melog token, skop OAuth eksplisit.

Ujian ini membuktikan logik kebenaran dalam kod. Ia **tidak** menguji infrastruktur Google atau Cloudflare.

## 4. Penemuan semasa Fasa 7 (telah dibetulkan)
- Butang menu pengguna pada telefon tiada nama boleh diakses (pembaca skrin): ditambah `aria-label`. Dikesan oleh axe-core.

## 5. Perkara terbuka (belum selesai atau tidak boleh disahkan di sini)
1. **Kelulusan IKN/KKM untuk perkhidmatan awan awam dan Akta Rahsia Rasmi 1972**: belum dijawab. Jika dokumen mesyuarat berklasifikasi Terhad/Rahsia, penyimpanan di Google Drive mungkin tidak dibenarkan oleh dasar jabatan. **Perlu keputusan bertulis pihak IKN sebelum live.** Pemaju tidak boleh menjawab ini.
2. **PDPA 2010**: sistem menyimpan nama, emel, jawatan (dan gambar pilihan). Lokasi data ialah pelayan Google. Client perlu menilai keperluan notis privasi dan persetujuan.
3. **Ujian beban sebenar** (20 pengguna serentak, 20 minit) dan **kuota emel Gmail** belum diukur pada akaun sebenar (lihat `UJIAN-PILOT.md`).
4. **Ujian had muat naik 16 MB** (fail HMI) belum dilaporkan.
5. **Ahli luar** (tiada akaun Google) tidak boleh membuka fail Drive. Mereka perlu akaun Google (Gmail percuma sudah memadai).
6. **Satu titik kegagalan akaun**: web app dijalankan sebagai akaun pemilik. Jika akaun digantung, kehilangan akses, atau 2FA hilang, sistem terhenti. Lihat `AKAUN-DAN-PEMILIKAN.md`.
7. **Backup fail Drive** tidak automatik (hanya Sheet). Salinan folder mesyuarat dibuat manual.
8. **Penilaian penembusan pihak ketiga** belum dibuat. Imbasan automatik di atas bukan pengganti.
9. **Aksesibiliti**: axe-core mengesan sebahagian besar isu sahaja (anggaran 30 hingga 40%). Ujian dengan pembaca skrin sebenar (NVDA/TalkBack) belum dibuat.

## 6. Cadangan operasi
- Aktifkan 2-Step Verification pada semua akaun (Google, GitHub, Cloudflare) dan simpan kod sandaran dengan client.
- Semak Audit Log dan Log Emel sekurang-kurangnya sebulan sekali.
- Jalankan `node tests/run-all.js` selepas setiap perubahan kod sebelum deploy.
