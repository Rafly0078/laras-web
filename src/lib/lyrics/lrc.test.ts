import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseLrc } from '@/lib/lyrics/lrc';
import type { Lyrics } from '@/lib/types';

/**
 * Dua kelompok test di sini, dan bedanya penting:
 *
 *  1. Terhadap FIXTURE NYATA di `fixtures/lrclib/` — respons LRCLIB sungguhan
 *     untuk dua lagu yang juga punya TTML Apple, jadi hasilnya bisa disilang.
 *     Angka harapannya diukur langsung dari file itu.
 *  2. Terhadap LRC BUATAN — hanya untuk toleransi yang memang dijanjikan
 *     docstring parser (3 desimal, tanpa desimal, timestamp ganda, tag
 *     metadata, offset). Ini bukan data nyata dan tidak berpura-pura begitu.
 */

const ROOT = path.join(process.cwd(), 'fixtures', 'lrclib');

interface LrclibResponse {
  duration: number;
  syncedLyrics: string;
  trackName: string;
}

function fixture(slug: string): LrclibResponse {
  return JSON.parse(readFileSync(path.join(ROOT, `${slug}.json`), 'utf8'));
}

function load(slug: string): Lyrics {
  const raw = fixture(slug);
  return parseLrc(raw.syncedLyrics, { durationSeconds: raw.duration });
}

/** Baris asli (bukan interlude sintetis). */
function realLines(lyrics: Lyrics) {
  return lyrics.lines.filter((l) => !l.interlude);
}

describe('parseLrc — fixture LRCLIB nyata', () => {
  it('bertaut: 36 baris berteks, sama dengan jumlah <p> di TTML Apple-nya', () => {
    const lyrics = load('bertaut');
    expect(realLines(lyrics)).toHaveLength(36);
  });

  it('hati-hati-di-jalan: 37 baris berteks', () => {
    expect(realLines(load('hati-hati-di-jalan'))).toHaveLength(37);
  });

  it('ditandai line-level, BUKAN syllable — ini yang mencegah sapuan palsu', () => {
    const lyrics = load('bertaut');
    expect(lyrics.kind).toBe('line');
    expect(lyrics.source).toBe('lrclib');
    expect(lyrics.attribution).toBe('LRCLIB');
  });

  it('satu baris = satu suku kata sepanjang baris', () => {
    for (const line of realLines(load('bertaut'))) {
      expect(line.lead.syllables).toHaveLength(1);
      expect(line.lead.syllables[0].text).toBe(line.text);
      expect(line.lead.syllables[0].isPartOfWord).toBe(false);
      expect(line.background).toHaveLength(0);
    }
  });

  it('teks & waktu baris pertama sesuai file: 21,38s', () => {
    const first = realLines(load('bertaut'))[0];
    expect(first.text).toBe('Bun, hidup berjalan seperti bajingan');
    expect(first.start).toBeCloseTo(21.38, 3);
  });

  it('TIMESTAMP KOSONG menutup baris sebelumnya (29,45s), bukan baris berikutnya (31,80s)', () => {
    // Ini inti kenapa timestamp bertext-kosong tidak dibuang: tanpanya baris
    // pertama akan menyala 10,4 detik, padahal file bilang 8,07 detik.
    const first = realLines(load('bertaut'))[0];
    expect(first.end).toBeCloseTo(29.45, 3);
    expect(first.end - first.start).toBeCloseTo(8.07, 2);
  });

  it('waktu monoton naik dan tidak ada baris berdurasi nol/negatif', () => {
    for (const slug of ['bertaut', 'hati-hati-di-jalan']) {
      const lines = load(slug).lines;
      for (let i = 0; i < lines.length; i += 1) {
        expect(lines[i].end).toBeGreaterThan(lines[i].start);
        if (i > 0) expect(lines[i].start).toBeGreaterThanOrEqual(lines[i - 1].start);
        expect(lines[i].index).toBe(i);
      }
    }
  });

  it('intro panjang jadi interlude: kedua lagu mulai setelah 13 detik', () => {
    for (const slug of ['bertaut', 'hati-hati-di-jalan']) {
      const lyrics = load(slug);
      expect(lyrics.lines[0].interlude).toBe(true);
      expect(lyrics.lines[0].start).toBe(0);
      expect(lyrics.lines[0].lead.syllables).toHaveLength(0);
    }
  });

  it('durasi LRCLIB bisa BERBEDA dari timestamp terakhirnya — parser tidak boleh memotong', () => {
    // Terukur: bertaut punya duration 250s tapi timestamp terakhir 287,57s.
    // Kalau durasi dipakai sebagai pemotong, sepertiga akhir lagu hilang.
    const raw = fixture('bertaut');
    const lines = realLines(load('bertaut'));
    const last = lines[lines.length - 1];
    expect(raw.duration).toBeLessThan(last.end);
    expect(last.end).toBeGreaterThan(280);
  });
});

describe('parseLrc — toleransi format (LRC buatan, bukan data nyata)', () => {
  it('tiga desimal dibaca sebagai milidetik, dua desimal sebagai ratusan', () => {
    const lyrics = parseLrc('[00:01.5] a\n[00:02.05] b\n[00:03.123] c\n[00:09.00] ');
    const lines = realLines(lyrics);
    expect(lines[0].start).toBeCloseTo(1.5, 3);
    expect(lines[1].start).toBeCloseTo(2.05, 3);
    expect(lines[2].start).toBeCloseTo(3.123, 3);
  });

  it('timestamp tanpa desimal diterima', () => {
    expect(realLines(parseLrc('[01:05] halo\n[01:09] '))[0].start).toBe(65);
  });

  it('menit di atas 60 tidak dipotong', () => {
    expect(realLines(parseLrc('[75:30.00] panjang\n[75:34.00] '))[0].start).toBe(4530);
  });

  it('satu teks dengan dua timestamp jadi dua baris, terurut', () => {
    const lines = realLines(parseLrc('[00:30.00][00:10.00] refrain\n[00:12.00] lain'));
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.text)).toEqual(['refrain', 'lain', 'refrain']);
    expect(lines[0].start).toBe(10);
    expect(lines[2].start).toBe(30);
  });

  it('tag metadata dilewati, tidak jadi baris lirik', () => {
    const lyrics = parseLrc('[ar: Nadin]\n[ti: Bertaut]\n[by: seseorang]\n[00:01.00] isi\n[00:04.00] ');
    expect(realLines(lyrics)).toHaveLength(1);
    expect(realLines(lyrics)[0].text).toBe('isi');
  });

  it('offset positif MEMPERCEPAT lirik (dikurangi), sesuai konvensi LRC', () => {
    const lines = realLines(parseLrc('[offset:+500]\n[00:10.00] a\n[00:14.00] '));
    expect(lines[0].start).toBeCloseTo(9.5, 3);
  });

  it('offset negatif memperlambat', () => {
    const lines = realLines(parseLrc('[offset:-500]\n[00:10.00] a\n[00:14.00] '));
    expect(lines[0].start).toBeCloseTo(10.5, 3);
  });

  it('offset tidak pernah membuat waktu negatif', () => {
    const lines = realLines(parseLrc('[offset:+5000]\n[00:01.00] a\n[00:14.00] '));
    expect(lines[0].start).toBe(0);
  });

  it('kurung siku DI TENGAH teks bukan timestamp', () => {
    const lines = realLines(parseLrc('[00:01.00] lihat [00:99.00] di sini\n[00:05.00] '));
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('lihat [00:99.00] di sini');
  });

  it('teks tanpa timestamp sama sekali menghasilkan lirik kosong, bukan lempar', () => {
    const lyrics = parseLrc('cuma teks biasa\ntanpa waktu');
    expect(lyrics.kind).toBe('static');
    expect(lyrics.lines).toHaveLength(0);
  });

  it('string kosong aman', () => {
    expect(parseLrc('').lines).toHaveLength(0);
  });

  it('durasi lagu menutup baris terakhir kalau tidak ada timestamp penutup', () => {
    const lines = realLines(parseLrc('[00:01.00] satu-satunya', { durationSeconds: 30 }));
    expect(lines[0].end).toBe(30);
  });

  it('tanpa durasi, baris terakhir diberi 4 detik — bukan menyala tanpa batas', () => {
    const lines = realLines(parseLrc('[00:01.00] satu-satunya'));
    expect(lines[0].end).toBe(5);
  });

  it('jeda panjang di tengah lagu jadi interlude', () => {
    const lyrics = parseLrc('[00:01.00] a\n[00:03.00] \n[00:40.00] b\n[00:44.00] ');
    expect(lyrics.lines.filter((l) => l.interlude)).toHaveLength(1);
    expect(lyrics.lines.map((l) => l.index)).toEqual([0, 1, 2]);
  });
});

