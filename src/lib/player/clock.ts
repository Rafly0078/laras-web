/**
 * Jam lirik — menjembatani posisi KASAR dari YouTube ke posisi HALUS per frame.
 *
 * Masalahnya: YouTube IFrame Player API hanya memberi getCurrentTime() lewat
 * postMessage, dengan pembaruan sekitar 250ms dan tanpa jaminan kehalusan.
 * Sapuan lirik per kata di 60fps butuh posisi sampai milidetik. Kalau nilai
 * pemutar dipoll langsung, sapuannya berhenti-jalan tiap 250ms.
 *
 * Cara kerjanya: simpan satu jangkar (posisi resmi + waktu monotonik saat
 * jangkar itu diterima), lalu di setiap frame majukan posisi internal dengan
 * waktu nyata yang berlalu. Ketika jangkar baru masuk dan berbeda dari
 * perkiraan kita, selisihnya TIDAK di-snap — ia dicicil pelan supaya mata
 * tidak melihat sentakan.
 *
 * Kelas ini murni matematika: tanpa DOM, tanpa timer, tanpa performance.now()
 * di dalamnya. Pemanggil yang menyuntikkan waktu, sehingga bisa diuji penuh
 * dengan waktu sintetis.
 */

export interface ClockOptions {
  /**
   * Di atas selisih ini (detik) kita SNAP, bukan mencicil.
   *
   * Drift sebesar ini bukan galat pengukuran — itu seek, buffering, atau tab
   * yang di-background. Mencicil 5 detik pelan-pelan membuat lirik salah
   * selama beberapa detik; satu lompatan jauh lebih baik.
   */
  maxDriftSeconds?: number;
  /**
   * Fraksi drift yang dikoreksi per detik (0..1).
   *
   * 0.15 berarti sekitar 15% sisa drift hilang tiap detik — cukup cepat untuk
   * menyusul dalam ~2 detik, cukup lambat untuk tak terlihat.
   */
  correctionRate?: number;
  /** Kecepatan putar (1 = normal). */
  rate?: number;
}

const DEFAULTS = {
  maxDriftSeconds: 0.35,
  correctionRate: 0.15,
  rate: 1,
} as const;

export class LyricsClock {
  private readonly maxDrift: number;
  private readonly correctionRate: number;

  private rate: number;
  private playing = false;

  /** Posisi yang kita yakini sekarang (detik). */
  private position = 0;
  /** Waktu monotonik (ms) saat position terakhir diperbarui. */
  private lastReadMs: number | null = null;
  /** Sudah pernah menerima jangkar? Sebelum itu read() = 0. */
  private anchored = false;

  /** Selisih yang masih harus dicicil (detik, bertanda). */
  private pendingDrift = 0;
  private lastDriftValue = 0;

  constructor(options: ClockOptions = {}) {
    this.maxDrift = options.maxDriftSeconds ?? DEFAULTS.maxDriftSeconds;
    this.correctionRate = options.correctionRate ?? DEFAULTS.correctionRate;
    this.rate = options.rate ?? DEFAULTS.rate;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Drift terakhir yang terukur — untuk panel diagnostik. */
  get lastDrift(): number {
    return this.lastDriftValue;
  }

  /**
   * Terima posisi resmi dari pemutar.
   *
   * Ini TIDAK langsung mengubah posisi yang dibaca (kecuali drift besar).
   * Selisihnya disimpan sebagai utang yang dicicil di read() berikutnya.
   */
  anchor(positionSeconds: number, nowMs: number): void {
    if (!Number.isFinite(positionSeconds) || positionSeconds < 0) return;

    if (!this.anchored) {
      // Jangkar pertama: tidak ada yang bisa didrift-kan, mulai dari sini.
      this.anchored = true;
      this.position = positionSeconds;
      this.lastReadMs = nowMs;
      this.pendingDrift = 0;
      this.lastDriftValue = 0;
      return;
    }

    // Majukan dulu ke nowMs supaya drift dihitung terhadap perkiraan yang
    // sezaman dengan jangkar, bukan terhadap posisi frame lama.
    this.advanceTo(nowMs);

    const drift = positionSeconds - this.position;
    this.lastDriftValue = drift;

    if (Math.abs(drift) > this.maxDrift) {
      // Seek / buffering / tab background: snap.
      this.position = positionSeconds;
      this.pendingDrift = 0;
      return;
    }

    // Drift kecil: jadikan utang, jangan geser posisi sekarang. Inilah yang
    // membuat read() sebelum dan sesudah anchor() pada nowMs yang sama
    // menghasilkan nilai (nyaris) identik.
    this.pendingDrift = drift;
  }

  /** Posisi terinterpolasi pada nowMs. Aman dipanggil tiap frame. */
  read(nowMs: number): number {
    if (!this.anchored) return 0;
    this.advanceTo(nowMs);
    return this.position;
  }

  setPlaying(playing: boolean, nowMs: number): void {
    if (playing === this.playing) return;
    // Selesaikan periode sebelumnya dengan aturan lama sebelum berganti.
    if (this.anchored) this.advanceTo(nowMs);
    this.playing = playing;
    this.lastReadMs = nowMs;
  }

  setRate(rate: number, nowMs: number): void {
    if (!Number.isFinite(rate) || rate <= 0) return;
    if (this.anchored) this.advanceTo(nowMs);
    this.rate = rate;
    this.lastReadMs = nowMs;
  }

  /** Buang seluruh state — dipakai saat seek eksplisit atau ganti lagu. */
  hardReset(positionSeconds: number, nowMs: number): void {
    this.anchored = true;
    this.position = Math.max(0, positionSeconds);
    this.lastReadMs = nowMs;
    this.pendingDrift = 0;
    this.lastDriftValue = 0;
  }

  /**
   * Majukan posisi internal sampai nowMs.
   *
   * Dua hal terjadi di sini: waktu nyata berjalan (kalau playing), dan
   * sebagian utang drift dilunasi. Keduanya digabung supaya monotonisitas
   * bisa dijaga di satu tempat.
   */
  private advanceTo(nowMs: number): void {
    if (this.lastReadMs === null) {
      this.lastReadMs = nowMs;
      return;
    }

    const dt = (nowMs - this.lastReadMs) / 1000;
    this.lastReadMs = nowMs;

    // dt <= 0 bisa terjadi kalau pemanggil mengirim timestamp sama dua kali
    // atau (jarang) jam melompat mundur. Jangan hitung apa pun.
    if (!(dt > 0)) return;

    const before = this.position;

    if (this.playing) {
      this.position += dt * this.rate;
    }

    if (this.pendingDrift !== 0) {
      // Cicilan eksponensial: porsi drift yang lunas per detik konstan,
      // jadi kecepatan koreksinya tidak bergantung frame-rate.
      const decay = Math.exp(-this.correctionRate * dt * 60);
      const remaining = this.pendingDrift * decay;
      const applied = this.pendingDrift - remaining;
      this.position += applied;
      this.pendingDrift = remaining;

      // Bila sisanya sudah tak berarti, tutup buku — kalau tidak, ia akan
      // terus mengecil selamanya dan setiap frame melakukan kerja sia-sia.
      if (Math.abs(this.pendingDrift) < 1e-4) this.pendingDrift = 0;
    }

    // MONOTONIK saat playing: animator memutuskan kata Sung/Active/NotSung
    // dari posisi ini. Kalau posisi mundur, kata yang sudah tersapu kembali
    // gelap — terlihat sebagai kedipan. Tahan posisi sampai waktu menyusul.
    if (this.playing && this.position < before) {
      this.position = before;
    }

    if (this.position < 0) this.position = 0;
  }
}
