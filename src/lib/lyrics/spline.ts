/**
 * Cubic spline MONOTON (Fritsch–Carlson) untuk kurva desain lirik.
 *
 * Dipakai untuk menerjemahkan progres kata (0..1) menjadi nilai target
 * (skala, offset Y, glow, opacity). Titik-titiknya sedikit — dua sampai
 * empat — tapi interpolasinya harus MULUS: kalau linear, transisi antar
 * segmen terasa seperti patahan.
 *
 * KENAPA MONOTON, BUKAN SPLINE NATURAL. Versi pertama file ini memakai spline
 * natural (turunan kedua = 0 di kedua ujung, sistem tridiagonal Thomas). Itu
 * mulus, tapi ia MELEWATI nilai simpul di antara simpul — dan angka simpul di
 * `design-tokens.ts` adalah angka desain yang harus dihormati apa adanya.
 * Terukur pada token nyata:
 *
 *   SPLINE.glow   {0,0} {0.15,1} {0.6,1} {1,0}
 *                 natural: at(0.34) = 1.433  ← 43% di atas 1, padahal
 *                 komentar tokennya berbunyi "menyala cepat lalu BERTAHAN".
 *                 Akibatnya glow memompa 0 → 1.43 → 1.0 → 0: satu denyut
 *                 tambahan di tengah kata yang tidak diminta siapa pun.
 *   SPLINE.yOffset {0,0} {0.9,-1/60} {1,0}
 *                 natural: at(0.574) = -0.0390 ← 2,34× amplitudo desain
 *                 1/60 = 0.0167, dan puncaknya jatuh di progres 0.574
 *                 bukan 0.9. Kata naik terlalu jauh, turun sedikit, baru
 *                 naik lagi — persis "acak-acakan".
 *
 * Interpolasi monoton tidak bisa melewati: di simpul yang jadi ekstremum lokal
 * tangennya dipaksa 0, jadi puncak kurva PERSIS sama dengan angka desain dan
 * segmen antar dua nilai sama menjadi datar sempurna. Nilai di simpul tetap
 * identik dengan versi natural, jadi tidak ada angka desain yang berubah.
 *
 * Ditulis sendiri, tanpa paket npm, supaya tidak ada dependensi runtime
 * tambahan di jalur animasi yang dieksekusi ratusan kali per frame.
 */

export interface SplinePoint {
  time: number;
  value: number;
}

export class LarasSpline {
  private readonly times: number[];
  private readonly values: number[];
  /** Tangen (turunan pertama) di tiap simpul, sudah dibatasi agar monoton. */
  private readonly tangents: number[];

  constructor(points: readonly SplinePoint[]) {
    if (points.length === 0) {
      throw new Error('LarasSpline butuh minimal satu titik');
    }

    // Titik desain sering ditulis tidak berurut (mis. yOffset punya puncak di
    // tengah). Urutkan dulu supaya pencarian segmen valid.
    const sorted = [...points].sort((a, b) => a.time - b.time);
    this.times = sorted.map((p) => p.time);
    this.values = sorted.map((p) => p.value);
    this.tangents = this.solveTangents();
  }

  /**
   * Tangen di setiap simpul menurut Fritsch–Carlson (1980).
   *
   * Tiga aturan yang menentukan bentuk kurvanya:
   *  1. Tangen di ujung = kemiringan sekan segmen terluar.
   *  2. Di simpul tempat kemiringan berganti tanda (atau salah satunya nol),
   *     tangen dipaksa 0. Ini yang membuat puncak berada TEPAT di simpul.
   *  3. Tangen dipangkas ke dalam lingkaran radius 3 (α² + β² ≤ 9) supaya
   *     tiap segmen tetap monoton walau rata-rata sekannya terlalu curam.
   */
  private solveTangents(): number[] {
    const n = this.times.length;
    const tangents = new Array<number>(n).fill(0);
    if (n < 2) return tangents; // satu titik = konstan

    const secant = new Array<number>(n - 1);
    for (let i = 0; i < n - 1; i += 1) {
      let h = this.times[i + 1] - this.times[i];
      // Dua titik dengan time identik akan membuat h = 0 dan meledak jadi
      // Infinity. Jaga dengan epsilon kecil — hasilnya praktis tangga tajam,
      // yang memang yang dimaksud kalau seseorang menulis dua titik sewaktu.
      if (h === 0) h = 1e-9;
      secant[i] = (this.values[i + 1] - this.values[i]) / h;
    }

    // Aturan 1. Untuk n = 2 ini sekaligus membuat Hermite-nya linear murni.
    tangents[0] = secant[0];
    tangents[n - 1] = secant[n - 2];

    // Aturan 2.
    for (let i = 1; i < n - 1; i += 1) {
      const before = secant[i - 1];
      const after = secant[i];
      tangents[i] = before * after <= 0 ? 0 : (before + after) / 2;
    }

    // Aturan 3.
    for (let i = 0; i < n - 1; i += 1) {
      const s = secant[i];
      if (s === 0) {
        // Segmen datar: dua tangennya WAJIB 0, kalau tidak kurvanya menggelembung
        // di antara dua nilai yang sama (inilah bug glow 1.433).
        tangents[i] = 0;
        tangents[i + 1] = 0;
        continue;
      }
      const alpha = tangents[i] / s;
      const beta = tangents[i + 1] / s;
      const radius = alpha * alpha + beta * beta;
      if (radius > 9) {
        const shrink = 3 / Math.sqrt(radius);
        tangents[i] = shrink * alpha * s;
        tangents[i + 1] = shrink * beta * s;
      }
    }

    return tangents;
  }

  /**
   * Nilai spline pada t.
   *
   * t di luar rentang di-CLAMP, tidak diekstrapolasi: progres kata selalu
   * 0..1, dan ekstrapolasi cubic di luar rentang bisa melesat jauh
   * (skala negatif, glow > 1) yang langsung terlihat sebagai kedipan.
   */
  at(t: number): number {
    const n = this.times.length;
    if (n === 1) return this.values[0];

    if (t <= this.times[0]) return this.values[0];
    if (t >= this.times[n - 1]) return this.values[n - 1];

    // Cari segmen lewat binary search (rentang kecil, tapi ini dipanggil
    // ribuan kali per frame untuk semua kata yang terlihat).
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.times[mid] <= t) lo = mid;
      else hi = mid;
    }

    const h = this.times[hi] - this.times[lo];
    if (h === 0) return this.values[hi];

    if (n === 2) {
      // Dua titik: linear murni. Hermite dengan tangen = sekan menghasilkan
      // hal yang sama, tapi jalur ini bebas galat pembulatan.
      const ratio = (t - this.times[lo]) / h;
      return this.values[lo] + ratio * (this.values[hi] - this.values[lo]);
    }

    // Hermite kubik pada segmen [lo, hi].
    const s = (t - this.times[lo]) / h;
    const s2 = s * s;
    const s3 = s2 * s;

    return (
      (2 * s3 - 3 * s2 + 1) * this.values[lo] +
      (s3 - 2 * s2 + s) * h * this.tangents[lo] +
      (-2 * s3 + 3 * s2) * this.values[hi] +
      (s3 - s2) * h * this.tangents[hi]
    );
  }
}
