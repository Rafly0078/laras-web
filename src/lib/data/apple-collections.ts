/**
 * Bagian kedua adapter Apple: playlist, hasil pencarian, dan rak Home.
 *
 * Dipisah dari apple.ts supaya tiap file tetap mudah dibaca; keduanya berbagi
 * type guard lewat re-export dari apple.ts.
 */

import { toAlbum, toArtist, toArtwork, toTrack, toTrackFromParsed } from '@/lib/data/apple';
import type {
  Album,
  Artist,
  Playlist,
  SearchResults,
  Shelf,
  ShelfItem,
  Track,
} from '@/lib/types';

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/* ── Playlist ──────────────────────────────────────────────────────────── */

/**
 * Ambil daftar track dari respons playlist.
 *
 * Tiga bentuk pernah dikirim relay dan semuanya harus tetap terbaca:
 *  - `/playlist` (2026-09 ke atas): item Apple penuh, track di
 *    `data[0].relationships.tracks.data` — bentuk `toTrack` standar.
 *  - `/playlist/tracks` lama: `raw_data.data` (Apple penuh) dan
 *    `parsed_tracks` (snake_case). `raw_data` dipakai lebih dulu karena
 *    memuat isrc, hasLyrics, dan template artwork yang bisa di-resize.
 */
function tracksFromPlaylistResponse(raw: unknown): Track[] {
  if (!isRec(raw)) return [];

  // Bentuk baru: `{ data: [item] }` dengan track di `item.relationships.tracks.data`.
  const item = asArray(raw.data)[0];
  const source = isRec(item) && isRec(item.relationships) ? item : raw;

  if (isRec(source.relationships)) {
    const rel = source.relationships.tracks;
    if (isRec(rel)) {
      const full = asArray(rel.data)
        .map(toTrack)
        .filter((t): t is Track => t !== null);
      if (full.length > 0) return full;
    }
  }

  if (isRec(raw.raw_data)) {
    const full = asArray(raw.raw_data.data)
      .map(toTrack)
      .filter((t): t is Track => t !== null);
    if (full.length > 0) return full;
  }

  // Cadangan: bentuk snake_case, dipetakan oleh toTrackFromParsed di apple.ts
  // (bentuknya berbeda sama sekali dari struktur Apple, jadi butuh pemeta
  // tersendiri — bukan sekadar varian toTrack).
  return asArray(raw.parsed_tracks)
    .map(toTrackFromParsed)
    .filter((t): t is Track => t !== null);
}

/**
 * Playlist dari metadata + respons track.
 *
 * `meta` bisa berbentuk item katalog Apple (`{ attributes: {...} }`) ATAU
 * bentuk pipih yang ditulis skrip fixture (`{ title, curator, ... }`).
 * Keduanya diterima supaya fixture dan API produksi bisa dipakai bergantian.
 */
export function toPlaylist(meta: unknown, tracks: unknown): Playlist | null {
  const trackList = tracksFromPlaylistResponse(tracks);

  let id: string | null = null;
  let title: string | null = null;
  let curator: string | null = null;
  let description: string | null = null;
  let artwork = null;

  if (isRec(meta)) {
    if (isRec(meta.attributes)) {
      const attrs = meta.attributes;
      id = asString(meta.id);
      title = asString(attrs.name);
      curator = asString(attrs.curatorName);
      const desc = isRec(attrs.description) ? attrs.description : null;
      description = desc ? asString(desc.standard) : null;
      artwork = toArtwork(attrs.artwork);
    } else {
      // Bentuk pipih dari fixture.
      title = asString(meta.title);
      curator = asString(meta.curator);
      description = asString(meta.description);
      artwork = toArtwork(meta.artwork);
    }
  }

  if (isRec(tracks) && !id) id = asString(tracks.playlist_id);
  if (!title) return null;

  return {
    id: id ?? title,
    title,
    curator,
    description,
    artwork,
    tracks: trackList,
  };
}

/** Playlist yang dibungkus fixture sebagai `{ meta, tracks }`. */
export function toPlaylistFixture(raw: unknown): Playlist | null {
  if (!isRec(raw)) return null;
  return toPlaylist(raw.meta, raw.tracks);
}

/**
 * Playlist dari respons `/playlist` yang membungkus di `data[0]`.
 *
 * Bentuk baru relay mengirim SATU objek berisi metadata DAN relasi tracks,
 * jadi `meta` dan `tracks` menunjuk item yang sama — `toPlaylist` sudah
 * menangani kedua sisi bentuk itu (attributes untuk metadata, relationships
 * untuk daftar lagu).
 */
export function toPlaylistResponse(raw: unknown): Playlist | null {
  if (!isRec(raw)) return null;
  const item = asArray(raw.data)[0];
  return item === undefined ? null : toPlaylist(item, item);
}

/* ── Hasil pencarian ───────────────────────────────────────────────────── */

/**
 * Ubah satu item hasil pencarian menjadi ShelfItem sesuai `type`-nya.
 *
 * Grup `top` berisi campuran, dan tiap item membawa `type` sendiri — itulah
 * yang dipakai untuk memilih varian, bukan posisi di array.
 */
function toShelfItem(raw: unknown): ShelfItem | null {
  if (!isRec(raw)) return null;

  switch (asString(raw.type)) {
    case 'songs': {
      const track = toTrack(raw);
      return track ? { kind: 'track', track } : null;
    }
    case 'albums': {
      const album = toAlbum(raw);
      return album ? { kind: 'album', album } : null;
    }
    case 'artists': {
      const artist = toArtist(raw);
      return artist ? { kind: 'artist', artist } : null;
    }
    case 'playlists': {
      const playlist = toPlaylist(raw, null);
      return playlist ? { kind: 'playlist', playlist } : null;
    }
    default:
      return null;
  }
}

function groupData(results: unknown, name: string): unknown[] {
  if (!isRec(results)) return [];
  const group = results[name];
  if (!isRec(group)) return [];
  return asArray(group.data);
}

export function toSearchResults(query: string, raw: unknown): SearchResults {
  const results = isRec(raw) && isRec(raw.results) ? raw.results : null;

  return {
    query,
    top: groupData(results, 'top')
      .map(toShelfItem)
      .filter((i): i is ShelfItem => i !== null),
    tracks: groupData(results, 'songs')
      .map(toTrack)
      .filter((t): t is Track => t !== null),
    albums: groupData(results, 'albums')
      .map(toAlbum)
      .filter((a): a is Album => a !== null),
    artists: groupData(results, 'artists')
      .map(toArtist)
      .filter((a): a is Artist => a !== null),
  };
}

/* ── Rak Home ──────────────────────────────────────────────────────────── */

/**
 * Ubah satu playlist editorial menjadi rak Home.
 *
 * Bentuk kartu: 'square' untuk playlist/album (artwork persegi Apple),
 * 'wide' untuk kartu editorial berformat lanskap.
 */
export function playlistToShelf(
  slug: string,
  meta: unknown,
  tracks: unknown,
  shape: 'square' | 'wide' = 'square',
): Shelf | null {
  const playlist = toPlaylist(meta, tracks);
  if (!playlist) return null;

  return {
    id: slug,
    title: playlist.title,
    subtitle: playlist.curator,
    shape,
    // Rak Home menampilkan LAGU dari playlist, bukan satu kartu playlist —
    // itu yang membuat Home terasa penuh alih-alih empat kartu kosong.
    items: playlist.tracks.map((track) => ({ kind: 'track' as const, track })),
  };
}

/** Rak dari fixture berbentuk `{ meta, tracks }`. */
export function playlistFixtureToShelf(
  slug: string,
  raw: unknown,
  shape: 'square' | 'wide' = 'square',
): Shelf | null {
  if (!isRec(raw)) return null;
  return playlistToShelf(slug, raw.meta, raw.tracks, shape);
}
