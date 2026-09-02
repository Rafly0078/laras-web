/*
 * =========================================================================
 *  KODE PIHAK KETIGA - DISALIN, BUKAN DITULIS DI SINI.
 *
 *  Asal    : src/utils/Lyrics/Animator/Lyrics/LyricsSetter.ts
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
import { $currentLyricsType } from "../../../../shim/stores";
import { LyricsObject, type LyricsType } from "../../../../shim/lyrics";
import { timeOffset } from "../Shared";

// Extend the LyricsType to include "None"
type ExtendedLyricsType = LyricsType | "None";

// Define a type for the word/syllable status
type ElementStatus = "NotSung" | "Active" | "Sung";

// Define interfaces for the objects we're working with
interface _SyllableLead {
  HTMLElement: HTMLElement;
  StartTime: number;
  EndTime: number;
  Status?: ElementStatus;
  [key: string]: any;
}

function getElementStatus(
  currentTime: number,
  startTime: number,
  endTime: number
): ElementStatus {
  if (currentTime < startTime) return "NotSung";
  if (currentTime >= endTime) return "Sung";
  return "Active";
}

export function TimeSetter(PreCurrentPosition: number): void {
  const CurrentPosition = PreCurrentPosition + timeOffset;
  const CurrentLyricsType = $currentLyricsType.get() as ExtendedLyricsType;

  if (!CurrentLyricsType || CurrentLyricsType === "None") return;

  // Type assertion to ensure we can index with CurrentLyricsType
  const lines = LyricsObject.Types[CurrentLyricsType as LyricsType].Lines;

  if (CurrentLyricsType === "Syllable") {
    for (let i = 0; i < lines.length; i++) {
      // Type assertion for the line
      const line = lines[i] as any;

      const lineTimes = {
        start: line.StartTime,
        end: line.EndTime,
        total: line.EndTime - line.StartTime,
      };

      if (getElementStatus(CurrentPosition, lineTimes.start, lineTimes.end) === "Active") {
        line.Status = "Active";

        // Check if Syllables exists
        if (!line.Syllables?.Lead) continue;

        const words = line.Syllables.Lead;
        for (let j = 0; j < words.length; j++) {
          const word = words[j];
          word.Status = getElementStatus(CurrentPosition, word.StartTime, word.EndTime);

          if (word?.LetterGroup) {
            for (let k = 0; k < word.Letters.length; k++) {
              const letter = word.Letters[k];
              letter.Status = getElementStatus(CurrentPosition, letter.StartTime, letter.EndTime);
            }
          }
        }
      } else if (lineTimes.start > CurrentPosition) {
        line.Status = "NotSung";

        // Check if Syllables exists
        if (!line.Syllables?.Lead) continue;

        const words = line.Syllables.Lead;
        for (let j = 0; j < words.length; j++) {
          const word = words[j];
          word.Status = "NotSung";

          if (word?.LetterGroup) {
            for (let k = 0; k < word.Letters.length; k++) {
              const letter = word.Letters[k];
              letter.Status = "NotSung";
            }
          }
        }
      } else if (lineTimes.end <= CurrentPosition) {
        line.Status = "Sung";

        // Check if Syllables exists
        if (!line.Syllables?.Lead) continue;

        const words = line.Syllables.Lead;
        for (let j = 0; j < words.length; j++) {
          const word = words[j];
          word.Status = "Sung";

          if (word?.LetterGroup) {
            for (let k = 0; k < word.Letters.length; k++) {
              const letter = word.Letters[k];
              letter.Status = "Sung";
            }
          }
        }
      }
    }
  } else if (CurrentLyricsType === "Line") {
    for (let i = 0; i < lines.length; i++) {
      // Type assertion for the line
      const line = lines[i] as any;

      const lineTimes = {
        start: line.StartTime,
        end: line.EndTime,
        total: line.EndTime - line.StartTime,
      };

      if (getElementStatus(CurrentPosition, lineTimes.start, lineTimes.end) === "Active") {
        line.Status = "Active";
        if (line.DotLine) {
          const leads = line.Syllables.Lead;
          for (let i = 0; i < leads.length; i++) {
            const dot = leads[i];
            dot.Status = getElementStatus(CurrentPosition, dot.StartTime, dot.EndTime);
          }
        }
      } else if (lineTimes.start > CurrentPosition) {
        line.Status = "NotSung";
        if (line.DotLine) {
          const leads = line.Syllables.Lead;
          for (let i = 0; i < leads.length; i++) {
            const dot = leads[i];
            dot.Status = "NotSung";
          }
        }
      } else if (lineTimes.end <= CurrentPosition) {
        line.Status = "Sung";
        if (line.DotLine) {
          const leads = line.Syllables.Lead;
          for (let i = 0; i < leads.length; i++) {
            const dot = leads[i];
            dot.Status = "Sung";
          }
        }
      }
    }
  }
}
