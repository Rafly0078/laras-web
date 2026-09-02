/*
 * =========================================================================
 *  KODE PIHAK KETIGA - DISALIN, BUKAN DITULIS DI SINI.
 *
 *  Asal    : src/utils/Lyrics/Applyer/Synced/Line.ts
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
import { $lyricsContainerExists, $simpleLyricsMode } from "../../../../shim/stores";
import { PageContainer } from "../../../../shim/PageView";
import { applyStyles, removeAllStyles } from "../../../../shim/Styles";
import {
  ClearScrollSimplebar,
  MountScrollSimplebar,
  RecalculateScrollSimplebar,
  ScrollSimplebar,
} from "../../../../shim/ScrollSimplebar";
import { ConvertTime } from "../../ConvertTime";
import { ClearLyricsPageContainer } from "../../../../shim/fetchLyrics";
import isRtl from "../../isRtl";
import {
  ClearLyricsContentArrays,
  LINE_SYNCED_CurrentLineLyricsObject,
  LyricsObject,
  SetWordArrayInCurentLine_LINE_SYNCED,
  getInterludeTimePadding,
  getLyricsBetweenShow,
  setRomanizedStatus,
} from "../../../../shim/lyrics";
import { CreateLyricsContainer, DestroyAllLyricsContainers } from "../../../../shim/CreateLyricsContainer";
import { StripZeroWidth } from "../Utils/StripZeroWidth";
import { initLyricsVirtualizer } from "../../../../shim/LyricsVirtualizer";
import { ApplyIsByCommunity } from "../../../../shim/Credits";
import { ApplyLyricsCredits } from "../../../../shim/Credits";
import { EmitApply, EmitNotApplyed } from "../../../../shim/OnApply";
import { ApplyLyricsProvider } from "../../../../shim/Credits";

// Define the data structure for lyrics
interface LyricsLineData {
  Text: string;
  StartTime: number;
  EndTime: number;
  TransliteratedText?: string;
  OppositeAligned?: boolean;
}

interface LyricsData {
  Type: string;
  Content: LyricsLineData[];
  StartTime: number;
  SongWriters?: string[];
  source?: "spt" | "spl" | "aml";
  classes?: string;
  styles?: Record<string, string>;
}

export function ApplyLineLyrics(data: LyricsData, UseRomanized: boolean = false): void {
  if (!$lyricsContainerExists.get()) return;
  EmitNotApplyed();

  DestroyAllLyricsContainers();

  const LyricsContainerParent = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent"
  );
  const LyricsContainerInstance = CreateLyricsContainer();
  const LyricsContainer = LyricsContainerInstance.Container;

  // Check if LyricsContainer exists
  if (!LyricsContainer) {
    console.error("LyricsContainer not found");
    return;
  }

  const hasOppositeAligned = data.Content.some(item => item.OppositeAligned === true);
  LyricsContainer.classList.toggle("HasDuetLines", hasOppositeAligned);
  const hasRtlLines = data.Content.some(line => isRtl(line.Text));
  LyricsContainer.classList.toggle("HasRtlLines", hasRtlLines);

  LyricsContainer.setAttribute("data-lyrics-type", "Line");

  ClearLyricsContentArrays();

  ClearScrollSimplebar();

  ClearLyricsPageContainer();

  const virtualContainer = document.createElement("div");
  virtualContainer.classList.add("VirtualLyricsContainer");
  LyricsContainer.appendChild(virtualContainer);

  const lineElements: HTMLElement[] = [];

  if (data.StartTime >= getLyricsBetweenShow()) {
    const musicalLine = document.createElement("div");
    musicalLine.classList.add("line");
    musicalLine.classList.add("musical-line");

    LyricsObject.Types.Line.Lines.push({
      HTMLElement: musicalLine,
      StartTime: 0,
      EndTime: ConvertTime(data.StartTime),
      TotalTime: ConvertTime(data.StartTime),
      DotLine: true,
    });

    SetWordArrayInCurentLine_LINE_SYNCED();

    if (data.Content[0].OppositeAligned) {
      musicalLine.classList.add("OppositeAligned");
    }

    const dotGroup = document.createElement("div");
    dotGroup.classList.add("dotGroup");

    const musicalDots1 = document.createElement("span");
    const musicalDots2 = document.createElement("span");
    const musicalDots3 = document.createElement("span");

    const totalTime = ConvertTime(data.StartTime);
    const baseDotTime = totalTime / 3;
    const dotPadding = getInterludeTimePadding() / 3;
    const dot1EndTime = Math.max(0, baseDotTime + dotPadding);
    const dot2EndTime = Math.max(dot1EndTime, baseDotTime * 2 + dotPadding * 2);
    const dot3EndTime = Math.max(dot2EndTime, totalTime + getInterludeTimePadding());

    musicalDots1.classList.add("word");
    musicalDots1.classList.add("dot");
    musicalDots1.textContent = "•";

    // Check if Syllables.Lead exists
    if (LyricsObject.Types.Line.Lines[LINE_SYNCED_CurrentLineLyricsObject]?.Syllables?.Lead) {
      LyricsObject.Types.Line.Lines[LINE_SYNCED_CurrentLineLyricsObject].Syllables?.Lead.push({
        HTMLElement: musicalDots1,
        StartTime: 0,
        EndTime: dot1EndTime,
        TotalTime: dot1EndTime,
        Dot: true,
      });
    } else {
      console.warn("Syllables.Lead is undefined for LINE_SYNCED_CurrentLineLyricsObject");
    }

    musicalDots2.classList.add("word");
    musicalDots2.classList.add("dot");
    musicalDots2.textContent = "•";

    // Check if Syllables.Lead exists
    if (LyricsObject.Types.Line.Lines[LINE_SYNCED_CurrentLineLyricsObject]?.Syllables?.Lead) {
      LyricsObject.Types.Line.Lines[LINE_SYNCED_CurrentLineLyricsObject].Syllables?.Lead.push({
        HTMLElement: musicalDots2,
        StartTime: dot1EndTime,
        EndTime: dot2EndTime,
        TotalTime: dot2EndTime - dot1EndTime,
        Dot: true,
      });
    } else {
      console.warn("Syllables.Lead is undefined for LINE_SYNCED_CurrentLineLyricsObject");
    }

    musicalDots3.classList.add("word");
    musicalDots3.classList.add("dot");
    musicalDots3.textContent = "•";

    // Check if Syllables.Lead exists
    if (LyricsObject.Types.Line.Lines[LINE_SYNCED_CurrentLineLyricsObject]?.Syllables?.Lead) {
      LyricsObject.Types.Line.Lines[LINE_SYNCED_CurrentLineLyricsObject].Syllables?.Lead.push({
        HTMLElement: musicalDots3,
        StartTime: dot2EndTime,
        EndTime: dot3EndTime,
        TotalTime: dot3EndTime - dot2EndTime,
        Dot: true,
      });
    } else {
      console.warn("Syllables.Lead is undefined for LINE_SYNCED_CurrentLineLyricsObject");
    }

    dotGroup.appendChild(musicalDots1);
    dotGroup.appendChild(musicalDots2);
    dotGroup.appendChild(musicalDots3);

    musicalLine.appendChild(dotGroup);
    lineElements.push(musicalLine);
  }

  data.Content.forEach((line, index, arr) => {
    const lineElem = document.createElement("div");
    lineElem.textContent = StripZeroWidth(
      UseRomanized && line.TransliteratedText !== undefined ? line.TransliteratedText : line.Text
    );
    lineElem.classList.add("line");

    if (isRtl(line.Text) && !lineElem.classList.contains("rtl")) {
      lineElem.classList.add("rtl");
    }

    const nextLineStartTime = arr[index + 1]?.StartTime ?? 0;

    const lineEndTimeAndNextLineStartTimeDistance =
      nextLineStartTime !== 0 ? nextLineStartTime - line.EndTime : 0;

    const lineEndTime = $simpleLyricsMode.get()
      ? nextLineStartTime === 0
        ? line.EndTime
        : lineEndTimeAndNextLineStartTimeDistance < getLyricsBetweenShow() &&
            nextLineStartTime > line.EndTime
          ? nextLineStartTime
          : line.EndTime
      : line.EndTime;

    LyricsObject.Types.Line.Lines.push({
      HTMLElement: lineElem,
      StartTime: ConvertTime(line.StartTime),
      EndTime: ConvertTime(lineEndTime),
      TotalTime: ConvertTime(lineEndTime) - ConvertTime(line.StartTime),
    });

    if (line.OppositeAligned) {
      lineElem.classList.add("OppositeAligned");
    }

    lineElements.push(lineElem);
    if (arr[index + 1] && arr[index + 1].StartTime - line.EndTime >= getLyricsBetweenShow()) {
      const musicalLine = document.createElement("div");
      musicalLine.classList.add("line");
      musicalLine.classList.add("musical-line");

      LyricsObject.Types.Line.Lines.push({
        HTMLElement: musicalLine,
        StartTime: ConvertTime(line.EndTime),
        EndTime: ConvertTime(arr[index + 1].StartTime),
        TotalTime:
          ConvertTime(arr[index + 1].StartTime) - ConvertTime(line.EndTime),
        DotLine: true,
      });

      SetWordArrayInCurentLine_LINE_SYNCED();

      if (arr[index + 1].OppositeAligned) {
        musicalLine.classList.add("OppositeAligned");
      }

      const dotGroup = document.createElement("div");
      dotGroup.classList.add("dotGroup");

      const musicalDots1 = document.createElement("span");
      const musicalDots2 = document.createElement("span");
      const musicalDots3 = document.createElement("span");

      const gapStartTime = ConvertTime(line.EndTime);
      const totalTime = ConvertTime(arr[index + 1].StartTime) - gapStartTime;
      const baseDotTime = totalTime / 3;
      const dotPadding = getInterludeTimePadding() / 3;
      const dot1EndTime = Math.max(gapStartTime, gapStartTime + baseDotTime + dotPadding);
      const dot2EndTime = Math.max(dot1EndTime, gapStartTime + baseDotTime * 2 + dotPadding * 2);
      const dot3EndTime = Math.max(dot2EndTime, gapStartTime + totalTime + getInterludeTimePadding());

      musicalDots1.classList.add("word");
      musicalDots1.classList.add("dot");
      musicalDots1.textContent = "•";

      // Check if Syllables.Lead exists
      if (LyricsObject.Types.Line.Lines[LINE_SYNCED_CurrentLineLyricsObject]?.Syllables?.Lead) {
        LyricsObject.Types.Line.Lines[LINE_SYNCED_CurrentLineLyricsObject].Syllables?.Lead.push({
          HTMLElement: musicalDots1,
          StartTime: gapStartTime,
          EndTime: dot1EndTime,
          TotalTime: dot1EndTime - gapStartTime,
          Dot: true,
        });
      } else {
        console.warn("Syllables.Lead is undefined for LINE_SYNCED_CurrentLineLyricsObject");
      }

      musicalDots2.classList.add("word");
      musicalDots2.classList.add("dot");
      musicalDots2.textContent = "•";

      LyricsObject.Types.Line.Lines[LINE_SYNCED_CurrentLineLyricsObject].Syllables?.Lead.push({
        HTMLElement: musicalDots2,
        StartTime: dot1EndTime,
        EndTime: dot2EndTime,
        TotalTime: dot2EndTime - dot1EndTime,
        Dot: true,
      });

      musicalDots3.classList.add("word");
      musicalDots3.classList.add("dot");
      musicalDots3.textContent = "•";

      LyricsObject.Types.Line.Lines[LINE_SYNCED_CurrentLineLyricsObject].Syllables?.Lead.push({
        HTMLElement: musicalDots3,
        StartTime: dot2EndTime,
        EndTime: dot3EndTime,
        TotalTime: dot3EndTime - dot2EndTime,
        Dot: true,
      });

      dotGroup.appendChild(musicalDots1);
      dotGroup.appendChild(musicalDots2);
      dotGroup.appendChild(musicalDots3);

      musicalLine.appendChild(dotGroup);
      lineElements.push(musicalLine);
    }
  });

  ApplyLyricsCredits(data, LyricsContainer);
  ApplyLyricsProvider(data, LyricsContainer);
  ApplyIsByCommunity(data, LyricsContainer);

  if (LyricsContainerParent) {
    LyricsContainerInstance.Append(LyricsContainerParent);
  }

  if (ScrollSimplebar) RecalculateScrollSimplebar();
  else MountScrollSimplebar();

  const scrollEl = ScrollSimplebar?.getScrollElement() as HTMLElement | undefined;
  if (scrollEl) initLyricsVirtualizer(scrollEl, virtualContainer, lineElements);

  const LyricsStylingContainer = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent .simplebar-content"
  );

  // Check if LyricsStylingContainer exists
  if (LyricsStylingContainer) {
    removeAllStyles(LyricsStylingContainer);

    if (data.classes) {
      LyricsStylingContainer.className = data.classes;
    }

    if (data.styles) {
      applyStyles(LyricsStylingContainer, data.styles);
    }
  } else {
    console.warn("LyricsStylingContainer not found");
  }

  EmitApply(data.Type, data.Content);

  setRomanizedStatus(UseRomanized);
}
