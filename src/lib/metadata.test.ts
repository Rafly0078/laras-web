/**
 * Test kartu bagikan. Semua data dari fixture NYATA di `fixtures/apple/` —
 * nol JSON karangan, dan yang di-assert nilai KONKRET (judul, jumlah, durasi),
 * bukan "tidak null": HANDOFF §4 #5 sudah dua kali kena karena id/nama yang
 * dikira benar.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { Metadata } from 'next';
import { describe, expect, it } from 'vitest';

import {
  toAlbumResponse,
  toArtistResponse,
  toTrack,
  toTrackFromParsed,
} from '@/lib/data/apple';
import { toPlaylistFixture } from '@/lib/data/apple-collections';
import type { Playlist } from '@/lib/types';
import { homePlaylistBySlug } from '@/lib/data/playlists';
import {
  albumMetadata,
  artistMetadata,
  playlistMetadata,
  trackMetadata,
} from '@/lib/metadata';

function load(name: string): unknown {
  return JSON.parse(
    readFileSync(path.join(process.cwd(), 'fixtures', 'apple', `${name}.json`), 'utf8'),
  );
}

/** `openGraph` yang dijamin ada; union OG dipersempit di tempat pakai. */
function openGraphOf(meta: Metadata): NonNullable<Metadata['openGraph']> {
  const value = meta.openGraph;
  if (value === undefined || value === null) {
    throw new Error('metadata ini seharusnya punya openGraph');
  }
  return value;
}

/** Entri `og:image` pertama sebagai descriptor — satu-satunya bentuk yang dipakai. */
function firstImage(meta: Metadata) {
  const { images } = openGraphOf(meta);
  const first = Array.isArray(images) ? images[0] : images;
  if (first === undefined || typeof first === 'string' || first instanceof URL) {
    throw new Error('og:image seharusnya berbentuk descriptor');
  }
  return first;
}

/* ── Lagu ──────────────────────────────────────────────────────────────── */

describe('trackMetadata', () => {
  const raw = load('playlist-top-100-indonesia');
  const first = (
    raw as { tracks: { raw_data: { data: unknown[] }; parsed_tracks: unknown[] } }
  ).tracks;
  const track = toTrack(first.raw_data.data[0]);

  if (track === null) throw new Error('fixture playlist seharusnya punya track');

  const meta = trackMetadata(track.id, track);

  it('judul memakai pola "<judul> — <artis> · LARAS"', () => {
    expect(track.id).toBe('6784585105');
    expect(meta.title).toEqual({ absolute: 'Teh Hijau — Tulus · LARAS' });
  });

  it('deskripsi bahasa Indonesia dan menyebut albumnya', () => {
    expect(meta.description).toBe(
      'Putar Teh Hijau dari Tulus di LARAS dengan lirik tersinkron per kata. ' +
        'Dari album Teh Hijau - Single.',
    );
  });

  it('og:type music.song dengan durasi dalam detik bulat', () => {
    const og = openGraphOf(meta);
    expect('type' in og && og.type).toBe('music.song');
    // 212879ms di fixture -> 213 detik, bukan 212.879.
    expect('duration' in og && og.duration).toBe(213);
    expect(og.url).toBe('/lagu/6784585105');
    expect(og.siteName).toBe('LARAS');
  });

  it('og:image memakai artwork 1200 persegi dengan dimensi yang jujur', () => {
    const image = firstImage(meta);
    expect(String(image.url)).toContain('1200x1200bb.jpg');
    expect(String(image.url)).not.toContain('{w}');
    expect(image.width).toBe(1200);
    expect(image.height).toBe(1200);
  });

  it('kartu X memakai summary supaya sampul persegi tidak dipotong', () => {
    const { twitter } = meta;
    if (twitter === undefined || twitter === null) throw new Error('twitter wajib ada');
    expect('card' in twitter && twitter.card).toBe('summary');
    expect(twitter.title).toBe('Teh Hijau — Tulus · LARAS');
  });

  it('canonical menunjuk rute lagu itu sendiri', () => {
    expect(meta.alternates?.canonical).toBe('/lagu/6784585105');
  });

  /* Ini penjagaan yang paling mudah hilang: bentuk `parsed_tracks` relay
     mengirim URL artwork yang SUDAH jadi (600x600), jadi ukuran 1200 tidak
     pernah terpasang — dan metadata tidak boleh mengaku sebaliknya. */
  it('URL artwork yang sudah jadi tidak diberi dimensi karangan', () => {
    const parsed = toTrackFromParsed(first.parsed_tracks[0]);
    if (parsed === null) throw new Error('fixture parsed_tracks seharusnya terbaca');

    const image = firstImage(trackMetadata(parsed.id, parsed));
    expect(String(image.url)).toContain('600x600bb.jpg');
    expect(image.width).toBeUndefined();
    expect(image.height).toBeUndefined();
  });

  it('track null -> judul cadangan, noindex, tanpa openGraph', () => {
    const missing = trackMetadata('0', null);
    expect(missing.title).toEqual({ absolute: 'Lagu tidak tersedia · LARAS' });
    expect(missing.description).toContain('tidak bisa dimuat');
    expect(missing.robots).toEqual({ index: false });
    expect(missing.openGraph).toBeUndefined();
  });
});

/* ── Album & artis ─────────────────────────────────────────────────────── */

describe('albumMetadata', () => {
  const album = toAlbumResponse(load('album-manusia'));
  if (album === null) throw new Error('fixture album seharusnya terbaca');

  const meta = albumMetadata(album.id, album);

  it('judul menandai jenisnya, deskripsi menyebut jumlah lagu dan tahun', () => {
    expect(meta.title).toEqual({ absolute: 'Manusia — Album Tulus · LARAS' });
    expect(meta.description).toBe(
      '10 lagu di album Manusia dari Tulus (2022). ' +
        'Putar dengan lirik tersinkron per kata di LARAS.',
    );
  });

  it('og:type music.album dengan tanggal rilis apa adanya', () => {
    const og = openGraphOf(meta);
    expect('type' in og && og.type).toBe('music.album');
    expect('releaseDate' in og && og.releaseDate).toBe('2022-03-03');
    expect(meta.alternates?.canonical).toBe('/album/1612163750');
    expect(String(firstImage(meta).url)).toContain('1200x1200bb.jpg');
  });

  it('album null -> judul cadangan dan noindex', () => {
    const missing = albumMetadata('0', null);
    expect(missing.title).toEqual({ absolute: 'Album tidak tersedia · LARAS' });
    expect(missing.robots).toEqual({ index: false });
  });
});

describe('artistMetadata', () => {
  const artist = toArtistResponse(load('artist-tulus'));
  if (artist === null) throw new Error('fixture artis seharusnya terbaca');

  const meta = artistMetadata(artist.id, artist);

  it('judul dan deskripsi memakai nama serta genre dari katalog', () => {
    expect(artist.name).toBe('Tulus');
    expect(meta.title).toEqual({ absolute: 'Tulus — Artis · LARAS' });
    expect(meta.description).toBe(
      'Lagu teratas dan diskografi Tulus — Pop. ' +
        'Putar dengan lirik tersinkron per kata di LARAS.',
    );
  });

  it('og:type profile — spesifikasi OG tidak punya tipe artis', () => {
    const og = openGraphOf(meta);
    expect('type' in og && og.type).toBe('profile');
    expect(og.url).toBe('/artis/1001681665');
  });

  it('genre ketiga ke atas dibuang supaya deskripsi tidak terpotong', () => {
    const many = artistMetadata(artist.id, {
      ...artist,
      genres: ['Indo Pop', 'Music', 'Pop'],
    });
    expect(many.description).toContain('Tulus — Indo Pop, Music.');
    expect(many.description).not.toContain('Music, Pop');
  });

  it('artis null -> judul cadangan dan noindex', () => {
    const missing = artistMetadata('0', null);
    expect(missing.title).toEqual({ absolute: 'Artis tidak tersedia · LARAS' });
    expect(missing.robots).toEqual({ index: false });
  });
});

/* ── Playlist ──────────────────────────────────────────────────────────── */

describe('playlistMetadata', () => {
  const slug = 'top-100-indonesia';
  const meta = homePlaylistBySlug(slug);
  if (meta === null) throw new Error('slug playlist ini wajib ada di HOME_PLAYLISTS');

  const playlist = toPlaylistFixture(load(`playlist-${slug}`));
  if (playlist === null) throw new Error('fixture playlist seharusnya terbaca');

  const card = playlistMetadata(slug, meta, playlist);

  it('judul menyebut kurator, deskripsi menyebut jumlah lagu', () => {
    expect(card.title).toEqual({
      absolute: 'Top 100: Indonesia — Playlist Apple Music · LARAS',
    });
    expect(playlist.tracks).toHaveLength(30);
    expect(card.description).toBe(
      '30 lagu di playlist Top 100: Indonesia pilihan Apple Music. ' +
        'Putar dengan lirik tersinkron per kata di LARAS.',
    );
  });

  it('sampul memakai artwork playlist, sama seperti yang dirender halaman', () => {
    const og = openGraphOf(card);
    expect('type' in og && og.type).toBe('music.playlist');
    expect(og.url).toBe('/playlist/top-100-indonesia');
    // Sejak 2026-09 `/playlist` mengirim artwork-nya sendiri dan halaman
    // memakainya lebih dulu; lagu pertama hanya cadangan. Kartu bagikan harus
    // menunjuk gambar yang SAMA dengan yang dirender.
    expect(playlist.artwork).not.toBeNull();
    expect(String(firstImage(card).url)).toBe(
      playlist.artwork?.template.replace('{w}', '1200').replace('{h}', '1200'),
    );
  });

  it('playlist tanpa artwork sendiri jatuh ke sampul lagu pertama', () => {
    const noCover: Playlist = { ...playlist, artwork: null };
    const card2 = playlistMetadata(slug, meta, noCover);
    expect(String(firstImage(card2).url)).toBe(
      playlist.tracks[0].artwork?.template
        .replace('{w}', '1200')
        .replace('{h}', '1200'),
    );
  });

  it('relay gagal -> judul tetap benar, jumlah lagu tidak dikarang', () => {
    const degraded = playlistMetadata(slug, meta, null);
    expect(degraded.title).toEqual({
      absolute: 'Top 100: Indonesia — Playlist Apple Music · LARAS',
    });
    expect(degraded.description).toBe(
      'Playlist Top 100: Indonesia pilihan Apple Music di LARAS. ' +
        'Putar dengan lirik tersinkron per kata.',
    );
    expect(degraded.description).not.toContain('0 lagu');
    expect(openGraphOf(degraded).images).toBeUndefined();
    // Playlist yang sah tetap boleh diindeks meski isinya belum bisa dimuat.
    expect(degraded.robots).toBeUndefined();
  });

  it('slug tak dikenal -> judul cadangan dan noindex', () => {
    const missing = playlistMetadata('tidak-ada', null, null);
    expect(missing.title).toEqual({ absolute: 'Playlist tidak tersedia · LARAS' });
    expect(missing.robots).toEqual({ index: false });
  });
});
