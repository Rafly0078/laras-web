/*
 * =========================================================================
 *  KODE PIHAK KETIGA - DISALIN, BUKAN DITULIS DI SINI.
 *
 *  Asal    : src/utils/Lyrics/Applyer/Utils/StripZeroWidth.ts
 *  Repo    : https://github.com/spikerko/spicy-lyrics
 *  Commit  : 4576d022b39e98291d71c75b0d4d355bcc332ced (2026-08-29)
 *  Hak cipta (c) Spikerko dan kontributor spicy-lyrics.
 *  Lisensi : GNU Affero General Public License v3.0 (AGPL-3.0).
 *
 *  TIDAK DIMODIFIKASI. Verbatim dari commit di atas (per 2026-09-02).
 *
 *  Program ini perangkat lunak bebas: kamu boleh menyebarkan dan/atau
 *  memodifikasinya di bawah syarat AGPL-3.0 sebagaimana diterbitkan Free
 *  Software Foundation, versi 3. Program ini disebarkan dengan harapan
 *  berguna, TANPA JAMINAN APA PUN. Salinan lisensinya ada di
 *  src/vendor/spicy-lyrics/LICENSE-AGPL-3.0.
 *
 *  Setiap penyesuaian LARAS di bawah ini ditandai komentar `// LARAS: ...`.
 *  Jangan "rapikan" file ini - makin dekat ke upstream, makin murah
 *  menarik perbaikan mereka berikutnya, dan makin kecil peluang animasi
 *  atau penempatan hurufnya bergeser dari aplikasi asal.
 * =========================================================================
 */

// Zero-width characters that carry no visual meaning but still occupy a
// character slot — they break letter-by-letter emphasis (empty <span>s with
// their own slice of the word's duration) and add invisible cursor stops.
//
// U+200B ZERO WIDTH SPACE, U+200E/U+200F LTR/RTL MARK, U+2060 WORD JOINER,
// U+FEFF ZERO WIDTH NO-BREAK SPACE (BOM).
//
// ZWNJ (U+200C) and ZWJ (U+200D) are deliberately left in: they are
// meaningful in Arabic/Persian/Indic scripts and in emoji sequences.
//
// This is render-only. The parsed/cached lyrics keep their original text so
// nothing downstream (hashing, transliteration, upload) sees a mutated string.
const ZeroWidthRegex = /[\u200B\u200E\u200F\u2060\uFEFF]/g;

export function StripZeroWidth(text: string): string {
  return text.replace(ZeroWidthRegex, "");
}

export default StripZeroWidth;
