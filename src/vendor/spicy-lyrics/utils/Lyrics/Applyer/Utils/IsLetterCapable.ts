/*
 * =========================================================================
 *  KODE PIHAK KETIGA - DISALIN, BUKAN DITULIS DI SINI.
 *
 *  Asal    : src/utils/Lyrics/Applyer/Utils/IsLetterCapable.ts
 *  Repo    : https://github.com/spikerko/spicy-lyrics
 *  Commit  : 4576d022b39e98291d71c75b0d4d355bcc332ced (2026-08-29)
 *  Hak cipta (c) Spikerko dan kontributor spicy-lyrics.
 *  Lisensi : GNU Affero General Public License v3.0 (AGPL-3.0).
 *
 *  DIMODIFIKASI oleh proyek LARAS pada 2026-09-02: hanya baris impor.
 *  Nol perubahan pada angka, kurva, urutan operasi, atau badan fungsi.
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

// LARAS: dua penyesuaian di blok impor, tidak ada yang lain. (1) Sufiks ".ts"
// dibuang: tsconfig repo ini tanpa allowImportingTsExtensions, jadi tsc menolak
// specifier berakhiran .ts. (2) Modul runtime Spicetify (stores/PageView/
// virtualizer/kredit/dll) diarahkan ke ../shim; lihat shim/<nama>.ts untuk
// apa yang hilang karenanya.
import { $simpleLyricsMode } from "../../../../shim/stores";

const Simple = (letterLength: number, totalDuration: number) => {
  const minDuration = 1000;

  return totalDuration >= minDuration;
};

const SimpleLyricsModeCapable = (letterLength: number, totalDuration: number) => {
  if (letterLength > 12) {
    return false;
  }

  const minDuration = 1050;
  //const maxDuration = 8550;

  return totalDuration >= minDuration; // && totalDuration <= maxDuration;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _Complex = (letterLength: number, totalDuration: number) => {
  // Enforce a maximum letter length of 12
  if (letterLength > 12) {
    return false;
  }

  // Calculate the minimum duration based on the letter length
  const minDuration = 1000 + ((letterLength - 1) / 1) * 25; // Increases duration as letter length increases

  // Return whether the letter length and duration meet the criteria
  return totalDuration >= minDuration;
};

export function IsLetterCapable(letterLength: number, totalDuration: number) {
  return $simpleLyricsMode.get()
    ? SimpleLyricsModeCapable(letterLength, totalDuration)
    : Simple(letterLength, totalDuration);
}
