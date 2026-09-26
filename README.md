# Undian — Chill n Sunset / Mini Gath Riot Balikpapan

Aplikasi undian berbasis web (tanpa database). Cukup buka lewat XAMPP:

```
http://localhost/undian/
```

## Isi
| File | Fungsi |
|---|---|
| `index.html` | Halaman panggung undian (pengaturan, pengacakan live, papan pemenang) |
| `absensi.html` | Halaman Absensi, dirancang untuk HP (cari, tandai hadir, tambah peserta) |
| `peserta.html` | Jendela Kelola Peserta (cari, tambah, ubah, hapus nama, tandai L/P) |
| `tim.html` | Pembagian tim acak dengan perempuan merata |
| `app.js` | Logika undian, baca Excel, drum roll, konfeti |
| `style.css` | Tema *sunset* untuk kedua halaman |

## Cara pakai
1. **Upload peserta** — buka *Pengaturan Undian → Data Peserta*, upload file `.xlsx`, `.xls`, atau `.csv`.
   Kolom **Nama** wajib (kolom nomor urut otomatis dilewati). Dua kolom opsional:
   **L/P** (header `L/P` / `JK` / `Gender` / `Kelamin`, isi `P` untuk perempuan) dan
   **Ikut Tim** (header `Ikut Tim` / `Status` / `OK`, isi `NOT` untuk yang bertugas).
   Tersedia juga tombol *Unduh Template* dan *Input Manual* (ketik/paste satu nama per baris).
   Nama otomatis dirapikan menjadi huruf besar di awal tiap kata (`pak trish` → `Pak Trish`).
   Setiap nama punya tombol **×** untuk dihapus, dan tombol **⤢ Kelola Peserta** membuka jendela
   terpisah berisi kotak pencarian, tambah nama, dan hapus per baris — perubahannya langsung
   terbaca di halaman undian.
2. **Pilih hadiah & jumlah** — pada form undian, pilih hadiah dari daftar (default *- Pilih Hadiah -*;
   daftar hadiah bisa ditambah/diubah lewat tombol **⚙ Kelola**) lalu isi **jumlah yang diundi**.
   Bila salah satu belum diisi, muncul peringatan dan undian tidak jalan.
3. **Undi** — tekan **MULAI UNDIAN**, lalu **STOP PENGUNDIAN**: pengacakan melambat ±2 detik lalu
   berhenti dan semua pemenang hadiah itu tampil sekaligus (fanfare + pita).
4. **Lanjut atau akhiri** — **🔄 PENGUNDIAN LAGI** menyimpan hasil lalu menampilkan kembali form
   pilihan hadiah (hadiah yang sama boleh dipilih lagi). **✅ PENGUNDIAN SELESAI** (ada di panggung
   maupun di bawah halaman) meminta konfirmasi, lalu menampilkan seluruh pemenang bernomor
   langsung di halaman ini — dikelompokkan per hadiah, bisa dicetak/PDF atau diunduh ke Excel.
5. **Reset** — **RESET SEMUA PENGUNDIAN** (dengan konfirmasi) menghapus seluruh hasil dan
   mengembalikan semua nama ke kotak undian. Daftar peserta tidak ikut terhapus.

## Absensi (`absensi.html`) — saringan pertama
Halaman ini dibuat untuk dipegang di HP saat menyambut tamu.

- Daftarnya **dibuka pada tab "Belum Hadir"**, jadi begitu seseorang ditandai hadir namanya
  langsung hilang dari antrean. Tab **Hadir** dan **Semua** tetap bisa dibuka.
- Kotak pencarian di atas menempel saat digulir. Jam absen dicatat otomatis.
- Pada tab **Belum Hadir** tiap baris hanya punya satu tombol: **HADIR**. Tombol **TIDAK**
  (untuk membatalkan kehadiran) muncul di tab **Hadir** dan **Semua**, karena di tab
  Belum Hadir barisnya memang sudah hilang sendiri setelah ditandai.
- Saat ditandai hadir, barisnya **berubah hijau dulu dan tetap terlihat ±2 detik**, baru
  meluncur keluar dari antrean. Tiap baris punya jatah 2 detiknya sendiri, jadi mengabsen
  beberapa orang beruntun tidak memotong tampilan yang lain. Menekan **TIDAK** sebelum
  2 detik membatalkan penghapusan dan barisnya tetap di daftar.
- **＋ Tambah Peserta** membuka isian nama + pilihan **L / P**. Peserta yang ditambahkan dari
  sini langsung ditandai **hadir**, **ikut undian**, dan **ikut tim**.
- Halaman ini sengaja dibuat polos: tidak ada tombol hapus peserta dan tidak ada tombol
  aksi massal. Semua itu ada di *Kelola Peserta*; ke halaman lain lewat tombol Back
  browser atau alamatnya langsung.

**Kehadiran adalah saringan pertama:** peserta yang belum ditandai hadir **tidak ikut
pengundian dan tidak ikut dibagi ke tim**, meskipun statusnya OK Undian / OK Tim. Halaman
undian dan pembagian tim menampilkan jumlahnya (🚷 *n* belum hadir) dan menolak mulai bila
belum ada satu pun yang hadir.

## Konfirmasi sebelum mengubah data peserta
Di halaman **Kelola Peserta**, tombol **UNDI/NON**, **TIM/NON**, dan **L/P** selalu menampilkan
dialog konfirmasi dulu, begitu juga tombol aksi massal (mis. "6 nama yang dipilih akan
dikeluarkan dari pengundian"). Tekan **Batal** dan tidak ada yang berubah.

## Mengubah nama peserta
- Di halaman **⤢ Kelola Peserta**, klik nama peserta untuk mengubahnya di tempat.
  **Enter** simpan, **Esc** batal. Namanya otomatis dirapikan jadi huruf besar di awal kata
  (mis. "dokter rifky pratama" → "Dokter Rifky Pratama").
- Bila orang itu sudah tercatat sebagai pemenang, namanya di daftar pemenang ikut berubah,
  jadi ia tetap tidak bisa menang dua kali.
- Bila nama barunya sama persis dengan peserta lain, muncul peringatan dulu — nama kembar
  membuat pencatatan pemenang bisa tertukar.

## Pemberi hadiah tidak menang hadiahnya sendiri
- Bila nama peserta tercantum di nama hadiah, ia otomatis tidak diikutkan untuk hadiah itu.
  Contoh: peserta **Ahmad** tidak bisa menang **"Grand Prize (Baju Kalcer Dari Ahmad)"**,
  tapi tetap ikut hadiah lain seperti Doorprize Biznet.
- Pencocokan per kata (minimal 3 huruf), jadi "Ahmad Fauzi" ikut tertahan, sedangkan kata
  umum seperti *dari, oleh, hadiah, doorprize, grand, prize, utama, hiburan, voucher*
  diabaikan — peserta bernama "Dari Susanti" tidak ikut tertahan.
- Nama yang ditahan disebutkan di catatan bawah form (🚫 …) begitu hadiah dipilih, dan
  di baris status saat roll berjalan. Mereka juga tidak muncul selama nama berputar.
- Bila tidak ingin aturan ini berlaku, ubah saja nama hadiahnya lewat **⚙ Kelola**.

## Kirim hasil ke WhatsApp
- Setiap kotak di **Hasil Sementara** punya tombol **💬 Kirim** dan **📋 Salin** untuk
  pemenang sesi itu saja. Judul di pesannya sama persis dengan judul kotaknya
  (mis. *Pengundian Ke-2 | Doorprize Gulf*) dan nomor urutnya mengikuti yang tampil di layar.
- Di bawah daftar ada **💬 Kirim Semua ke WhatsApp** dan **📋 Salin Semua** — isinya seluruh
  sesi yang digabung per hadiah, jadi judulnya memakai nama hadiah saja tanpa nomor pengundian.
- Di halaman hasil akhir, tiap judul hadiah juga punya **💬 Kirim** dan **📋 Salin** sendiri
  di sampingnya, selain tombol untuk seluruh hasil di bagian bawah.
- Halaman **Pembagian Tim** punya tombol yang sama: 💬 dan 📋 kecil di kepala tiap kartu tim
  untuk mengirim satu tim saja, serta **💬 Kirim Semua ke WhatsApp** dan **📋 Salin Semua**
  di baris tombol bawah. Perempuan ditandai ♀ dan tiap tim disertai jumlah orang serta
  jumlah perempuannya.
- Tombolnya membuka `wa.me/?text=...` di tab baru: WhatsApp terbuka dengan pesan sudah
  terisi, penerima tetap dipilih sendiri lalu tekan kirim (WhatsApp tidak mengizinkan
  pengiriman otomatis). Bila daftarnya sangat panjang (>1500 karakter) muncul peringatan —
  pakai tombol Salin lalu tempel manual agar pesan tidak terpotong.

## Catatan teknis
- Pengacakan memakai `crypto.getRandomValues` (acak kriptografis, tanpa bias) dengan
  pengambilan sampel unik, sehingga satu nama tidak mungkin menang dua kali.
- Jumlah hadiah tidak boleh melebihi jumlah peserta — tombol MULAI otomatis nonaktif
  dan status di bawah papan memberi tahu bila jumlahnya kurang.
- Peserta, pengaturan, dan pemenang disimpan di `localStorage` browser, jadi aman bila halaman
  ter-refresh. Gunakan browser & perangkat yang sama saat acara.
- Musik drum roll disintesis lewat Web Audio API (tidak butuh file audio). Tombol 🔊 untuk
  menyalakan/mematikan, ⛶ untuk layar penuh saat presentasi.
- Pembacaan Excel memakai SheetJS dari CDN, jadi saat pertama kali dibuka perlu internet.
  Bila offline, gunakan file `.csv` atau *Input Manual* yang tidak butuh pustaka apa pun.

## Pembagian Tim (`tim.html`)
Dibuka lewat tautan **👥 Pembagian Tim** di halaman undian.

- Memakai daftar peserta yang sama dengan undian.
- Isi **jumlah tim** dan awalan nama tim, tekan **Bagi Tim Sekarang** (atau **Acak Ulang Tim**).
- **Perempuan dibagi rata**: peserta perempuan dibagikan lebih dulu ke tim yang perempuannya
  paling sedikit, baru laki-laki mengisi tim yang anggotanya paling sedikit — selisih antar tim
  maksimal 1 orang, baik jumlah anggota maupun jumlah perempuan.
- Menandai perempuan: klik nama pada daftar (L ⇄ P). Bisa juga otomatis dari file Excel bila ada
  kolom berjudul `JK` / `Gender` / `Kelamin` / `L/P` berisi `P` (atau Perempuan/Wanita/Cewek).
- Nama tim bisa diklik untuk diubah. Hasil tersimpan sendiri, bisa dicetak/PDF atau diunduh ke Excel.

### Peserta yang bertugas saat acara
Setiap peserta punya status **OK** (ikut tim) atau **NOT** (bertugas, tidak ikut tim).
Tombolnya ada di halaman *Kelola Peserta* maupun *Pembagian Tim*; nama ber-status NOT
tampil dicoret dan dikeluarkan dari pembagian tim, **tetapi tetap ikut undian hadiah**.

### Peserta yang tidak ikut undian
Selain status tim, tiap peserta punya status **UNDI** (ikut undian) / **NON** (tidak ikut undian).
Tombolnya ada di halaman *Kelola Peserta*, dan bisa diisi dari kolom **Ikut Undian** pada file Excel.
Nama ber-status NON tidak pernah muncul di papan undian — termasuk saat nama-nama sedang berputar.

Kedua status ini berdiri sendiri:

| | Ikut tim | Ikut undian |
|---|---|---|
| Tombol **TIM** / **NON** | ya / tidak | tidak terpengaruh |
| Tombol **UNDI** / **NON** | tidak terpengaruh | ya / tidak |
