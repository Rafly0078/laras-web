/**
 * Nilai desain lirik — DISALIN DARI PENGUKURAN spicy-lyrics (spikerko).
 *
 * PENTING: repo spicy-lyrics berlisensi AGPL-3.0. Tidak ada satu baris kode
 * mereka di project ini. Yang ada di file ini adalah ANGKA hasil pembacaan
 * CSS/animator mereka (fakta, bukan ekspresi berhak cipta), diimplementasikan
 * ulang dari nol. Spring-nya di-port dari Fraktality/spr (MIT) — sumber yang
 * sama yang mereka port juga.
 *
 * Jangan "merapikan" angka-angka di sini. Setiap nilai punya efek yang
 * terlihat; 1.0505 bukan salah tulis dari 1.05.
 */

/* ── Spring: frekuensi (Hz) + damping ratio ─────────────────────────
 * damping < 1 = underdamped = ada overshoot. Itu yang bikin kata "memantul"
 * sedikit saat masuk, dan itu memang disengaja.                          */
export const SPRING = {
  yOffset: { frequency: 1.45, damping: 0.4 },
  scale: { frequency: 0.88, damping: 0.64 },
  glow: { frequency: 1.18, damping: 0.56 },
  opacity: { frequency: 1.25, damping: 0.5 },
} as const;

/**
 * Skala kata saat DIAM.
 *
 * Diberi nama karena dipakai di tiga tempat yang harus sepakat: dua kurva skala
 * di bawah, kelas `.wordGroup` di lyrics.module.css (nilai diam dipasang di CSS
 * supaya baris di luar jendela animator tidak melompat), dan renderer yang
 * membagi skala absolut dengan angka ini sebelum menulisnya.
 *
 * KENAPA PEMBAGIAN ITU ADA: skala diam dipasang pada KELOMPOK KATA, bukan pada
 * tiap suku kata. Kalau tiap span mengecil 5% di sekitar pivotnya sendiri,
 * sambungan di dalam satu kata membuka celah tinta (terukur p50 0,91px setelah
 * pivot diperbaiki, 3,07px sebelumnya) dan celah ANTAR kata melebar jadi 0,50ch
 * padahal marginnya 0,32ch — kotak layout tidak menyusut, hanya tintanya.
 *
 * Dengan skala di kelompok, seluruh kata menyusut sebagai satu kotak: nol seam
 * di dalam kata, dan celah antar kata ikut menyusut proporsional. Konsekuensinya
 * animator tetap mengeluarkan skala ABSOLUT (0.95..1.0505, supaya tetap bisa
 * diuji terhadap angka desain) dan renderer membaginya dengan nilai ini supaya
 * hasil kalinya kembali absolut.
 */
export const IDLE_SCALE = 0.95;

/* ── Spline: goal spring sebagai fungsi progres kata (0..1) ──────────
 * Titik-titik ini diinterpolasi cubic; spring lalu MENGEJAR nilainya.
 * Jadi ada dua lapis pelembutan — itu sebabnya terasa organik.          */
export const SPLINE = {
  /**
   * Skala kata biasa: diam 0.95, puncak 1.0505 di progres 0.7, PULANG ke 0.95.
   *
   * Simpul `time: 1` itu wajib dan pernah tidak ada. Tanpanya `LarasSpline.at()`
   * meng-clamp di simpul terakhir, jadi `at(1) === 1.0505` — dan karena animator
   * memakai `splineAt = 1` untuk keadaan 'sung', goal spring kata yang SUDAH
   * dinyanyikan adalah PUNCAKNYA, bukan nilai diamnya. Kata yang sudah lewat
   * tidak pernah mengecil kembali.
   *
   * Terukur pada satu pane sebelum diperbaiki: 219 span diam di 1.0505/1.175
   * bersebelahan dengan 324 span di 0.95 — empat ukuran huruf diam sekaligus,
   * beda terjauh 24%. Karena `scale` tidak mengubah layout, kata yang melebar
   * menabrak tetangganya; jarak tinta terukur sampai -7,30px (tumpang-tindih).
   *
   * `yOffset` dan `glow` di bawah SUDAH punya simpul pulang sejak awal. Dua
   * kurva skala ini yang tertinggal.
   */
  scale: [
    { time: 0, value: IDLE_SCALE },
    { time: 0.7, value: 1.0505 },
    { time: 1, value: IDLE_SCALE },
  ],
  /** Kata "emphasis" (span panjang) menonjol jauh lebih kuat, lalu pulang juga. */
  scaleEmphasis: [
    { time: 0, value: IDLE_SCALE },
    { time: 0.7, value: 1.175 },
    { time: 1, value: IDLE_SCALE },
  ],
  /** Naik ke atas 1/60 em di progres 0.9 — sangat kecil, sangat penting. */
  yOffset: [
    { time: 0, value: 0 },
    { time: 0.9, value: -(1 / 60) },
    { time: 1, value: 0 },
  ],
  /** Glow menyala cepat lalu bertahan. */
  glow: [
    { time: 0, value: 0 },
    { time: 0.15, value: 1 },
    { time: 0.6, value: 1 },
    { time: 1, value: 0 },
  ],
  /** Opacity kata: 0.35 saat diam → 1 di progres 0.6. */
  opacity: [
    { time: 0, value: 0.35 },
    { time: 0.6, value: 1 },
  ],
} as const;

/* ── Sapuan gradient: inti visual spicy-lyrics ──────────────────────
 * Teks dibuat transparan (-webkit-text-fill-color) lalu diwarnai oleh
 * background-image ber-gradient yang di-clip ke bentuk teks. Menggeser
 * --gradient-position dari -20% ke 100% = sapuan.                       */
export const GRADIENT = {
  /** Posisi awal (belum dinyanyikan). */
  positionNotSung: -20,
  /** Posisi akhir (sudah dinyanyikan). */
  positionSung: 100,
  /** Rentang gerak: -20 + 120 × progres. */
  positionRange: 120,
  /** Alpha di titik gradient (bagian sudah tersapu). */
  alpha: 0.85,
  /** Alpha di ujung gradient (bagian belum tersapu). */
  alphaEnd: 0.35,
  /** Lebar bulu/feather gradient. */
  feather: 20,
  /**
   * 90deg = sapuan HORIZONTAL, kiri ke kanan mengikuti arah baca.
   *
   * spicy-lyrics memakai 180deg (vertikal), dan itu sempat disalin ke sini
   * apa adanya. Terbukti lewat piksel: pada 180deg batas terang/redup melintang
   * MENDATAR di tengah huruf, jadi setiap suku kata di-wipe dari atas ke bawah —
   * pada peradaban itu 935 wipe vertikal pendek (durasi span p50 0,315s).
   *
   * Pemilik repo menunjuk rujukan visual bergaya Apple Music: kata menyala
   * berurutan dari kiri ke kanan. Itu 90deg. Angka ini SENGAJA berbeda dari
   * spicy-lyrics — bukan salah salin.
   */
  degrees: 90,
  /** Vokal latar memakai alpha lebih redup. */
  backgroundAlpha: 0.6,
  backgroundAlphaEnd: 0.3,
} as const;

/* ── Glow → text-shadow ─────────────────────────────────────────────
 * Bukan filter: drop-shadow. text-shadow jauh lebih murah dan
 * menghasilkan cahaya yang menempel pada bentuk huruf.                  */
export const GLOW = {
  /** blur = base + scale × nilaiGlow (px). */
  blurBase: 4,
  blurScale: 2,
  /** opacity = min(nilaiGlow × factor, max) persen. */
  opacityFactor: 35,
  opacityMax: 100,
} as const;

/* ── Blur baris jauh ────────────────────────────────────────────────
 * INI text-shadow, BUKAN filter: blur(). Teks transparan + bayangan
 * putih = baris jauh terlihat lembut bercahaya, bukan sekadar kabur.
 * Rumus asli: min(1.25 × jarak, 1.25×5 + 1.25×0.465).                  */
export const BLUR = {
  multiplier: 1.25,
  /** = 1.25 × 5 + 1.25 × 0.465 = 6.83; dibiarkan sebagai rumus agar jelas. */
  max: 1.25 * 5 + 1.25 * 0.465,
} as const;

/* ── Opacity per keadaan baris ──────────────────────────────────────
 * Perhatikan: Sung (0.497) sedikit LEBIH REDUP dari NotSung (0.51).
 * Bukan kekeliruan — baris yang sudah lewat sengaja mundur lebih jauh.  */
export const LINE_OPACITY = {
  notSung: 0.51,
  active: 1,
  sung: 0.497,
  hover: 1,
} as const;

/* ── Tipografi ──────────────────────────────────────────────────────
 * Bobot 700 RATA untuk semua baris. spicy-lyrics TIDAK memakai bobot
 * bertingkat per jarak; hierarki dibawa opacity + blur saja.            */
export const TYPO = {
  fontWeight: 700,
  /** clamp(1.85rem, 7cqw, 3.5rem) — cqw butuh container-type: size. */
  fontSizeMin: '1.85rem',
  fontSizeFluid: 'calc(1cqw * 7)',
  fontSizeMax: '3.5rem',
  lineHeight: 1.1818181818,
  letterSpacing: 0,
  /** Jarak antar kata, dipasang via ::after margin-right. */
  wordGap: '0.32ch',
  /** Skala saat diam — kata mengecil sedikit sebelum dinyanyikan. */
  idleScale: 0.95,
  idleEmphasisScale: 0.95,
  /** Transisi opacity antar keadaan baris. */
  opacityTransition: '0.2s cubic-bezier(0.61, 1, 0.88, 1)',
} as const;

/* ── Interlude (titik berdenyut saat jeda instrumental) ─────────────── */
export const DOTS = {
  /** Titik 1.3× ukuran font lirik, lalu diperkecil lewat scale. */
  fontSizeMultiplier: 1.3,
  scale: 0.75,
  opacity: 0.35,
  lineHeight: 0.65,
  /** Jeda minimal sebelum sebuah gap dianggap interlude (detik). */
  minGapSeconds: 4,
  /** Denyut per titik dijadwalkan dalam interval ini. */
  pulseIntervalSeconds: 0.9,
} as const;

/* ── Pane lirik: mask fade + ruang scroll ───────────────────────────── */
export const PANE = {
  /** Fade atas/bawah agar baris tidak terpotong keras di tepi. */
  maskFadeStart: '16px',
  maskSolidStart: '64px',
  maskSolidEnd: 'calc(100% - 64px)',
  maskFadeEnd: 'calc(100% - 16px)',
  /** Ruang di atas baris pertama supaya bisa mencapai tengah. */
  scrollMarginTop: '25cqh',
  scrollMarginBottom: '6cqh',
} as const;

/* ── Ambient background dari artwork ───────────────────────────────
 * Kunci "kaya warna"-nya spicy-lyrics: saturasi 2.5×. Blur + dim saja
 * menghasilkan abu-abu mati.                                            */
export const AMBIENT = {
  animated: { saturate: 2.5, brightness: 0.65 },
  static: { brightness: 0.55, contrast: 1.05, saturate: 1.7, scale: 1.25 },
  /** Scrim gelap ke arah bawah pane. */
  scrimMask: 'linear-gradient(to top, transparent, black 145%)',
  scrimHeight: '90%',
  colorTransition: '1.5s',
} as const;

/** Ambang kata dianggap "emphasis" (detik). Span panjang = ditahan penyanyi. */
export const EMPHASIS_MIN_DURATION = 1.0;
