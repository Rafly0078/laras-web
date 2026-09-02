/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  SHIM LARAS — pengganti bagian `ArabicPersianRegex` dari
 *  `src/utils/Addons.ts` milik spicy-lyrics (60 baris).
 *  Nilai regex-nya disalin dari file itu pada 2026-09-02;
 *  hak cipta (c) Spikerko dan kontributor spicy-lyrics — AGPL-3.0.
 *  Repo asal: https://github.com/spikerko/spicy-lyrics
 *  Commit   : 4576d022b39e98291d71c75b0d4d355bcc332ced (2026-08-29)
 *
 *  Yang digantikan: `Addons.ts` upstream adalah keranjang pembantu campur —
 *  di dalamnya ada pemanggil API Spicetify dan util UI. Kode vendor di LARAS
 *  hanya memakai satu konstanta dari sana.
 *
 *  Yang HILANG karenanya: tidak ada yang relevan untuk mesin lirik.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Dipakai `Emphasize.ts` untuk menandai kata Arab/Persia supaya dirender dengan
 * font Vazirmatn. Rentangnya blok Arabic dasar (U+0600–U+06FF).
 */
export const ArabicPersianRegex = /[\u0600-\u06FF]/;
