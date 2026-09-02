import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { bestMatch } from '@/lib/data/bridge';
import {
  collectListItems,
  findVideoId,
  parseSearchResponse,
  runsText,
  toCandidate,
} from '@/lib/data/innertube';

/** Respons InnerTube NYATA, disimpan sebagai fixture. */
function load(name: string): unknown {
  return JSON.parse(
    readFileSync(
      path.join(process.cwd(), 'fixtures', 'youtube', `search-${name}.json`),
      'utf8',
    ),
  );
}

describe('runsText', () => {
  it('menggabungkan seluruh runs', () => {
    expect(runsText({ runs: [{ text: 'Tulus' }, { text: ' • ' }, { text: '4:02' }] })).toBe(
      'Tulus • 4:02',
    );
  });

  it('aman terhadap bentuk tak terduga', () => {
    expect(runsText(null)).toBe('');
    expect(runsText({})).toBe('');
    expect(runsText({ runs: 'bukan array' })).toBe('');
    expect(runsText({ runs: [{ noText: 1 }] })).toBe('');
  });
});

describe('findVideoId', () => {
  it('menemukan videoId bersarang', () => {
    expect(findVideoId({ a: { b: [{ videoId: 'E7kHvjvU6JY' }] } })).toBe('E7kHvjvU6JY');
  });

  it('menolak id berformat salah', () => {
    expect(findVideoId({ videoId: 'pendek' })).toBeNull();
    expect(findVideoId({ videoId: 'kepanjangansekali123' })).toBeNull();
    expect(findVideoId({ videoId: 42 })).toBeNull();
  });

  it('tidak melempar pada masukan aneh', () => {
    expect(findVideoId(null)).toBeNull();
    expect(findVideoId('teks')).toBeNull();
    expect(findVideoId([])).toBeNull();
  });

  it('berhenti pada kedalaman berlebih (tidak infinite)', () => {
    // Struktur bersarang 40 tingkat: batas kedalaman 12 harus menyelamatkan.
    let deep: Record<string, unknown> = { videoId: 'E7kHvjvU6JY' };
    for (let i = 0; i < 40; i += 1) deep = { nested: deep };
    expect(findVideoId(deep)).toBeNull();
  });
});

describe('collectListItems dari respons NYATA', () => {
  const items = collectListItems(load('hati-hati-di-jalan'));

  it('menemukan 20 item hasil', () => {
    expect(items.length).toBe(20);
  });

  it('setiap item punya flexColumns', () => {
    for (const item of items) {
      expect(Array.isArray(item.flexColumns)).toBe(true);
    }
  });

  it('array kosong untuk masukan sampah, bukan throw', () => {
    expect(collectListItems(null)).toEqual([]);
    expect(collectListItems({})).toEqual([]);
    expect(collectListItems('teks')).toEqual([]);
  });
});

describe('toCandidate dari item NYATA', () => {
  const items = collectListItems(load('hati-hati-di-jalan'));
  const first = toCandidate(items[0]);

  it('hasil pertama adalah lagu yang dicari', () => {
    expect(first).not.toBeNull();
    expect(first?.videoId).toBe('E7kHvjvU6JY');
    expect(first?.title).toBe('Hati-Hati di Jalan');
    expect(first?.artist).toBe('Tulus');
  });

  it('durasi diambil dari TEKS baris metadata (bukan lengthSeconds)', () => {
    // "Tulus • Manusia • 4:02" -> 242 detik
    expect(first?.durationSeconds).toBe(242);
  });

  it('menolak item tanpa flexColumns', () => {
    expect(toCandidate({})).toBeNull();
    expect(toCandidate(null)).toBeNull();
    expect(toCandidate({ flexColumns: [] })).toBeNull();
  });

  it('menolak item tanpa videoId', () => {
    expect(
      toCandidate({
        flexColumns: [
          {
            musicResponsiveListItemFlexColumnRenderer: {
              text: { runs: [{ text: 'Judul' }] },
            },
          },
        ],
      }),
    ).toBeNull();
  });
});

describe('parseSearchResponse', () => {
  it('mengubah respons nyata menjadi kandidat lengkap', () => {
    const candidates = parseSearchResponse(load('hati-hati-di-jalan'));
    expect(candidates.length).toBeGreaterThan(10);
    // Semua kandidat wajib punya videoId valid.
    for (const c of candidates) {
      expect(c.videoId).toMatch(/^[\w-]{11}$/);
    }
  });

  it('sebagian besar kandidat punya durasi terparse', () => {
    const candidates = parseSearchResponse(load('die-with-a-smile'));
    const withDuration = candidates.filter((c) => c.durationSeconds !== null);
    expect(withDuration.length).toBeGreaterThan(candidates.length / 2);
  });

  it('array kosong untuk sampah', () => {
    for (const junk of [null, undefined, {}, [], 'teks', 7]) {
      expect(parseSearchResponse(junk)).toEqual([]);
    }
  });
});

describe('jembatan ujung-ke-ujung: respons nyata -> pasangan benar', () => {
  it('memilih rekaman Tulus yang benar, bukan cover Indah Yastami', () => {
    const candidates = parseSearchResponse(load('hati-hati-di-jalan'));
    const match = bestMatch(candidates, {
      title: 'Hati-Hati di Jalan',
      artist: 'Tulus',
      durationSeconds: 242.36,
    });

    expect(match).not.toBeNull();
    expect(match?.candidate.videoId).toBe('E7kHvjvU6JY');
    expect(match?.candidate.artist).toBe('Tulus');
    // Cover Indah Yastami (3:43 = 223s) berada di luar toleransi 3 detik.
    expect(Math.abs(match?.durationDelta ?? 99)).toBeLessThanOrEqual(3);
  });

  it('memilih rekaman kolaborasi yang benar untuk Die With A Smile', () => {
    const candidates = parseSearchResponse(load('die-with-a-smile'));
    const match = bestMatch(candidates, {
      title: 'Die With A Smile',
      artist: 'Lady Gaga & Bruno Mars',
      durationSeconds: 251.667,
    });

    expect(match).not.toBeNull();
    expect(match?.candidate.videoId).toMatch(/^[\w-]{11}$/);
    expect(Math.abs(match?.durationDelta ?? 99)).toBeLessThanOrEqual(3);
  });

  it('menolak semua kandidat kalau durasi target tidak masuk akal', () => {
    const candidates = parseSearchResponse(load('hati-hati-di-jalan'));
    const match = bestMatch(candidates, {
      title: 'Hati-Hati di Jalan',
      artist: 'Tulus',
      // 10 menit: tidak ada kandidat sepanjang ini.
      durationSeconds: 600,
    });
    expect(match).toBeNull();
  });

  it('menolak kalau edisi target berbeda (Live) padahal kandidat studio', () => {
    const candidates = parseSearchResponse(load('hati-hati-di-jalan'));
    const match = bestMatch(candidates, {
      title: 'Hati-Hati di Jalan (Live)',
      artist: 'Tulus',
      durationSeconds: 242.36,
    });
    expect(match).toBeNull();
  });
});
