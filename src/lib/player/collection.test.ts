import { describe, expect, it } from 'vitest';

import {
  COLLECTION_VERSION,
  MAX_FAVORITES,
  MAX_HISTORY,
  emptyCollection,
  isFavorite,
  parseCollection,
  withFavoriteToggled,
  withHistoryCleared,
  withPlayed,
} from '@/lib/player/collection';
import type { Track } from '@/lib/types';

function track(id: string, extra: Partial<Track> = {}): Track {
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
    ...extra,
  };
}

describe('parseCollection — localStorage adalah masukan tak terpercaya', () => {
  it('null / string kosong jadi koleksi kosong', () => {
    expect(parseCollection(null)).toEqual(emptyCollection);
    expect(parseCollection('')).toEqual(emptyCollection);
  });

  it('JSON rusak tidak melempar', () => {
    expect(parseCollection('{bukan json')).toEqual(emptyCollection);
    expect(parseCollection('[1,2,3')).toEqual(emptyCollection);
  });

  it('bentuk yang salah sama sekali diabaikan', () => {
    for (const raw of ['null', '42', '"teks"', '[]', '{}']) {
      expect(parseCollection(raw)).toEqual(emptyCollection);
    }
  });

  it('versi berbeda DIBUANG, tidak ditebak-migrasikan', () => {
    const older = JSON.stringify({ version: 0, history: [track('a')], favorites: [] });
    expect(parseCollection(older).history).toEqual([]);
  });

  it('satu entri rusak tidak menghapus entri lain yang sah', () => {
    const raw = JSON.stringify({
      version: COLLECTION_VERSION,
      history: [track('a'), { id: 42 }, null, 'teks', track('b')],
      favorites: [],
    });
    expect(parseCollection(raw).history.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('entri tanpa judul/artis ditolak — renderer bergantung pada keduanya', () => {
    const raw = JSON.stringify({
      version: COLLECTION_VERSION,
      history: [{ id: 'x', title: 'ada' }, { id: 'y', artist: 'ada' }],
      favorites: [],
    });
    expect(parseCollection(raw).history).toEqual([]);
  });

  it('duplikat dibuang saat dibaca', () => {
    const raw = JSON.stringify({
      version: COLLECTION_VERSION,
      history: [track('a'), track('a'), track('b')],
      favorites: [],
    });
    expect(parseCollection(raw).history.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('audio yang tersimpan SELALU dibuang — videoId bisa sudah mati', () => {
    const raw = JSON.stringify({
      version: COLLECTION_VERSION,
      history: [
        {
          ...track('a'),
          audio: { provider: 'youtube', id: 'kadaluwarsa', durationSeconds: 1, durationDelta: 0, matchedTitle: null },
        },
      ],
      favorites: [],
    });
    expect(parseCollection(raw).history[0].audio).toBeNull();
  });

  it('artwork tanpa template ditolak, artwork lengkap dipertahankan', () => {
    const raw = JSON.stringify({
      version: COLLECTION_VERSION,
      history: [
        track('a', { artwork: { width: 1, height: 1, bgColor: null, textColors: [] } as never }),
        track('b', {
          artwork: { template: 'x/{w}x{h}bb.jpg', width: 3000, height: 3000, bgColor: 'ffffff', textColors: ['000'] },
        }),
      ],
      favorites: [],
    });
    const parsed = parseCollection(raw).history;
    expect(parsed[0].artwork).toBeNull();
    expect(parsed[1].artwork?.template).toBe('x/{w}x{h}bb.jpg');
  });

  it('daftar yang terlalu panjang dipotong saat dibaca', () => {
    const raw = JSON.stringify({
      version: COLLECTION_VERSION,
      history: Array.from({ length: MAX_HISTORY + 40 }, (_, i) => track(`h${i}`)),
      favorites: [],
    });
    expect(parseCollection(raw).history).toHaveLength(MAX_HISTORY);
  });
});

describe('withPlayed — riwayat', () => {
  it('lagu baru masuk ke DEPAN', () => {
    const c = withPlayed(withPlayed(emptyCollection, track('a')), track('b'));
    expect(c.history.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('memutar ulang lagu yang sama MEMINDAHKAN, bukan menduplikasi', () => {
    let c = emptyCollection;
    for (const id of ['a', 'b', 'c', 'a']) c = withPlayed(c, track(id));
    expect(c.history.map((t) => t.id)).toEqual(['a', 'c', 'b']);
  });

  it('riwayat dibatasi MAX_HISTORY, yang tertua terbuang', () => {
    let c = emptyCollection;
    for (let i = 0; i < MAX_HISTORY + 10; i += 1) c = withPlayed(c, track(`t${i}`));
    expect(c.history).toHaveLength(MAX_HISTORY);
    expect(c.history[0].id).toBe(`t${MAX_HISTORY + 9}`);
    expect(c.history.some((t) => t.id === 't0')).toBe(false);
  });

  it('audio tidak pernah ikut tersimpan', () => {
    const withAudio = track('a', {
      audio: { provider: 'youtube', id: 'abc', durationSeconds: 200, durationDelta: 0, matchedTitle: null },
    });
    expect(withPlayed(emptyCollection, withAudio).history[0].audio).toBeNull();
  });

  it('tidak memutasi koleksi lama', () => {
    const before = withPlayed(emptyCollection, track('a'));
    const after = withPlayed(before, track('b'));
    expect(before.history.map((t) => t.id)).toEqual(['a']);
    expect(after).not.toBe(before);
  });

  it('withHistoryCleared mengosongkan riwayat tapi TIDAK menyentuh favorit', () => {
    const c = withFavoriteToggled(withPlayed(emptyCollection, track('a')), track('b'));
    const cleared = withHistoryCleared(c);
    expect(cleared.history).toEqual([]);
    expect(cleared.favorites.map((t) => t.id)).toEqual(['b']);
  });
});

describe('withFavoriteToggled — favorit', () => {
  it('menandai lalu melepas', () => {
    const marked = withFavoriteToggled(emptyCollection, track('a'));
    expect(isFavorite(marked, 'a')).toBe(true);

    const unmarked = withFavoriteToggled(marked, track('a'));
    expect(isFavorite(unmarked, 'a')).toBe(false);
    expect(unmarked.favorites).toEqual([]);
  });

  it('yang baru ditandai ada di DEPAN', () => {
    const c = withFavoriteToggled(withFavoriteToggled(emptyCollection, track('a')), track('b'));
    expect(c.favorites.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('favorit dibatasi MAX_FAVORITES', () => {
    let c = emptyCollection;
    for (let i = 0; i < MAX_FAVORITES + 5; i += 1) c = withFavoriteToggled(c, track(`f${i}`));
    expect(c.favorites).toHaveLength(MAX_FAVORITES);
  });

  it('isFavorite untuk id yang tidak ada = false, bukan lempar', () => {
    expect(isFavorite(emptyCollection, 'tidak-ada')).toBe(false);
  });

  it('menandai favorit tidak mengubah riwayat', () => {
    const c = withPlayed(emptyCollection, track('a'));
    expect(withFavoriteToggled(c, track('b')).history.map((t) => t.id)).toEqual(['a']);
  });
});
