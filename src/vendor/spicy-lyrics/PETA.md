# PETA — mesin lirik spicy-lyrics yang di-vendor

Kode di `src/vendor/spicy-lyrics/` adalah **salinan** mesin lirik
[spikerko/spicy-lyrics](https://github.com/spikerko/spicy-lyrics) pada commit
`4576d022b39e98291d71c75b0d4d355bcc332ced` (2026-08-29), AGPL-3.0, hak cipta
(c) Spikerko dan kontributor. Lisensi lengkap: `LICENSE-AGPL-3.0` di direktori
ini. Setiap penyesuaian LARAS ditandai `// LARAS:` di file yang bersangkutan.

Dokumen ini untuk orang yang menulis **adapter React**-nya. Isinya: apa yang
diekspor tiap file, apa yang dibutuhkannya dari luar, dan siapa pemanggilnya.

## Tiga hal yang paling mudah salah

1. **Satuan waktu berpindah di tengah jalan.** Payload yang kamu berikan ke
   `ApplySyllableLyrics`/`ApplyLineLyrics` pakai **DETIK** (sama seperti
   `src/lib/types.ts`). Tapi `TimeSetter(pos)` dan `Animate(pos)` menerima
   **MILIDETIK** — Applyer sudah mengalikan 1000 lewat `ConvertTime` saat
   menulis ke `LyricsObject`. Salah satuan = lirik diam atau habis seketika.
2. **Mesin ini state global tingkat modul.** `LyricsObject` di `shim/lyrics.ts`
   satu-satunya papan tulis, dan `PageContainer` satu-satunya container. Artinya
   **hanya boleh ada SATU pane lirik hidup per halaman** — persis batasan
   aplikasi asal. Dua `<LyricsView>` sekaligus akan saling menimpa.
3. **Jangan kirim baris interlude sendiri.** Applyer MEMBUAT baris titik
   (`.musical-line` + 3 `.dot`) dari jarak antar-baris >= 3 detik. Kalau
   `LyricLine.interlude` dari `src/lib/types.ts` ikut dikirim sebagai baris,
   titiknya jadi dobel.

## Urutan pemanggilan

```ts
import { setLyricsPageContainer } from "@/vendor/spicy-lyrics/shim/PageView";
import { $currentLyricsType } from "@/vendor/spicy-lyrics/shim/stores";
import { ApplySyllableLyrics } from "@/vendor/spicy-lyrics/utils/Lyrics/Applyer/Synced/Syllable";
import { TimeSetter } from "@/vendor/spicy-lyrics/utils/Lyrics/Animator/Lyrics/LyricsSetter";
import { Animate } from "@/vendor/spicy-lyrics/utils/Lyrics/Animator/Lyrics/LyricsAnimator";
import { DestroyAllLyricsContainers } from "@/vendor/spicy-lyrics/shim/CreateLyricsContainer";

setLyricsPageContainer(hostEl);      // 1. wajib pertama: menyalakan $lyricsContainerExists
$currentLyricsType.set("Syllable");  // 2. "Syllable" | "Line"; kalau "None" animator diam
ApplySyllableLyrics(payload);        // 3. bangun DOM + isi LyricsObject
                                     // 4. tiap frame, dalam urutan ini:
TimeSetter(positionMs);              //    tandai status baris/kata/huruf
Animate(positionMs);                 //    tulis kelas + custom property
                                     // 5. saat dilepas:
DestroyAllLyricsContainers();
setLyricsPageContainer(null);
```

`TimeSetter` sebelum `Animate`, selalu: `Animate` membaca `Status` yang baru
ditulis `TimeSetter`. Keduanya di dalam SATU `requestAnimationFrame` loop —
lihat `HANDOFF.md` §2(c), aturan itu tetap berlaku di sini.

## Bentuk payload yang diterima Applyer

Waktu **detik**. Bentuknya nyaris sama dengan `Lyrics` di `src/lib/types.ts`,
jadi adapternya tipis:

```ts
// ApplySyllableLyrics(data)
{
  Type: "Syllable",
  StartTime: number,           // mulai baris pertama; >= 3 -> ada baris titik pembuka
  Content: [{
    Lead: {
      StartTime: number, EndTime: number,
      Syllables: [{
        Text: string,
        StartTime: number, EndTime: number,
        IsPartOfWord?: boolean,     // menempel ke potongan berikutnya tanpa spasi
        TransliteratedText?: string // dipakai kalau UseRomanized = true
      }]
    },
    Background?: [{ StartTime, EndTime, Syllables: [...] }],
    OppositeAligned?: boolean,      // penyanyi kedua -> rata kanan
  }],
  SongWriters?: string[],           // diabaikan (shim kredit no-op)
  source?: "spt" | "spl" | "aml",   // diabaikan
  classes?: string,                 // diterapkan ke .simplebar-content — TIDAK ADA di LARAS
  styles?: Record<string, string>,  // idem
}

// ApplyLineLyrics(data): Content-nya rata, tanpa Lead/Background
{ Type: "Line", StartTime, Content: [{ Text, StartTime, EndTime,
  TransliteratedText?, OppositeAligned? }] }
```

Pemetaan dari `src/lib/types.ts`: `lead.syllables[].{text,start,end,isPartOfWord}`
→ `Syllables[].{Text,StartTime,EndTime,IsPartOfWord}`, `background[]` →
`Background[]`, `oppositeAligned` → `OppositeAligned`.

**`Syllable.emphasis` LARAS tidak dipakai.** Mesin ini memutuskan sendiri lewat
`IsLetterCapable`: di mode penuh, setiap suku kata berdurasi **>= 1000 ms**
dipecah jadi huruf-per-huruf. Kalau angka `emphasis` dari TTML Apple perlu
dihormati, itu keputusan baru — bukan sesuatu yang tinggal disambungkan.

## File vendor: ekspor / kebutuhan / pemakai

### `utils/Lyrics/Applyer/Synced/Syllable.ts` — 568 baris (+header)

- **Ekspor:** `ApplySyllableLyrics(data, UseRomanized = false): void`
- **Butuh dari luar:** `$lyricsContainerExists` & `$minimalLyricsMode` &
  `$simpleLyricsMode` (shim/stores), `PageContainer` (shim/PageView),
  `applyStyles`/`removeAllStyles` (shim/Styles), 4 fungsi simplebar
  (shim/ScrollSimplebar), `LyricsObject` + `CurrentLineLyricsObject` +
  `SetWordArrayInCurentLine` + `ClearLyricsContentArrays` +
  `getLyricsBetweenShow` + `getInterludeTimePadding` + `setRomanizedStatus`
  (shim/lyrics), `CreateLyricsContainer`/`DestroyAllLyricsContainers`,
  `initLyricsVirtualizer`, `ClearLyricsPageContainer`, 3 fungsi kredit,
  `EmitApply`/`EmitNotApplyed`, plus `ConvertTime`, `isRtl`, `StripZeroWidth`,
  `Emphasize`, `IsLetterCapable`, `IdleLyricsScale`, `IdleEmphasisLyricsScale`.
- **Dipanggil:** adapter, sekali tiap lagu/lirik baru. Langsung `return` kalau
  `$lyricsContainerExists` masih `false`.
- **Efek:** menghapus container lama, membangun ulang seluruh DOM baris/kata,
  dan MENGISI `LyricsObject.Types.Syllable.Lines` (dalam milidetik).

### `utils/Lyrics/Applyer/Synced/Line.ts` — 337 baris (+header)

- **Ekspor:** `ApplyLineLyrics(data, UseRomanized = false): void`
- **Butuh:** sama dengan Syllable.ts, minus Emphasize/IsLetterCapable/Idle*,
  plus `LINE_SYNCED_CurrentLineLyricsObject` &
  `SetWordArrayInCurentLine_LINE_SYNCED`. Mengisi
  `LyricsObject.Types.Line.Lines`.
- **Dipanggil:** adapter, untuk lirik `kind: 'line'` (mis. LRCLIB — lihat
  `HANDOFF.md` §9). Tidak ada sapuan per kata di jalur ini.

### `utils/Lyrics/Animator/Lyrics/LyricsAnimator.ts` — 1841 baris (+header)

- **Ekspor:** `Animate(position: number): void` (ms) — inti;
  `findActiveElement(currentTime): any` (mengembalikan `[element, jenis]`);
  `GetSpline(range: AnimationPoint[])`; `Clamp(value, min, max)`;
  `Blurring_LastLine` + `setBlurringLastLine(c)` (cache indeks baris terakhir
  yang di-blur); `interface AnimationPoint { Time, Value }`.
- **Butuh:** `cubic-spline` + `d3-ease` (npm), `Spring` (modules/Spring),
  `BlurMultiplier` + `timeOffset` (Animator/Shared), `LyricsObject` +
  `SimpleLyricsMode_LetterEffectsStrengthConfig` + `preHiddenDotLineMs`
  (shim/lyrics), tiga store, `setOnNewElementMounted` (shim/LyricsVirtualizer).
- **Dipanggil:** adapter, tiap frame, SETELAH `TimeSetter`.
- **Catatan:** menulis gaya lewat cache + batch (`setStyleIfChanged` →
  `flushStyleBatch`), jadi memanggilnya ulang dengan posisi sama nyaris gratis.
  Elemen yang tidak `isConnected` dilewati saat blur.

### `utils/Lyrics/Animator/Lyrics/LyricsSetter.ts` — 147 baris (+header)

- **Ekspor:** `TimeSetter(PreCurrentPosition: number): void` (ms)
- **Butuh:** `$currentLyricsType`, `LyricsObject` + `LyricsType`, `timeOffset`.
- **Dipanggil:** adapter, tiap frame, SEBELUM `Animate`. Tugasnya hanya menulis
  `Status: "NotSung" | "Active" | "Sung"` ke baris, kata, dan huruf.

### `modules/Spring.ts` — 122 baris (+header)

- **Ekspor:** `class Spring` — `new Spring(startPosition, frequency,
  dampingRatio, goal?)`, `Step(dt): number`, `CanSleep(): boolean`,
  `GetGoal()`, `SetGoal(goal, replacePosition?)`, `SetDampingRatio(d)`,
  `SetFrequency(f)`.
- **Butuh:** tidak ada.
- **Dipanggil:** hanya LyricsAnimator. Port dari Fraktality/spr (MIT) —
  header aslinya dipertahankan. LARAS punya port sendiri di
  `src/lib/lyrics/spring.ts`; keduanya sengaja tidak digabung supaya file
  vendor tetap bisa didiff ke upstream.

### `utils/Lyrics/Animator/Shared.ts` — 32 baris (+header)

- **Ekspor:** `IdleLyricsScale = 0.95`, `IdleEmphasisLyricsScale = 0.95`,
  `timeOffset = 0`, `DurationTimeOffset = 0`, `BlurMultiplier = 1.25`,
  `WordBlurs` (min/max blur untuk kata & emphasis).
- **Dipanggil:** LyricsAnimator, LyricsSetter, Syllable, Emphasize.
  `WordBlurs` dan `DurationTimeOffset` belum dipakai satu pun file di sini.

### `utils/Lyrics/Applyer/Utils/Emphasize.ts` — 115 baris (+header)

- **Ekspor:** default `Emphasize(letters: string[], applyTo: HTMLElement,
  lead: any, isBgWord = false): void`
- **Butuh:** `$simpleLyricsMode`, `ArabicPersianRegex`,
  `IdleEmphasisLyricsScale`, `ConvertTime`, `CurrentLineLyricsObject` +
  `LyricsObject`.
- **Dipanggil:** Syllable.ts saja, untuk suku kata yang lolos
  `IsLetterCapable`. Membuat satu `<span class="letter Emphasis">` per huruf
  (spasi ditandai `SpaceLetter`) dan mendorong `LetterGroup` ke baris aktif.
- **`any` upstream:** parameter `lead` bertipe `any` — dibiarkan.

### `utils/Lyrics/Applyer/Utils/IsLetterCapable.ts` — 38 baris (+header)

- **Ekspor:** `IsLetterCapable(letterLength, totalDuration): boolean`
- **Aturan:** mode penuh → `totalDuration >= 1000` (ms), panjang kata tidak
  dibatasi. Mode simple (mati di LARAS) → `<= 12` huruf DAN `>= 1050` ms.

### Tiga util murni

| File | Ekspor | Dipakai |
|---|---|---|
| `utils/Lyrics/ConvertTime.ts` (3) | `ConvertTime(t) => t * 1000` | Syllable, Line, Emphasize |
| `utils/Lyrics/isRtl.ts` (31) | default `isRtl(text): boolean` | Syllable, Line |
| `utils/Lyrics/Applyer/Utils/StripZeroWidth.ts` (19) | `StripZeroWidth(text)` + default | Syllable, Line |

## Shim: apa yang digantikan, apa yang hilang

Semua di `shim/`. Header tiap file memuat versi panjangnya.

| Shim | Menggantikan (upstream) | Yang hilang |
|---|---|---|
| `stores.ts` | `utils/stores.ts` (110) | Persistensi ke localStorage & panel setelan. `simpleLyricsMode`, `minimalLyricsMode`, `simpleLyricsModeRenderingType` dibekukan (`false`/`false`/`"calculate"`). `$currentLyricsType` + `$lyricsContainerExists` bisa ditulis. |
| `PageView.ts` | `components/Pages/PageView.ts` (800) | Rute Spicetify, loader, ViewControls, fullscreen/compact, kelas mode di container. Container DITERIMA dari pemanggil; kerangka `.LyricsContainer > .LyricsContent` dibuat otomatis kalau belum ada. |
| `lyrics.ts` | `utils/Lyrics/lyrics.ts` (345) | Loop rAF bawaan (yang membaca posisi dari SpotifyPlayer), klik-untuk-seek, store romanisasi. **Model data + semua angka disalin apa adanya.** |
| `LyricsVirtualizer.ts` | `utils/Lyrics/LyricsVirtualizer.ts` (1006) | Windowing @tanstack/virtual-core, pengukuran tinggi, `scrollLyricsToIndex`, dan **jarak antar-baris** yang upstream taruh di padding wrapper — di LARAS jarak itu harus datang dari CSS. Callback `setOnNewElementMounted` tetap dipanggil (sekali, karena semua baris dipasang sekaligus). |
| `ScrollSimplebar.ts` | `utils/Scrolling/Simplebar/ScrollSimplebar.ts` (73) | Paket `simplebar` + auto-hide scrollbar + `isDragging` + elemen `.simplebar-content` (akibatnya `data.classes`/`data.styles` hanya menghasilkan peringatan `LyricsStylingContainer not found` — normal, bukan kerusakan). |
| `CreateLyricsContainer.ts` | `utils/Lyrics/Applyer/CreateLyricsContainer.ts` (86) | `ResizeObserver` + `QueueForceScroll`: mengubah ukuran pane tidak otomatis menggeser tampilan ke baris aktif. |
| `fetchLyrics.ts` | `utils/Lyrics/fetchLyrics.ts` (sebagian) | Seluruh lapisan pengambilan lirik mereka; hanya `ClearLyricsPageContainer()` yang dipertahankan. |
| `OnApply.ts` | `utils/Lyrics/Applyer/OnApply.ts` (18) | Event `lyrics:apply`/`lyrics:not-apply` ke bus global. Pelepasan kelas `HiddenTransitioned` DIPERTAHANKAN. |
| `Credits.ts` | `Applyer/Credits/{ApplyLyricsCredits,ApplyProvider,ApplyIsByCommunity}` | Elemen kredit di kaki pane. LARAS merender atribusinya sendiri lewat React (`Lyrics.attribution`). |
| `Styles.ts` | `utils/CSS/Styles.ts` (23) | Tidak ada; perilakunya setara. |
| `Addons.ts` | `utils/Addons.ts` (sebagian) | Tidak ada yang relevan; hanya `ArabicPersianRegex`. |
| `cubic-spline.d.ts` | — | Bukan shim: deklarasi tipe untuk paket `cubic-spline` yang tidak mengirim `.d.ts` dan tidak punya `@types` di npm. |

`shim/engine-wiring.test.ts` menjaga rangkaian di atas tetap nyambung: Applyer →
container → virtualizer → `Animate` benar-benar menulis ke DOM. Suku kata di
dalamnya karangan, bukan teks lagu.

## Kontrak DOM (untuk CSS di `../css` dan untuk adapter)

Struktur yang dihasilkan:

```
host (dari setLyricsPageContainer)
└─ .LyricsContainer
   └─ .LyricsContent.ScrollbarScrollable
      └─ .SpicyLyricsScrollContainer[data-lyrics-type="Syllable"|"Line"]
         │  [.HasDuetLines][.HasRtlLines]  ← perhatikan: di SINI, bukan di .LyricsContainer
         └─ .VirtualLyricsContainer
            ├─ .line.musical-line > .dotGroup > span.word.dot ×3
            ├─ .line[.OppositeAligned][.rtl]
            │  ├─ span.word[.LastWordInLine][.PartOfWord]
            │  ├─ div.letterGroup > span.letter.Emphasis[.SpaceLetter][.LastLetterInWord]
            │  └─ span.word-group > (kata yang menempel tanpa spasi)
            └─ .line.bg-line > span.word.bg-word
```

Catatan: kata yang dipecah jadi huruf adalah `div.letterGroup` dan **tidak**
mendapat kelas `.word` — selektor yang mengandalkan `.word` akan melewatinya.

Kelas status yang dipasang animator: `Active`, `Sung`, `NotSung`,
`pre-hidden`, `FeelSung`.

Custom property yang ditulis (hanya jalur yang hidup di mode penuh):
`--gradient-position` (posisi sapuan, %), `--BlurAmount` (px, jarak dari baris
aktif), `--text-shadow-opacity`, `--text-shadow-blur-radius`. Selain itu gaya
inline `scale`, `opacity`, `transform`, `willChange`.
Yang DIBACA dari CSS: `var(--DefaultLyricsSize)` (kata lead) dan
`var(--font-size)` (kata latar) — keduanya wajib ada di CSS, kalau tidak
`translateY` kata jadi `calc()` yang tak terhitung.




