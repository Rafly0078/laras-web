/*
 * =========================================================================
 *  KODE PIHAK KETIGA - DISALIN, BUKAN DITULIS DI SINI.
 *
 *  Asal    : src/utils/Lyrics/Animator/Shared.ts
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

const IdleLyricsScale = 0.95;
const IdleEmphasisLyricsScale = 0.95;
const timeOffset = 0;
const DurationTimeOffset = 0;
const BlurMultiplier = 1.25;

// Adjust blur levels in low-quality mode for better performance
const WordBlurs = {
  Emphasis: {
    min: 4,
    max: 14,
    LowQualityMode: {
      min: 1, // Lowered from 2 for better performance
      max: 3, // Lowered from 6
    },
  },
  min: 3,
  max: 9,
  LowQualityMode: {
    min: 2, // Lowered from 4
    max: 6, // Lowered from 8
  },
};

export {
  IdleLyricsScale,
  IdleEmphasisLyricsScale,
  timeOffset,
  DurationTimeOffset,
  BlurMultiplier,
  WordBlurs,
};
