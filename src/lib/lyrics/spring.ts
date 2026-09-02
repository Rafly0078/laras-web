/**
 * Spring analitik — port dari Fraktality/spr (MIT), bukan dari spicy-lyrics (AGPL).
 *
 * Kenapa spring analitik, bukan integrasi numerik: solusinya diselesaikan
 * secara tertutup untuk sembarang dt, jadi hasilnya IDENTIK di 30fps maupun
 * 144fps. Integrator Euler/Verlet akan menghasilkan gerak berbeda tiap
 * frame-rate, dan lirik yang animasinya berbeda di HP vs desktop itu cacat.
 *
 * Parameternya frekuensi (Hz) + damping ratio, BUKAN tension/friction:
 *   damping < 1  underdamped  -> ada overshoot (kata "memantul" sedikit)
 *   damping = 1  critically   -> paling cepat tanpa melewati goal
 *   damping > 1  overdamped   -> lambat, tidak pernah melewati goal
 * Nilai spicy-lyrics semuanya < 1 karena overshoot itulah yang bikin terasa hidup.
 */

const TAU = Math.PI * 2;

/** Di bawah ambang ini spring dianggap sampai; snap ke goal supaya berhenti menulis DOM. */
const SLEEP_OFFSET_SQ_LIMIT = (1 / 3840) ** 2;
const SLEEP_VELOCITY_SQ_LIMIT = 1e-2 ** 2;

/** Ambang aman sebelum pembagian oleh angka sangat kecil jadi tidak stabil. */
const EPS = 1e-5;

/**
 * sin(a)/a lewat seri Taylor, untuk kasus a mendekati 0.
 *
 * Dipakai karena `sin(dt·f·c)/c` meledak jadi 0/0 ketika damping mendekati 1
 * (c = sqrt(1-d²) -> 0). Membiarkannya membagi langsung menghasilkan NaN yang
 * lalu merambat ke seluruh transform lirik.
 */
function sincTaylor(a: number): number {
  const a2 = a * a;
  return 1 - a2 / 6 + (a2 * a2) / 120;
}

export class LarasSpring {
  private dampingRatio: number;
  private frequency: number;
  private goalValue: number;
  private position: number;
  private velocity: number;

  constructor(
    startPosition: number,
    frequency: number,
    dampingRatio: number,
    goal?: number,
  ) {
    this.dampingRatio = dampingRatio;
    this.frequency = frequency;
    this.goalValue = goal ?? startPosition;
    this.position = startPosition;
    this.velocity = 0;
  }

  /** Nilai sekarang tanpa memajukan waktu. */
  get currentValue(): number {
    return this.position;
  }

  get goal(): number {
    return this.goalValue;
  }

  /**
   * Ganti target. Kecepatan TIDAK direset — itu kuncinya: kata yang sedang
   * bergerak lalu goal-nya berubah akan melengkung mulus ke target baru,
   * bukan berhenti lalu mulai lagi.
   */
  setGoal(goal: number): void {
    this.goalValue = goal;
  }

  /** Buang seluruh state (dipakai saat seek / ganti lagu). */
  reset(position: number): void {
    this.position = position;
    this.velocity = 0;
  }

  /**
   * Majukan `dt` DETIK dan kembalikan posisi baru.
   *
   * dt <= 0 dikembalikan apa adanya: frame ganda dengan timestamp sama
   * (bisa terjadi saat tab kembali aktif) tidak boleh menghasilkan NaN.
   */
  step(dt: number): number {
    if (!(dt > 0)) return this.position;

    const d = this.dampingRatio;
    const f = this.frequency * TAU; // Hz -> rad/detik
    const g = this.goalValue;
    const p0 = this.position;
    const v0 = this.velocity;

    const offset = p0 - g;
    const decay = Math.exp(-dt * f * d);

    let p1: number;
    let v1: number;

    if (d === 1) {
      // Critically damped: satu suku eksponensial, tanpa osilasi.
      p1 = (offset * (1 + dt * f) + v0 * dt) * decay + g;
      v1 = (v0 * (1 - dt * f) - dt * offset * (f * f)) * decay;
    } else if (d < 1) {
      // Underdamped: osilasi teredam. c = bagian imajiner frekuensi.
      const c = Math.sqrt(1 - d * d);
      const a = dt * f * c;
      const i = Math.cos(a);
      const j = Math.sin(a);

      // z = sin(a)/c dan y = sin(a)/(f·c); keduanya 0/0 saat c atau f→0.
      const z = c > EPS ? j / c : dt * f * sincTaylor(a);
      const y = f * c > EPS ? j / (f * c) : dt * sincTaylor(a);

      p1 = (offset * (i + d * z) + v0 * y) * decay + g;
      v1 = (v0 * (i - z * d) - offset * (z * f)) * decay;
    } else {
      // Overdamped: dua eksponensial nyata, tanpa overshoot.
      const c = Math.sqrt(d * d - 1);
      const r1 = -f * (d - c);
      const r2 = -f * (d + c);

      const co2 = (v0 - offset * r1) / (2 * f * c);
      const co1 = offset - co2;

      const e1 = Math.exp(r1 * dt);
      const e2 = Math.exp(r2 * dt);

      p1 = co1 * e1 + co2 * e2 + g;
      v1 = co1 * r1 * e1 + co2 * r2 * e2;
    }

    // Tidur: begitu cukup dekat DAN cukup lambat, snap. Tanpa ini spring
    // terus menulis nilai yang berbeda di desimal ke-15 selamanya, dan tiap
    // penulisan itu jadi kerja DOM sia-sia untuk ratusan kata.
    const finalOffset = p1 - g;
    if (
      finalOffset * finalOffset < SLEEP_OFFSET_SQ_LIMIT &&
      v1 * v1 < SLEEP_VELOCITY_SQ_LIMIT
    ) {
      this.position = g;
      this.velocity = 0;
      return g;
    }

    this.position = p1;
    this.velocity = v1;
    return p1;
  }
}
