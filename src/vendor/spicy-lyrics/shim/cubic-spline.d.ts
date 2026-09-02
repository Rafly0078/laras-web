/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  Deklarasi tipe untuk paket `cubic-spline` (MIT, morganherlocker) — paket itu
 *  hanya mengirim `index.js` tanpa `.d.ts`, dan tidak ada `@types/cubic-spline`
 *  di npm (dicek 2026-09-02: 404).
 *
 *  LyricsAnimator.ts upstream menyiasatinya dengan `// @ts-ignore pkg has no
 *  @types on npm` di baris pertama. Baris itu DIBIARKAN apa adanya; file ini
 *  hanya menambah tipe yang benar di atasnya, supaya `Spline` tidak jadi `any`
 *  implisit (aturan repo: nol `any`). `@ts-ignore` yang tidak terpakai bukan
 *  error, jadi tidak ada yang perlu diubah di file vendor.
 *
 *  Ditulis untuk LARAS pada 2026-09-02. Permukaannya sesuai
 *  `node_modules/cubic-spline/index.js`: `new Spline(xs, ys)` dan `.at(x)`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

declare module "cubic-spline" {
  export default class Spline {
    constructor(xs: number[], ys: number[]);
    /** Nilai spline terinterpolasi di titik `x`. */
    at(x: number): number;
  }
}
