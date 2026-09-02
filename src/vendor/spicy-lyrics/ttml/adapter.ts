/*
 * File LARAS (bukan salinan upstream) — 2026-09-02.
 *
 * Jembatan dari keluaran parser spicy-lyrics (`ParsedTTMLLyrics`, bentuk
 * PascalCase mereka) ke kontrak `Lyrics` di `src/lib/types.ts`. Sengaja
 * dipisah dari `parser.ts` supaya `parser.ts` bisa tetap verbatim dan mudah
 * disinkronkan ulang dengan upstream.
 *
 * Yang TIDAK bisa ditampung tipe kita dicatat di `SpicyDroppedInfo` alih-alih
 * dibuang diam-diam — itu bahan keputusan apakah `Lyrics` perlu diperluas.
 */

import { DOTS, EMPHASIS_MIN_DURATION } from '@/lib/lyrics/design-tokens';
import type { Lyrics, LyricLine, Syllable, VocalGroup } from '@/lib/types';
import {
  parseTTML,
  type ParsedSyllable,
  type ParsedSyllableVocal,
  type ParsedTTMLLyrics,
  type ParsedVocalGroup,
} from '@/vendor/spicy-lyrics/ttml/parser';

/**
 * Informasi yang dibawa parser spicy-lyrics tetapi tidak punya tempat di
 * `Lyrics`/`LyricLine`/`Syllable` kita. Dikembalikan apa adanya supaya
 * keputusan memperluas tipe bisa diambil dengan angka.
 */
export interface SpicyDroppedInfo {
  /** `iTunesMetadata > songwriters` — kredit penulis lagu. */
  songWriters: string[];
  /** Romanisasi per suku kata (`x-roman` / blok transliterations). */
  transliteratedSyllables: number;
  /** Romanisasi setingkat baris (lead atau background). */
  transliteratedGroups: number;
  /** Terjemahan setingkat baris (`x-translation`). */
  translatedGroups: number;
  hasTransliterations: boolean;
  hasTranslations: boolean;
  /**
   * Suku kata yang waktunya `undefined` di sisi mereka. Tipe kita mewajibkan
   * `number`, jadi suku kata ini DILEWATI — angkanya harus 0 pada TTML sehat.
   */
  untimedSyllablesDropped: number;
  /**
   * Parser mereka membaca `itunes:songPart` hanya untuk MELEWATI div
   * "Instrumental"; nilainya tidak pernah keluar. Jadi `songPart` kita selalu
   * null lewat jalur ini — kemunduran dibanding parser lama.
   */
  songPartAvailable: false;
}

export interface SpicyAdaptResult {
  lyrics: Lyrics;
  dropped: SpicyDroppedInfo;
}

const emptyDropped = (): SpicyDroppedInfo => ({
  songWriters: [],
  transliteratedSyllables: 0,
  transliteratedGroups: 0,
  translatedGroups: 0,
  hasTransliterations: false,
  hasTranslations: false,
  untimedSyllablesDropped: 0,
  songPartAvailable: false,
});

/**
 * Susun ulang teks baris dari suku kata.
 *
 * Semantik `isPartOfWord` di LARAS bersifat MAJU: "aku menempel ke potongan
 * SESUDAHKU". Itu yang dipakai CSS (`.word:not(.partOfWord)` mendapat
 * margin-right 0.32ch) dan itu pula semantik `IsPartOfWord` upstream, jadi
 * penyusunan teks di sini harus ikut arah maju.
 */
function joinForward(syllables: readonly Syllable[]): string {
  let out = '';
  syllables.forEach((s, i) => {
    out += s.text;
    const last = i === syllables.length - 1;
    if (!s.isPartOfWord && !last) out += ' ';
  });
  return out.trim();
}

function toSyllable(s: ParsedSyllable): Syllable | null {
  // Tipe kita mewajibkan angka; suku kata tanpa waktu tidak bisa disapu.
  if (typeof s.StartTime !== 'number' || typeof s.EndTime !== 'number') return null;
  return {
    text: s.Text,
    start: s.StartTime,
    end: s.EndTime,
    isPartOfWord: s.IsPartOfWord,
    emphasis: s.EndTime - s.StartTime >= EMPHASIS_MIN_DURATION,
  };
}

interface GroupResult {
  group: VocalGroup;
  untimedDropped: number;
}

function toVocalGroup(g: ParsedVocalGroup, fallbackStart: number, fallbackEnd: number): GroupResult {
  const syllables: Syllable[] = [];
  let untimedDropped = 0;
  for (const raw of g.Syllables) {
    const syllable = toSyllable(raw);
    if (syllable === null) untimedDropped += 1;
    else syllables.push(syllable);
  }

  const start =
    typeof g.StartTime === 'number'
      ? g.StartTime
      : syllables.length > 0
        ? Math.min(...syllables.map((s) => s.start))
        : fallbackStart;
  const end =
    typeof g.EndTime === 'number'
      ? g.EndTime
      : syllables.length > 0
        ? Math.max(...syllables.map((s) => s.end))
        : fallbackEnd;

  return { group: { syllables, start, end }, untimedDropped };
}

/** Baris interlude sintetis — sama bentuknya dengan parser lama. */
function makeInterlude(start: number, end: number): LyricLine {
  return {
    index: 0,
    start,
    end,
    lead: { syllables: [], start, end },
    background: [],
    oppositeAligned: false,
    interlude: true,
    songPart: null,
    text: '',
  };
}

/**
 * Sisipkan interlude (intro panjang + jeda antar baris) lalu nomori ulang.
 * Ambang DOTS.minGapSeconds dipertahankan supaya renderer tidak perlu tahu
 * parser mana yang menghasilkan barisnya.
 */
function withInterludes(timed: readonly LyricLine[]): LyricLine[] {
  if (timed.length === 0) return [];
  const out: LyricLine[] = [];
  if (timed[0].start >= DOTS.minGapSeconds) out.push(makeInterlude(0, timed[0].start));
  timed.forEach((line, i) => {
    out.push(line);
    const next = timed[i + 1];
    if (next && next.start - line.end >= DOTS.minGapSeconds) {
      out.push(makeInterlude(line.end, next.start));
    }
  });
  return out.map((line, i) => ({ ...line, index: i }));
}

function countGroupExtras(g: ParsedVocalGroup, dropped: SpicyDroppedInfo): void {
  dropped.transliteratedSyllables += g.Syllables.filter(
    (s) => s.TransliteratedText !== undefined,
  ).length;
  if (g.TransliteratedText !== undefined) dropped.transliteratedGroups += 1;
  if (g.TranslatedText !== undefined) dropped.translatedGroups += 1;
}

function adaptSyllableVocal(vocal: ParsedSyllableVocal, dropped: SpicyDroppedInfo): LyricLine {
  const leadResult = toVocalGroup(vocal.Lead, 0, 0);
  dropped.untimedSyllablesDropped += leadResult.untimedDropped;
  countGroupExtras(vocal.Lead, dropped);

  const background: VocalGroup[] = [];
  for (const bg of vocal.Background ?? []) {
    const bgResult = toVocalGroup(bg, leadResult.group.start, leadResult.group.end);
    dropped.untimedSyllablesDropped += bgResult.untimedDropped;
    countGroupExtras(bg, dropped);
    background.push(bgResult.group);
  }

  return {
    index: 0,
    start: leadResult.group.start,
    end: leadResult.group.end,
    lead: leadResult.group,
    background,
    oppositeAligned: vocal.OppositeAligned,
    interlude: false,
    // LARAS: parser mereka tidak pernah mengeluarkan itunes:songPart.
    songPart: null,
    text: joinForward(leadResult.group.syllables),
  };
}

const staticLyrics = (dropped: SpicyDroppedInfo): SpicyAdaptResult => ({
  lyrics: {
    kind: 'static',
    lines: [],
    source: 'apple',
    attribution: 'Apple Music',
    instrumental: true,
  },
  dropped,
});

/**
 * Parse TTML dengan mesin spicy-lyrics lalu normalkan ke `Lyrics`.
 *
 * Dipakai sebagai KANDIDAT pengganti `parseAppleTtml`; keduanya hidup
 * berdampingan sampai `ttml-vendor.test.ts` membuktikan mana yang lebih benar.
 */
export function adaptSpicyTtml(xml: string): SpicyAdaptResult {
  const dropped = emptyDropped();
  const parsed: ParsedTTMLLyrics | null = parseTTML(xml);
  if (parsed === null) return staticLyrics(dropped);

  if (parsed.SongWriters !== undefined) dropped.songWriters = parsed.SongWriters;
  dropped.hasTransliterations = parsed.HasTransliterations === true;
  dropped.hasTranslations = parsed.HasTranslations === true;

  if (parsed.Type === 'Static') {
    const lines = parsed.Lines.map((line, index) => {
      if (line.TransliteratedText !== undefined) dropped.transliteratedGroups += 1;
      if (line.TranslatedText !== undefined) dropped.translatedGroups += 1;
      return {
        index,
        start: 0,
        end: 0,
        lead: { syllables: [], start: 0, end: 0 },
        background: [],
        oppositeAligned: false,
        interlude: false,
        songPart: null,
        text: line.Text,
      } satisfies LyricLine;
    });
    return {
      lyrics: {
        kind: 'static',
        lines,
        source: 'apple',
        attribution: 'Apple Music',
        instrumental: false,
      },
      dropped,
    };
  }

  if (parsed.Type === 'Line') {
    const timed: LyricLine[] = [];
    for (const vocal of parsed.Content) {
      const start = vocal.StartTime;
      const end = vocal.EndTime;
      if (typeof start !== 'number' || typeof end !== 'number') continue;
      if (vocal.TransliteratedText !== undefined) dropped.transliteratedGroups += 1;
      if (vocal.TranslatedText !== undefined) dropped.translatedGroups += 1;

      const text = vocal.Text ?? '';
      // Satu "suku kata" seukuran baris: baris menyala tanpa sapuan palsu.
      const syllables: Syllable[] =
        text.length > 0
          ? [{ text, start, end, isPartOfWord: false, emphasis: false }]
          : [];
      timed.push({
        index: 0,
        start,
        end,
        lead: { syllables, start, end },
        background: [],
        oppositeAligned: vocal.OppositeAligned,
        interlude: false,
        songPart: null,
        text,
      });
    }
    if (timed.length === 0) return staticLyrics(dropped);
    return {
      lyrics: {
        kind: 'line',
        lines: withInterludes(timed),
        source: 'apple',
        attribution: 'Apple Music',
        instrumental: false,
      },
      dropped,
    };
  }

  const timed = parsed.Content.map((vocal) => adaptSyllableVocal(vocal, dropped));
  if (timed.length === 0) return staticLyrics(dropped);

  // Baris tanpa timing per kata bisa muncul di dokumen word-level; kalau TIDAK
  // ADA satu pun yang punya >1 suku kata, sapuan per kata tidak ada gunanya.
  const hasWordTiming = timed.some((l) => l.lead.syllables.length > 1);

  return {
    lyrics: {
      kind: hasWordTiming ? 'syllable' : 'line',
      lines: withInterludes(timed),
      source: 'apple',
      attribution: 'Apple Music',
      instrumental: false,
    },
    dropped,
  };
}
