import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  playlistFixtureToShelf,
  toPlaylistFixture,
  toSearchResults,
} from '@/lib/data/apple-collections';
import {
  artworkUrl,
  toAlbumResponse,
  toArtistResponse,
  toArtwork,
  toTrack,
} from '@/lib/data/apple';

/** Semua test membaca fixture NYATA — nol JSON karangan. */
function load(name: string): unknown {
  return JSON.parse(
    readFileSync(path.join(process.cwd(), 'fixtures', 'apple', `${name}.json`), 'utf8'),
  );
}

describe('toArtwork & artworkUrl', () => {
  const album = load('album-manusia');
  const artworkRaw = (() => {
    const root = album as { data: { attributes: { artwork: unknown } }[] };
    return root.data[0].attributes.artwork;
  })();

  it('membaca template, dimensi, dan warna Apple', () => {
    const art = toArtwork(artworkRaw);
    expect(art).not.toBeNull();
    expect(art?.template).toContain('{w}x{h}');
    expect(art?.width).toBe(3000);
    expect(art?.bgColor).toBe('f4f3f3');
  });

  it('mengumpulkan keempat textColor secara berurutan', () => {
    const art = toArtwork(artworkRaw);
    expect(art?.textColors).toHaveLength(4);
    expect(art?.textColors[0]).toBe('05165a');
  });

  it('mengisi {w}/{h} dengan ukuran yang diminta', () => {
    const url = artworkUrl(toArtwork(artworkRaw), 600);
    expect(url).toContain('600x600');
    expect(url).not.toContain('{w}');
    expect(url).not.toContain('{h}');
  });

  it('URL yang sudah jadi dikembalikan apa adanya', () => {
    const plain = {
      template: 'https://is1-ssl.mzstatic.com/x/300x300bb.jpg',
      width: null,
      height: null,
      bgColor: null,
      textColors: [],
    };
    expect(artworkUrl(plain, 600)).toBe(plain.template);
  });

  it('artwork null -> URL null, bukan throw', () => {
    expect(artworkUrl(null, 600)).toBeNull();
    expect(toArtwork(null)).toBeNull();
    expect(toArtwork({})).toBeNull();
    expect(toArtwork('bukan objek')).toBeNull();
  });
});

describe('toAlbumResponse dari album-manusia.json', () => {
  const album = toAlbumResponse(load('album-manusia'));

  it('album terbaca', () => {
    expect(album).not.toBeNull();
    expect(album?.title).toBe('Manusia');
    expect(album?.artist).toBe('Tulus');
  });

  it('10 track dengan urutan dan durasi benar', () => {
    expect(album?.tracks).toHaveLength(10);
    const first = album?.tracks[0];
    expect(first?.title).toBe('Tujuh Belas');
    expect(first?.trackNumber).toBe(1);
    // 254600 ms -> 254,6 detik. Tipe internal memakai DETIK.
    expect(first?.durationSeconds).toBeCloseTo(254.6, 3);
  });

  it('metadata album lain terisi', () => {
    expect(album?.trackCount).toBe(10);
    expect(album?.copyright).toContain('TulusCompany');
    expect(album?.genres.length).toBeGreaterThan(0);
    expect(album?.artwork?.template).toContain('{w}x{h}');
  });

  it('setiap track punya isrc dan artwork sendiri', () => {
    const withIsrc = album?.tracks.filter((t) => t.isrc !== null) ?? [];
    expect(withIsrc.length).toBe(10);
    expect(album?.tracks.every((t) => t.artwork !== null)).toBe(true);
  });

  it('audio SELALU null di adapter katalog', () => {
    expect(album?.tracks.every((t) => t.audio === null)).toBe(true);
  });
});

describe('toArtistResponse dari artist-tulus.json', () => {
  const artist = toArtistResponse(load('artist-tulus'));

  it('artis terbaca', () => {
    expect(artist).not.toBeNull();
    expect(artist?.name).toBe('Tulus');
  });

  it('relasi album dan lagu teratas terbaca', () => {
    expect(artist?.albums.length).toBeGreaterThan(0);
    expect(artist?.topTracks.length).toBeGreaterThan(0);
  });

  it('album relasi punya judul dan artwork', () => {
    const first = artist?.albums[0];
    expect(first?.title.length).toBeGreaterThan(0);
    expect(first?.artwork).not.toBeNull();
  });
});

describe('toSearchResults dari search-tulus.json', () => {
  const results = toSearchResults('tulus', load('search-tulus'));

  it('ketiga grup terisi', () => {
    expect(results.tracks.length).toBeGreaterThan(0);
    expect(results.albums.length).toBeGreaterThan(0);
    expect(results.artists.length).toBeGreaterThan(0);
  });

  it('grup top berisi campuran ShelfItem bertipe', () => {
    expect(results.top.length).toBeGreaterThan(0);
    const kinds = new Set(results.top.map((i) => i.kind));
    for (const kind of kinds) {
      expect(['track', 'album', 'artist', 'playlist']).toContain(kind);
    }
  });

  it('lagu Tulus yang dikenal ada di hasil', () => {
    const found = results.tracks.find((t) => t.title === 'Hati-Hati di Jalan');
    expect(found).toBeDefined();
    expect(found?.artist).toBe('Tulus');
    expect(found?.durationSeconds).toBeGreaterThan(200);
  });

  it('query diteruskan apa adanya', () => {
    expect(results.query).toBe('tulus');
  });
});

describe('toPlaylistFixture dari playlist editorial', () => {
  const playlist = toPlaylistFixture(load('playlist-top-100-indonesia'));

  it('playlist terbaca dengan kurator Apple', () => {
    expect(playlist).not.toBeNull();
    expect(playlist?.title).toBe('Top 100: Indonesia');
    expect(playlist?.curator).toBe('Apple Music');
  });

  it('30 lagu, semuanya punya judul dan durasi', () => {
    expect(playlist?.tracks).toHaveLength(30);
    for (const track of playlist?.tracks ?? []) {
      expect(track.title.length).toBeGreaterThan(0);
      expect(track.durationSeconds).toBeGreaterThan(0);
    }
  });

  it('memakai raw_data (bentuk kaya), bukan parsed_tracks', () => {
    // Bukti: bentuk kaya memuat template artwork yang bisa di-resize.
    const withTemplate = playlist?.tracks.filter((t) =>
      t.artwork?.template.includes('{w}'),
    );
    expect((withTemplate ?? []).length).toBeGreaterThan(0);
  });
});

describe('playlistFixtureToShelf', () => {
  it('rak Home berisi lagu, bukan satu kartu playlist', () => {
    const shelf = playlistFixtureToShelf(
      'indonesian-music-today',
      load('playlist-indonesian-music-today'),
    );
    expect(shelf).not.toBeNull();
    expect(shelf?.id).toBe('indonesian-music-today');
    expect(shelf?.items.length).toBe(30);
    expect(shelf?.items.every((i) => i.kind === 'track')).toBe(true);
  });

  it('bentuk kartu bisa diatur', () => {
    const wide = playlistFixtureToShelf(
      'x',
      load('playlist-top-100-indonesia'),
      'wide',
    );
    expect(wide?.shape).toBe('wide');
  });
});

describe('ketahanan terhadap data rusak', () => {
  it('toTrack menolak masukan tak valid tanpa throw', () => {
    expect(toTrack(null)).toBeNull();
    expect(toTrack(undefined)).toBeNull();
    expect(toTrack({})).toBeNull();
    expect(toTrack('bukan objek')).toBeNull();
    expect(toTrack(42)).toBeNull();
    expect(toTrack([])).toBeNull();
    // Ada attributes tapi tanpa nama -> ditolak.
    expect(toTrack({ id: '1', attributes: {} })).toBeNull();
    // Ada nama tapi tanpa id -> ditolak.
    expect(toTrack({ attributes: { name: 'X' } })).toBeNull();
  });

  it('toAlbumResponse / toArtistResponse aman', () => {
    expect(toAlbumResponse(undefined)).toBeNull();
    expect(toAlbumResponse({})).toBeNull();
    expect(toAlbumResponse({ data: [] })).toBeNull();
    expect(toArtistResponse(null)).toBeNull();
  });

  it('toSearchResults dengan sampah mengembalikan hasil kosong', () => {
    for (const junk of [null, undefined, {}, [], 'teks', 7]) {
      const r = toSearchResults('q', junk);
      expect(r.tracks).toHaveLength(0);
      expect(r.albums).toHaveLength(0);
      expect(r.artists).toHaveLength(0);
      expect(r.top).toHaveLength(0);
    }
  });

  it('toPlaylistFixture dengan sampah -> null', () => {
    expect(toPlaylistFixture(null)).toBeNull();
    expect(toPlaylistFixture({})).toBeNull();
    expect(toPlaylistFixture({ meta: {}, tracks: {} })).toBeNull();
  });

  it('track dengan durasi hilang jadi 0, bukan NaN', () => {
    const track = toTrack({ id: '9', attributes: { name: 'Tanpa Durasi' } });
    expect(track?.durationSeconds).toBe(0);
    expect(Number.isNaN(track?.durationSeconds)).toBe(false);
  });

  it('angka berbentuk string tetap terbaca (relay kadang begitu)', () => {
    const track = toTrack({
      id: '9',
      attributes: { name: 'X', durationInMillis: 200000, trackNumber: '3' },
    });
    expect(track?.trackNumber).toBe(3);
  });
});
