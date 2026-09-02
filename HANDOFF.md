# HANDOFF — LARAS web

Status per 2026-09-02. Ditulis untuk agen/kontributor yang mengambil alih.
Baca ini + `BRIEF.md` sebelum menulis kode. `BRIEF.md` memuat keputusan produk
yang sudah final; file ini memuat keadaan sekarang dan alasan di baliknya.

---

## 1. Keadaan sekarang: apa yang JALAN

Aplikasi berfungsi penuh dengan data live. Bukan mock, bukan fixture.

| Rute | Isi | Rendering | Waktu terukur |
|---|---|---|---|
| `/` | 4 rak, 105 lagu dari playlist editorial | ISR 6 jam | 27ms (cache) |
| `/cari?q=` | 24 lagu + 24 album + 15 artis | dinamis | 3,9s |
| `/playlist/[slug]` | 100 baris lagu | ISR 6 jam | 45ms |
| `/album/[id]` | track dengan nomor asli | dinamis | 1,9s |
| `/artis/[id]` | lagu teratas + diskografi | dinamis | 0,6s |
| `/lagu/[id]` | artwork + kontrol + lirik word-level | dinamis, lirik di-stream | kerangka 0,6–1,8s cold; lirik menyusul 9,5–11,5s; 13–130ms warm |
| `/demo`, `/demo/[slug]` | 4 lagu dari fixture (peninggalan fase frontend) | SSG | — |
| `/dev/lirik/[slug]` | uji mesin lirik dengan jam sintetis | SSG, `notFound()` di prod | — |

### Verifikasi (semua hijau, jalankan sendiri sebelum percaya)

    npm test                 184 test, 7 file
    npm run typecheck        bersih
    npm run lint             0 error, 0 warning
    npm run build            sukses, 14 halaman

    node scripts/verify-lyrics.cjs   45 assertion — mesin sapuan lirik
    node scripts/verify-home.cjs     29 assertion — kerangka UI
    node scripts/verify-live.cjs     43 assertion — data live + pemutar global
    node scripts/verify-stream.cjs   16 assertion — kerangka dulu, lirik menyusul

Harness CDP butuh Chrome berjalan dengan remote debugging — lihat §7.

---

## 2. Arsitektur: empat keputusan yang tidak boleh dibatalkan

### (a) Pemutar hidup di root layout, BUKAN di halaman

`src/app/layout.tsx` membungkus semuanya dengan `PlayerProvider`, lalu merender
`<VideoDock />` dan `<MiniPlayer />` **di luar** `children`.

Alasannya bukan preferensi: **iframe YouTube tidak bisa dipindahkan di DOM.**
Memindahkannya ke induk lain — atau me-remount komponennya — membuat browser
memuat ulang iframe dari nol; audio berhenti, posisi hilang. Kalau pemutar hidup
di dalam halaman, setiap navigasi memutus lagu.

Konsekuensi yang harus dijaga:
- `VideoDock` mengubah **ukuran dan posisi lewat CSS** (`position: fixed` +
  kelas kondisional), bukan dengan memindahkan node.
- Saat belum ada lagu, dok digeser ke luar layar (`translate-y-[200vh]`),
  **tidak** dilepas dari DOM — kalau dilepas, ref container hilang.
- Jangan pernah menaruh `useYouTubePlayer` di komponen halaman.

Ini terbukti empiris, bukan diasumsikan: `verify-live` menandai iframe dengan
`dataset.larasProbe`, memutar lagu, menavigasi SPA ke `/cari`, lalu memastikan
iframe **bertanda yang sama** masih ada. Hasil 1 dari 1.

### (b) Penjembatanan audio ditunda sampai lagu diklik

Katalog Apple punya lirik + metadata; audio datang dari YouTube Music. Keduanya
dijembatani lewat **pencocokan durasi**, bukan kemiripan judul.

Satu playlist berisi 100 lagu. Menjembatani semuanya di muka = 100 permintaan ke
YouTube Music hanya untuk MENAMPILKAN daftar. Jadi penjembatanan terjadi saat
klik, lewat server action `src/app/actions.ts` → `resolveTrackAudio`.

Harganya jeda ~1 detik antara klik dan audio mulai. Itu jauh lebih murah daripada
menahan render daftar 30 detik. Baris yang sedang dijembatani menampilkan
"Mencari audio…"; yang gagal menampilkan alasannya.

### (c) Lirik TIDAK memakai framer-motion

Lagu terpanjang di fixture punya 935 suku kata. Satu komponen motion per kata =
935 siklus render React per frame = mati jauh sebelum 60fps.

Yang dipakai: satu `requestAnimationFrame` loop di `lyrics-view.tsx` yang menulis
CSS custom property langsung lewat ref. React merender struktur **sekali**.
Detail lengkap di `BRIEF.md` §framer-motion dan di komentar file itu.

### (d) Lirik di-STREAM, tidak menahan halaman lagu

`/lagu/[id]` memulai `loadLyrics(id)` tapi **tidak** me-`await`-nya. Promise-nya
diteruskan ke dua komponen di bawah `<Suspense>`:
`lyrics-section.tsx` → `LyricsSection` (pane lirik) dan `LyricsKindNote`
(keterangan "· lirik per kata" di kolom kiri). Selama menunggu, pane diisi
`components/lyrics/lyrics-skeleton.tsx`.

Alasannya bukan gaya, tapi angka: relay `/lyrics` butuh ~10 detik untuk lagu
yang belum pernah diminta, dan `await` di badan halaman menahan SELURUH render.
Diukur pada satu server dan satu build yang sama, dua id cold berbeda:

    lirik di-await di halaman   byte pertama & <h1>  9410ms
    lirik di dalam <Suspense>   <h1> 938ms, lirik menyusul 11453ms

Yang harus dijaga:
- **Satu promise, dua batas Suspense.** `loadLyrics` dipanggil SEKALI lalu
  promise-nya dibagi. Memanggilnya dua kali berarti dua permintaan relay.
- **`loadLyrics` tidak boleh menolak.** Promise yang ditolak di bawah
  `<Suspense>` tidak berhenti di pane lirik — ia naik ke batas error terdekat
  dan mengganti seluruh halaman. Karena itu parser TTML-nya dibungkus
  try/catch di `catalog.ts`; jangan dilepas.
- **`LyricsPanel` tetap menerima nilai biasa**, bukan promise. Yang meng-`await`
  adalah Server Component di atasnya, jadi `LyricsView` tetap murni dan tetap
  bisa diuji dengan jam sintetis.
- Skeleton memakai kelas `.larasLyrics` + `.scroller` yang SAMA dengan renderer
  sungguhan, supaya baris lirik yang masuk mendarat di posisi yang hampir sama.
  Kalau geometri lirik diubah, skeleton ikut sendiri.

Dibuktikan oleh `scripts/verify-stream.cjs`, bukan diasumsikan.

---

## 3. Peta file

### Data (server-only)

    src/lib/data/client.ts          HTTP ke relay Apple; cache per jenis data;
                                    SEMUA kegagalan -> null, tidak pernah throw
    src/lib/data/catalog.ts         lapisan tingkat-halaman; 'server-only';
                                    HOME_PLAYLISTS + SIDEBAR_PLAYLISTS di sini
    src/lib/data/apple.ts           adapter artwork/track/album/artist
    src/lib/data/apple-collections.ts  adapter playlist/search/shelf
    src/lib/data/innertube.ts       parser respons YouTube Music (MURNI, teruji)
    src/lib/data/youtube.ts         HTTP ke InnerTube + resolveAudio
    src/lib/data/bridge.ts          logika pencocokan durasi (MURNI, teruji)
    src/lib/data/fixtures.ts        pembaca fixture (dipakai /demo & /dev saja)

Pemisahan `innertube.ts` (parsing) dari `youtube.ts` (fetch) itu sengaja: bentuk
pohon InnerTube adalah bagian paling rapuh dari seluruh jembatan. Dengan
dipisah, ia bisa diuji terhadap fixture respons nyata — kalau YouTube mengubah
bentuknya, yang gagal lebih dulu adalah test, bukan pengguna.

### Lirik

    src/lib/lyrics/spring.ts        spring analitik (port dari Fraktality/spr, MIT)
    src/lib/lyrics/spline.ts        cubic spline: progres kata -> target spring
    src/lib/lyrics/animator.ts      matematika sapuan, MURNI (nol DOM)
    src/lib/lyrics/ttml.ts          parser TTML Apple
    src/lib/lyrics/xml.ts           tokenizer XML (bukan DOMParser — tidak ada di Node)
    src/lib/lyrics/design-tokens.ts SEMUA angka desain, dengan alasannya

    src/components/lyrics/lyrics-view.tsx    renderer + rAF loop (MURNI dari pemutar)
    src/components/lyrics/lyrics.module.css  teknik sapuan background-clip: text
    src/components/lyrics/lyrics-panel.tsx   penghubung LyricsView <-> pemutar global
    src/components/lyrics/lyrics-skeleton.tsx  isi pane selama relay dijemput
    src/app/lagu/[id]/lyrics-section.tsx     yang meng-await lirik, di bawah <Suspense>

`lyrics-view.tsx` sengaja tidak tahu apa pun soal pemutar — ia hanya menerima
`getPosition`. Itulah yang membuat mesinnya bisa diuji dengan jam sintetis.

### Pemutar

    src/lib/player/clock.ts             LyricsClock: 250ms -> per-frame, MURNI
    src/lib/player/player-context.tsx   konteks global + antrean
    src/components/player/use-youtube-player.ts  IFrame API + polling jangkar
    src/components/player/video-dock.tsx         SATU iframe, selamanya
    src/components/player/mini-player.tsx        bar bawah, progres via rAF
    src/components/player/ambient-backdrop.tsx   mesh gradient dari warna artwork
    src/components/player/now-playing.tsx        HANYA dipakai /demo (peninggalan)

### UI

    src/components/shell/{sidebar,top-bar,app-shell}.tsx
    src/components/ui/{artwork,icons,shelf-row,track-row,track-list}.tsx

`track-row.tsx` presentasi murni; `track-list.tsx` yang tahu pemutar.

---

## 4. Jebakan yang SUDAH dibayar — jangan ulangi

Semua ini ditemukan lewat pengukuran, bukan pembacaan kode. Tidak satu pun
memberi error di konsol.

### React

1. **Jangan `refs.current.clear()` di efek.** Ref callback jalan di fase commit —
   SEBELUM efek. Efek itu membuang ref yang baru terdaftar, dan rAF loop lalu
   berjalan dengan Map kosong: lirik diam total padahal animator benar.

2. **Cache `writeIfChanged` wajib dibuang saat loop restart**, di dalam efek rAF
   itu sendiri. Setelah komponen dilepas-pasang, elemen DOM baru punya inline
   style kosong tapi cache masih menyimpan nilai lama → "tidak berubah" → tidak
   pernah menulis lagi.

3. **Ref penyimpan callback disegarkan di EFEK, bukan di badan komponen.**
   `ref.current = fn` saat render dilarang React 19 (`react-hooks/refs`): dengan
   concurrent rendering, render bisa dibuang dan mutasinya tetap tertinggal.
   Pola ini sudah muncul 2×: `onEndedRef` dan `advanceRef`.

4. **Depend pada fungsi, bukan objek hook.** `useCallback(..., [player])` berubah
   identitas tiap render karena objeknya baru; destructure dulu
   (`const { readPosition } = player`).

### Data

5. **Jangan pernah menebak id.** Sudah dua kali kena: `artist-tulus.json`
   ternyata berisi Imagine Dragons, dan `/album/1596456857` tidak ada di katalog.
   Ambil id dari respons `/search` yang sungguhan. Test yang menangkapnya, bukan
   mata — jadi assert nilai konkret (nama, jumlah, durasi), bukan "tidak null".

6. **Playlist id di `HOME_PLAYLISTS` diambil dari field `playlist_id`** respons
   `/playlist/tracks` nyata (ada di `fixtures/apple/playlist-*.json`).

7. **Durasi YouTube: `hl=id` → `4.02` (TITIK), `hl=en` → `4:02`.** Parser yang
   hanya menerima titik dua gagal 0/7 tanpa satu pun error.

8. **Durasi ada di TEKS `flexColumns[1]`** ("Tulus • Manusia • 4:02"), bukan di
   `lengthSeconds` — field itu tidak dikirim di jalur pencarian. Cari dari
   BELAKANG, karena tahun rilis di depan bisa salah terparse.

### Verifikasi

9. **`document.visibilityState === 'hidden'` mematikan rAF sepenuhnya.** Kalau
   jendela Chrome di latar, SEMUA assertion animasi gagal dengan nilai nol dan
   pesannya tidak memberi petunjuk apa pun. CDP `Page.bringToFront` **tidak**
   mengangkat jendela OS. Lihat §7 untuk flag yang benar.

10. **`getComputedStyle` MENGHAPUS `180deg`** dari `linear-gradient` (itu arah
    default). Assertion `.includes('180deg')` selalu gagal.

11. **Autoplay YouTube diblokir tanpa interaksi**, jadi sapuan bergerak tidak
    bisa diuji di halaman pemutar. Itu sebabnya `/dev/lirik/[slug]` ada: jam
    sintetis yang membuka `window.__laras` supaya posisi bisa disetel dari luar.

12. **Satu kata di tengah sapuan pada instan mana pun itu NORMAL.** Jangan
    assert "nol kata sedang menyapu".

13. **`npm run lint` juga melint `scripts/*.cjs`.** `eslint` tanpa argumen
    mencakup `**/*.cjs`, dan `@typescript-eslint/no-require-imports` menembak
    setiap `require()` di harness — 14 error yang tidak ada hubungannya dengan
    app. Sudah dimatikan untuk `scripts/**/*.cjs` di `eslint.config.mjs`.
    Sebelum itu, klaim "0 error" di dokumen ini SALAH; jangan percaya klaim
    lint tanpa menjalankannya.

14. **UA bot HTML-limited TIDAK mematikan streaming di rute ini.** Dokumen Next
    bilang bot menerima dokumen utuh, jadi `Twitterbot/1.0` sempat dipakai
    sebagai kontrol "perilaku tanpa stream". Hasil terukur: TTFB tetap
    550–1006ms dan badan tetap dipecah 14 chunk. Sebabnya Next hanya menunggu
    `generateMetadata` untuk bot, dan halaman lagu tidak punya
    `generateMetadata`. Untuk mengukur perilaku blocking, satu-satunya cara
    adalah merender versi blocking-nya sungguhan.

15. **Assertion bisa gagal permanen karena halaman sudah pindah bentuk.**
    `verify-home` §7 mencari `a[href^="/demo/"]` — kartu per lagu dari FASE
    FIXTURE. Sejak Beranda memakai playlist live, kartunya menuju `/lagu/<id>`
    dan dua assertion itu gagal 100% dari waktu, bukan kadang-kadang. Sudah
    diarahkan ke pintu masuk `/demo`. Pelajarannya: harness yang GAGAL bukan
    selalu berarti aplikasi rusak — periksa dulu apakah assertion-nya masih
    menggambarkan halaman yang sekarang.

### Lingkungan (Windows + MSYS bash)

16. `next dev`/`next start` orphan menyajikan build LAMA. Kill listener dulu:
    `powershell -Command "Get-NetTCPConnection -LocalPort 3210 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"`.
    `taskkill //F` GAGAL di MSYS.
17. `curl` exit code 23 di MSYS itu normal (write error pada `-o /dev/null -w`);
    baca body/HTTP code-nya, jangan exit code.
18. Auto-lint `write_file` melaporkan TS6053 palsu di path ber-spasi. Verifikasi
    lewat `npm run lint` / `npm run build` sungguhan.

---

## 5. Yang BELUM ada

Bukan bug — belum dikerjakan. Urut dari yang paling terasa:

1. **Antrean tidak bisa diubah manual** — hanya urut playlist. Tanpa shuffle,
   tanpa repeat.
2. **Tanpa riwayat / favorit** — butuh penyimpanan (localStorage cukup, tanpa akun).
3. **Volume**: konteks punya `setMuted` tapi UI tidak punya slider.
4. **Halaman `/demo` dan `now-playing.tsx` adalah peninggalan** fase fixture.
   Masih hijau di test, tapi sudah digantikan `/lagu/[id]` + `LyricsPanel`.
   Boleh dihapus kalau tidak dipakai lagi — hapus juga assertion terkait.
5. **Fallback LRCLIB belum dipasang.** Kalau Apple tidak punya lirik untuk sebuah
   lagu, tidak ada cadangan. LRCLIB hidup, CORS `*`, tapi line-level saja dan
   cakupan Indonesia tipis. Sekarang pane-nya cuma menulis "Lirik tersinkron
   tidak tersedia" — dan itu ditemui cukup sering saat mencari id cold.
6. **`git status` masih kotor** — belum pernah di-commit selain
   "Initial commit from Create Next App". Belum ada `.env`; semua konfigurasi
   punya default (`APPLE_CATALOG_BASE` opsional).

---

## 6. Gaya kode (ditegakkan, bukan saran)

- Komentar menjelaskan **KENAPA**, bukan apa. Setiap angka desain wajib punya alasan.
- Komentar & UI bahasa **Indonesia**; nama simbol bahasa Inggris.
- `strict` menyala, nol `any`.
- Radius WAJIB `rounded-[var(--radius-...)]`. JANGAN `rounded-xl`/`lg`/`md`.
- Warna WAJIB kelas `laras-*` dari `@theme` di `globals.css`.
- Target tap minimal 44px.
- Logika murni (matematika, parsing) WAJIB punya unit test terhadap fixture nyata.
- Jalankan `npm test` + `npm run typecheck` + `npm run lint` sebelum menyatakan
  selesai. Screenshot **tidak** membuktikan animasi benar; angka yang membuktikan.

---

## 7. Menjalankan harness CDP

Butuh Chrome dengan remote debugging DAN jendela di depan (lihat jebakan #9):

    "C:/Program Files/Google/Chrome/Application/chrome.exe" \
      --remote-debugging-port=9222 --remote-allow-origins=* \
      --user-data-dir="$LOCALAPPDATA/Temp/laras-cdp-profile" \
      --no-first-run --no-default-browser-check \
      --autoplay-policy=no-user-gesture-required \
      --disable-backgrounding-occluded-windows \
      --disable-renderer-backgrounding \
      --disable-background-timer-throttling \
      --window-position=0,0 --window-size=1440,900 about:blank

Lalu:

    npm run build
    npx next start -p 3210

    BU_CDP_URL=http://127.0.0.1:9222 TARGET=http://127.0.0.1:3210 \
      node scripts/verify-live.cjs

    BU_CDP_URL=http://127.0.0.1:9222 TARGET=http://127.0.0.1:3210 \
      SLUG=die-with-a-smile node scripts/verify-lyrics.cjs

    BU_CDP_URL=http://127.0.0.1:9222 TARGET=http://127.0.0.1:3210 \
      node scripts/verify-home.cjs

    BU_CDP_URL=http://127.0.0.1:9222 TARGET=http://127.0.0.1:3210 \
      node scripts/verify-stream.cjs

`verify-stream` beda dari yang lain: ia MEMBAKAR data. Untuk membuktikan
kerangka mendahului lirik, ia butuh lagu yang belum pernah diminta — dan begitu
diukur, lagu itu hangat selamanya (cache relay + Data Cache Next). Skrip ini
memilih sendiri id dari Beranda, mendeteksi mana yang sudah hangat, lalu lanjut
ke kandidat berikutnya; tiap kali jalan ia melewati semua id yang sudah terpakai
dulu (lihat `MAX_CANDIDATES`). Kalau semua 104 id di Beranda sudah pernah
diukur, tunggu playlist editorial dirotasi.

Verifikasi cepat rAF hidup: `scripts/probe-raf.cjs` mencetak jumlah tick per
detik. Sehat ≈ 60–145. Nol berarti tab tidak terlihat.

Chrome debug ini profil kosong tanpa cookie login — itu memang yang diinginkan.

---

## 8. Fakta relay (terukur, jangan diasumsikan ulang)

Relay: `https://api.spicyamll.online` — nama resmi "Lyricsflow API 1.1.0",
30 endpoint. `GET /openapi.json` untuk daftar lengkap.

    /lyrics  cold  9,8 – 11,7 detik     warm  310 – 620 ms
    /search        360 – 950 ms
    burst 8x       semua 200, tanpa rate-limit

Angka cold itu dikonfirmasi ulang lewat halaman lagu: 9,5 · 9,6 · 9,7 · 10,0 ·
10,3 · 11,5 detik pada enam id berbeda yang belum pernah diminta. Setelah
diminta sekali, seluruh halaman (metadata + lirik) selesai dalam 13–130ms karena
Data Cache Next menyimpan keduanya 30 hari. Efeknya untuk pengukuran: **satu id
hanya bisa dipakai sekali** untuk mengukur jalur cold.

Sebagian lagu di katalog Apple memang **tidak punya lirik sama sekali** —
`/lyrics` membalas tanpa `syncedLyrics`. Ini sering ditemui, bukan kasus tepi;
pane lirik menampilkan pesan dan pemutar tetap jalan.

Bentuk respons `/lyrics`:
`{ syncedLyrics: "<tt …>", plainLyrics, format, trackId, trackName, duration, hasWordLevel, source }`.
Yang dipakai `syncedLyrics` (TTML); `plainLyrics` tanpa timing per kata.

Jebakan endpoint:
- `/playlist?playlist=` balas **404**. Yang jalan `/playlist/tracks?playlist=`.
- `/playlist/tracks` mengirim DUA bentuk: `raw_data.data` (Apple penuh, punya
  isrc + template artwork yang bisa di-resize) dan `parsed_tracks` (snake_case,
  lebih miskin). **Pakai `raw_data.data`.**
- `/recommendations` tanpa akun hanya memberi kartu genre — **nol lagu**. Itu
  sebabnya Beranda memakai playlist editorial.
- Relay menolak permintaan tanpa User-Agent browser dengan 403. Jangan simpulkan
  host mati sebelum mencoba dengan UA Chrome.

`api.spicylyrics.org` **MATI untuk publik** (403 Cloudflare, semua permintaan).
YouTube Music InnerTube **tidak punya lirik ber-timestamp** — sudah ditelusuri
sampai `browseId MPLY...`: nol `cueRange`, nol `timedLyricsData`. Jangan coba lagi.
