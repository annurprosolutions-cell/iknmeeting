# Panduan Admin SyuraDocs (1 halaman)

Admin menguruskan pengguna, tetapan, audit dan backup. Admin juga mempunyai semua kuasa Setiausaha.

## Tugas harian dan mingguan
- **Pengguna** (menu Pengguna): Tambah Pengguna atau Import Senarai (satu baris satu orang: nama, emel, jawatan, peranan). Emel mesti akaun Google. Nyahaktifkan orang yang tidak lagi terlibat: akses mereka ke sistem dan fail Drive ditarik serta-merta.
- **Peranan**: Admin (semua), Setiausaha (urus mesyuarat, bahan, minit, tindakan), Pengerusi dan Ahli (baca, kehadiran, komen). Pengerusi ditetapkan **pada setiap mesyuarat**, bukan pada peranan: sesiapa yang Aktif boleh dipilih sebagai Pengerusi mesyuarat itu.
- **Audit & Tetapan > Audit Log**: siapa buat apa dan bila (log masuk gagal, terbit, padam komen, buka semula minit, dsb.). Tidak boleh diubah atau dipadam melalui sistem.
- **Log Emel**: status setiap emel (Dihantar, Gagal, Dilangkau). "Dilangkau" bermakna kuota harian habis.
- **Backup**: automatik setiap Ahad ~02:00 ke folder "SyuraDocs Backup" (simpan 8 terkini). Tekan "Backup sekarang" sebelum perubahan besar. **Fail dalam Drive tidak disalin sistem**: salin folder "e-Mesyuarat IKN/Mesyuarat" sendiri setiap suku tahun.

## Tetapan
Nama sistem, **Alamat sistem** (wajib https, untuk pautan dalam emel), senarai nama mesyuarat, jam peringatan, Digest on/off, had muat naik (MB), bilangan backup.

## Kuasa khas Admin
- **Buka semula minit** yang telah Disahkan (kembali Draf, direkod audit). Setiausaha tidak boleh.
- Mengesahkan minit bagi pihak Pengerusi bila perlu.
- Padam komen sesiapa (direkod audit).

## Perkara yang perlu dijaga
1. Akaun Google pemilik sistem ialah identiti "Execute as" web app. Jika akaun itu digantung atau kata laluan ditukar tanpa semak, sistem terhenti. Jangan kongsi kata laluannya; tambah penyelenggara sebagai Editor Sheet melalui akaun mereka sendiri.
2. Jangan padam folder "e-Mesyuarat IKN" atau tab Sheet secara manual. Jika terlanjur, jalankan `setupSystem()` (selamat dijalankan berulang).
3. Kuota emel Gmail ~100 sehari. Lihat Log Emel jika ahli mengadu tidak menerima emel.
4. Kemas kini sistem dibuat oleh pemaju mengikut `PANDUAN-PEMASANGAN.md` bahagian E.

## Bila sistem bermasalah
Halaman log masuk memaparkan status sambungan. Jika "Sambungan gagal", hubungi pemaju dengan tangkap layar. Admin boleh melihat butiran ralat ringkas dalam kurungan pada mesej ralat.
