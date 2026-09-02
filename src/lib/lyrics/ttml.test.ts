import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseAppleTtml, parseTtmlTime } from '@/lib/lyrics/ttml';
import type { Lyrics } from '@/lib/types';

/**
 * Semua test di sini melawan TTML Apple NYATA di fixtures/ttml, bukan XML
 * karangan. Angka harapan (306/935/395/239 span) diukur langsung dari file
 * itu, jadi kalau parser regresi, test ini yang menangkapnya.
 */

const ROOT = path.join(process.cwd(), 'fixtures', 'ttml');

function load(slug: string): Lyrics {
  return parseAppleTtml(readFileSync(path.join(ROOT, `${slug}.ttml`), 'utf8'));
}

/** Hitung total suku kata (lead + semua background) di seluruh baris. */
function countSyllables(lyrics: Lyrics): number {
  return lyrics.lines.reduce(
    (sum, line) =>
      sum +
      line.lead.syllables.length +
      line.background.reduce((n, g) => n + g.syllables.length, 0),
    0,
  );
}

describe('parseTtmlTime', () => {
  it('detik saja', () => {
    expect(parseTtmlTime('9.420')).toBeCloseTo(9.42, 6);
    expect(parseTtmlTime('0')).toBe(0);
  });

  it('menit:detik (bentuk yang dominan di fixture panjang)', () => {
    expect(parseTtmlTime('4:20.642')).toBeCloseTo(260.642, 6);
    expect(parseTtmlTime('1:04.945')).toBeCloseTo(64.945, 6);
  });

  it('jam:menit:detik', () => {
    expect(parseTtmlTime('1:04:20.642')).toBeCloseTo(3860.642, 6);
  });

  it('bentuk bersatuan', () => {
    expect(parseTtmlTime('12s')).toBe(12);
    expect(parseTtmlTime('120ms')).toBeCloseTo(0.12, 9);
    expect(parseTtmlTime('90m')).toBe(5400);
    expect(parseTtmlTime('1.5h')).toBe(5400);
  });

  it('nilai tak terbaca -> NaN (pemanggil melewati span)', () => {
    expect(Number.isNaN(parseTtmlTime(''))).toBe(true);
    expect(Number.isNaN(parseTtmlTime('abc'))).toBe(true);
    expect(Number.isNaN(parseTtmlTime('10f'))).toBe(true);
  });
});

describe('die-with-a-smile.ttml — duet + backing', () => {
  const lyrics = load('die-with-a-smile');

  it('terdeteksi word-level', () => {
    expect(lyrics.kind).toBe('syllable');
    expect(lyrics.source).toBe('apple');
  });

  it('306 suku kata, sesuai jumlah span di file', () => {
    expect(countSyllables(lyrics)).toBe(306);
  });

  it('50 baris bertimbang (di luar interlude sintetis)', () => {
    expect(lyrics.lines.filter((l) => !l.interlude)).toHaveLength(50);
  });

  it('baris pertama bertimbang berbunyi "Ooh"', () => {
    const first = lyrics.lines.find((l) => !l.interlude);
    expect(first?.text.toLowerCase()).toContain('ooh');
  });

  it('duet terdeteksi: ada baris oppositeAligned', () => {
    expect(lyrics.lines.some((l) => l.oppositeAligned)).toBe(true);
  });

  it('agent grup (v1000) TIDAK dianggap penyanyi kedua', () => {
    // v1000 di file ini muncul sebagai <p ttm:agent="v1000">; barisnya harus
    // tetap di kiri, bukan dilempar ke kanan seperti duet.
    const aligned = lyrics.lines.filter((l) => l.oppositeAligned).length;
    expect(aligned).toBeLessThan(50);
  });

  it('songPart terbaca', () => {
    const parts = new Set(
      lyrics.lines.map((l) => l.songPart).filter((p): p is string => p !== null),
    );
    expect(parts.has('Chorus')).toBe(true);
    expect(parts.has('Verse')).toBe(true);
  });
});

describe('peradaban.ttml — vokal latar bersarang + suku kata', () => {
  const lyrics = load('peradaban');

  it('935 suku kata', () => {
    expect(countSyllables(lyrics)).toBe(935);
  });

  it('64 baris bertimbang', () => {
    expect(lyrics.lines.filter((l) => !l.interlude)).toHaveLength(64);
  });

  it('vokal latar terpisah dari lead', () => {
    const withBg = lyrics.lines.filter((l) => l.background.length > 0);
    expect(withBg.length).toBeGreaterThan(0);
    // Kelompok background punya suku kata sendiri, bukan kosong.
    expect(withBg[0].background[0].syllables.length).toBeGreaterThan(0);
  });

  it('suku kata menempel terdeteksi (isPartOfWord)', () => {
    const attached = lyrics.lines.flatMap((l) =>
      l.lead.syllables.filter((s) => s.isPartOfWord),
    );
    expect(attached.length).toBeGreaterThan(0);
  });

  it('kata pecah tersusun kembali menjadi teks utuh tanpa spasi liar', () => {
    // "Su"+"a"+"tu" harus jadi "Suatu", bukan "Su a tu".
    const joined = lyrics.lines.map((l) => l.text).join(' ');
    expect(joined).not.toMatch(/\bSu a tu\b/);
    expect(joined.toLowerCase()).toContain('suatu');
  });
});

describe('bertaut.ttml', () => {
  const lyrics = load('bertaut');

  it('395 suku kata, 36 baris', () => {
    expect(countSyllables(lyrics)).toBe(395);
    expect(lyrics.lines.filter((l) => !l.interlude)).toHaveLength(36);
  });

  it('solo: tidak ada baris yang dilempar ke kanan', () => {
    expect(lyrics.lines.every((l) => !l.oppositeAligned)).toBe(true);
  });
});

describe('hati-hati-di-jalan.ttml — tanpa songPart', () => {
  const lyrics = load('hati-hati-di-jalan');

  it('239 suku kata, 41 baris', () => {
    expect(countSyllables(lyrics)).toBe(239);
    expect(lyrics.lines.filter((l) => !l.interlude)).toHaveLength(41);
  });

  it('songPart null di semua baris, tanpa crash', () => {
    expect(lyrics.lines.every((l) => l.songPart === null)).toBe(true);
  });
});

describe('invariant di SEMUA fixture', () => {
  const slugs = ['die-with-a-smile', 'peradaban', 'bertaut', 'hati-hati-di-jalan'];

  for (const slug of slugs) {
    describe(slug, () => {
      const lyrics = load(slug);

      it('setiap suku kata start <= end', () => {
        for (const line of lyrics.lines) {
          for (const s of line.lead.syllables) {
            expect(s.start).toBeLessThanOrEqual(s.end);
          }
          for (const g of line.background) {
            for (const s of g.syllables) {
              expect(s.start).toBeLessThanOrEqual(s.end);
            }
          }
        }
      });

      it('start baris naik monoton', () => {
        const starts = lyrics.lines.map((l) => l.start);
        for (let i = 1; i < starts.length; i += 1) {
          expect(starts[i]).toBeGreaterThanOrEqual(starts[i - 1]);
        }
      });

      it('index berurut 0..n tanpa lompatan', () => {
        lyrics.lines.forEach((line, i) => expect(line.index).toBe(i));
      });

      it('tidak ada waktu NaN', () => {
        for (const line of lyrics.lines) {
          expect(Number.isFinite(line.start)).toBe(true);
          expect(Number.isFinite(line.end)).toBe(true);
        }
      });

      it('baris bertimbang punya teks tidak kosong', () => {
        for (const line of lyrics.lines) {
          if (!line.interlude) expect(line.text.length).toBeGreaterThan(0);
        }
      });
    });
  }
});

describe('interlude sintetis', () => {
  it('bertaut punya interlude (jeda 11,5 detik terukur di file)', () => {
    const lyrics = load('bertaut');
    const interludes = lyrics.lines.filter((l) => l.interlude);
    expect(interludes.length).toBeGreaterThan(0);
  });

  it('baris interlude tidak punya suku kata dan teksnya kosong', () => {
    const lyrics = load('bertaut');
    for (const line of lyrics.lines.filter((l) => l.interlude)) {
      expect(line.lead.syllables).toHaveLength(0);
      expect(line.text).toBe('');
      expect(line.end).toBeGreaterThan(line.start);
    }
  });

  it('intro panjang menjadi interlude di awal', () => {
    // bertaut baris pertama mulai di 21,4s -> wajib ada interlude sebelumnya.
    const lyrics = load('bertaut');
    expect(lyrics.lines[0].interlude).toBe(true);
    expect(lyrics.lines[0].start).toBe(0);
  });
});

describe('penanganan masukan rusak', () => {
  it('XML kosong -> lirik statis, bukan exception', () => {
    const lyrics = parseAppleTtml('');
    expect(lyrics.kind).toBe('static');
    expect(lyrics.lines).toHaveLength(0);
    expect(lyrics.instrumental).toBe(true);
  });

  it('tag tidak tertutup tidak menggantung', () => {
    const lyrics = parseAppleTtml('<tt itunes:timing="Word"><body><div><p begin="1"');
    expect(lyrics.lines).toHaveLength(0);
  });

  it('span dengan waktu tak terbaca dilewati, bukan jadi NaN', () => {
    const xml = `<tt itunes:timing="Word"><body><div>
      <p begin="0" end="2"><span begin="oops" end="1">x</span> <span begin="1" end="2">y</span></p>
    </div></body></tt>`;
    const lyrics = parseAppleTtml(xml);
    const line = lyrics.lines.find((l) => !l.interlude);
    expect(line?.lead.syllables).toHaveLength(1);
    expect(line?.lead.syllables[0].text).toBe('y');
  });

  it('entitas XML didekode', () => {
    const xml = `<tt itunes:timing="Word"><body><div>
      <p begin="0" end="2"><span begin="0" end="1">Rock</span> <span begin="1" end="2">&amp;</span> <span begin="1.5" end="2">Roll</span></p>
    </div></body></tt>`;
    const lyrics = parseAppleTtml(xml);
    expect(lyrics.lines.find((l) => !l.interlude)?.text).toBe('Rock & Roll');
  });
});
