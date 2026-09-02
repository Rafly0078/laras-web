import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseAppleTtml } from '@/lib/lyrics/ttml';
import { toWordGroups, wordTexts } from '@/lib/lyrics/word-groups';
import type { Lyrics, Syllable } from '@/lib/types';

/**
 * Test ini yang menutup cacat `Ha ri-hariber ulang`.
 *
 * Caranya sengaja tidak memuat satu baris lirik pun: parser membangun
 * `LyricLine.text` lewat jalurnya sendiri, jadi kalau kata hasil pengelompokan
 * digabung dengan satu spasi dan hasilnya SAMA dengan `line.text`, jarak antar
 * kata pasti mendarat di tempat yang benar. Yang di-assert cuma angka.
 */

const ROOT = path.join(process.cwd(), 'fixtures', 'ttml');
const SLUGS = ['peradaban', 'bertaut', 'hati-hati-di-jalan', 'die-with-a-smile'] as const;

function load(slug: string): Lyrics {
  return parseAppleTtml(readFileSync(path.join(ROOT, `${slug}.ttml`), 'utf8'));
}

function syllableLines(lyrics: Lyrics): Syllable[][] {
  return lyrics.lines
    .filter((line) => !line.interlude && line.lead.syllables.length > 0)
    .map((line) => line.lead.syllables);
}

/** Normalkan spasi supaya perbandingan menguji BATAS KATA, bukan whitespace. */
function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

describe('toWordGroups — batas kata', () => {
  it.each(SLUGS)('%s: gabungan kata sama dengan teks baris dari parser', (slug) => {
    const lyrics = load(slug);
    const lines = lyrics.lines.filter(
      (line) => !line.interlude && line.lead.syllables.length > 0,
    );

    let cocok = 0;
    for (const line of lines) {
      if (squash(wordTexts(line.lead.syllables).join(' ')) === squash(line.text)) {
        cocok += 1;
      }
    }

    // Semua baris, bukan sebagian: satu baris yang tidak cocok berarti ada kata
    // yang jaraknya jatuh di posisi salah, dan itu yang dilihat pengguna.
    expect(cocok).toBe(lines.length);
  });

  it.each(SLUGS)('%s: tiap suku kata masuk TEPAT satu kelompok', (slug) => {
    for (const syllables of syllableLines(load(slug))) {
      const groups = toWordGroups(syllables);
      const flat = groups.flat();
      expect(flat).toHaveLength(syllables.length);
      expect(flat).toEqual([...flat].sort((a, b) => a - b));
      expect(new Set(flat).size).toBe(syllables.length);
    }
  });

  it.each(SLUGS)('%s: tidak ada kelompok kosong', (slug) => {
    for (const syllables of syllableLines(load(slug))) {
      for (const group of toWordGroups(syllables)) expect(group.length).toBeGreaterThan(0);
    }
  });

  it('kata majemuk memang digabung, bukan dipecah per suku kata', () => {
    /* Apple memecah mayoritas kata Indonesia. Kalau pengelompokan tidak
       bekerja, jumlah kata akan sama dengan jumlah span.

       791, bukan 935: angka 935 di BRIEF adalah SELURUH span termasuk vokal
       latar (16 wrapper x-bg), sementara di sini hanya `lead` yang dihitung.
       Assertion pertama versi awal test ini menuntut 935 dan gagal — salahnya
       di aritmetika test, bukan di pengelompokannya. */
    const lyrics = load('peradaban');
    const syllables = syllableLines(lyrics).flat().length;
    const words = syllableLines(lyrics).reduce(
      (n, list) => n + toWordGroups(list).length,
      0,
    );
    expect(syllables).toBe(791);
    expect(words).toBeLessThan(syllables / 1.5);
  });

  it('lirik Inggris hampir tidak punya kata majemuk — kontrol', () => {
    const lyrics = load('die-with-a-smile');
    const syllables = syllableLines(lyrics).flat().length;
    const words = syllableLines(lyrics).reduce(
      (n, list) => n + toWordGroups(list).length,
      0,
    );
    expect(syllables - words).toBeLessThan(syllables * 0.1);
  });

  it('masukan kosong dan satu suku kata tidak melempar', () => {
    expect(toWordGroups([])).toEqual([]);
    const one: Syllable[] = [
      { text: 'x', start: 0, end: 1, isPartOfWord: false, emphasis: false },
    ];
    expect(toWordGroups(one)).toEqual([[0]]);
  });

  it('suku kata pertama selalu memulai kata, walau isPartOfWord true', () => {
    // TTML rusak bisa menandai span pertama sebagai menempel. Tanpa penjagaan
    // `index === 0`, kelompok pertama tidak akan pernah dibuat.
    const glued: Syllable[] = [
      { text: 'a', start: 0, end: 1, isPartOfWord: true, emphasis: false },
      { text: 'b', start: 1, end: 2, isPartOfWord: true, emphasis: false },
    ];
    expect(toWordGroups(glued)).toEqual([[0, 1]]);
  });
});
