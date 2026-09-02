# LARAS

Pemutar musik web bergaya Apple Music dengan **lirik tersinkron per kata**.

- **Katalog, metadata, artwork, lirik** — Apple Music lewat relay pihak ketiga,
  dengan LRCLIB sebagai cadangan lirik level-baris.
- **Audio** — YouTube Music, diputar lewat YouTube IFrame Player API.
- **Tanpa akun.** Tidak ada login, tidak ada database user; riwayat dan favorit
  hidup di localStorage perangkat.
- **Bahasa UI: Indonesia.** Tema gelap tunggal, tanpa light mode.

Live: <https://laras-web.vercel.app>

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 (CSS-first,
tanpa `tailwind.config`) · framer-motion 13 (transisi halaman/sheet saja, **tidak**
untuk lirik) · Vitest.

## Perintah

    npm run dev          dev server di port 3000
    npm test             unit test (Vitest)
    npm run typecheck    tsc --noEmit
    npm run lint         eslint
    npm run build        build produksi

## Konfigurasi

Salin `.env.example` ke `.env.local`. Satu-satunya env yang diset di produksi
adalah `NEXT_PUBLIC_SITE_URL`.

**`LARAS_ENABLE_DEV=1` JANGAN pernah diset di produksi.** Flag itu membuka rute
uji `/demo` dan `/dev/lirik`, dan kedua rute itu menyajikan lirik berhak cipta
empat lagu dari fixture. Tanpa flag, keduanya 404 — begitulah seharusnya di
produksi.

## Dokumen untuk kontributor

Baca berurutan sebelum menyentuh kode:

1. `HANDOFF.md` — keadaan sekarang, arsitektur, dan jebakan yang sudah dibayar.
2. `BRIEF.md` — keputusan produk yang final (tema, kontrak data, TTML, ToS YouTube).
3. `AGENTS.md` — aturan yang paling sering dilanggar.

## Lisensi

LARAS berlisensi **GNU AGPL-3.0-or-later**. Teks lengkap: [`LICENSE`](./LICENSE).

Mesin liriknya **diturunkan dari kode** [`spicy-lyrics`](https://github.com/spikerko/spicy-lyrics)
karya **Spikerko** (AGPL-3.0), commit `4576d022b39e98291d71c75b0d4d355bcc332ced`.
Kode itu ada di `src/vendor/spicy-lyrics/` dan setiap berkasnya membawa header
asal + catatan modifikasi. Karena itulah seluruh proyek ini AGPL-3.0.

Konsekuensinya, dan ini bukan opsional: **AGPL pasal 13** mewajibkan setiap
pengguna yang memakai LARAS lewat jaringan ditawari source lengkapnya. Repo ini
harus tetap **publik**, dan tautan ke repo ini harus tetap **terlihat di UI**
(kaki sidebar). Jangan hapus tautan itu karena dianggap dekorasi.

Atribusi lengkap — termasuk spring yang di-port dari
[`Fraktality/spr`](https://github.com/Fraktality/spr) (MIT) — ada di
[`NOTICE.md`](./NOTICE.md).

Katalog, artwork, lirik, dan audio adalah **data pihak ketiga**, bukan kode.
AGPL-3.0 di repo ini tidak melisensikannya; hak ciptanya tetap pada pemiliknya
masing-masing. Lihat `NOTICE.md`.
