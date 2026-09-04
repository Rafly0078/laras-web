import { describe, expect, it } from 'vitest';

import {
  MAX_PER_ARTIST,
  MAX_SEED_ARTISTS,
  MAX_SIMILAR_ARTISTS,
  buildRecommendationShelf,
  hashSeed,
  mergeSimilarArtists,
  seedArtistIds,
  seededRandom,
  type RecommendationCandidate,
} from '@/lib/home/recommend';
import type { Track } from '@/lib/types';

function track(id: string, artist = 'Artis'): Track {
  return {
    id,
    title: `Lagu ${id}`,
    artist,
    album: null,
    durationSeconds: 200,
    isrc: null,
    hasLyrics: false,
    artwork: null,
    trackNumber: null,
    discNumber: null,
    explicit: false,
    audio: null,
  };
}

/** Kandidat ringkas: `id lagu` + `id artis penyumbang`. */
function cand(trackId: string, artistId: string): RecommendationCandidate {
  return { track: track(trackId), artistId };
}

describe('seedArtistIds', () => {
  /* Peta id lagu -> id artis, meniru apa yang nanti datang dari relay. */
  const artistOf = (map: Record<string, string>) => (t: Track) => map[t.id] ?? null;

  it('mengambil artis dari lagu TERBARU, bukan yang terbanyak', () => {
    /* Riwayat: 1 lagu artis baru di depan, 3 lagu artis lama di belakang.
       Kalau implementasinya menghitung frekuensi, 'lama' akan menang — dan itu
       salah, karena selera bergerak dan riwayat menyimpan 100 entri. */
    const history = [track('n1'), track('o1'), track('o2'), track('o3')];
    const map = { n1: 'baru', o1: 'lama', o2: 'lama', o3: 'lama' };
    expect(seedArtistIds(artistOf(map), history)).toEqual(['baru', 'lama']);
  });

  it('dedup: satu artis diputar berulang tidak menghabiskan kuota benih', () => {
    const history = [track('a1'), track('a2'), track('a3'), track('b1'), track('c1')];
    const map = { a1: 'A', a2: 'A', a3: 'A', b1: 'B', c1: 'C' };
    expect(seedArtistIds(artistOf(map), history)).toEqual(['A', 'B', 'C']);
  });

  it('berhenti di MAX_SEED_ARTISTS', () => {
    const history = ['1', '2', '3', '4', '5'].map((id) => track(id));
    const map = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E' };
    const seeds = seedArtistIds(artistOf(map), history);
    expect(seeds).toHaveLength(MAX_SEED_ARTISTS);
    expect(seeds).toEqual(['A', 'B', 'C']);
  });

  it('lagu tanpa artis dilewati, bukan menghentikan pencarian', () => {
    const history = [track('x'), track('a1')];
    const map = { a1: 'A' };
    expect(seedArtistIds(artistOf(map), history)).toEqual(['A']);
  });

  it('riwayat kosong → tidak ada benih', () => {
    expect(seedArtistIds(() => 'A', [])).toEqual([]);
  });

  it('id kosong ditolak (bukan diterima sebagai artis bernama "")', () => {
    expect(seedArtistIds(() => '', [track('1')])).toEqual([]);
  });
});

describe('mergeSimilarArtists', () => {
  it('artis yang muncul di dua benih didahulukan', () => {
    /* B mirip dengan kedua benih; A dan C masing-masing sekali. */
    const merged = mergeSimilarArtists([['A', 'B'], ['C', 'B']], []);
    expect(merged[0]).toBe('B');
  });

  it('artis benih dibuang dari hasilnya sendiri', () => {
    /* Apple kadang memasukkan artis ke daftar miripnya sendiri; merekomendasikan
       artis yang baru saja didengar bukan penemuan. */
    const merged = mergeSimilarArtists([['seed1', 'A']], ['seed1']);
    expect(merged).toEqual(['A']);
  });

  it('urutan peringkat Apple dipertahankan saat hitungannya sama', () => {
    const merged = mergeSimilarArtists([['A', 'B', 'C']], []);
    expect(merged).toEqual(['A', 'B', 'C']);
  });

  it('dipotong di MAX_SIMILAR_ARTISTS', () => {
    const many = Array.from({ length: 30 }, (_, i) => `a${i}`);
    expect(mergeSimilarArtists([many], [])).toHaveLength(MAX_SIMILAR_ARTISTS);
  });

  it('daftar kosong → hasil kosong, tanpa exception', () => {
    expect(mergeSimilarArtists([], [])).toEqual([]);
    expect(mergeSimilarArtists([[], []], ['x'])).toEqual([]);
  });
});

describe('hashSeed & seededRandom', () => {
  it('benih sama → deretan angka sama (rak stabil antar render)', () => {
    const a = seededRandom(hashSeed('tulus,raisa'));
    const b = seededRandom(hashSeed('tulus,raisa'));
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('benih beda → deretan beda', () => {
    const a = seededRandom(hashSeed('tulus'));
    const b = seededRandom(hashSeed('raisa'));
    expect(a()).not.toBe(b());
  });

  it('hasilnya selalu di [0, 1)', () => {
    const r = seededRandom(hashSeed('apa saja'));
    for (let i = 0; i < 200; i += 1) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('hash tetap 32-bit tanpa NaN untuk string panjang', () => {
    const h = hashSeed('x'.repeat(5000));
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it('string kosong tetap menghasilkan angka sah', () => {
    expect(Number.isInteger(hashSeed(''))).toBe(true);
  });
});

describe('buildRecommendationShelf', () => {
  it('membuang lagu yang sudah ada di riwayat', () => {
    const candidates = [cand('1', 'A'), cand('2', 'B'), cand('3', 'C')];
    const result = buildRecommendationShelf(candidates, [track('2')]);
    expect(result.map((t) => t.id).sort()).toEqual(['1', '3']);
  });

  it('membuang duplikat id (satu lagu di top-songs dua artis)', () => {
    const candidates = [cand('1', 'A'), cand('1', 'B'), cand('2', 'C')];
    const result = buildRecommendationShelf(candidates, []);
    expect(result).toHaveLength(2);
  });

  it('membatasi lagu per artis', () => {
    /* 6 lagu dari satu artis; hanya MAX_PER_ARTIST yang boleh lolos, kalau
       tidak rak rekomendasi terasa seperti halaman artis. */
    const candidates = ['1', '2', '3', '4', '5', '6'].map((id) => cand(id, 'A'));
    const result = buildRecommendationShelf(candidates, []);
    expect(result).toHaveLength(MAX_PER_ARTIST);
  });

  it('batas per artis berlaku per artis, bukan global', () => {
    const candidates = [
      ...['a1', 'a2', 'a3', 'a4'].map((id) => cand(id, 'A')),
      ...['b1', 'b2', 'b3', 'b4'].map((id) => cand(id, 'B')),
    ];
    const result = buildRecommendationShelf(candidates, []);
    expect(result).toHaveLength(MAX_PER_ARTIST * 2);
  });

  it('dipotong ke ukuran rak', () => {
    /* 40 artis × 1 lagu = 40 kandidat lolos batas per-artis; rak tetap 30. */
    const candidates = Array.from({ length: 40 }, (_, i) => cand(`t${i}`, `a${i}`));
    expect(buildRecommendationShelf(candidates, [])).toHaveLength(30);
    expect(buildRecommendationShelf(candidates, [], { size: 5 })).toHaveLength(5);
  });

  it('urutannya SAMA untuk kandidat yang sama (bukan Math.random)', () => {
    const candidates = Array.from({ length: 20 }, (_, i) => cand(`t${i}`, `a${i % 5}`));
    const first = buildRecommendationShelf(candidates, []).map((t) => t.id);
    const second = buildRecommendationShelf(candidates, []).map((t) => t.id);
    expect(first).toEqual(second);
  });

  it('benih berbeda → urutan berbeda (jadi rak ikut berubah saat riwayat berubah)', () => {
    const candidates = Array.from({ length: 20 }, (_, i) => cand(`t${i}`, `a${i % 5}`));
    const a = buildRecommendationShelf(candidates, [], { seed: 'satu' }).map((t) => t.id);
    const b = buildRecommendationShelf(candidates, [], { seed: 'dua' }).map((t) => t.id);
    expect(a).not.toEqual(b);
    /* Isinya sama, hanya urutannya beda — pengacakan tidak boleh menghapus lagu. */
    expect([...a].sort()).toEqual([...b].sort());
  });

  it('benar-benar mengacak, bukan mengembalikan urutan masuk', () => {
    const candidates = Array.from({ length: 30 }, (_, i) => cand(`t${i}`, `a${i}`));
    const result = buildRecommendationShelf(candidates, []).map((t) => t.id);
    const inOrder = candidates.slice(0, 30).map((c) => c.track.id);
    expect(result).not.toEqual(inOrder);
  });

  it('kandidat kosong → rak kosong, tanpa exception', () => {
    expect(buildRecommendationShelf([], [])).toEqual([]);
    expect(buildRecommendationShelf([], [track('1')])).toEqual([]);
  });

  it('semua kandidat sudah didengar → rak kosong (bukan mendaur ulang riwayat)', () => {
    const candidates = [cand('1', 'A'), cand('2', 'B')];
    const history = [track('1'), track('2')];
    expect(buildRecommendationShelf(candidates, history)).toEqual([]);
  });
});
