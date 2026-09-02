/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  SHIM LARAS — pengganti `src/utils/Lyrics/lyrics.ts` milik spicy-lyrics
 *  (345 baris).
 *  Repo asal: https://github.com/spikerko/spicy-lyrics
 *  Commit   : 4576d022b39e98291d71c75b0d4d355bcc332ced (2026-08-29)
 *  Hak cipta (c) Spikerko dan kontributor spicy-lyrics — AGPL-3.0.
 *
 *  BUKAN shim kosong: seluruh MODEL DATA mesin lirik (LyricsObject, tipe-tipe
 *  baris/suku kata, pembukuan indeks baris) dan SEMUA ANGKA di file upstream
 *  disalin apa adanya ke sini pada 2026-09-02, karena kode vendor menulis dan
 *  membaca struktur itu setiap frame. Yang dibuang hanya bagian yang menempel
 *  ke Spicetify.
 *
 *  Yang HILANG karenanya:
 *  - Loop `requestAnimationFrame` tingkat modul yang di upstream memanggil
 *    `Lyrics.TimeSetter(SpotifyPlayer.GetPosition())` + `Lyrics.Animate(...)`
 *    tanpa henti. Di LARAS jam-nya milik pemutar YouTube; adapter React yang
 *    memanggil TimeSetter/Animate. (Lihat HANDOFF.md §2(c): satu rAF loop.)
 *  - `addLinesEvListener`/`removeLinesEvListener` — klik baris/kata untuk
 *    seek. Butuh `SpotifyPlayer.Seek` + `Global.Event` + `Maid`; adapter LARAS
 *    memasang listener-nya sendiri.
 *  - `$romanization` (store nanostores yang dipersistensi). `isRomanized` di
 *    sini hanya bendera dalam memori.
 *  - `ScrollingIntervalTime` dan `SetWordArrayInAllLines`, keduanya tidak
 *    dipakai file yang di-vendor.
 *
 *  Catatan `any`: tipe `AnimatorStore` memang `any` di upstream, dan itu
 *  disengaja — isinya `Spring` sungguhan di mode penuh tapi objek no-op
 *  (`{ Step, SetGoal }`) di simpleLyricsMode, dan LyricsAnimator sendiri
 *  menulis `(line.AnimatorStore as any)`. Menyempitkannya di sini akan
 *  membuat kode vendor gagal dikompilasi, jadi dibiarkan.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { $minimalLyricsMode } from "./stores";

/** Jeda antar-baris (detik) yang cukup panjang untuk dirender sebagai titik. */
export const getLyricsBetweenShow = () => ($minimalLyricsMode.get() ? 5 : 3);

export const SimpleLyricsMode_LetterEffectsStrengthConfig = {
  LongerThan: 1500,
  Longer: {
    Glow: 0.4,
    YOffset: 0.45,
    Scale: 1.103,
  },
  Shorter: {
    Glow: 0.285,
    YOffset: 0.1,
    Scale: 1.09,
  },
};

/* eslint-disable @typescript-eslint/no-explicit-any -- lihat catatan `any` di header. */

export interface SyllableAnimatorStore {
  Scale: any;
  YOffset: any;
  Glow: any;
  Opacity?: any;
  [key: string]: any;
}

export interface LetterAnimatorStore {
  Scale: any;
  YOffset: any;
  Glow: any;
  [key: string]: any;
}

export interface LineAnimatorStore {
  Glow: any;
  [key: string]: any;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export interface SyllableLead {
  HTMLElement: HTMLElement;
  StartTime: number;
  EndTime: number;
  TotalTime: number;
  LetterGroup?: boolean;
  Letters?: Array<{
    HTMLElement: HTMLElement;
    StartTime: number;
    EndTime: number;
    AnimatorStore?: LetterAnimatorStore;
    SLMAnimated?: boolean;
    PreSLMAnimated?: boolean;
  }>;
  BGWord?: boolean;
  Dot?: boolean;
  AnimatorStore?: SyllableAnimatorStore;
  SLMAnimated?: boolean;
  PreSLMAnimated?: boolean;
}

export interface LyricsSyllable {
  HTMLElement: HTMLElement;
  StartTime: number;
  EndTime: number;
  TotalTime?: number;
  Status?: string;
  Syllables?: {
    Lead: SyllableLead[];
  };
  DotLine?: boolean;
  BGLine?: boolean;
  AnimatorStore?: LineAnimatorStore;
  SLMAnimated?: boolean;
  PreSLMAnimated?: boolean;
}

export interface LyricsLine {
  HTMLElement: HTMLElement;
  StartTime: number;
  EndTime: number;
  TotalTime?: number;
  Status?: string;
  DotLine?: boolean;
  Syllables?: {
    Lead: SyllableLead[];
  };
  AnimatorStore?: LineAnimatorStore;
}

export interface LyricsStatic {
  HTMLElement: HTMLElement;
}

export type LyricsType = "Syllable" | "Line" | "Static";

/**
 * SATU papan tulis global untuk seluruh mesin: Applyer menulis baris + suku
 * kata ke sini, TimeSetter menandai statusnya, Animate membacanya tiap frame.
 * Ini state tingkat modul — artinya hanya boleh ada SATU pane lirik aktif per
 * halaman, persis seperti di aplikasi upstream.
 */
export const LyricsObject = {
  Types: {
    Syllable: {
      Lines: [] as LyricsSyllable[],
    },
    Line: {
      Lines: [] as LyricsLine[],
    },
    Static: {
      Lines: [] as LyricsStatic[],
    },
  },
};

export let CurrentLineLyricsObject = LyricsObject.Types.Syllable.Lines.length - 1;
export let LINE_SYNCED_CurrentLineLyricsObject =
  LyricsObject.Types.Line.Lines.length - 1;

export function SetWordArrayInCurentLine() {
  CurrentLineLyricsObject = LyricsObject.Types.Syllable.Lines.length - 1;

  if (CurrentLineLyricsObject >= 0) {
    LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables = {
      Lead: [],
    };
  }
}

export function SetWordArrayInCurentLine_LINE_SYNCED() {
  LINE_SYNCED_CurrentLineLyricsObject = LyricsObject.Types.Line.Lines.length - 1;

  if (LINE_SYNCED_CurrentLineLyricsObject >= 0) {
    LyricsObject.Types.Line.Lines[LINE_SYNCED_CurrentLineLyricsObject].Syllables = {
      Lead: [],
    };
  }
}

export function ClearLyricsContentArrays() {
  LyricsObject.Types.Syllable.Lines = [];
  LyricsObject.Types.Line.Lines = [];
  LyricsObject.Types.Static.Lines = [];
}

export let isRomanized = false;

export const setRomanizedStatus = (val: boolean) => {
  isRomanized = val;
};

/** Berapa lama sebelum baris titik muncul/hilang (ms). */
export const preHiddenDotLineMs = 500;
export const getInterludeTimePadding = () => (preHiddenDotLineMs + 50) * -1;
