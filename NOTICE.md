# NOTICE — atribusi & lisensi LARAS

Berkas ini mencatat asal kode pihak ketiga di LARAS dan konsekuensi lisensinya.
Ia bukan pengganti `LICENSE`; ia menjelaskan **kenapa** `LICENSE` berbunyi AGPL.

## Lisensi LARAS

LARAS berlisensi **AGPL-3.0-or-later** sejak **2026-09-02**. Teks lengkapnya ada
di [`LICENSE`](./LICENSE).

    LARAS — pemutar musik web dengan lirik tersinkron per kata
    Copyright (C) 2026  Rafly (github.com/Rafly0078)

Sebelum tanggal itu proyek ini belum punya lisensi dan rencananya menulis mesin
lirik dari nol. Rencana itu dibatalkan; lihat "Sejarah keputusan" di bawah.

## Kode turunan: spicy-lyrics (AGPL-3.0)

Mesin lirik LARAS **diturunkan dari kode** `spicy-lyrics` karya **Spikerko**.

    Proyek   spicy-lyrics
    Penulis  Spikerko
    Sumber   https://github.com/spikerko/spicy-lyrics
    Lisensi  GNU AGPL-3.0
    Commit   4576d022b39e98291d71c75b0d4d355bcc332ced  (2026-08-29)

Commit di atas adalah revisi yang benar-benar dibaca dan disalin. Kalau nanti
ada pembaruan dari hulu, catat commit barunya di sini — jangan biarkan angka ini
menunjuk revisi yang bukan sumbernya.

Kode yang disalin tinggal di **`src/vendor/spicy-lyrics/`**. Direktori itulah
daftar yang berwenang, dan aturannya: **setiap file di dalamnya WAJIB membawa
header** yang menyebut berkas asalnya di repo hulu, commit-nya, penulis aslinya,
lisensinya, dan **catatan modifikasi** yang LARAS lakukan. Daftar nama file
sengaja tidak diduplikasi di sini supaya tidak pernah basi terhadap isi
direktorinya.

Kalau ada file di sana yang belum membawa header itu, itu **cacat kepatuhan**,
bukan gaya penulisan — tambahkan headernya, jangan hapus filenya.

Karena `spicy-lyrics` AGPL-3.0 dan LARAS memuat karya turunannya, **seluruh
LARAS ikut AGPL-3.0**. Itu bukan pilihan gaya, itu syarat lisensinya.

### Kewajiban pasal 13 — tawaran source ke pengguna jaringan

AGPL-3.0 pasal 13 mewajibkan: siapa pun yang berinteraksi dengan program ini
**lewat jaringan** harus ditawari source lengkap versi yang sedang ia pakai.
LARAS dilayani di <https://laras-web.vercel.app>, jadi kewajiban itu aktif.

LARAS memenuhinya dengan dua hal:

1. Repo source publik: <https://github.com/Rafly0078/laras-web>
2. Tautan ke repo itu **terlihat di UI**, di kaki sidebar
   (`src/components/shell/sidebar.tsx`).

Tautan itu **bukan hiasan**. Menghapusnya = melanggar lisensi. Repo juga harus
tetap **publik**; kalau ia diprivatkan, tautannya jadi 404 dan tawaran source
itu bohong.

## Kode turunan lain: Fraktality/spr (MIT)

    Sumber   https://github.com/Fraktality/spr
    Lisensi  MIT — Original Copyright (c) Fraktality

Dua berkas di LARAS adalah port dari `spr.lua`:

- `src/lib/lyrics/spring.ts` — port milik LARAS sendiri.
- `src/vendor/spicy-lyrics/modules/Spring.ts` — port milik spicy-lyrics, ikut
  tersalin bersama mesin liriknya.

MIT dan AGPL-3.0 cocok satu arah: kode MIT boleh masuk ke karya AGPL. Atribusi
di atas wajib tetap ada, baik di berkas ini maupun di header kedua berkas itu.

## Dependensi npm

Dependensi (Next.js, React, framer-motion, Tailwind, cubic-spline, dst.) diambil
lewat npm dan **tidak** ikut di-vendor ke repo ini. Lisensi masing-masing ada di
paketnya sendiri di `node_modules/`; `package.json` + `package-lock.json` adalah
catatan versinya.

## Data — bukan kode, dan bukan milik kami

Ini bagian yang paling sering disamarkan orang. LARAS mengatakannya terus
terang:

- **Katalog, metadata, artwork, dan lirik** berasal dari **Apple Music**, diambil
  lewat **relay pihak ketiga** `https://api.spicyamll.online` ("Lyricsflow API
  1.1.0") yang bukan milik kami dan tidak kami kendalikan.
- **Lirik cadangan** berasal dari **LRCLIB** (<https://lrclib.net>).
- **Audio** diputar dari **YouTube Music** lewat YouTube IFrame Player API,
  tunduk pada ToS YouTube.

Semua itu **DATA, bukan kode**. AGPL-3.0 di repo ini **tidak** melisensikannya,
dan kami **tidak berhak** melisensikannya kembali. Hak cipta lirik, artwork, dan
rekaman tetap pada pemiliknya masing-masing. Empat berkas TTML di `fixtures/`
memuat lirik berhak cipta dan hanya dipakai untuk unit test serta rute uji
(`/demo`, `/dev/lirik`) yang **404 di produksi** — lihat `HANDOFF.md` §10.

## Sejarah keputusan

- **Sebelum 2026-09-02** — keputusan lama: nol baris kode `spicy-lyrics`; hanya
  angka hasil pengukuran (fakta, bukan ekspresi berhak cipta), mesin lirik
  ditulis ulang dari nol. Tujuannya menghindari copyleft AGPL.
- **2026-09-02** — pemilik repo membatalkan keputusan itu dan memilih memakai
  kode mereka. AGPL-3.0 memang mengizinkannya; ongkosnya adalah seluruh proyek
  ikut AGPL-3.0, repo jadi publik, dan source wajib ditawarkan ke pengguna
  jaringan. Ketiga konsekuensi itu diterima secara eksplisit.

Jejak keputusan lama disimpan di sini dengan sengaja: supaya komentar lama di
kode yang masih berbunyi "tidak ada satu baris kode mereka" bisa dikenali
sebagai sisa fase sebelumnya, bukan sebagai keadaan sekarang.
