<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# LARAS — baca ini dulu

Web pemutar musik gaya Apple Music dengan lirik tersinkron **per kata**.
Katalog + lirik dari Apple Music (via relay), audio dari YouTube Music.

## Urutan bacaan wajib

1. **`HANDOFF.md`** — keadaan sekarang, arsitektur, dan 29 jebakan yang sudah
   dibayar. Baca ini sebelum menyentuh kode apa pun.
2. **`BRIEF.md`** — keputusan produk yang sudah final (tema, lisensi, struktur
   TTML, aturan ToS YouTube).

Catatan: bagian "Fase sekarang: FRONTEND SAJA" di `BRIEF.md` sudah **selesai**
dan dilewati. Fase backend sudah dikerjakan — data live sudah masuk. Yang masih
berlaku dari `BRIEF.md` adalah tema, kontrak data, fakta TTML, lisensi, dan
aturan ToS.

## Perintah

    npm run dev              dev server (port 3000)
    npm test                 303 unit test
    npm run typecheck        tsc --noEmit
    npm run lint             eslint
    npm run build            build produksi

Harness browser (butuh Chrome remote debugging DAN build ber-flag —
`LARAS_ENABLE_DEV=1 npm run build`, lihat `HANDOFF.md` §7):

    node scripts/verify-live.cjs     43 assertion, data live + pemutar
    node scripts/verify-lyrics.cjs   45 assertion, mesin sapuan lirik
    node scripts/verify-home.cjs     29 assertion, kerangka UI
    node scripts/verify-stream.cjs   17 assertion, kerangka dulu lalu lirik

## Empat aturan yang paling sering dilanggar

1. **Jangan pindahkan pemutar ke dalam halaman.** Iframe YouTube tidak bisa
   dipindah di DOM — audio akan berhenti setiap navigasi. Ia hidup di
   `src/app/layout.tsx` lewat `VideoDock`, selamanya.
2. **Jangan pakai framer-motion untuk lirik.** 935 suku kata × 60fps akan mati.
   Satu rAF loop menulis CSS custom property lewat ref.
3. **Jangan menebak id katalog.** Ambil dari respons `/search` sungguhan. Sudah
   dua kali kena: fixture artis berisi artis yang salah, dan id album yang tidak
   ada. Test yang menangkapnya, bukan mata.
4. **Jangan me-`await` `loadLyrics` di badan `/lagu/[id]`.** Relay butuh ~10
   detik untuk lagu baru, dan `await` di halaman menahan artwork + judul +
   tombol putar selama itu juga. Terukur: 9410ms jadi 938ms. Lirik ditunggu di
   `lyrics-section.tsx`, di bawah `<Suspense>`. Lihat `HANDOFF.md` §2(d).

## Gaya

Komentar menjelaskan **kenapa**, bukan apa. Komentar & UI bahasa Indonesia; nama
simbol bahasa Inggris. Radius wajib `rounded-[var(--radius-...)]`, warna wajib
kelas `laras-*`. Nol `any`. Logika murni wajib punya unit test terhadap fixture
nyata. Screenshot tidak membuktikan animasi benar — angka yang membuktikan.
