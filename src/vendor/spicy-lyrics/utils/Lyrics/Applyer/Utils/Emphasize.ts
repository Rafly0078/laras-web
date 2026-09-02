/*
 * =========================================================================
 *  KODE PIHAK KETIGA - DISALIN, BUKAN DITULIS DI SINI.
 *
 *  Asal    : src/utils/Lyrics/Applyer/Utils/Emphasize.ts
 *  Repo    : https://github.com/spikerko/spicy-lyrics
 *  Commit  : 4576d022b39e98291d71c75b0d4d355bcc332ced (2026-08-29)
 *  Hak cipta (c) Spikerko dan kontributor spicy-lyrics.
 *  Lisensi : GNU Affero General Public License v3.0 (AGPL-3.0).
 *
 *  DIMODIFIKASI oleh proyek LARAS pada 2026-09-02: baris impor, plus satu
 *  `!` non-null di baris 130 (lihat komentar `// LARAS:` di sana).
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
import { ArabicPersianRegex } from "../../../../shim/Addons";
import { IdleEmphasisLyricsScale } from "../../Animator/Shared";
import { ConvertTime } from "../../ConvertTime";
import { CurrentLineLyricsObject, LyricsObject } from "../../../../shim/lyrics";

const Substractions = {
  StartTime: $simpleLyricsMode.get() ? -21 : 0,
  EndTime: $simpleLyricsMode.get() ? -40 : 250,
};

interface LetterData {
  HTMLElement: HTMLElement;
  StartTime: number;
  EndTime: number;
  TotalTime: number;
  Emphasis: boolean;
  BGLetter?: boolean;
}

export default function Emphasize(
  letters: Array<string>,
  applyTo: HTMLElement,
  lead: any,
  isBgWord: boolean = false
) {
  const StartTime = ConvertTime(lead.StartTime) - Substractions.StartTime;
  const EndTime = ConvertTime(lead.EndTime) - Substractions.EndTime;
  const totalDuration = EndTime - StartTime;
  const letterDuration = totalDuration / letters.length; // Duration per letter
  const word = applyTo;
  const Letters: LetterData[] = [];

  letters.forEach((letter, index) => {
    const letterElem = document.createElement("span");
    letterElem.textContent = letter;
    letterElem.classList.add("letter");
    letterElem.classList.add("Emphasis");
    // Whitespace inside an inline-block collapses to a 0px box, which glues
    // multi-word syllables ("Watch this") together. Tag it so CSS can size it.
    if (letter.trim().length === 0) {
      letterElem.classList.add("SpaceLetter");
    }
    const isLastLetter = index === letters.length - 1;
    // Calculate start and end time for each letter
    const letterStartTime = StartTime + index * letterDuration;
    const letterEndTime = letterStartTime + letterDuration;

    //const contentDuration = letterDuration > 150 ? letterDuration : 150;
    //letterElem.style.setProperty("--content-duration", `${contentDuration}ms`);

    if (isLastLetter) {
      letterElem.classList.add("LastLetterInWord");
    }

    if (ArabicPersianRegex.test(lead.Text)) {
      word.setAttribute("font", "Vazirmatn");
    }

    const mcont = isBgWord
      ? {
          BGLetter: true,
        }
      : {};

    Letters.push({
      HTMLElement: letterElem,
      StartTime: letterStartTime,
      EndTime: letterEndTime,
      TotalTime: letterDuration,
      Emphasis: true,
      ...mcont,
    });

    if (!$simpleLyricsMode.get()) {
      letterElem.style.setProperty("--gradient-position", `-20%`);
    }
    letterElem.style.setProperty("--text-shadow-opacity", `0%`);
    letterElem.style.setProperty("--text-shadow-blur-radius", `4px`);
    letterElem.style.scale = IdleEmphasisLyricsScale.toString();
    letterElem.style.transform = `translateY(calc(var(--DefaultLyricsSize) * 0.02))`;

    word.appendChild(letterElem);
  });

  word.classList.add("letterGroup");

  const mcont = isBgWord
    ? {
        BGWord: true,
      }
    : {};

  // Make sure CurrentLineLyricsObject is valid and Syllables.Lead exists
  if (
    CurrentLineLyricsObject >= 0 &&
    LyricsObject.Types.Syllable.Lines?.[CurrentLineLyricsObject].Syllables
  ) {
    // LARAS: `!` ditambahkan (satu karakter, hilang saat kompilasi). Upstream
    // jalan dengan strictNullChecks: false, jadi `if` di atas cukup bagi mereka;
    // di sini indeksnya `let` yang diimpor sehingga TS tidak mau mempersempit.
    LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables!.Lead.push({
      HTMLElement: word,
      StartTime: StartTime,
      EndTime: EndTime,
      TotalTime: totalDuration,
      LetterGroup: true,
      Letters,
      ...mcont,
    });
  } else {
    console.warn(
      "Cannot add letter group: CurrentLineLyricsObject is invalid or Syllables.Lead doesn't exist"
    );
  }

  // No need to reset Letters as it's a local constant
}
