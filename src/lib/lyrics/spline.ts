/**
 * Cubic spline natural untuk kurva desain lirik.
 *
 * Dipakai untuk menerjemahkan progres kata (0..1) menjadi nilai target
 * (skala, offset Y, glow, opacity). Titik-titiknya sedikit — tiga sampai
 * empat — tapi interpolasinya harus MULUS: kalau linear, transisi antar
 * segmen terasa seperti patahan.
 *
 * Ditulis sendiri (algoritma Thomas untuk sistem tridiagonal) alih-alih
 * memakai paket npm supaya tidak ada dependensi runtime tambahan di jalur
 * animasi yang dieksekusi ratusan kali per frame.
 */

export interface SplinePoint {
  time: number;
  value: number;
}

export class LarasSpline {
  private readonly times: number[];
  private readonly values: number[];
  /** Turunan kedua di tiap simpul; inti dari interpolasi cubic. */
  private readonly second: number[];

  constructor(points: readonly SplinePoint[]) {
    if (points.length === 0) {
      throw new Error('LarasSpline butuh minimal satu titik');
    }

    // Titik desain sering ditulis tidak berurut (mis. yOffset punya puncak di
    // tengah). Urutkan dulu supaya pencarian segmen valid.
    const sorted = [...points].sort((a, b) => a.time - b.time);
    this.times = sorted.map((p) => p.time);
    this.values = sorted.map((p) => p.value);
    this.second = this.solveSecondDerivatives();
  }

  /**
   * Hitung turunan kedua di setiap simpul untuk spline natural
   * (turunan kedua di kedua ujung = 0).
   */
  private solveSecondDerivatives(): number[] {
    const n = this.times.length;
    const out = new Array<number>(n).fill(0);
    if (n < 3) return out; // 1 titik = konstan, 2 titik = linear

    const h = new Array<number>(n - 1);
    for (let i = 0; i < n - 1; i += 1) {
      h[i] = this.times[i + 1] - this.times[i];
      // Dua titik dengan time identik akan membuat h = 0 dan meledak jadi
      // Infinity. Jaga dengan epsilon kecil — hasilnya praktis tangga tajam,
      // yang memang yang dimaksud kalau seseorang menulis dua titik sewaktu.
      if (h[i] === 0) h[i] = 1e-9;
    }

    // Sistem tridiagonal: mu[i]·m[i-1] + 2·m[i] + lambda[i]·m[i+1] = d[i]
    const alpha = new Array<number>(n).fill(0);
    const beta = new Array<number>(n).fill(0);

    for (let i = 1; i < n - 1; i += 1) {
      const hPrev = h[i - 1];
      const hNext = h[i];
      const slopePrev = (this.values[i] - this.values[i - 1]) / hPrev;
      const slopeNext = (this.values[i + 1] - this.values[i]) / hNext;

      const mu = hPrev / (hPrev + hNext);
      const lambda = hNext / (hPrev + hNext);
      const d = (6 * (slopeNext - slopePrev)) / (hPrev + hNext);

      // Eliminasi maju (Thomas)
      const denom = 2 + mu * alpha[i - 1];
      alpha[i] = -lambda / denom;
      beta[i] = (d - mu * beta[i - 1]) / denom;
    }

    // Substitusi balik; ujung tetap 0 (syarat spline natural)
    for (let i = n - 2; i >= 1; i -= 1) {
      out[i] = alpha[i] * out[i + 1] + beta[i];
    }

    return out;
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
      // Dua titik: linear murni, tanpa turunan kedua.
      const ratio = (t - this.times[lo]) / h;
      return this.values[lo] + ratio * (this.values[hi] - this.values[lo]);
    }

    const a = (this.times[hi] - t) / h;
    const b = (t - this.times[lo]) / h;
    const mLo = this.second[lo];
    const mHi = this.second[hi];

    return (
      a * this.values[lo] +
      b * this.values[hi] +
      ((h * h) / 6) * ((a * a * a - a) * mLo + (b * b * b - b) * mHi)
    );
  }
}
