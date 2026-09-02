import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { toLrclibLyrics } from '@/lib/data/lrclib';

/**
 * Yang diuji: ATURAN PENERIMAAN, bagian LRCLIB yang paling mudah salah.
 *
 * Jebakan yang membuat test ini ada — terukur pada API-nya: permintaan tanpa
 * durasi untuk "Bertaut" membalas rekaman lain (316 detik, bukan 250). Jadi
 * adapter tidak boleh memercayai apa pun yang dikirim balik; ia harus
 * memeriksa durasinya sendiri.
 */

const ROOT = path.join(process.cwd(), 'fixtures', 'lrclib');

function fixture(slug: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(ROOT, `${slug}.json`), 'utf8'));
}

describe('toLrclibLyrics', () => {
  it('menerima respons nyata saat durasinya cocok', () => {
    const lyrics = toLrclibLyrics(fixture('bertaut'), 250);
    expect(lyrics).not.toBeNull();
    expect(lyrics?.kind).toBe('line');
    expect(lyrics?.source).toBe('lrclib');
    expect(lyrics?.lines.filter((l) => !l.interlude)).toHaveLength(36);
  });

  it('selisih durasi kecil masih diterima (pembulatan, fade-out beda master)', () => {
    expect(toLrclibLyrics(fixture('bertaut'), 252)).not.toBeNull();
    expect(toLrclibLyrics(fixture('bertaut'), 247)).not.toBeNull();
  });

  it('MENOLAK rekaman berdurasi jauh berbeda — ini jebakan 316 vs 250 detik', () => {
    expect(toLrclibLyrics(fixture('bertaut'), 316)).toBeNull();
    expect(toLrclibLyrics(fixture('bertaut'), 200)).toBeNull();
  });

  it('tanpa durasi harapan, hasilnya diterima apa adanya', () => {
    // Jalur ini dipakai kalau katalog Apple tidak memberi durasi sama sekali.
    expect(toLrclibLyrics(fixture('hati-hati-di-jalan'), null)).not.toBeNull();
  });

  it('instrumental dilaporkan sebagai jawaban, bukan kegagalan', () => {
    const lyrics = toLrclibLyrics(
      { duration: 250, instrumental: true, syncedLyrics: '' },
      250,
    );
    expect(lyrics).not.toBeNull();
    expect(lyrics?.instrumental).toBe(true);
    expect(lyrics?.lines).toHaveLength(0);
  });

  it('durasi tetap diperiksa sebelum instrumental diterima', () => {
    expect(
      toLrclibLyrics({ duration: 400, instrumental: true }, 250),
    ).toBeNull();
  });

  it('hanya plainLyrics (tanpa timing) ditolak', () => {
    expect(
      toLrclibLyrics(
        { duration: 250, instrumental: false, plainLyrics: 'ada teks', syncedLyrics: null },
        250,
      ),
    ).toBeNull();
  });

  it('syncedLyrics berisi spasi saja ditolak', () => {
    expect(
      toLrclibLyrics({ duration: 250, syncedLyrics: '   \n  ' }, 250),
    ).toBeNull();
  });

  it('syncedLyrics tanpa satu pun timestamp ditolak', () => {
    expect(
      toLrclibLyrics({ duration: 250, syncedLyrics: 'baris tanpa waktu' }, 250),
    ).toBeNull();
  });

  it('masukan sampah tidak melempar', () => {
    for (const junk of [null, undefined, 42, 'teks', [], { error: 'not found' }]) {
      expect(toLrclibLyrics(junk, 250)).toBeNull();
    }
  });
});
