import { describe, expect, it } from 'vitest';

import { firstTrackOf } from '@/lib/home/hero';
import type { Shelf, Track } from '@/lib/types';

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

function shelf(id: string, tracks: Track[], extra: Partial<Shelf> = {}): Shelf {
  return {
    id,
    title: `Rak ${id}`,
    subtitle: null,
    shape: 'square',
    items: tracks.map((t) => ({ kind: 'track', track: t })),
    ...extra,
  };
}

describe('firstTrackOf', () => {
  it('mengambil lagu pertama rak pertama', () => {
    const shelves = [shelf('a', [track('1'), track('2')]), shelf('b', [track('3')])];
    expect(firstTrackOf(shelves)?.id).toBe('1');
  });

  it('rak pertama kosong → jatuh ke rak kedua', () => {
    const shelves = [shelf('a', []), shelf('b', [track('3'), track('4')])];
    expect(firstTrackOf(shelves)?.id).toBe('3');
  });

  it('semua rak kosong → null', () => {
    expect(firstTrackOf([shelf('a', []), shelf('b', [])])).toBeNull();
  });

  it('daftar rak kosong → null', () => {
    expect(firstTrackOf([])).toBeNull();
  });

  it('non-track di rak diabaikan', () => {
    const shelves: Shelf[] = [
      {
        id: 'a',
        title: 'Rak',
        subtitle: null,
        shape: 'wide',
        items: [
          {
            kind: 'album',
            album: {
              id: 'al1',
              title: 'Album',
              artist: 'A',
              artwork: null,
              releaseDate: null,
              trackCount: 1,
              notes: null,
              copyright: null,
              genres: [],
              tracks: [track('1')],
            },
          },
          { kind: 'track', track: track('2') },
        ],
      },
    ];
    expect(firstTrackOf(shelves)?.id).toBe('2');
  });
});
