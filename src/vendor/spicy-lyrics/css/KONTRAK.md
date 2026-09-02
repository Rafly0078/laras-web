# Kontrak DOM & CSS — vendor `spicy-lyrics`

Dokumen ini menjelaskan apa yang **dibutuhkan** oleh dua file CSS di folder ini
supaya berfungsi. Ia bukan panduan gaya; ia daftar syarat. Kalau DOM yang kamu
tulis tidak cocok dengan hierarki di §1, CSS-nya diam saja (tidak error) dan
lirik akan tampak tidak berwarna atau tidak bergerak.

Sumber : `src/css/Lyrics/main.css` + `src/css/Lyrics/Mixed.css`
Repo   : <https://github.com/spikerko/spicy-lyrics>
Commit : `4576d022b39e98291d71c75b0d4d355bcc332ced`
Lisensi: AGPL-3.0 (lihat header tiap file)

Semua nomor baris di bawah merujuk **file di folder ini** (sudah termasuk header
lisensi 30 baris), bukan file upstream.

---

## §1 Hierarki DOM yang diharapkan

### 1.1 Kerangka luar

```
<div id="SpicyLyricsPage" class="SpicyRenderer …">     ← ID + kelas WAJIB
  └── <div class="LyricsContainer">                     (flex column, center)
        └── <div class="LyricsContent">                 ← viewport gulir; container-type: size
              └── <div class="SpicyLyricsScrollContainer"
                       data-lyrics-type="Syllable|Line|Static"
                       class="… HasDuetLines? HasRtlLines?">
                    ├── <div class="VirtualLyricsContainer">   ← host virtualizer; container-type: size
                    │     └── <div data-index="N" …>           ← wrapper TANPA kelas (opsional)
                    │           └── <div class="line …">       ← baris lirik
                    ├── <div class="Credits">
                    ├── <div class="LyricsProvider">
                    └── <div class="SongInfo">
```

Catatan penting:

- **`#SpicyLyricsPage` adalah ID, bukan kelas.** Hampir setiap selektor di
  `Mixed.css` diawali `#SpicyLyricsPage.SpicyRenderer`. Tanpa keduanya di elemen
  yang sama, **nol** aturan `Mixed.css` menyala. `main.css` hanya butuh
  `#SpicyLyricsPage` (tanpa `.SpicyRenderer`) kecuali satu aturan margin baris.
- Semua kombinator adalah **descendant** (spasi), bukan child (`>`). Jadi
  menyisipkan wrapper di antara level mana pun aman — itulah sebabnya wrapper
  posisi milik virtualizer boleh tanpa kelas.
- `.VirtualLyricsContainer` punya `container-type: size`. **`container-type: size`
  menuntut tinggi eksplisit.** Upstream mengisinya dari JS (virtualizer). Kalau
  LARAS tidak mengisi tinggi, elemen ini runtuh ke 0 dan seluruh lirik hilang.
- Wrapper virtualizer upstream: `position:absolute; left:0; width:100%;
  will-change:transform; padding-bottom:<gap>px`, atribut `data-index`, tanpa
  kelas. `padding-bottom` inilah jarak antar baris yang sebenarnya (§3.4).
- Spacer bawah permanen setinggi `clientHeight / 2` di-append ke elemen gulir
  (bukan ke `.VirtualLyricsContainer`) supaya baris terakhir bisa ke tengah.

### 1.2 Isi satu baris (`data-lyrics-type="Syllable"`)

```
<div class="line [OppositeAligned] [rtl] [Active|Sung|NotSung] [FeelSung] [pre-hidden]">
  ├── <span class="word [PartOfWord|LastWordInLine]">        ← satu SUKU KATA
  ├── <div  class="letterGroup [PartOfWord|LastWordInLine]"> ← suku kata mode per-huruf
  │     └── <span class="letter Emphasis [SpaceLetter] [LastLetterInWord]">  ← satu HURUF
  └── <span class="word-group">                              ← pembungkus suku kata yang menempel
        └── <span class="word PartOfWord"> | <div class="letterGroup PartOfWord">
</div>
```

Vokal latar = **baris terpisah**, bukan anak baris utama:

```
<div class="line bg-line [OppositeAligned] [rtl]">
  └── <span class="word bg-word …"> | <div class="letterGroup …">
</div>
```

Interlude (jeda instrumental) juga baris tersendiri:

```
<div class="line musical-line [OppositeAligned]">
  └── <div class="dotGroup">
        ├── <span class="word dot">   ← isi teks: karakter bullet literal
        ├── <span class="word dot">
        └── <span class="word dot">
</div>
```

Lirik statis (tak tersinkron): teks ditaruh **langsung di `.line.static`**, tanpa
`.word` sama sekali — `.static` memasok gradient sendiri (`--gradient-position:
100%`, kedua alpha `1`) sehingga teksnya putih pekat.

### 1.3 Aturan penamaan yang mudah salah

| Kelas | Elemen | Jangan tertukar |
|---|---|---|
| `.word` | satu **suku kata** (bukan satu kata) | dipasang juga pada `.dot` |
| `.letterGroup` | suku kata yang dipecah per huruf | **TIDAK** ikut memakai `.word` |
| `.letter` | satu **karakter** (UTF-16 code unit) | selalu ikut `.Emphasis` |
| `.word-group` | pembungkus deretan `.PartOfWord` | bukan "satu kata" secara semantik |
| `.PartOfWord` | suku kata yang menempel ke berikutnya | pada `.word` **dan** `.letterGroup` |
| `.LastWordInLine` | suku kata terakhir di baris | meniadakan jarak `::after` |
| `.SpaceLetter` | `.letter` yang isinya hanya spasi | wajib, lihat §4.4 |
| `.bg-line` | baris vokal latar | baris sendiri, bukan anak |
| `.musical-line` | baris interlude | runtuh ke tinggi 0 saat non-aktif |

### 1.4 Kelas keadaan (ditulis mesin animasi, bukan penulis DOM)

Pada `.line`: `Active`, `Sung`, `NotSung`, `FeelSung`, `pre-hidden`.
Pada `#SpicyLyricsPage`: `SpicyRenderer` (wajib), `SimpleLyricsMode`,
`MinimalLyricsMode`, `Fullscreen`, `CompactMode`, `UseSpicyFont`,
`Exp_DuetLinePadding`, `NoLineHoverBackground`.
Pada `.LyricsContent`: `Hidden`, `HiddenTransitioned`, `HideLineBlur`, `offline`.
Pada `.SpicyLyricsScrollContainer`: `HasDuetLines`, `HasRtlLines`.
Pada `.Credits`: `Active`.
Ancestor opsional: `.spicy-pip-wrapper` (mode picture-in-picture).
Disebut tapi didefinisikan di luar file ini: `.LyricsNotice`, `.ViewControls`
`.ViewControl`, `.simplebar-content`.

**`Active` / `Sung` / `NotSung` saling eksklusif dan WAJIB ada salah satu.** Baris
tanpa satu pun dari ketiganya tidak dapat `background-image` maupun `text-shadow`
— artinya **tidak terlihat sama sekali**, karena `-webkit-text-fill-color:
transparent` tetap berlaku. Ini jebakan nomor satu (§4.2).

---

## §2 CSS custom property

Kolom "penulis": `CSS` = nilai tetap di file ini; `JS/frame` = ditulis mesin
animasi tiap frame; `JS/state` = ditulis saat baris aktif berganti.

### 2.1 Dibaca tiap frame — ini yang wajib ditulis mesin animasi

| Properti | Default | Satuan | Rentang | Penulis | Dipasang di |
|---|---|---|---|---|---|
| `--gradient-position` | `-20%` | `<percentage>` | `-20%` → `100%` | JS/frame | `.line`, `.word`, `.letter` |
| `--text-shadow-blur-radius` | `4px` | `<length>` | `4px` → ±`12px` (huruf: ±`36px`) | JS/frame | `.word`, `.letter`, `.letterGroup` |
| `--text-shadow-opacity` | `0%` | `<percentage>` | `0%` → `100%` (huruf dihitung s/d `185%`, dipotong `rgba()`) | JS/frame | `.word`, `.letter`, `.letterGroup` |
| `--BlurAmount` | `0px` | `<length>` | `0px` → `6.83125px` | JS/state | `.line` |
| `--SLM_GradientPosition` | `-50%` | `<percentage>` (via `@property`) | `-50%` → `100%` | JS/state | `.word`, `.letter` (hanya `SimpleLyricsMode`) |

`--BlurAmount` = `min(1.25 × |index − indexAktif|, 1.25×5 + 1.25×0.465)` px, dan
`0px` untuk baris aktif. Ia masuk ke **`text-shadow`**, bukan `filter: blur()`.

`--text-shadow-blur-radius` punya **tiga profil** di upstream, tergantung jalur
kode: kata biasa `4 + 2·glow`, kata jalur kedua `4 + 6·glow`, huruf `4 + 8·glow`.
Opasitasnya: `min(glow·35, 100)%`, `glow·90%`, dan `glow·185%` berturut-turut.

`--SLM_GradientPosition` terdaftar lewat `@property` sehingga **bisa
ditransisikan** oleh CSS; `--gradient-position` tidak terdaftar, jadi harus
digerakkan per frame dari JS.

### 2.2 Knob gradient (nilai tetap, boleh dioverride per konteks)

| Properti | Default | Satuan | Override yang ada | Dipasang di |
|---|---|---|---|---|
| `--gradient-color` | `255` | angka tanpa satuan | — | `.line`, `.word`, `.letter` |
| `--gradient-alpha` | `0.85` | angka `0`–`1` | `1` (SimpleLyricsMode, `.static`), `0.6` (`.bg-line`) | idem |
| `--gradient-alpha-end` | `0.5` → **`0.35 !important`** di `.line` | angka `0`–`1` | `0.3` (SimpleLyricsMode, `.bg-line`), `1` (`.static`) | idem |
| `--gradient-degrees` | `90deg` → **`180deg !important`** di `.line` | `<angle>` | `-90deg !important` (`.rtl .word/.letter`) | idem |
| `--gradient-offset` | `0%` | `<percentage>` | `30% !important` (SimpleLyricsMode) | idem |

`--gradient-color` disisipkan tiga kali ke dalam satu `rgba()`, jadi ia hanya bisa
menghasilkan abu-abu netral (`rgba(c, c, c, a)`), bukan warna sembarang.

Nilai dasar `--gradient-alpha-end: 0.5` **selalu** tertimpa `0.35 !important` di
`.line`. Yang efektif adalah `0.35`.

### 2.3 Ukuran & tata letak

| Properti | Default | Satuan | Override yang ada | Dipasang di |
|---|---|---|---|---|
| `--DefaultLyricsSize` | `clamp(1.85rem, calc(1cqw * 7), 3.5rem)` | `<length>` | PiP `clamp(1.7rem, 5.5cqw, 2.6rem)`; Static `clamp(0.8rem, 5cqw, 2.5rem)`; PiP+Static `clamp(1.4rem, 6cqw, 2.3rem)` | `.LyricsContent` |
| `--font-size` | `var(--DefaultLyricsSize)` | `<length>` | `× 0.75` (`.bg-line`), `× 1.3` (`.dot`), `× 0.33` (`.SongInfo .Uploader/.Maker`, `× 0.45` di PiP) | `.line` dan turunannya |
| `--lyrics-line-height` | `1.1818181818` | angka | — | `.line` |
| `--SpicyLyrics-LineSpacing` | `1cqw 0` | nilai shorthand `margin` | fallback `2cqw 0` di jalur `data-lyrics-type="Line"` | `:root` |
| `--vertical-gap` | `0px` | `<length>` | — | `.LyricsContent` |
| `--SL-LyricsContent_MaskTopPadding` | `0px` (`@property <length>`, `inherits: false`) | `<length>` | `32px` saat `.ViewControl` di-hover; transisi `0.5s` | `.LyricsContent` |
| `--ImageMask` | gradient mask (§3.6) | `<image>` | dimatikan di PiP saat ada `.LyricsNotice` | `.LyricsContent` |
| `--DuetLineInset` | `5cqw` | `<length>` | `15cqw` dengan `.Exp_DuetLinePadding` | `.SpicyLyricsScrollContainer.HasDuetLines` |
| `--top` / `--bottom` | `1.15cqw` / `1.25cqw` | `<length>` | — | **hanya** `.line.rtl` dan turunannya |
| `--dot-gap` | `clamp(0.005rem, 1.7cqw, 0.18rem)` | `<length>` | `clamp(0.0067rem, 1.76cqw, 0.32rem)` (SimpleLyricsMode) | `.dotGroup` |
| `--opacity-size` | `0.35` | angka `0`–`1` | `0.27` (SimpleLyricsMode) | `.dot` |

### 2.4 Opacity & skala baris

| Properti | Default | Override | Dibaca? |
|---|---|---|---|
| `--Vocal-NotSung-opacity` | `0.51` | `0.45` (SimpleLyricsMode) | ya, `.line.NotSung` |
| `--Vocal-Sung-opacity` | `0.497` | `0.35` (SimpleLyricsMode) | ya, `.line.Sung` |
| `--Vocal-Hover-opacity` | `1` | — | ya, `:hover` |
| `--Vocal-Active-opacity` | `1` | — | **tidak** — `.Active` memakai literal `opacity: 1` |
| `--DefaultLineScale` | `1` | — | ya, `.Sung`/`.NotSung` |
| `--DefaultEmphasisLyricsScale` | `0.95` | — | **tidak** (hanya di aturan yang dikomentari) |
| `--DefaultLyricsScale` | `0.95` | — | **tidak** — JS memakai konstanta sendiri |

### 2.5 Dideklarasikan tapi tidak pernah dibaca file ini

`--TextGlowDef` (`rgba(255,255,255,0.15) 0 0 6px`), `--ActiveTextGlowDef`
(`…0.4… 14px`, dibaca hanya di aturan terkomentari), `--StrongTextGlowDef`
(`…0.68… 16.4px`), `--StrongerTextGlowDef` (`…0.74… 16px`),
`--amll-lyric-player-font-size`, `--Simplebar-Scrollbar-Color`
(`rgba(255,255,255,0.6)`).

Ditulis JS tapi **tidak** dibaca kedua file ini: `--active-line-distance`,
`--scale-amount` (hanya di aturan terkomentari), `--content-duration`,
`--SLM_TranslateY`. Jangan repot menulisnya.

**Eksternal (bukan milik spicy-lyrics):** `--spice-sidebar` — variabel tema
Spicetify. Lihat §5.

---

## §3 Angka desain vs `src/lib/lyrics/design-tokens.ts`

Token kita hasil pengukuran tangan; CSS ini sumber aslinya. Di bawah dipisah
tegas: yang **SAMA** (pengukuran kita benar) dan yang **BEDA** (temuan).

### 3.1 SAMA — persis, sampai angka desimalnya

| Nilai | CSS upstream | Token kita |
|---|---|---|
| Ukuran font | `clamp(1.85rem, calc(1cqw * 7), 3.5rem)` | `TYPO.fontSizeMin/Fluid/Max` |
| `line-height` | `1.1818181818` | `TYPO.lineHeight` |
| `letter-spacing` | `0` | `TYPO.letterSpacing` |
| `font-weight` | `700` | `TYPO.fontWeight` |
| Jarak antar kata | `0.32ch` | `TYPO.wordGap` |
| Skala diam | `0.95` (biasa & emphasis) | `TYPO.idleScale`, `idleEmphasisScale` |
| Transisi opacity | `0.2s cubic-bezier(0.61, 1, 0.88, 1)` | `TYPO.opacityTransition` |
| Gradient posisi | `-20%` → `100%` (rentang 120) | `GRADIENT.positionNotSung/Sung/Range` |
| Gradient feather | `+ 20%` | `GRADIENT.feather` |
| Gradient arah | `180deg` | `GRADIENT.degrees` |
| Gradient alpha | `0.85` / `0.35` | `GRADIENT.alpha` / `alphaEnd` |
| Alpha vokal latar | `0.6` / `0.3` | `GRADIENT.backgroundAlpha` / `backgroundAlphaEnd` |
| Opacity baris | `0.51` / `1` / `0.497` / `1` | `LINE_OPACITY` (termasuk Sung < NotSung) |
| Glow kata | `4 + 2·glow` px, `min(glow·35, 100)%` | `GLOW.blurBase/blurScale/opacityFactor/opacityMax` |
| Blur baris jauh | `min(1.25·d, 1.25·5 + 1.25·0.465)` | `BLUR.multiplier` / `BLUR.max` |
| Titik interlude | `1.3×` font, `scale 0.75`, `opacity 0.35`, `line-height 0.65` | `DOTS.*` |
| Mask tepi | `16px` / `64px` / `100%−64px` / `100%−16px` | `PANE.mask*` |
| Ruang gulir atas | `25cqh` | `PANE.scrollMarginTop` |
| Ruang gulir bawah | `6cqh` | `PANE.scrollMarginBottom` |
| Ambang emphasis | `totalDuration >= 1000` ms | `EMPHASIS_MIN_DURATION = 1.0` |

### 3.2 BEDA — angka

| Hal | CSS upstream | Kita | Catatan |
|---|---|---|---|
| Ukuran vokal latar | `calc(--DefaultLyricsSize * 0.75)`, **absolut** | `.background { font-size: 0.72em }`, relatif | 0.75 vs 0.72 |
| Bobot vokal latar | `600 !important` | mewarisi `700` | |
| Offset vokal latar | `margin: -1cqw 0 1cqw` | `margin-top: 0.12em` | upstream negatif ke atas |
| Padding vertikal baris | **tidak ada** | `padding: 0.34em 0` | upstream: jarak dari margin/gap |
| Padding kanan baris | `5cqw` (non-duet), inset duet `5cqw`/`15cqw` | tidak ada | mengubah lebar bungkus → titik putus baris berbeda |
| Jarak antar baris | `1cqw` (`0.2cqw` sebelum `.bg-line`), ditulis px oleh virtualizer | dari padding `0.34em` | |
| `transform-origin` kata | `center center` + sadar `PartOfWord` | `center bottom`, tidak sadar `PartOfWord` | §4.6 — kandidat penyebab huruf bergeser |
| `align-items` pada baris | tidak disetel (default `stretch`) | `baseline` | terasa saat ukuran font campuran |
| Glow huruf | `4 + 8·glow` px, `glow·185%` | tidak ada profil huruf | |
| Glow kata jalur ke-2 | `4 + 6·glow` px, `glow·90%` | tidak dicatat | |
| `translateY` diam | kata `× 0.01`, huruf/letterGroup `× 0.02` dari `--DefaultLyricsSize` | `SPLINE.yOffset` puncak `−1/60 ≈ −0.0167` | huruf upstream dapat `currentYOffset × 2` |
| Akhir emphasis | `EndTime − 250 ms` | tidak ada | huruf selesai lebih awal |
| Kredit | `.Credits 0.47em` (op. 0.6), `.LyricsProvider 0.34em` (op. 0.5), `.SongInfo 0.35em` | `.credit 0.3em`, op. 0.35 | |
| Jarak titik interlude | `clamp(0.005rem, 1.7cqw, 0.18rem)` | `gap: 0.28em` | |
| Skala baris aktif (mode Line) | `1.05`, `scale 0.2s cubic-bezier(0.37, 0, 0.63, 1)` | tidak ada | |
| Lirik statis | `clamp(0.8rem, 5cqw, 2.5rem)`, `font-weight: 500`, alpha `1`/`1` | tidak ada | |

### 3.3 BEDA — arsitektur, bukan angka

1. **Baris non-aktif digambar oleh `text-shadow`, bukan gradient.**
   `background-image` HANYA diberikan ke `.line.Active`, `.Active .word`,
   `.Active .letter`, dan `.line.static`. Baris `NotSung`/`Sung` hanya mendapat
   `text-shadow: 0 0 var(--BlurAmount, 0) rgba(c,c,c,alpha)`. Karena
   `-webkit-text-fill-color: transparent` berlaku ke semua, teks baris non-aktif
   **seluruhnya adalah bayangan** dari glyph transparan. Modul kita memberi
   gradient ke `.word` tanpa syarat dan memakai `text-shadow` hanya untuk glow.
2. **Nama properti berbeda.** Upstream `--BlurAmount` dan
   `--text-shadow-blur-radius`; modul kita `--blur-amount` dan
   `--text-shadow-blur`. Upstream `--DefaultLyricsSize`; kita
   `--laras-lyrics-size`. Mesin animasi harus memakai nama upstream.
3. **`container-type: size` di dua tempat** (`.LyricsContent` **dan**
   `.VirtualLyricsContainer`). Kita hanya di root. Akibatnya `1cqw` di dalam
   baris upstream diukur dari lebar virtual container, sedangkan `25cqh` pada
   scroll container diukur dari `.LyricsContent`.
4. **Penanganan RTL lengkap**: `direction: ltr` dipaksa di setiap `.line`,
   `.rtl` membalikkannya plus `transform-origin: right center` dan
   `--gradient-degrees: -90deg`. Kita nol penanganan arah.
5. **Plat hover di bawah baris**: `.line::before` — `rgba(255,255,255,0.1)`,
   `backdrop-filter: blur(2px)`, radius `16px`, `scale` `0.9` → `1.05`,
   `transition: opacity .25s ease, scale .4s linear(…)`. Butuh `.line { position:
   relative }` (sudah ada). Kita tidak punya.
6. **Interlude runtuh**: `.musical-line` non-aktif → `height: 0; line-height: 0;
   overflow: hidden; opacity: 0; z-index: -1; margin: 0; padding: 0`; saat
   `.Active` → `height: auto; overflow: visible`. `.dotGroup` di-`scale` `1` ↔ `0`
   dengan kurva `linear()` yang memantul. Kita tidak punya.
7. **Titik interlude = glyph**, bukan lingkaran CSS. Upstream menaruh karakter
   bullet sebagai teks dan mewarnainya lewat pipeline gradient/`text-shadow` yang
   sama; `border-radius: 50%` pada `.dot` sisa peninggalan dan tidak terlihat.
   Kita menggambar `width/height: 0.3em` + `background`.
8. **`--SL-LyricsContent_MaskTopPadding`** menggeser awal mask dari `64px` ke
   `96px` (`64 + 32`) saat kontrol tampilan di-hover, ditransisikan `0.5s` lewat
   `@property`. Kita tidak punya.
9. **`margin` baris mati di jalur virtualizer.** `main.css` memasang
   `… .VirtualLyricsContainer .line { margin: 0 !important }` dengan spesifisitas
   (1,6,0), mengalahkan `margin: var(--SpicyLyrics-LineSpacing)` (1,5,0) **dan**
   `.bg-line { margin: -1cqw 0 1cqw !important }` (1,5,0). Jadi seluruh angka
   margin baris di `Mixed.css` tidak berlaku selama virtualizer dipakai; jarak
   sebenarnya = `padding-bottom` wrapper dalam px.
10. **Ruang gulir bawah `6cqh` itu bukan salah ukur kita.** Komentar upstream
    menjelaskan `6cqh` cukup karena virtualizer menambah spacer permanen setinggi
    setengah viewport. Modul kita memakai `padding-bottom: 30cqh` — itu tambalan
    tangan untuk ketiadaan spacer tersebut, dan tidak cocok dengan
    `PANE.scrollMarginBottom` (`6cqh`) di token kita sendiri.

### 3.4 Angka yang hanya ada di sisi JS (bukan di CSS)

`GAP_NORMAL = 1` (cqw, baris↔baris), `GAP_LINE_TO_BG = 0.2` (cqw, baris↔vokal
latar), estimasi tinggi awal `66px` (baris biasa) / `50px` (`.bg-line`) / `0`
(`.musical-line` non-aktif), `LetterGlowMultiplier_Opacity = 185`,
`BlurMultiplier = 1.25`, `IdleLyricsScale = IdleEmphasisLyricsScale = 0.95`.

### 3.5 Mask tepi (identik dengan token kita)

```
linear-gradient(180deg,
  transparent 0, transparent 16px,
  <warna> calc(64px + var(--SL-LyricsContent_MaskTopPadding)),
  <warna> calc(100% - 64px),
  transparent calc(100% - 16px), transparent)
```

---

## §4 Teknik — jawaban langsung atas pertanyaan yang diajukan

### 4.1 Sapuan: `background-clip: text`, sama seperti kode kita

Ya. Mekanismenya identik: glyph dibuat transparan, warna datang dari
`background-image` ber-gradient yang di-clip ke bentuk teks, dan sapuan =
menggeser `--gradient-position`. Dua beda halus yang penting:

- Upstream **hanya** menyetel `-webkit-text-fill-color: transparent`; ia **tidak**
  menyetel `color: transparent`. Modul kita menyetel keduanya.
- Upstream **hanya** menyetel `background-clip: text` tanpa varian
  `-webkit-background-clip: text`. Modul kita menyetel keduanya.

Keduanya berlaku ke `.line`, `.word`, dan `.letter` — **bukan** ke `.letterGroup`
(elemen itu tidak punya teks sendiri, hurufnya yang punya).

### 4.2 Konsekuensi yang mudah membakar: gradient hanya untuk `.Active`

`background-image` diberikan hanya ke `.line.Active`, `.Active .word`,
`.Active .letter`, `.line.static`. Untuk `NotSung`/`Sung`, teks dirender 100% oleh
`text-shadow` dengan radius `var(--BlurAmount, 0)` — radius `0` menghasilkan
salinan tajam glyph, jadi teks tetap terbaca. Kalau DOM kita lupa memasang salah
satu dari `Active`/`Sung`/`NotSung`, baris itu **tidak terlihat sama sekali**.

### 4.3 Penanganan per-HURUF: ada, dan lebih agresif dari dugaan kita

- Pemicu: `IsLetterCapable(letterLength, totalDuration)`. Di mode default
  syaratnya **hanya** `totalDuration >= 1000` ms — **tidak ada batas jumlah
  huruf.** Batas 12 huruf hanya berlaku di `SimpleLyricsMode`. Syarat tambahan:
  panjang teks > 0 dan teks **bukan RTL**.
- Suku kata yang lolos berubah dari `<span class="word">` menjadi
  `<div class="letterGroup">` berisi satu `<span class="letter Emphasis">` per
  karakter, masing-masing dengan slot waktu `totalDuration / jumlahKarakter`.
- **`.letterGroup` tidak mendapat kelas `.word`.** Selektor `.line .word` tidak
  mengenainya. Ini alasan hampir setiap aturan disebut dua kali
  (`… .word, … .letterGroup`).
- **`.letterGroup` efektif `display: inline-flex`**, bukan `inline-block`. Ada dua
  aturan dengan spesifisitas sama (1,5,0); yang belakangan (`inline-flex`) menang.
  Jadi setiap huruf adalah **flex item** tersendiri.
- Pemecahan memakai `String.prototype.split("")` — per **UTF-16 code unit**, bukan
  per grapheme cluster.

### 4.4 `unicode-bidi`, `word-break`, `overflow-wrap`, `white-space`

Hasil pemeriksaan menyeluruh kedua file (dihitung, bukan dikira):

| Properti | Jumlah kemunculan |
|---|---|
| `unicode-bidi` | **0** |
| `word-break` | **0** |
| `overflow-wrap` | **0** |
| `hyphens` | **0** |
| `text-wrap` | **0** |
| `word-spacing` | **0** |
| `font-kerning`, `font-feature-settings`, `font-variant` | **0** |
| `white-space` | **2** |
| `direction` | 8 (`ltr` di `.line`, `rtl !important` di `.line.rtl`, sisanya `flex-direction`) |
| `letter-spacing` | 1 (`0` di `.line`) |

Dua `white-space` itu:

- `.letter.SpaceLetter { white-space: pre; min-width: 0.3ch; }`
- `.word-group { white-space: nowrap; }` (bersama `flex-wrap: wrap`)

### 4.5 Kenapa ini relevan dengan "penempatan huruf Indonesia acak-acakan"

Dilaporkan apa adanya, dipisah antara yang **terbukti dari kode** dan yang
**dugaan mekanisme**.

**Terbukti dari kode:**

1. **Spasi di dalam suku kata runtuh ke 0px kalau tidak ditandai.** Sebuah
   `.letter` yang isinya hanya spasi menjadi kotak `inline-block`/flex item
   selebar 0 — dua kata dalam satu suku kata langsung menempel. Upstream
   menambalnya dengan `.letter.SpaceLetter { white-space: pre; min-width: 0.3ch }`
   dan komentar upstream menyebut persis gejala ini. **Modul kita tidak punya
   padanan `.SpaceLetter` sama sekali.**
2. **`.letterGroup` adalah flex container, jadi shaping teks mati.** Setiap huruf
   flex item terpisah → browser tidak bisa melakukan kerning, ligatur, atau
   shaping lintas batas span. Posisi huruf jadi murni penjumlahan advance width
   per glyph. Pada font bold Latin, pasangan seperti `T`+`a` / `V`+`a` / `W`+`a`
   bergeser terlihat dibanding teks yang di-shape normal.
3. **Pemecahan `split("")` per UTF-16 code unit.** Untuk bahasa Indonesia (Latin
   ASCII murni) ini aman. Tapi ia memecah pasangan surrogate (emoji) dan
   memisahkan combining mark dari huruf dasarnya — dan karena setiap potongan jadi
   flex item, mark tidak bisa lagi menempel ke basisnya. Skrip RTL sudah
   dikecualikan lewat `isRtl`, tetapi Devanagari/Thai/Vietnam **tidak**.
4. **Karakter zero-width harus dibuang sebelum dipecah.** Upstream membuang
   U+200B, U+200E, U+200F, U+2060, U+FEFF dari teks render (menyisakan ZWNJ/ZWJ
   yang bermakna). Tanpa itu setiap karakter tak terlihat menjadi satu `<span
   class="letter">` kosong yang memakan satu slot durasi suku kata — huruf jadi
   tampak bergeser waktunya.
5. **Pemutusan baris terjadi antar flex item, bukan di dalam teks.** `.line` dan
   `.word-group` memakai `flex-wrap: wrap`. Karena `white-space` **tidak**
   mengatur pemutusan antar flex item, `white-space: nowrap` pada `.word-group`
   praktis tidak berpengaruh: satu kata yang terdiri dari beberapa suku kata
   **masih bisa terpotong ke baris berikutnya**. Tidak ada `word-break` atau
   `overflow-wrap` yang membatasi apa pun.
6. **Tidak ada `unicode-bidi`.** `direction: ltr` dipaksa pada `.line` tanpa
   `unicode-bidi: plaintext`/`isolate`. Karena tiap suku kata elemen inline
   tersendiri, algoritma bidi berjalan per-elemen. Aman untuk Indonesia; tidak
   aman untuk teks campuran.

**Dugaan mekanisme (belum diukur, tapi paling menjelaskan gejala):**

7. **`transform-origin` yang tidak sadar `PartOfWord`.** Upstream memakai rantai
   berikut supaya suku kata yang menempel membesar tanpa menggeser sambungannya:
   `.word`/`.letterGroup` → `center center`; `.PartOfWord` → `right center`;
   `.PartOfWord + .PartOfWord` → `center center`; `.PartOfWord + (.word |
   .letterGroup)` → `left center` (versi `.rtl` dicerminkan). Efeknya: potongan
   pertama sebuah kata berjangkar di tepi kanannya, potongan terakhir di tepi
   kirinya, sehingga kata mengembang simetris dari tengah dan sambungan antar suku
   kata tidak melorot. Modul kita memakai `center bottom` untuk **semua** `.word`
   tanpa varian `PartOfWord` — setiap suku kata yang di-`scale` menggeser
   tetangganya. Ini kandidat terkuat penyebab "huruf bergeser".
8. **`white-space: pre` pada setiap `.word` di modul kita.** Upstream **tidak**
   memasangnya di `.word`, hanya di `.SpaceLetter`. Kalau teks suku kata dari TTML
   membawa spasi di ujung, `white-space: pre` mempertahankannya **dan**
   `::after { margin-right: 0.32ch }` menambah jarak lagi — jarak jadi ganda dan
   tidak konsisten antar suku kata.

### 4.6 Jarak antar kata: `::after`, bukan `gap`

```
.line .word:not(.PartOfWord, .dot, .LastWordInLine)::after,
.line .letterGroup:not(.PartOfWord, .dot, .LastWordInLine)::after {
  content: ""; margin-right: 0.32ch;
}
```

Jadi jarak hidup **di dalam** kotak suku kata dan **tidak ikut ter-`scale`**
bersama huruf. Baris `.OppositeAligned` bekerja terbalik: `::after`-nya
di-`margin-right: 0` dan jaraknya diambil dari `column-gap: 0.32ch` pada baris.
`.line` biasa **tidak** punya `column-gap`.

### 4.7 Skala & geser dipisah ke dua properti berbeda

Upstream memakai properti CSS `scale` untuk pembesaran dan `transform:
translateY(...)` untuk naik-turun — dua properti terpisah supaya tidak saling
menimpa. Nilai `translateY` dinyatakan dalam kelipatan `--DefaultLyricsSize`
(`calc(var(--DefaultLyricsSize) * n)`), jadi geserannya ikut skala font.

---

## §5 Ketergantungan Spotify / Spicetify dan cara penanganannya

### 5.1 Diperbaiki — satu tanda `/* LARAS: */`

**`main.css`, di dalam `--ImageMask`: `var(--spice-sidebar)` → `var(--spice-sidebar, #000)`.**

`--spice-sidebar` adalah variabel tema Spicetify. Di luar Spotify ia tidak
terdefinisi, sehingga `var()` tanpa fallback membuat seluruh `linear-gradient()`
*invalid at computed-value time*; `mask-image` lalu jatuh ke nilai awalnya
(`none`) dan **fade tepi atas/bawah hilang total**. Mask hanya memakai kanal
alpha, jadi warna opaque apa pun setara — `#000` dipilih karena sama dengan yang
dipakai modul lirik kita. Ini satu-satunya perubahan aturan di kedua file.

### 5.2 Dibiarkan verbatim, tapi perlu diketahui

| Temuan | Di mana | Kenapa dibiarkan |
|---|---|---|
| `body:has(.Root:not(.global-nav))` (2 aturan) | `main.css` | `.Root`/`.global-nav` kelas DOM Spotify. Di luar Spotify selektor ini **tidak pernah cocok**, jadi tidak merusak apa pun — aturan dasar (`margin-top: 25cqh`, dan `40cqh` untuk MinimalLyricsMode) yang berlaku. Kedua aturan itu hanya menukar `margin-top` menjadi `padding-top`. Kode mati, bukan kode rusak. |
| `#SpicyLyricsPage`, `.SpicyRenderer`, `.LyricsContainer`, `.LyricsContent` | keduanya | Milik spicy-lyrics sendiri, bukan Spotify. **Harus direplikasi** di DOM LARAS, lihat §1.1. |
| `.spicy-pip-wrapper` | keduanya | Wrapper picture-in-picture milik mereka. Tidak pernah cocok di LARAS; semua aturannya hanya penyesuaian ukuran untuk popup. |
| `.simplebar-content` | dirujuk kode JS | Scrollbar kustom (pustaka SimpleBar), bukan Spotify. LARAS memakai gulir native, jadi `.SpicyLyricsScrollContainer` bisa langsung jadi anak `.LyricsContent`. |
| `--Simplebar-Scrollbar-Color` | `main.css` | Dideklarasikan untuk CSS SimpleBar yang tidak ikut di-vendor. Tidak berefek. |
| `--amll-lyric-player-font-size` | `main.css` | Untuk renderer alternatif (AMLL) yang tidak ikut di-vendor. Tidak berefek. |
| `.ViewControls .ViewControl` | `main.css` | Kontrol tampilan milik mereka. Tanpa elemen ini, `--SL-LyricsContent_MaskTopPadding` tetap `0px` — mask tetap benar. |
| `.LyricsNotice` | `main.css` | Blok pesan milik mereka (mis. "lirik tidak tersedia"). Hanya dipakai untuk mematikan mask di PiP dan mengecualikan `font-weight: 700 !important`. |

### 5.3 Ketergantungan aset, bukan DOM: font `SpicyLyrics`

`font-family: SpicyLyrics` muncul 3× (`.bg-line` dengan `.UseSpicyFont`,
`.musical-line`, dan `.dotGroup`). Ini font milik mereka yang **tidak** ikut
di-vendor. Karena `.dot` merender karakter bullet literal sebagai teks, ia tetap
tampil dengan font fallback — hanya bentuk bulatnya sedikit berbeda. Tidak diubah
karena bukan ketergantungan DOM Spotify; kalau bentuk titiknya perlu presisi,
opsi kita adalah mengganti glyph atau menggambar lingkaran sendiri.

### 5.4 Kompatibilitas toolchain

Kedua file lolos Lightning CSS 1.32.0 (mesin CSS Tailwind v4 / Next.js) tanpa
error dan tanpa warning, termasuk kedua blok `@property`, fungsi easing
`linear(…)`, dan transisi custom property. **Tidak ada** perubahan sintaks yang
perlu dilakukan untuk build.







