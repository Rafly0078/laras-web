/*
 * =========================================================================
 *  KODE PIHAK KETIGA - DISALIN, BUKAN DITULIS DI SINI.
 *
 *  Asal    : src/utils/Lyrics/isRtl.ts
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

/**
 * Determines if text is primarily right-to-left.
 * @param text The string to check
 * @returns true if the text is RTL, false if LTR
 */
function isRtl(text: string): boolean {
  // Return false for empty strings
  if (!text || text.length === 0) return false;

  // RTL Unicode ranges for Arabic, Hebrew, Persian, etc.
  const rtlRegex =
    /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFF]/;

  // Find the first strongly directional character
  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // Skip digits, spaces and common punctuation
    if (/[\d\s,.;:?!()[\]{}"'\\/<>@#$%^&*_=+-]/.test(char)) {
      continue;
    }

    // Return true if the character is from RTL scripts
    return rtlRegex.test(char);
  }

  // Default to LTR if no strong directional character is found
  return false;
}

export default isRtl;
