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
| `/lagu/[id]` | artwork + kontrol + lirik word-level | dinamis, lirik di-stream | TTFB 15–26ms; skeleton 48ms; `<h1>` 0,65–0,97s; lirik 9,5–11,5s; 50ms warm |
| `/koleksi` | favorit + riwayat dari localStorage | statis | nol permintaan jaringan |
| `/api/lirik/[id]` | lirik ternormalisasi, JSON | dinamis, rate limit | mengikuti relay |
| `/api/health` | keterjangkauan relay + latensinya | dinamis, `no-store` | 1 panggilan relay |
| `/demo`, `/demo/[slug]` | 4 lagu fixture — permukaan uji mesin lirik | SSG, **404 di prod** | — |
| `/dev/lirik/[slug]` | uji mesin lirik dengan jam sintetis | SSG, **404 di prod** | — |

`/demo` dan `/dev/lirik` hanya hidup kalau `LARAS_ENABLE_DEV=1` diset saat build
(lihat §7). Keduanya menyajikan lirik lengkap dari TTML yang di-commit, dan itu
teks berhak cipta — bukan sesuatu yang layak terbuka di produksi.

### Verifikasi (semua hijau, jalankan sendiri sebelum percaya)

    npm test                 461 test, 20 file
    npm run typecheck        bersih
    npm run lint             0 error, 0 warning
    npm run build            sukses

    node scripts/verify-lyrics.cjs   45 assertion — mesin sapuan lirik
    node scripts/verify-home.cjs     36 assertion — kerangka UI + hero
    node scripts/verify-live.cjs     44 assertion — data live + pemutar global
    node scripts/verify-sidebar.cjs  32 assertion — sidebar buka/tutup
    node scripts/verify-stream.cjs   17 assertion — kerangka dulu, lirik menyusul

174 assertion browser, semuanya hijau pada build yang sama.

Harness CDP butuh Chrome berjalan dengan remote debugging — lihat §7.

---

## 2. Arsitektur: enam keputusan yang tidak boleh dibatalkan

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

Setelah `loading.tsx` ditambahkan, byte pertama turun lagi jauh — Next mengirim
fallback rute sebelum `loadTrack` menjawab:

    TTFB 15–26ms · skeleton lirik 48ms · <h1> 650–970ms · lirik 9,5s

Urutan itu penting dan sempat MEMBUAT ASSERTION GAGAL: `verify-stream` versi
pertama menuntut skeleton dan `<h1>` muncul berjarak < 500ms, padahal sekarang
skeleton mendahului `<h1>` 600ms. Assertion-nya yang salah, bukan aplikasinya.

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

### (e) Antrean adalah REDUCER MURNI, dan shuffle tidak mengacak antrean

`src/lib/player/queue.ts` memegang lima nilai yang saling bergantung: `tracks`,
`order`, `cursor`, `shuffle`, `repeat`. Sebagai `useState` terpisah, menghapus
satu lagu berarti tiga pemanggil setState yang masing-masing hanya melihat
sebagian kebenaran — bug-nya muncul sebagai "kadang melompat ke lagu yang
salah". Sebagai reducer, 30 assertion mengujinya tanpa React.

Yang diacak shuffle adalah `order` (daftar indeks), BUKAN `tracks`. Alasannya
perilaku yang diharapkan: mematikan shuffle harus MENGEMBALIKAN urutan album.
Kalau `tracks` yang diacak, urutan aslinya hilang selamanya.

Dua hal yang dijaga:
- **`repeat: 'one'` tidak ditangani reducer.** Mengulang lagu yang sama =
  `seek(0)` pada pemutar, bukan memindahkan antrean. Reducer tidak boleh tahu
  apa pun soal pemutar; konteks yang memutuskan.
- **Aksi `resolvedAudio`, bukan `play` ulang.** Menambal audio satu lagu dengan
  `play` akan membangun antrean dari nol dan menghapus 99 lagu lainnya.

### (f) Lapisan data punya penggabungan permintaan, dan halaman TIDAK lewat `/api`

`src/lib/data/coalesce.ts` menggabungkan permintaan berjalan dengan URL yang
sama. Angkanya: `/lyrics` cold butuh ~10 detik, dan selama sepuluh detik itu
cache Next masih kosong — jadi sepuluh pengunjung yang membuka lagu baru yang
sama berarti sepuluh panggilan ke relay pihak ketiga. Dengan penggabungan: satu.

Batasnya harus dipahami: peta itu hidup di memori SATU proses. Di Vercel berarti
per instance, bukan per dunia. Untuk global butuh Redis; untuk lalu lintas app
ini, per instance sudah memotong bagian terburuknya.

`/api/lirik/[id]` dan `/api/health` ada untuk klien dan pemantauan dari luar.
Server component TIDAK memakainya — ia memanggil `lib/data` langsung. Memanggil
route handler sendiri dari server berarti satu round-trip HTTP ke proses kita
sendiri dan Data Cache Next tidak ikut bekerja. Jangan "menyeragamkan" keduanya.

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
    src/lib/data/coalesce.ts        penggabung permintaan berjalan (MURNI, teruji)
    src/lib/data/rate-limit.ts      token bucket untuk /api (MURNI, teruji)
    src/lib/data/lrclib.ts          adapter cadangan lirik (MURNI, teruji)
    src/lib/data/lrclib-client.ts   HTTP ke LRCLIB
    src/lib/data/playlists.ts       konstanta playlist — TANPA server-only,
                                    karena komponen klien juga memakainya
    src/lib/api/guard.ts            identitas pemanggil + batas laju /api

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
    src/lib/lyrics/lrc.ts           parser LRC line-level (MURNI, teruji)

`lyrics-view.tsx` sengaja tidak tahu apa pun soal pemutar — ia hanya menerima
`getPosition`. Itulah yang membuat mesinnya bisa diuji dengan jam sintetis.

### Pemutar

    src/lib/player/clock.ts             LyricsClock: 250ms -> per-frame, MURNI
    src/lib/player/queue.ts             antrean/shuffle/repeat, REDUCER MURNI
    src/lib/player/collection.ts        riwayat & favorit, aturan MURNI
    src/lib/player/collection-context.tsx  localStorage lewat useSyncExternalStore
    src/lib/player/player-context.tsx   konteks global; antrean di reducer
    src/components/player/use-youtube-player.ts  IFrame API + polling jangkar
    src/components/player/video-dock.tsx         SATU iframe, selamanya
    src/components/player/mini-player.tsx        bar bawah, progres via rAF
    src/components/player/ambient-backdrop.tsx   mesh gradient dari warna artwork
    src/components/player/now-playing.tsx        HANYA dipakai /demo (permukaan uji)
    src/components/player/queue-panel.tsx        antrean yang bisa diubah
    src/components/player/favorite-button.tsx    tombol hati
    src/components/player/play-history-recorder.tsx  jembatan pemutar -> koleksi

### UI

    src/components/shell/{sidebar,top-bar,app-shell}.tsx
    src/components/ui/{artwork,icons,shelf-row,track-row,track-list}.tsx
    src/components/home/{home-ambient,home-greeting,home-hero}.tsx
    src/lib/shell/{sidebar.ts,sidebar-context.tsx}   keadaan buka/tutup sidebar
    src/lib/home/{greeting,hero}.ts                  logika murni Beranda

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

14. **Untuk bot, Next menunggu `generateMetadata` — bukan seluruh halaman.**
    Ini pernah salah dibaca dua arah, jadi keduanya dicatat:

    - Saat halaman lagu BELUM punya `generateMetadata`, `Twitterbot/1.0` tetap
      menerima stream: TTFB 550–1006ms, badan tetap 14 chunk. Jadi UA bot tidak
      bisa dipakai sebagai kontrol "perilaku tanpa stream".
    - Setelah `generateMetadata` ditambahkan, bot memang menunggu — dan itulah
      sebabnya `generateMetadata` **DILARANG menyentuh `/lyrics`**. Terukur
      pada dua id cold di build yang sama: UA bot TTFB **1,14s** (hanya
      menunggu `loadTrack`), UA Chrome TTFB **0,034s**, dan lirik tetap
      menyusul di ~10s di bawah `<Suspense>` pada keduanya. Kalau
      `generateMetadata` ikut menunggu lirik, TTFB bot jadi ~10 detik dan
      seluruh kerja §2(d) hilang untuk setiap crawler.

    Untuk mengukur perilaku blocking yang sesungguhnya, satu-satunya cara adalah
    merender versi blocking-nya sungguhan.

15. **Assertion bisa gagal permanen karena halaman sudah pindah bentuk.**
    `verify-home` §7 mencari `a[href^="/demo/"]` — kartu per lagu dari FASE
    FIXTURE. Sejak Beranda memakai playlist live, kartunya menuju `/lagu/<id>`
    dan dua assertion itu gagal 100% dari waktu, bukan kadang-kadang. Sudah
    diarahkan ke pintu masuk `/demo`. Pelajarannya: harness yang GAGAL bukan
    selalu berarti aplikasi rusak — periksa dulu apakah assertion-nya masih
    menggambarkan halaman yang sekarang.

### React 19 & Next 16 (ditemukan sambil menambah fitur)

16. **`setState` di dalam `useEffect` DILARANG** (`react-hooks/set-state-in-effect`).
    Ini menutup pola biasa "baca localStorage di efek lalu setState". Yang benar
    `useSyncExternalStore` — lihat `collection-context.tsx`. Bonusnya: dua tab
    ikut sinkron lewat event `storage`, gratis.

17. **`useReducer` menolak reducer yang punya argumen ketiga.** `queueReducer`
    menerima fungsi permutasi supaya shuffle bisa diuji deterministik; React
    hanya memanggil `(state, action)` dan TypeScript menolaknya. Bungkus dengan
    fungsi dua-argumen (`playerQueueReducer`), jangan hapus argumennya.

18. **`generateStaticParams` yang mengembalikan `[]` TIDAK menutup rute.**
    `dynamicParams` default `true`, jadi Next tetap merender slug apa pun
    on-demand. `/dev/lirik/die-with-a-smile` membalas **200 di produksi**
    padahal komentarnya mengklaim `notFound()`. Penjaga wajib ada di BADAN
    halaman. Sekarang keduanya lewat `lib/dev-routes.ts`.

19. **Paket `server-only` tidak bisa di-resolve Vitest** — Next menanganinya
    sebagai modul virtual, dan `node_modules/server-only` tidak ada. Jadi modul
    apa pun yang perlu diuji TIDAK BOLEH mengimpornya. Pola yang sudah dipakai
    repo ini: pisahkan yang murni dari yang mem-fetch (`innertube.ts` vs
    `youtube.ts`, `lrclib.ts` vs `lrclib-client.ts`).

20. **`isPartOfWord` bicara batas KIRI; `::after` bekerja di batas KANAN.**
    Ketidakcocokan arah itu membuat lirik Indonesia tampil seperti
    `Ha ri-hariber ulang` — jarak jatuh di tengah kata, hilang di antara kata.
    Untuk split `Ha|ri-|ha|ri| ber|u|lang`, kode lama memasang jarak sesudah
    setiap span ber-`isPartOfWord === false`, yaitu suku kata PERTAMA tiap kata.

    Terukur di DOM, pane 824px, 0.32ch = 12,08px:

        peradaban (ID)   72,0% batas kata kehilangan jarak
                         64,6% sambungan dalam kata malah mendapatkannya
        bertaut (ID)     75,5% · 66,2%
        die-with-a-smile  0,0% · 78,6%

    Jumlah jarak palsu cocok PERSIS dengan jumlah kata majemuk di TTML
    (326/143/11). Indonesia terkena karena Apple memecah 76–80% katanya jadi
    beberapa span; Inggris hanya ~4%.

    Perbaikannya struktural: suku kata satu kata dibungkus `.wordGroup`, dan
    jarak jadi milik ANTAR kelompok — arah tidak bisa lagi tertukar.
    `src/lib/lyrics/word-groups.ts` MURNI dan diuji: gabungan katanya wajib sama
    dengan `LyricLine.text` yang dibangun parser lewat jalur berbeda, di keempat
    fixture, semua baris. Jangan pindahkan logika itu balik ke komponen React.

21. **Skala diam harus di KELOMPOK, bukan di tiap suku kata.** `scale` tidak
    mengubah kotak layout, hanya tinta. Menyusutkan tiap span 5% membuka celah
    di dalam kata (terukur 3,07px; 0,91px setelah pivot diperbaiki). Dengan satu
    transform di `.wordGroup`, celah dalam kata jadi **0,00px** di ketiga lagu.
    Konsekuensi yang wajib dijaga: renderer menulis skala RELATIF (absolut
    dibagi `IDLE_SCALE`), karena transform induk berkali dengan transform anak.
    Animator tetap mengeluarkan angka absolut supaya bisa diuji langsung
    terhadap angka desain.

22. **`SPLINE.scale` wajib punya simpul `time: 1`.** `LarasSpline.at()`
    meng-clamp di simpul terakhir, dan animator memakai `splineAt = 1` untuk
    keadaan `sung` — jadi tanpa simpul pulang, goal spring kata yang SUDAH
    dinyanyikan adalah PUNCAKNYA. Satu pane pernah memuat empat ukuran huruf
    diam berdampingan: 0,95 / 1,0 / 1,0505 / 1,175, beda terjauh 24%, dengan
    tumpang-tindih tinta sampai −7,30px. `yOffset` dan `glow` sudah punya simpul
    itu sejak awal; dua kurva skala yang tertinggal.

23. **`display: inline-flex` + `white-space: nowrap` menahan kata TERLALU
    kuat.** Kata yang lebih lebar dari pane akan meluber keluar. `inline-block`
    memberi hasil yang sama untuk kata normal (celah dalam kata 0,00px) tapi
    tetap membolehkan patah sebagai upaya terakhir. Patah lebih baik daripada
    meluber.

24. **Menyisipkan lagu "setelah yang sekarang" salah kalau lagunya sudah ada di
    antrean.** Lagu itu dicabut dulu dari `order`, dan pencabutan menggeser
    posisi lagu yang sedang diputar — angka posisi yang dihitung SEBELUM
    pencabutan jadi salah satu. Ditangkap unit test, bukan mata.

### CSS

25. **`rgb(r,g,b / alpha)` INVALID — alpha garis miring butuh channel dipisah
    SPASI.** Ini mematikan latar ambient sejak file itu ditulis, tanpa satu pun
    error di konsol. Karena warnanya dipakai di dalam `background` shorthand
    berisi lima lapisan, satu stop yang invalid membuang SELURUH background.

    Yang memisahkan diagnosanya: HTML SSR memuat 1 `radial-gradient`, DOM hidup
    memuat **0** lapisan radial. Kalau markup ada tapi lapisannya nol, jangan
    curiga hidrasi atau tinggi kotak — curigai nilai CSS yang tidak sah. Kotaknya
    ternyata 1170×812 sejak awal; isinya yang kosong.

    Semua helper warna di `ambient-backdrop.tsx` sekarang mengembalikan `'r g b'`.
    Jangan kembalikan ke koma.

26. **`textColors` Apple BUKAN warna latar.** Terukur pada satu lagu: `bgColor`
    `a6a953` (kuning-hijau, cocok sampulnya) sementara keempat textColor-nya
    `010100` / `060702` / `21230d` / `282a11` — nyaris hitam. Wajar: itu warna
    TEKS yang dirancang Apple untuk ditaruh DI ATAS sampul terang. Memakainya
    sebagai stop gradient menghasilkan latar hitam, dan menaikkan
    saturate/brightness pada hitam tetap hitam.

### Lingkungan (Windows + MSYS bash)

27. `next dev`/`next start` orphan menyajikan build LAMA. Kill listener dulu:
    `powershell -Command "Get-NetTCPConnection -LocalPort 3210 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"`.
    `taskkill //F` GAGAL di MSYS.
28. `curl` exit code 23 di MSYS itu normal (write error pada `-o /dev/null -w`);
    baca body/HTTP code-nya, jangan exit code.
29. Auto-lint `write_file` melaporkan TS6053 palsu di path ber-spasi. Verifikasi
    lewat `npm run lint` / `npm run build` sungguhan.

---

## 5. Yang BELUM ada

Bukan bug — belum dikerjakan. Urut dari yang paling terasa:

1. **Antrean belum bisa disusun ulang dengan seret.** Sudah bisa: shuffle,
   repeat, "putar berikutnya", "ke antrean", hapus satu baris, lompat, kosongkan.
   Yang belum: menggeser urutan dengan drag.
2. **Koleksi tidak ikut pindah perangkat.** Konsekuensi langsung dari "tanpa
   akun" di `BRIEF.md`, dan itu dikatakan terus terang di halaman `/koleksi`.
   Ekspor/impor JSON akan menutupnya tanpa melanggar keputusan itu.
3. **Penggabungan permintaan & rate limit hanya per instance.** Di Vercel setiap
   instance punya memorinya sendiri. Global butuh Redis — layanan berbayar dan
   satu titik gagal baru, jadi sengaja belum dipasang.
4. **Lirik LRCLIB hanya line-level.** Cadangannya jalan, tapi tidak ada sapuan
   per kata karena datanya memang tidak punya. Ditandai di pane lirik supaya
   pengguna tidak menyangka mesinnya rusak.
5. **Belum ada pemantauan.** `/api/health` ada, tapi tidak ada yang memanggilnya
   secara berkala dan tidak ada tempat log dikumpulkan.

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
      --disable-features=CalculateNativeWinOcclusion \
      --disable-backgrounding-occluded-windows \
      --disable-renderer-backgrounding \
      --disable-background-timer-throttling \
      --window-position=0,0 --window-size=1440,900 about:blank

`--disable-features=CalculateNativeWinOcclusion` bukan hiasan: tanpa itu Windows
melaporkan jendela Chrome sebagai TERTUTUP jendela lain, dan Chrome menyetel
`document.visibilityState` ke `hidden` — rAF berhenti, seluruh `verify-lyrics`
gagal 0/45. Flag ini hanya bisa diberikan **saat peluncuran**; jendela yang sudah
jalan tidak bisa diperbaiki belakangan. Terukur 2026-09-04: `Page.bringToFront`,
`Emulation.setFocusEmulationEnabled`, `Page.setWebLifecycleState('active')`, dan
bahkan `SetForegroundWindow` Win32 (yang melapor `cocok=True`) SEMUANYA
mengembalikan `hidden`; meluncurkan ulang Chrome dengan flag ini langsung
memberi `visible` dan 45/45.

Lalu — perhatikan flag-nya:

    LARAS_ENABLE_DEV=1 npm run build
    npx next start -p 3210

`LARAS_ENABLE_DEV=1` WAJIB untuk harness. Tanpa itu `/demo` dan `/dev/lirik`
membalas 404 di build produksi (lihat §1), dan `verify-lyrics` kehilangan 77
assertion sekaligus tanpa penjelasan yang jelas. Build yang dipakai untuk
produksi TIDAK boleh memakai flag ini.

    BU_CDP_URL=http://127.0.0.1:9222 TARGET=http://127.0.0.1:3210 \
      node scripts/verify-live.cjs

    BU_CDP_URL=http://127.0.0.1:9222 TARGET=http://127.0.0.1:3210 \
      SLUG=die-with-a-smile node scripts/verify-lyrics.cjs

    BU_CDP_URL=http://127.0.0.1:9222 TARGET=http://127.0.0.1:3210 \
      node scripts/verify-home.cjs

    BU_CDP_URL=http://127.0.0.1:9222 TARGET=http://127.0.0.1:3210 \
      node scripts/verify-sidebar.cjs

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

Jebakan endpoint (DIBALIK TOTAL 2026-09-03 — relay berganti rute, terverifikasi
ulang terhadap `/openapi.json` + probe; jangan percaya catatan lama):
- `/song?song=` dan `/playlist/tracks` sekarang **404**. Yang hidup:
  `/song/<id>` (bentuk path) dan `/playlist?playlist=`.
- `/playlist` mengirim metadata DAN track sekaligus
  (`data[0].relationships.tracks.data`, 100 lagu) plus artwork playlist —
  tapi **MENOLAK `limit`** (400 "Limit may not be supplied"), jadi pemotongan
  rak Home terjadi di `loadHomeShelf`, bukan di relay.
- `/artist` hanya mengirim identitas; `songs` tidak ada dan `albums` cuma stub
  `{id,type,href}`. Judul + artwork yang sungguhan: `/artist/songs` dan
  `/artist/albums` (digabung `toArtistFromParts`).
- `/recommendations` tanpa akun hanya memberi kartu genre — **nol lagu**. Itu
  sebabnya Beranda memakai playlist editorial.
- Relay menolak permintaan tanpa User-Agent browser dengan 403. Jangan simpulkan
  host mati sebelum mencoba dengan UA Chrome.

`api.spicylyrics.org` **MATI untuk publik** (403 Cloudflare, semua permintaan).
YouTube Music InnerTube **tidak punya lirik ber-timestamp** — sudah ditelusuri
sampai `browseId MPLY...`: nol `cueRange`, nol `timedLyricsData`. Jangan coba lagi.

---

## 9. Fakta LRCLIB (cadangan lirik, terukur)

`https://lrclib.net` — `GET /api/get` dan `GET /api/search`. Tanpa kunci, tapi
meminta User-Agent yang mengidentifikasi aplikasi; itu syarat wajar dan dipenuhi
(bukan dipalsukan jadi browser seperti pada relay Apple).

**Durasi menentukan rekaman mana yang dikirim.** Ini bukan detail kecil:

    /api/get ... &duration=252   -> duration 250, timestamp terakhir 287,57
    /api/get ... (tanpa duration) -> duration 316  ← REKAMAN LAIN

Karena itu durasi selalu dikirim DAN hasilnya diperiksa ulang di
`toLrclibLyrics` dengan toleransi 3 detik. Sama seperti jembatan audio YouTube:
durasi yang memutuskan, bukan judul.

Fakta lain yang sudah menjebak sekali:
- `duration` di respons bisa TIDAK cocok dengan timestamp terakhirnya (bertaut:
  250 vs 287,57). Jadi durasi jangan dipakai memotong lirik.
- Format LRC-nya memakai timestamp BERTEKS-KOSONG (`[00:29.45] `) sebagai
  penanda akhir baris sebelumnya. Membuangnya membuat baris terakhir sebelum
  jeda menyala belasan detik.
- Hanya line-level. Tidak ada timing per kata, jadi hasilnya `kind: 'line'` dan
  animator sengaja TIDAK menyapunya — menyapu berarti mengarang presisi yang
  tidak ada di datanya (`BRIEF.md`: "sapuan palsu").
- Sebagian lagu dibalas `instrumental: true`. Itu jawaban BERGUNA, bukan
  kegagalan: pane lirik bisa mengatakannya dengan yakin.

Fixture nyata dua lagu ada di `fixtures/lrclib/`; 33 unit test berjalan
terhadapnya.

---

## 10. Produksi

    Repo    https://github.com/Rafly0078/laras-web   (private)
    Live    https://laras-web.vercel.app             (publik, tanpa proteksi)
    Vercel  proyek `laras-web`, akun rafly4018-5755, terhubung ke repo di atas

Env di Vercel (Production): `NEXT_PUBLIC_SITE_URL=https://laras-web.vercel.app`.
Itu satu-satunya yang diset. `APPLE_CATALOG_BASE` memakai default, dan
`LARAS_ENABLE_DEV` **tidak diset** — kalau ia pernah diset di produksi, `/demo`
dan `/dev/lirik` terbuka dan lirik berhak cipta empat lagu ikut tersaji.

Deploy berikutnya: `npx vercel deploy --prod --yes`, atau push ke `master`
(repo sudah terhubung).

### Terukur di produksi, bukan diasumsikan

Streaming **jalan di Vercel** tanpa konfigurasi apa pun. Satu id cold
(`/lagu/6791909852`, belum pernah diminta):

    TTFB 499ms · <h1> 708ms · lirik 9611ms · 9 chunk · badan tutup 9619ms

Selisih kerangka→lirik 8,9 detik — sama seperti lokal. Kalau angka ini pernah
berubah jadi "TTFB ≈ waktu lirik", berarti ada lapisan yang mem-buffer respons;
periksa §2(d) dan panduan streaming Next soal proxy/CDN.

Pemeriksaan cepat setelah deploy:

    curl -s https://laras-web.vercel.app/api/health
    → {"ok":true,"relay":{"terjangkau":true,"ms":244}}

    /demo dan /dev/lirik WAJIB 404 di produksi. Kalau 200, `LARAS_ENABLE_DEV`
    ikut terbawa ke build produksi.

Rate limit terverifikasi lokal: permintaan ke-11 dalam satu ledakan ke
`/api/lirik/<id>` dibalas **429** dengan `Retry-After`. Ingat batasnya — per
instance, bukan global (§2(f)).
