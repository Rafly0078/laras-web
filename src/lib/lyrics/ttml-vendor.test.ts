/**
 * ANGKA, bukan kesan: parser lama (`src/lib/lyrics/ttml.ts`) vs mesin
 * spicy-lyrics yang di-vendor (`src/vendor/spicy-lyrics/ttml/`), dijalankan
 * terhadap KEEMPAT fixture TTML Apple nyata di `fixtures/ttml/`.
 *
 * Test ini SENGAJA mendokumentasikan perbedaan, bukan menuntut kesamaan.
 * Setiap perbedaan punya nilai konkret, jadi kalau salah satu parser berubah,
 * test ini yang memberi tahu — bukan mata di depan layar.
 *
 * Temuan pokoknya (lihat blok "geser satu posisi" di bawah): kedua parser
 * menemukan batas kata yang PERSIS SAMA, tetapi arah `isPartOfWord` berbeda.
 *   - lama   : "aku menempel ke potongan SEBELUMKU"  (mundur)
 *   - vendor : "aku menempel ke potongan SESUDAHKU"  (maju)
 * CSS kita memberi margin-right 0.32ch pada `.word:not(.partOfWord)`, jadi
 * kontrak renderer = MAJU, sama seperti dokumentasi `Syllable` di types.ts.
 * Artinya jarak antar suku kata dari parser lama jatuh satu posisi terlalu awal.
 *
 * Aturan file ini: JANGAN tempelkan teks lirik. Rujuk dengan indeks.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseAppleTtml } from '@/lib/lyrics/ttml';
import type { Lyrics, Syllable } from '@/lib/types';
import { adaptSpicyTtml, type SpicyDroppedInfo } from '@/vendor/spicy-lyrics/ttml/adapter';

const ROOT = path.join(process.cwd(), 'fixtures', 'ttml');

const readFixture = (slug: string): string =>
  readFileSync(path.join(ROOT, `${slug}.ttml`), 'utf8');

/** Semua kelompok vokal (lead + tiap lapis background) dalam urutan dokumen. */
function groups(lyrics: Lyrics): Syllable[][] {
  const out: Syllable[][] = [];
  for (const line of lyrics.lines) {
    if (line.lead.syllables.length > 0) out.push(line.lead.syllables);
    for (const g of line.background) if (g.syllables.length > 0) out.push(g.syllables);
  }
  return out;
}

const flat = (lyrics: Lyrics): Syllable[] => groups(lyrics).flat();

const timed = (lyrics: Lyrics) => lyrics.lines.filter((l) => !l.interlude);

interface Measurement {
  old: Lyrics;
  vendor: Lyrics;
  dropped: SpicyDroppedInfo;
  /** Jumlah suku kata (lead + background) di seluruh dokumen. */
  syllablesOld: number;
  syllablesVendor: number;
  flagsOld: number;
  flagsVendor: number;
  /** Posisi yang nilai `isPartOfWord`-nya BERBEDA, dibandingkan indeks-ke-indeks. */
  rawFlagDiff: number;
  /** Perbedaan setelah keluaran lama digeser satu posisi ke kiri. */
  shiftedFlagDiff: number;
  shiftedPairs: number;
  /** Suku kata yang teksnya berbeda antar parser. */
  textDiff: number;
  /** Baris yang `text`-nya berbeda antar parser. */
  lineTextDiff: number;
  /** Suku kata yang start/end-nya berbeda antar parser. */
  timeDiff: number;
  flaggedGroupFirstOld: number;
  flaggedGroupFirstVendor: number;
  flaggedGroupLastOld: number;
  flaggedGroupLastVendor: number;
}

const cache = new Map<string, Measurement>();

function measure(slug: string): Measurement {
  const hit = cache.get(slug);
  if (hit) return hit;

  const xml = readFixture(slug);
  const old = parseAppleTtml(xml);
  const { lyrics: vendor, dropped } = adaptSpicyTtml(xml);

  const a = flat(old);
  const b = flat(vendor);
  const ga = groups(old);
  const gb = groups(vendor);

  let rawFlagDiff = 0;
  let textDiff = 0;
  let timeDiff = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i].isPartOfWord !== b[i].isPartOfWord) rawFlagDiff += 1;
    if (a[i].text !== b[i].text) textDiff += 1;
    if (a[i].start !== b[i].start || a[i].end !== b[i].end) timeDiff += 1;
  }

  let shiftedFlagDiff = 0;
  let shiftedPairs = 0;
  for (let g = 0; g < Math.min(ga.length, gb.length); g += 1) {
    const n = Math.min(ga[g].length, gb[g].length);
    for (let i = 0; i + 1 < n; i += 1) {
      shiftedPairs += 1;
      if (ga[g][i + 1].isPartOfWord !== gb[g][i].isPartOfWord) shiftedFlagDiff += 1;
    }
  }

  const ta = timed(old);
  const tb = timed(vendor);
  let lineTextDiff = 0;
  for (let i = 0; i < Math.min(ta.length, tb.length); i += 1) {
    if (ta[i].text !== tb[i].text) lineTextDiff += 1;
  }

  const value: Measurement = {
    old,
    vendor,
    dropped,
    syllablesOld: a.length,
    syllablesVendor: b.length,
    flagsOld: a.filter((s) => s.isPartOfWord).length,
    flagsVendor: b.filter((s) => s.isPartOfWord).length,
    rawFlagDiff,
    shiftedFlagDiff,
    shiftedPairs,
    textDiff,
    lineTextDiff,
    timeDiff,
    flaggedGroupFirstOld: ga.filter((g) => g[0].isPartOfWord).length,
    flaggedGroupFirstVendor: gb.filter((g) => g[0].isPartOfWord).length,
    flaggedGroupLastOld: ga.filter((g) => g[g.length - 1].isPartOfWord).length,
    flaggedGroupLastVendor: gb.filter((g) => g[g.length - 1].isPartOfWord).length,
  };
  cache.set(slug, value);
  return value;
}

/* ── Tabel per lagu ─────────────────────────────────────────────────────────
 * Angka diukur, bukan ditebak. Kolom yang penting:
 *   syl        jumlah suku kata (lead + background)
 *   flags      jumlah isPartOfWord=true
 *   rawDiff    posisi yang berbeda kalau dibandingkan lurus indeks-ke-indeks
 *   shiftDiff  perbedaan setelah keluaran lama digeser satu posisi
 * shiftDiff = 0 di keempat lagu = batas kata IDENTIK, arah penandanya beda.  */
const TABLE = [
  { slug: 'peradaban', lines: 64, syl: 935, flags: 505, rawDiff: 652, shiftedPairs: 855 },
  { slug: 'bertaut', lines: 36, syl: 395, flags: 216, rawDiff: 286, shiftedPairs: 359 },
  { slug: 'die-with-a-smile', lines: 50, syl: 306, flags: 14, rawDiff: 22, shiftedPairs: 256 },
  { slug: 'hati-hati-di-jalan', lines: 41, syl: 239, flags: 92, rawDiff: 118, shiftedPairs: 198 },
] as const;

describe.each(TABLE)('$slug — kedua parser', (row) => {
  it(`keduanya word-level dan sama-sama ${row.lines} baris bertimbang`, () => {
    const m = measure(row.slug);
    expect(m.old.kind).toBe('syllable');
    expect(m.vendor.kind).toBe('syllable');
    expect(timed(m.old)).toHaveLength(row.lines);
    expect(timed(m.vendor)).toHaveLength(row.lines);
  });

  it(`jumlah suku kata identik: ${row.syl}`, () => {
    const m = measure(row.slug);
    expect(m.syllablesOld).toBe(row.syl);
    expect(m.syllablesVendor).toBe(row.syl);
  });

  it(`jumlah isPartOfWord identik (${row.flags}), tetapi ${row.rawDiff} POSISI berbeda`, () => {
    const m = measure(row.slug);
    // Total sama = tidak ada batas kata yang hilang atau muncul...
    expect(m.flagsOld).toBe(row.flags);
    expect(m.flagsVendor).toBe(row.flags);
    // ...tapi penandanya duduk di suku kata yang lain.
    expect(m.rawFlagDiff).toBe(row.rawDiff);
  });

  it('geser satu posisi: 0 perbedaan — batas kata IDENTIK', () => {
    const m = measure(row.slug);
    expect(m.shiftedPairs).toBe(row.shiftedPairs);
    expect(m.shiftedFlagDiff).toBe(0);
  });

  it('arah penanda: lama menandai potongan TERAKHIR kata, vendor yang PERTAMA', () => {
    const m = measure(row.slug);
    // Kalau penanda lama berarti "menempel ke SEBELUMKU", potongan pertama
    // sebuah kelompok tidak mungkin ditandai — dan memang nol.
    expect(m.flaggedGroupFirstOld).toBe(0);
    // Sebaliknya, penanda vendor berarti "menempel ke SESUDAHKU", jadi
    // potongan terakhir kelompok tidak mungkin ditandai — dan memang nol.
    expect(m.flaggedGroupLastVendor).toBe(0);
  });

  it('waktu tiap suku kata sama persis di kedua parser', () => {
    const m = measure(row.slug);
    expect(m.timeDiff).toBe(0);
  });
});

/* ── Seberapa besar akibat geseran itu, per lagu ────────────────────────────
 * flags/syl = porsi suku kata yang salah tempat jaraknya di renderer lama.
 * Bahasa Indonesia jauh lebih sering dipecah per suku kata daripada Inggris,
 * jadi kerusakannya juga jauh lebih besar. Ini jawaban angka atas keluhan
 * "penempatan huruf acak-acakan".                                            */
describe('porsi suku kata yang terdampak geseran', () => {
  const EXPECTED = [
    { slug: 'peradaban', flags: 505, syl: 935, percent: 54 },
    { slug: 'bertaut', flags: 216, syl: 395, percent: 54.7 },
    { slug: 'hati-hati-di-jalan', flags: 92, syl: 239, percent: 38.5 },
    { slug: 'die-with-a-smile', flags: 14, syl: 306, percent: 4.6 },
  ] as const;

  it.each(EXPECTED)('$slug: $flags/$syl ≈ $percent%', (row) => {
    const m = measure(row.slug);
    expect(m.flagsVendor).toBe(row.flags);
    expect(m.syllablesVendor).toBe(row.syl);
    expect(Number(((row.flags / row.syl) * 100).toFixed(1))).toBeCloseTo(row.percent, 1);
  });

  it('lagu Indonesia dipecah 8x lebih sering daripada fixture Inggris', () => {
    const id = measure('peradaban');
    const en = measure('die-with-a-smile');
    const rasioId = id.flagsVendor / id.syllablesVendor;
    const rasioEn = en.flagsVendor / en.syllablesVendor;
    expect(rasioId / rasioEn).toBeGreaterThan(8);
    expect(rasioId / rasioEn).toBeLessThan(13);
  });

  it('kata terpanjang: peradaban 6 potongan, hati-hati 5, bertaut 4, dws 3', () => {
    const longest = (slug: string): number => {
      let max = 1;
      for (const g of groups(measure(slug).vendor)) {
        let run = 1;
        for (const s of g) {
          if (s.isPartOfWord) {
            run += 1;
            max = Math.max(max, run);
          } else run = 1;
        }
      }
      return max;
    };
    expect(longest('peradaban')).toBe(6);
    expect(longest('hati-hati-di-jalan')).toBe(5);
    expect(longest('bertaut')).toBe(4);
    expect(longest('die-with-a-smile')).toBe(3);
  });
});

/* ── Invariant waktu (dua-duanya wajib lulus) ─────────────────────────────── */
describe.each(TABLE)('$slug — invariant waktu', (row) => {
  const cases = [
    { name: 'lama', pick: (m: Measurement) => m.old },
    { name: 'vendor', pick: (m: Measurement) => m.vendor },
  ] as const;

  it.each(cases)('$name: tidak ada suku kata dengan end <= start', (c) => {
    const bad = flat(c.pick(measure(row.slug))).filter((s) => !(s.end > s.start));
    expect(bad).toHaveLength(0);
  });

  it.each(cases)('$name: start baris naik monoton, tidak ada waktu NaN', (c) => {
    const lyrics = c.pick(measure(row.slug));
    let turun = 0;
    let nan = 0;
    lyrics.lines.forEach((line, i) => {
      if (!Number.isFinite(line.start) || !Number.isFinite(line.end)) nan += 1;
      const prev = lyrics.lines[i - 1];
      if (prev && line.start < prev.start) turun += 1;
    });
    expect(turun).toBe(0);
    expect(nan).toBe(0);
  });

  it.each(cases)('$name: suku kata di dalam satu kelompok tidak mundur', (c) => {
    let turun = 0;
    for (const g of groups(c.pick(measure(row.slug)))) {
      for (let i = 1; i < g.length; i += 1) {
        if (g[i].start < g[i - 1].start) turun += 1;
      }
    }
    expect(turun).toBe(0);
  });

  it.each(cases)('$name: index baris berurut 0..n', (c) => {
    const lyrics = c.pick(measure(row.slug));
    lyrics.lines.forEach((line, i) => expect(line.index).toBe(i));
  });
});

/* ── Format waktu CAMPUR dalam satu dokumen ───────────────────────────────── */
describe('format waktu campur "9.420" dan "4:20.642"', () => {
  const FORMATS = [
    { slug: 'peradaban', jam: 1881, detik: 157, minStart: 20.96, maxEnd: 337.118 },
    { slug: 'bertaut', jam: 782, detik: 100, minStart: 21.388, maxEnd: 289.321 },
    { slug: 'die-with-a-smile', jam: 527, detik: 207, minStart: 3.432, maxEnd: 244.037 },
    { slug: 'hati-hati-di-jalan', jam: 439, detik: 139, minStart: 13.274, maxEnd: 227.378 },
  ] as const;

  it.each(FORMATS)('$slug memang memakai KEDUA format ($jam jam:menit, $detik detik)', (row) => {
    const xml = readFixture(row.slug);
    // Dihitung dari XML mentah: kalau fixture berubah, angka ini yang gugur
    // lebih dulu — jadi klaim "campur" tidak pernah jadi asumsi basi.
    expect((xml.match(/(?:begin|end)="\d+:[^"]*"/g) ?? []).length).toBe(row.jam);
    expect((xml.match(/(?:begin|end)="\d+\.\d+"/g) ?? []).length).toBe(row.detik);
  });

  it.each(FORMATS)('$slug: kedua parser sepakat batas waktu lagu', (row) => {
    const m = measure(row.slug);
    for (const lyrics of [m.old, m.vendor]) {
      const s = flat(lyrics);
      expect(Math.min(...s.map((x) => x.start))).toBeCloseTo(row.minStart, 3);
      expect(Math.max(...s.map((x) => x.end))).toBeCloseTo(row.maxEnd, 3);
    }
  });

  it('XML sintetis: detik telanjang, m:ss, h:mm:ss, dan bersatuan dibaca sama', () => {
    // Bukan lirik: token satu huruf, hanya untuk menguji pembacaan waktu.
    const xml =
      '<tt itunes:timing="Word"><body><div>' +
      '<p begin="9.420" end="4:20.642">' +
      '<span begin="9.420" end="10.5">a</span> ' +
      '<span begin="1:04.945" end="1:05.5">b</span> ' +
      '<span begin="1:04:20.642" end="1:04:21">c</span> ' +
      '<span begin="3900s" end="3901500ms">d</span>' +
      '</p></div></body></tt>';
    const vendor = adaptSpicyTtml(xml).lyrics;
    const syllables = timed(vendor)[0].lead.syllables;
    expect(syllables).toHaveLength(4);
    expect(syllables[0].start).toBeCloseTo(9.42, 6);
    expect(syllables[1].start).toBeCloseTo(64.945, 6);
    expect(syllables[2].start).toBeCloseTo(3860.642, 6);
    expect(syllables[3].start).toBeCloseTo(3900, 6);
    expect(syllables[3].end).toBeCloseTo(3901.5, 6);
    // Parser lama membaca angka yang sama untuk tiga bentuk pertama.
    const old = timed(parseAppleTtml(xml))[0].lead.syllables;
    expect(old.slice(0, 3).map((s) => s.start)).toEqual(
      syllables.slice(0, 3).map((s) => s.start),
    );
  });
});

/* ── Vokal latar <span ttm:role="x-bg"> yang BERSARANG ───────────────────────
 * Wrapper x-bg tidak punya begin/end sendiri; isinya span bertimbang. Hanya
 * peradaban yang memakainya di antara keempat fixture.                        */
describe('vokal latar bersarang (peradaban)', () => {
  const bgGroups = (lyrics: Lyrics) =>
    lyrics.lines.reduce((n, l) => n + l.background.length, 0);
  const bgSyllables = (lyrics: Lyrics) =>
    lyrics.lines.reduce(
      (n, l) => n + l.background.reduce((m, g) => m + g.syllables.length, 0),
      0,
    );

  it('16 wrapper x-bg di XML → 16 kelompok background di KEDUA parser', () => {
    const m = measure('peradaban');
    expect((readFixture('peradaban').match(/ttm:role="x-bg"/g) ?? []).length).toBe(16);
    expect(bgGroups(m.old)).toBe(16);
    expect(bgGroups(m.vendor)).toBe(16);
  });

  it('144 suku kata background, sama di kedua parser', () => {
    const m = measure('peradaban');
    expect(bgSyllables(m.old)).toBe(144);
    expect(bgSyllables(m.vendor)).toBe(144);
  });

  it('kelompok background punya waktu sendiri dan tidak NaN', () => {
    for (const lyrics of [measure('peradaban').old, measure('peradaban').vendor]) {
      for (const line of lyrics.lines) {
        for (const g of line.background) {
          expect(Number.isFinite(g.start)).toBe(true);
          expect(Number.isFinite(g.end)).toBe(true);
          expect(g.end).toBeGreaterThan(g.start);
          expect(g.syllables.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('PERBEDAAN: vendor membuang tanda kurung di background, lama mempertahankannya', () => {
    const m = measure('peradaban');
    // 16 kelompok × 2 (buka + tutup) = 32 suku kata yang teksnya berbeda —
    // dan itu SATU-SATUNYA perbedaan teks di keempat fixture.
    expect(flat(m.old).filter((s) => /[()]/.test(s.text))).toHaveLength(32);
    expect(flat(m.vendor).filter((s) => /[()]/.test(s.text))).toHaveLength(0);
    expect(m.textDiff).toBe(32);
  });

  it('perbedaan teks nol di tiga fixture lain', () => {
    for (const slug of ['bertaut', 'die-with-a-smile', 'hati-hati-di-jalan']) {
      expect(measure(slug).textDiff).toBe(0);
    }
  });

  it('teks baris (untuk salin/cari) identik di keempat fixture', () => {
    // Penanda maju/mundur saling meniadakan saat teks disusun ulang, jadi
    // `line.text` selalu benar di kedua parser — kerusakannya murni di jarak
    // visual antar span, bukan di teksnya.
    for (const row of TABLE) expect(measure(row.slug).lineTextDiff).toBe(0);
  });
});

/* ── Duet ttm:agent="v2" ────────────────────────────────────────────────────
 * Perbedaan nyata kedua, dan bukan sekadar geseran: siapa yang dianggap
 * penyanyi utama.                                                             */
describe('duet die-with-a-smile', () => {
  it('50 <p>: 22 ber-agent v2, 10 v1, 18 v1000 (dihitung dari XML)', () => {
    const xml = readFixture('die-with-a-smile');
    const agents = (xml.match(/<p\b[^>]*ttm:agent="([^"]*)"/g) ?? []).map(
      (tag) => /ttm:agent="([^"]*)"/.exec(tag)?.[1] ?? '',
    );
    expect(agents).toHaveLength(50);
    expect(agents.filter((a) => a === 'v2')).toHaveLength(22);
    expect(agents.filter((a) => a === 'v1')).toHaveLength(10);
    expect(agents.filter((a) => a === 'v1000')).toHaveLength(18);
  });

  it('PERBEDAAN: lama melempar 10 baris ke kanan, vendor 22', () => {
    const m = measure('die-with-a-smile');
    // Parser lama menebak "agent pertama yang muncul = penyanyi utama". Di file
    // ini <p> pertama ber-agent v2, jadi v1 yang justru dianggap penyanyi kedua
    // dan 10 baris v1 pindah ke kanan — duetnya terbalik.
    expect(m.old.lines.filter((l) => l.oppositeAligned)).toHaveLength(10);
    // Vendor memakai konvensi Apple: v1 selalu utama, v2/v2000 yang di kanan.
    // 22 = tepat jumlah <p ttm:agent="v2">.
    expect(m.vendor.lines.filter((l) => l.oppositeAligned)).toHaveLength(22);
  });

  it('v1000 (grup/backing) tidak dilempar ke kanan oleh parser mana pun', () => {
    const m = measure('die-with-a-smile');
    // 18 baris v1000 + 10 v1 = 28 baris tetap di kiri menurut vendor.
    expect(m.vendor.lines.filter((l) => !l.oppositeAligned && !l.interlude)).toHaveLength(28);
  });

  it('tiga fixture solo: nol baris ke kanan di kedua parser', () => {
    for (const slug of ['peradaban', 'bertaut', 'hati-hati-di-jalan']) {
      const m = measure(slug);
      expect(m.old.lines.filter((l) => l.oppositeAligned)).toHaveLength(0);
      expect(m.vendor.lines.filter((l) => l.oppositeAligned)).toHaveLength(0);
    }
  });
});

/* ── Yang HILANG kalau kita pindah ke mesin vendor ───────────────────────────
 * Bukan bug mereka: parser mereka memang tidak pernah mengeluarkan songPart.
 * Dicatat sebagai angka supaya keputusan pindah dibuat dengan mata terbuka.   */
describe('kemunduran: itunes:songPart hilang di keluaran vendor', () => {
  const distinctSongParts = (lyrics: Lyrics): number =>
    new Set(lyrics.lines.map((l) => l.songPart).filter((p): p is string => p !== null)).size;

  const CASES = [
    { slug: 'die-with-a-smile', old: 7 },
    { slug: 'bertaut', old: 3 },
    { slug: 'peradaban', old: 2 },
    // hati-hati-di-jalan memang tanpa songPart sama sekali di XML-nya.
    { slug: 'hati-hati-di-jalan', old: 0 },
  ] as const;

  it.each(CASES)('$slug: lama $old bagian, vendor 0', (row) => {
    const m = measure(row.slug);
    expect(distinctSongParts(m.old)).toBe(row.old);
    expect(distinctSongParts(m.vendor)).toBe(0);
    expect(m.dropped.songPartAvailable).toBe(false);
  });
});

/* ── Yang DIBAWA vendor tapi belum ada tempatnya di tipe kita ────────────── */
describe('informasi ekstra dari mesin vendor', () => {
  const WRITERS = [
    { slug: 'die-with-a-smile', count: 5 },
    { slug: 'bertaut', count: 3 },
    { slug: 'hati-hati-di-jalan', count: 2 },
    { slug: 'peradaban', count: 1 },
  ] as const;

  it.each(WRITERS)('$slug: $count penulis lagu terbaca (tipe Lyrics belum punya field ini)', (row) => {
    const m = measure(row.slug);
    expect(m.dropped.songWriters).toHaveLength(row.count);
    expect(m.dropped.songWriters.every((w) => w.trim().length > 0)).toBe(true);
  });

  it('romanisasi & terjemahan: nol di keempat fixture (semuanya Latin)', () => {
    for (const row of TABLE) {
      const m = measure(row.slug);
      expect(m.dropped.transliteratedSyllables).toBe(0);
      expect(m.dropped.transliteratedGroups).toBe(0);
      expect(m.dropped.translatedGroups).toBe(0);
      expect(m.dropped.hasTransliterations).toBe(false);
      expect(m.dropped.hasTranslations).toBe(false);
    }
  });

  it('tidak ada suku kata yang dibuang karena waktunya undefined', () => {
    for (const row of TABLE) expect(measure(row.slug).dropped.untimedSyllablesDropped).toBe(0);
  });
});

/* ── Interlude & masukan rusak: kontrak tetap sama ────────────────────────── */
describe('kesetaraan kontrak renderer', () => {
  const INTERLUDES = [
    { slug: 'bertaut', count: 6 },
    { slug: 'hati-hati-di-jalan', count: 3 },
    { slug: 'peradaban', count: 1 },
    { slug: 'die-with-a-smile', count: 1 },
  ] as const;

  it.each(INTERLUDES)('$slug: $count interlude sintetis di kedua parser', (row) => {
    const m = measure(row.slug);
    expect(m.old.lines.filter((l) => l.interlude)).toHaveLength(row.count);
    expect(m.vendor.lines.filter((l) => l.interlude)).toHaveLength(row.count);
  });

  it('baris interlude kosong dan berdurasi positif', () => {
    for (const row of TABLE) {
      for (const line of measure(row.slug).vendor.lines.filter((l) => l.interlude)) {
        expect(line.lead.syllables).toHaveLength(0);
        expect(line.text).toBe('');
        expect(line.end).toBeGreaterThan(line.start);
      }
    }
  });

  it('XML kosong / rusak → statis + instrumental, tanpa exception', () => {
    const kosong = adaptSpicyTtml('');
    expect(kosong.lyrics.kind).toBe('static');
    expect(kosong.lyrics.lines).toHaveLength(0);
    expect(kosong.lyrics.instrumental).toBe(true);

    const rusak = adaptSpicyTtml('<tt itunes:timing="Word"><body><div><p begin="1"');
    expect(rusak.lyrics.lines).toHaveLength(0);
  });

  it('sumber & kredit tetap "apple" / "Apple Music"', () => {
    for (const row of TABLE) {
      const m = measure(row.slug);
      expect(m.vendor.source).toBe('apple');
      expect(m.vendor.attribution).toBe('Apple Music');
      expect(m.vendor.instrumental).toBe(false);
      expect(m.vendor.source).toBe(m.old.source);
    }
  });

  it('setiap baris bertimbang punya teks tidak kosong di kedua parser', () => {
    for (const row of TABLE) {
      const m = measure(row.slug);
      for (const lyrics of [m.old, m.vendor]) {
        for (const line of timed(lyrics)) expect(line.text.length).toBeGreaterThan(0);
      }
    }
  });
});

/* ── Bukti minimal arah penanda, tanpa menyentuh lirik ────────────────────────
 * Token sintetis: satu "kata" tiga potongan yang menempel, lalu satu kata
 * kedua yang dipisah spasi. Model CSS kita: margin-right 0.32ch DI BELAKANG
 * setiap span yang BUKAN .partOfWord.                                          */
describe('arah penanda pada contoh sintetis', () => {
  const xml =
    '<tt itunes:timing="Word"><body><div>' +
    '<p begin="0" end="4">' +
    '<span begin="0" end="1">Aa</span><span begin="1" end="2">Bb</span>' +
    '<span begin="2" end="3">Cc</span> <span begin="3" end="4">Dd</span>' +
    '</p></div></body></tt>';

  /** Rendering sesuai CSS sekarang: spasi menyusul span yang tak bertanda. */
  const renderTrailing = (syllables: readonly Syllable[]): string =>
    syllables
      .map((s, i) => s.text + (!s.isPartOfWord && i < syllables.length - 1 ? ' ' : ''))
      .join('');

  it('vendor menandai potongan 1 & 2 → tiga potongan pertama menyatu', () => {
    const line = timed(adaptSpicyTtml(xml).lyrics)[0];
    expect(line.lead.syllables.map((s) => s.isPartOfWord)).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(renderTrailing(line.lead.syllables)).toBe('AaBbCc Dd');
  });

  it('lama menandai potongan 2 & 3 → jarak jatuh satu posisi terlalu awal', () => {
    const line = timed(parseAppleTtml(xml))[0];
    expect(line.lead.syllables.map((s) => s.isPartOfWord)).toEqual([
      false,
      true,
      true,
      false,
    ]);
    // Inilah "acak-acakan"-nya: jarak muncul di tengah kata pertama, lalu kata
    // kedua menempel ke ekor kata pertama.
    expect(renderTrailing(line.lead.syllables)).toBe('Aa BbCcDd');
  });

  it('teks baris tetap sama walau penandanya beda arah', () => {
    expect(timed(parseAppleTtml(xml))[0].text).toBe(
      timed(adaptSpicyTtml(xml).lyrics)[0].text,
    );
  });
});

