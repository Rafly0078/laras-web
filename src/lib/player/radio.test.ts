import { describe, expect, it } from 'vitest';

import {
  RADIO_BATCH,
  RADIO_THRESHOLD,
  pickRadioTracks,
  shouldFillQueue,
} from '@/lib/player/radio';
import type { Track } from '@/lib/types';

function track(id: string): Track {
  return {
    id,
    title: `Lagu ${id}`,
    artist: 'Artis',
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

describe('shouldFillQueue', () => {
  it('mengisi saat lagu terakhir sedang diputar', () => {
    const d = shouldFillQueue({
      currentId: 'a',
      upcomingCount: 0,
      lastFilledFor: null,
    });
    expect(d.fill).toBe(true);
    expect(d.reason).toBe('isi');
  });

  it('TIDAK mengisi saat antrean masih panjang', () => {
    const d = shouldFillQueue({
      currentId: 'a',
      upcomingCount: 5,
      lastFilledFor: null,
    });
    expect(d.fill).toBe(false);
    expect(d.reason).toBe('antrean-masih-panjang');
  });

  it('ambang default 1: isi selagi lagu terakhir masih berbunyi', () => {
    /* Kalau ambangnya 0, pemutar sempat BERHENTI dulu sebelum diisi — jeda yang
       terdengar. Uji ini yang mengikat pilihan itu. */
    expect(RADIO_THRESHOLD).toBe(1);
    expect(
      shouldFillQueue({ currentId: 'a', upcomingCount: 0, lastFilledFor: null }).fill,
    ).toBe(true);
    expect(
      shouldFillQueue({ currentId: 'a', upcomingCount: 1, lastFilledFor: null }).fill,
    ).toBe(false);
  });

  it('tanpa lagu yang diputar, tidak ada yang perlu diisi', () => {
    const d = shouldFillQueue({
      currentId: null,
      upcomingCount: 0,
      lastFilledFor: null,
    });
    expect(d.fill).toBe(false);
    expect(d.reason).toBe('tidak-ada-lagu');
  });

  it('tidak mengisi dua kali untuk lagu yang sama', () => {
    /* Penjagaan paling penting di file ini: kalau rekomendasi mengembalikan NOL
       lagu (relay gagal, atau semua sudah didengar), tanpa ini efeknya mencoba
       lagi setiap render sampai relay ambruk. */
    const d = shouldFillQueue({
      currentId: 'a',
      upcomingCount: 0,
      lastFilledFor: 'a',
    });
    expect(d.fill).toBe(false);
    expect(d.reason).toBe('sudah-diisi-untuk-lagu-ini');
  });

  it('lagu BERGANTI setelah pengisian gagal → boleh dicoba lagi', () => {
    const d = shouldFillQueue({
      currentId: 'b',
      upcomingCount: 0,
      lastFilledFor: 'a',
    });
    expect(d.fill).toBe(true);
  });

  it('radio dimatikan → tidak pernah mengisi', () => {
    const d = shouldFillQueue({
      currentId: 'a',
      upcomingCount: 0,
      lastFilledFor: null,
      enabled: false,
    });
    expect(d.fill).toBe(false);
    expect(d.reason).toBe('radio-mati');
  });

  it('ambang bisa dinaikkan (prefetch lebih awal)', () => {
    expect(
      shouldFillQueue({
        currentId: 'a',
        upcomingCount: 2,
        lastFilledFor: null,
        threshold: 3,
      }).fill,
    ).toBe(true);
  });
});

describe('pickRadioTracks', () => {
  it('mengambil sebanyak RADIO_BATCH', () => {
    const candidates = Array.from({ length: 30 }, (_, i) => track(`c${i}`));
    expect(pickRadioTracks(candidates, [], null)).toHaveLength(RADIO_BATCH);
  });

  it('membuang lagu yang SUDAH ada di antrean', () => {
    /* Menambahkan lagu yang sudah ada bukan menduplikasi tapi MEMINDAHKAN
       (lihat withInserted di queue.ts) — radio akan mengocok antrean yang sudah
       disusun pengguna. */
    const candidates = [track('a'), track('b'), track('c')];
    const queue = [track('b')];
    const picked = pickRadioTracks(candidates, queue, null);
    expect(picked.map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('membuang lagu yang sedang diputar', () => {
    const candidates = [track('a'), track('b')];
    const picked = pickRadioTracks(candidates, [], 'a');
    expect(picked.map((t) => t.id)).toEqual(['b']);
  });

  it('membuang duplikat di dalam daftar kandidat itu sendiri', () => {
    const candidates = [track('a'), track('a'), track('b')];
    const picked = pickRadioTracks(candidates, [], null);
    expect(picked.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('kandidat kosong → hasil kosong, tanpa exception', () => {
    expect(pickRadioTracks([], [track('a')], 'a')).toEqual([]);
  });

  it('semua kandidat sudah di antrean → hasil kosong', () => {
    const candidates = [track('a'), track('b')];
    expect(pickRadioTracks(candidates, candidates, null)).toEqual([]);
  });

  it('urutan kandidat dipertahankan (rekomendasi sudah diurutkan)', () => {
    const candidates = ['z', 'y', 'x'].map((id) => track(id));
    expect(pickRadioTracks(candidates, [], null, 3).map((t) => t.id)).toEqual([
      'z',
      'y',
      'x',
    ]);
  });

  it('batch bisa dikecilkan', () => {
    const candidates = Array.from({ length: 30 }, (_, i) => track(`c${i}`));
    expect(pickRadioTracks(candidates, [], null, 3)).toHaveLength(3);
  });
});
