# Pelan Ujian Pilot dan Senarai Semak Kemasukan Live

Ujian automatik (lihat `KESELAMATAN.md`) menggunakan mock Google. Ia **tidak** menggantikan ujian dengan akaun Google sebenar. Dokumen ini ialah ujian manual itu.

## Ujian asap hari pertama (selepas pemasangan, ~30 minit)
Perlukan: akaun Admin, satu emel Setiausaha, satu Pengerusi, dua Ahli (semua emel Google sebenar, boleh log masuk pada peranti berasingan).
- [ ] Halaman log masuk papar "Sambungan berjaya"
- [ ] Log masuk Admin; akaun Google lain yang tidak didaftar ditolak (baris `login_gagal` dalam Audit Log)
- [ ] Cipta Setiausaha, Pengerusi, 2 Ahli; setiap seorang log masuk dan menu betul (Ahli: Dashboard dan Mesyuarat sahaja)
- [ ] Cipta mesyuarat Draf: folder muncul dalam Drive; Ahli tidak nampak
- [ ] Terbitkan: folder dikongsi (Viewer), tiada emel kongsi Google, **setiap ahli menerima satu emel jemputan** dengan pautan betul
- [ ] Ahli luar (bukan dijemput) tidak boleh buka mesyuarat atau folder Drive
- [ ] Muat naik PDF, PPTX, DOCX, XLSX: pratonton berfungsi dalam penonton
- [ ] **Ujian had muat naik**: fail 5 MB, 20 MB, dan fail HMI 16 MB (pptx). Catat keputusan; jika gagal gunakan Imbas folder Drive
- [ ] Bahan Bicara: Pengerusi nampak, Ahli tidak, folder `Terhad` tidak boleh dibuka Ahli
- [ ] Mod Mesyuarat pada 3 peranti; item semasa bertukar pada Ahli dalam 30 saat; komen muncul tanpa muat semula
- [ ] Minit: Draf (hanya staf nampak) > Untuk Semakan (Pengerusi nampak, Ahli tidak) > Disahkan (semua nampak); emel semakan dan pengesahan diterima; cetak; lampir PDF
- [ ] Tindakan: Ahli hanya nampak tindakan sendiri; maklum balas dipaparkan kepada staf; tertunggak ditanda
- [ ] Backup sekarang berjaya; 9 kali berturut hanya 8 kekal
- [ ] Setiausaha dan Ahli tidak boleh buka Audit & Tetapan dan folder "SyuraDocs Backup"
- [ ] Pasang app pada telefon dan komputer; matikan internet selepas buka agenda: agenda masih boleh dibaca

## Pilot (satu mesyuarat sebenar, selari dengan kaedah lama)
1. Pilih satu mesyuarat dengan risiko rendah (cth. mesyuarat dalaman biasa), 2 minggu sebelum tarikh.
2. Setiausaha menyediakan dan menerbitkan; semua dokumen **tetap diedarkan melalui kaedah lama** sebagai sandaran.
3. Semua ahli (~20) menggunakan Mod Mesyuarat selama sekurang-kurangnya 20 minit. Catat: kelewatan paparan, ralat kuota, sesiapa tersangkut.
4. Selepas mesyuarat: minit melalui sistem hingga Disahkan; tindakan dicipta dan dimaklum balas.
5. Kutip maklum balas (borang ringkas): mudah digunakan? paparan telefon? apa yang mengelirukan?

### Kriteria lulus pilot
- [ ] Tiada kehilangan data atau akses tidak sah
- [ ] Semua ahli dapat membuka bahan dalam masa kurang 10 saat pada rangkaian biasa
- [ ] Ujian beban 20 pengguna serentak 20 minit tanpa ralat kuota atau paparan tersangkut
- [ ] Emel jemputan, peringatan dan minit diterima oleh semua ahli (semak Log Emel; tiada "Dilangkau")
- [ ] Setiausaha melaksanakan satu kitaran penuh (cipta hingga minit disahkan) tanpa bantuan pemaju
- [ ] Skor kepuasan pengguna ≥ 4/5 atau semua isu kritikal diselesaikan
- [ ] Tiada isu Kritikal atau Tinggi yang terbuka

## Log isu pilot
| # | Tarikh | Dilapor oleh | Skrin / langkah | Perihal | Tahap (Kritikal/Tinggi/Sederhana/Rendah) | Status | Catatan pembetulan |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |

Tahap: **Kritikal** = data bocor, kehilangan data, tidak boleh log masuk; **Tinggi** = fungsi utama gagal tanpa jalan pintas; **Sederhana** = ada jalan pintas; **Rendah** = kosmetik.

## Senarai semak kemasukan live (go-live)
- [ ] Pilot lulus dan isu Kritikal/Tinggi ditutup
- [ ] Latihan Sesi 1 dan 2 selesai
- [ ] Semua pengguna sebenar didaftar dan disahkan emel Google mereka
- [ ] Alamat sistem ditetapkan; Backup sekarang dibuat
- [ ] Dokumen akaun dan pelan pindah milik (`AKAUN-DAN-PEMILIKAN.md`) ditandatangani
- [ ] Soalan kelulusan penggunaan awan IKN dijawab (lihat `KESELAMATAN.md` bahagian "Perkara terbuka")
- [ ] Kaedah lama dikekalkan sebagai sandaran bagi 1 mesyuarat pertama selepas live
