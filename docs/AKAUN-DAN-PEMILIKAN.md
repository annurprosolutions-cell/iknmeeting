# Akaun, Pemilikan dan Pelan Pindah Milik

Prinsip: **client memiliki semua akaun dan data**. Pemaju memegang kelayakan hanya sementara semasa pemasangan, dan kemudian menjadi penyelenggara dengan akses tertentu melalui akaun pemaju sendiri.

## 1. Inventori akaun
| # | Akaun | Fungsi | Pemilik akhir | Pemegang semasa pemasangan | Pemulihan/2FA |
|---|---|---|---|---|---|
| 1 | Google (emel client) | Pemilik Sheet, Apps Script, Drive, projek Google Cloud; identiti "Execute as" web app | Client | Pemaju (sementara) | Nombor telefon, emel pemulihan, kod sandaran: _isi_ |
| 2 | Google Cloud project "SyuraDocs" | OAuth Client ID | Client (di bawah akaun 1) | Pemaju (sementara) | Sama seperti akaun 1 |
| 3 | GitHub | Repo `syuradocs` (private) | Client | Pemaju (sementara) | 2FA dan recovery codes: _isi_ |
| 4 | Cloudflare | Hos frontend | Client | Pemaju (sementara) | 2FA dan recovery codes: _isi_ |
| 5 | Domain (jika ada) | `syura.…` | Client/IT client | IT client | _isi_ |

Sumber yang dihasilkan dan di mana: Google Sheet "SyuraDocs - DB" (data); folder Drive "e-Mesyuarat IKN" (bahan, dikongsi per mesyuarat); "SyuraDocs Backup" (salinan Sheet); Apps Script "SyuraDocs API" (backend, 4 trigger); repo `syuradocs`; Worker `syuradocs`.

## 2. Semasa pemasangan (tempoh pemaju memegang kelayakan)
- Gunakan profil pelayar berasingan untuk akaun client; jangan log masuk akaun client pada peranti kongsi.
- Jangan simpan kata laluan dalam chat, emel, repo atau fail teks. Gunakan pengurus kata laluan.
- Kod sandaran 2FA dicetak dan diserahkan kepada client semasa serah milik (jangan simpan salinan kekal).
- Direkod: tarikh mula memegang kelayakan, tarikh akhir, kebenaran bertulis client (rujuk `PANDUAN-PEMASANGAN.md` 0.1).

## 3. Pelan pindah milik (dibuat pada hari serahan, bersama client)
Senarai semak bertandatangan oleh kedua-dua pihak.

**Google**
- [ ] Client log masuk sendiri pada peranti mereka dan sahkan akaun berfungsi
- [ ] Tukar **kata laluan** (client memilih; pemaju tidak mengetahuinya)
- [ ] Tukar **emel pemulihan** dan **nombor telefon pemulihan** kepada milik client
- [ ] Daftar semula **2-Step Verification** pada telefon client; jana kod sandaran baharu dan serahkan cetakan
- [ ] Keluarkan semua peranti dan sesi lama (Security > Your devices > sign out)
- [ ] Semak Security > Third-party access: hanya aplikasi yang dijangka

**Akses penyelenggaraan pemaju selepas serah** (kaedah disyorkan: tiada perkongsian kata laluan)
- [ ] Client berkongsi Google Sheet "SyuraDocs - DB" sebagai **Editor** kepada akaun Google **pemaju sendiri** (membolehkan buka Apps Script dan kemas kini kod). Boleh ditarik balik bila-bila masa.
- [ ] GitHub: tambah pemaju sebagai **Collaborator** (atau Outside collaborator) pada repo
- [ ] Cloudflare: Manage Account > Members > jemput pemaju dengan peranan terhad (Workers Platform Admin, bukan Super Administrator)
- [ ] Setiap akses direkod: siapa, bila, tujuan; client boleh menarik balik

**GitHub dan Cloudflare**
- [ ] Tukar kata laluan, emel pemulihan, 2FA; keluarkan token/PAT yang pernah dijana pemaju (GitHub > Settings > Developer settings); semak "Authorized apps"
- [ ] Cloudflare: semak API Tokens, buang yang tidak digunakan

**Dokumen dan pengetahuan**
- [ ] Serah: `docs/` penuh, `README.md`, pakej kod (repo), senarai akaun ini, kod sandaran 2FA
- [ ] Latihan Sesi 1 dan 2 selesai (`LATIHAN.md`)
- [ ] Client mengesahkan boleh: log masuk Admin, tambah pengguna, Backup sekarang, buka Log Emel

## 4. Selepas serah
- **Penyelenggaraan**: perubahan kod diuji pada persekitaran ujian pemaju, kemudian dikemas kini pada sistem client melalui akses di bahagian 3 (`PANDUAN-PEMASANGAN.md` bahagian E).
- **Risiko kontinuiti**: jika akaun Google client digantung atau hilang akses, web app terhenti. Mitigasi: 2FA dan pemulihan lengkap, kod sandaran selamat, akaun tidak dibiarkan tidak aktif lebih 2 tahun (Gmail dipadam bila tidak aktif), backup mingguan, salinan folder Drive suku tahunan.
- **Pemindahan akaun pemilik sistem pada masa depan** (cth. pertukaran Setiausaha): tukar Admin dalam sistem (Pengguna), tetapi pemilik Sheet/Apps Script/Drive kekal akaun asal kecuali dipindah melalui "Make a copy" dan pasang semula dengan akaun baharu. Rancang ini bersama pemaju; jangan lakukan sendiri tanpa menyalin Sheet dan menjalankan semula langkah pemasangan.
- **Penamatan perkhidmatan**: client boleh meminta pemaju mengeluarkan akses; kod dan data kekal milik client.

## 5. Pengakuan serah milik
Nama dan jawatan wakil client: ________________  Tarikh: ____________
Nama pemaju: ________________  Tarikh: ____________
Kebenaran penggunaan akaun sepanjang pemasangan telah diterima: ☐ ya (rujukan: ____________)
