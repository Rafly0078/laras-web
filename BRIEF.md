# LARAS — brief teknis untuk kontributor & subagent

Baca ini SEBELUM menulis kode. Semua keputusan di sini sudah final.

## Apa ini

Web pemutar musik bergaya Apple Music dengan lirik tersinkron per kata.
Nama produk: **LARAS** (satu keluarga dengan app Android LARAS milik pemilik repo).

- **Katalog, metadata, artwork, lirik** → API Apple Music lewat relay
  `https://api.spicyamll.online` (nama resmi relay: "Lyricsflow API 1.1.0").
- **Audio** → YouTube Music, diputar lewat YouTube IFrame Player API.
- **Visual lirik** → mengikuti spicy-lyrics (spikerko), bukan Apple Music dan
  bukan LARAS Android. Nilainya ada di `src/lib/lyrics/design-tokens.ts`.
- **Tanpa akun.** Tidak ada login, tidak ada database user.

## Fase: SELESAI — data live, siap produksi

Bagian ini dulu berbunyi "FRONTEND SAJA, semua data dari fixtures". Itu sudah
lewat. Keadaan sekarang:

- Katalog, lirik, dan audio semuanya LIVE. `fixtures/` tinggal dipakai unit test
  dan dua rute uji (`/demo`, `/dev/lirik`) yang 404 di produksi.
- Ada lapisan data milik sendiri: `src/lib/data/` dengan penggabungan permintaan,
  dan `src/app/api/` (`/api/lirik/[id]`, `/api/health`) dengan rate limit.
- Tidak ada lagi stub `[TODO backend]`.

Yang TIDAK berubah dan tetap final: **tanpa akun, tanpa database user.** Riwayat
dan favorit hidup di localStorage perangkat. Lihat `HANDOFF.md` §5 untuk
konsekuensi yang diterima.

## Stack

- Next.js 16 App Router, React 19, TypeScript
- Tailwind v4 (CSS-first: `@theme` di `src/app/globals.css`, TANPA tailwind.config)
- framer-motion 13 — untuk transisi halaman/sheet/mini player SAJA
- Vitest untuk unit test (`npm test`)

**framer-motion TIDAK BOLEH menyentuh lirik.** Lirik butuh satu rAF loop yang
men-`step()` spring tiap kata tiap frame lalu menulis CSS custom property.
Ratusan komponen motion akan mati di 60fps.

## Kontrak data

`src/lib/types.ts` adalah SATU sumber kebenaran. Renderer tidak boleh tahu data
datang dari mana; adapter yang menormalkan. Kalau sumber mati, ganti adapternya.

Semua waktu dalam **DETIK** (bukan ms) — satuan `getCurrentTime()` IFrame API.

## Tema

Gelap tunggal, tanpa light mode. Token di `globals.css`:

    hitam #000 · surface #0a0a0a · elevated #141414 · card #1c1c1e
    control #2c2c2e · outline #3a3a3c
    teks #f5f5f7 · sekunder #aeaeb2 · tersier #8e8e93
    aksen #fa2d48

Pakai kelas `bg-laras-card`, `text-laras-secondary`, dst. Radius pakai
`rounded-[var(--radius-card)]` — JANGAN `rounded-xl`/`rounded-lg` Tailwind.

Font: Inter (UI) + Inter Tight (display) sebagai pengganti SF Pro.

Bahasa UI: **Indonesia**.

## Fixtures

    fixtures/tracks.json          4 lagu: id Apple, durasi, videoId YouTube hasil jembatan
    fixtures/ttml/*.ttml          TTML word-level Apple ASLI
                                  die-with-a-smile 306 span (duet v1/v2 + backing v1000)
                                  bertaut 395 · hati-hati-di-jalan 239 · peradaban 935
    fixtures/apple/*.json         respons katalog mentah: search, recommendations,
                                  album-manusia, artist-tulus
    fixtures/lrclib/*.json        respons LRCLIB nyata (bertaut, hati-hati)
                                  — cadangan lirik line-level
    fixtures/youtube/*.json       respons InnerTube nyata untuk uji parser

Struktur TTML Apple:
- root `itunes:timing="Word"`
- `<div itunes:songPart="Chorus">` — Intro/Verse/PreChorus/Chorus/PostChorus/Bridge/Outro
- `<p begin end itunes:key ttm:agent>` — agent `v1`/`v2` = duet, `v1000` = grup/backing
- `<span begin end>` per kata
- Format waktu **CAMPUR**: `"9.420"` dan `"4:20.642"` — parser wajib tahan keduanya
- `<span ttm:role="x-bg">` membungkus vokal latar dan **BERSARANG**: ia tidak punya
  begin/end sendiri, isinya `<span begin end>` per kata. Terverifikasi di
  peradaban.ttml (16 wrapper x-bg, nested = true).
- Kata bisa dipecah jadi suku kata TANPA spasi di antaranya:
  `<span>Su</span><span>a</span><span>tu</span>` = satu kata "Suatu". Kalau tidak
  ada whitespace antar span, potongan itu `isPartOfWord: true` (jangan diberi
  jarak 0.32ch).
- Fakta terukur per fixture: die-with-a-smile agent {v1,v2,v1000} 50 `<p>` 306 span;
  peradaban agent {v1} 64 `<p>` 935 span + 16 x-bg; bertaut {v1} 36/395;
  hati-hati-di-jalan {v1} 41/239 dan **tanpa** `itunes:songPart` sama sekali
  (jadi songPart wajib opsional).

Artwork Apple: `attributes.artwork.url` berisi template `.../{w}x{h}bb.jpg`.
Isi `{w}`/`{h}` sendiri. CORS `*`, jadi canvas getImageData aman. Sampai 3000px.

## Jebakan yang sudah terbukti (jangan ulangi)

1. **Durasi YouTube**: dengan `hl=id` formatnya `4.02` (titik), dengan `hl=en`
   `4:02`. Parser wajib tahan keduanya — kalau tidak, jembatan Apple→YouTube
   gagal 0/7 tanpa error yang jelas.
2. **Relay /lyrics lambat saat cold**: 9,8–11,7 detik untuk lagu baru, 310–620ms
   kalau sudah pernah diminta. Wajib di-cache di fase backend. Fase frontend
   pakai fixture, tanpa jaringan.
3. **YouTube Music tidak punya lirik ber-timestamp.** Sudah ditelusuri sampai
   browseId `MPLY...`: nol `cueRange`, nol `timedLyricsData`. Jangan coba lagi.
4. **`/player` InnerTube balas UNPLAYABLE** tanpa PO token — jalur stream audio
   langsung tertutup (dan itu memang melanggar ToS). IFrame API satu-satunya jalan.
5. **Tailwind v4 mengembalikan `oklab()`/`lab()`** dari `getComputedStyle().color`,
   bukan `rgb()`. Kode kontras yang meregex angka akan salah. Konversi via canvas.
6. **Math.random() di useState initializer** = hydration mismatch fatal di Next.
   Semua nilai render-time wajib deterministik.

## Aturan YouTube ToS (bukan opsional)

- Iframe **wajib terlihat** saat mode Video; viewport minimal 200×200px.
- **Dilarang** menaruh overlay/elemen apa pun DI DEPAN player yang terlihat.
  Karena itu: saat mode Video menyala, lirik **disembunyikan sepenuhnya** dan
  tombol lirik menjadi non-aktif. Ini keputusan final pemilik repo.
- Autoplay wajib muted dulu.
- Jangan pernah menyembunyikan iframe untuk menjadikannya audio-only.

## Lisensi: AGPL-3.0 — DIUBAH 2026-09-02

Keadaan sekarang, dan ini yang berlaku:

**Kode `spicy-lyrics` (spikerko, AGPL-3.0) DIPAKAI di project ini.** Mesin
liriknya diturunkan dari kode mereka, disalin dari commit
`4576d022b39e98291d71c75b0d4d355bcc332ced`, dan tinggal di
`src/vendor/spicy-lyrics/` — tiap berkas di sana membawa header asal + catatan
modifikasi.

Konsekuensinya sudah diterima pemilik repo secara eksplisit, ketiganya:

1. **Seluruh LARAS ikut AGPL-3.0-or-later.** Bukan pilihan gaya — syarat
   copyleft. Lihat `LICENSE` dan `NOTICE.md`.
2. **Repo jadi publik.** `HANDOFF.md` §10 masih mencatatnya private; itu harus
   diubah di GitHub, bukan cuma di dokumen.
3. **Source wajib DITAWARKAN ke pengguna jaringan** (AGPL pasal 13). LARAS
   dilayani di laras-web.vercel.app, jadi pasal itu aktif: tautan ke
   github.com/Rafly0078/laras-web terpasang di kaki sidebar dan **tidak boleh
   dihapus**.

Spring tetap di-port dari `Fraktality/spr` (MIT) — MIT boleh masuk ke karya
AGPL, atribusinya wajib tetap ada.

Katalog, artwork, lirik, dan audio adalah **data** pihak ketiga (Apple Music via
relay, LRCLIB, YouTube). AGPL kita tidak melisensikannya dan kita tidak berhak
melisensikannya kembali.

### Keputusan lama (dibatalkan)

Bagian ini dulu berbunyi: "**Nol baris kode mereka** di project ini — hanya angka
hasil pengukuran (fakta, bukan ekspresi berhak cipta). Tulis semuanya dari nol."
Tujuannya menghindari copyleft AGPL.

Pemilik repo membatalkannya pada **2026-09-02**: menyalin kode mereka jauh lebih
murah daripada menulis ulang mesin lirik, dan AGPL memang mengizinkannya asalkan
karya turunan ikut AGPL-3.0 dan source ditawarkan ke pengguna. Kedua syarat itu
dipenuhi, jadi tidak ada alasan lagi menulis dari nol.

Jejaknya disimpan karena beberapa komentar di kode lama masih berbunyi "tidak
ada satu baris kode mereka" (mis. `src/lib/lyrics/design-tokens.ts`). Itu sisa
fase sebelumnya, bukan keadaan sekarang.

## Gaya kode

- Komentar menjelaskan **kenapa**, bukan apa. Angka desain wajib punya alasan.
- Komentar & UI dalam bahasa Indonesia; nama simbol dalam bahasa Inggris.
- Tidak ada `any` kalau bisa dihindari; `strict` menyala.
- Tulis unit test untuk logika murni (matematika timing, parsing). Jalankan
  `npm test` dan `npm run typecheck` sebelum menyatakan selesai.
