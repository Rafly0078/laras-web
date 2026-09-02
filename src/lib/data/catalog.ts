/**
 * Lapisan katalog tingkat-halaman: memanggil relay, menormalkan, mengembalikan
 * tipe internal. Halaman TIDAK PERNAH memanggil `client.ts` langsung.
 *
 * Semua fungsi mengembalikan bentuk yang aman untuk dirender (null / array
 * kosong saat gagal), sehingga halaman tidak perlu try/catch dan tidak akan
 * jatuh ke layar error hanya karena relay lambat.
 */

import 'server-only';

import { toAlbumResponse, toArtistResponse, toTrack } from '@/lib/data/apple';
import {
  toPlaylist,
  toSearchResults,
  playlistToShelf,
} from '@/lib/data/apple-collections';
import {
  apiAlbum,
  apiArtist,
  apiLyrics,
  apiPlaylistTracks,
  apiSearch,
  apiSong,
} from '@/lib/data/client';
import { parseAppleTtml } from '@/lib/lyrics/ttml';
import type {
  Album,
  Artist,
  Lyrics,
  Playlist,
  SearchResults,
  Shelf,
  Track,
} from '@/lib/types';

import { fetchLrclibLyrics } from '@/lib/data/lrclib-client';
import { homePlaylistBySlug, HOME_PLAYLISTS } from '@/lib/data/playlists';

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/* ── Pencarian ─────────────────────────────────────────────────────────── */

export async function searchCatalog(query: string): Promise<SearchResults> {
  const raw = await apiSearch(query, 'songs,albums,artists,playlists', 24);
  // toSearchResults sudah tahan terhadap null/sampah, jadi tidak perlu cabang.
  return toSearchResults(query, raw);
}

/* ── Playlist ──────────────────────────────────────────────────────────── */

export async function loadPlaylist(slug: string): Promise<Playlist | null> {
  const meta = homePlaylistBySlug(slug);
  if (!meta) return null;

  const raw = await apiPlaylistTracks(meta.id, 100);
  if (raw === null) return null;

  // Metadata dikirim dalam bentuk pipih; adapter menerima kedua bentuk.
  return toPlaylist(
    { title: meta.title, curator: meta.curator, description: null, artwork: null },
    raw,
  );
}

export async function loadHomeShelf(slug: string): Promise<Shelf | null> {
  const meta = homePlaylistBySlug(slug);
  if (!meta) return null;

  const raw = await apiPlaylistTracks(meta.id, 30);
  if (raw === null) return null;

  return playlistToShelf(
    slug,
    { title: meta.title, curator: meta.curator, description: null, artwork: null },
    raw,
  );
}

/**
 * Semua rak Beranda, diambil PARALEL.
 *
 * Berurutan berarti 4 × latensi (bisa 4 detik); paralel membuatnya selebar
 * permintaan terlambat saja. Rak yang gagal dibuang, bukan menjatuhkan Beranda.
 */
export async function loadHomeShelves(): Promise<Shelf[]> {
  const results = await Promise.all(
    HOME_PLAYLISTS.map((p) => loadHomeShelf(p.slug)),
  );
  return results.filter((s): s is Shelf => s !== null);
}

/* ── Album & artis ─────────────────────────────────────────────────────── */

export async function loadAlbum(albumId: string): Promise<Album | null> {
  return toAlbumResponse(await apiAlbum(albumId));
}

export async function loadArtist(artistId: string): Promise<Artist | null> {
  return toArtistResponse(await apiArtist(artistId));
}

/* ── Satu lagu ─────────────────────────────────────────────────────────── */

export async function loadTrack(appleTrackId: string): Promise<Track | null> {
  const raw = await apiSong(appleTrackId);
  if (!isRec(raw)) return null;

  const first = Array.isArray(raw.data) ? raw.data[0] : undefined;
  return first === undefined ? null : toTrack(first);
}

/* ── Lirik ─────────────────────────────────────────────────────────────── */

/**
 * Lirik untuk satu track: Apple dulu, LRCLIB sebagai cadangan.
 *
 * Relay membalas `{ syncedLyrics: "<tt …>", plainLyrics, hasWordLevel }`.
 * Yang dipakai `syncedLyrics` (TTML); `plainLyrics` hanya teks datar tanpa
 * timing, jadi tidak berguna untuk sapuan.
 *
 * Kalau Apple tidak punya apa pun, LRCLIB dicoba. Bedanya harus disadari:
 * LRCLIB hanya line-level, jadi hasilnya `kind: 'line'` dan tidak disapu per
 * kata. Lebih baik lirik yang menyala per baris daripada pane kosong.
 *
 * Metadata track diambil di sini (bukan dijadikan parameter) supaya pemanggil
 * tidak perlu tahu bahwa jalur cadangan membutuhkannya. Biayanya nol dalam
 * praktik: halaman lagu sudah memanggil `loadTrack(id)` dengan URL yang sama,
 * dan permintaan itu digabung oleh coalescer + Data Cache Next.
 *
 * Promise ini TIDAK BOLEH ditolak. Halaman lagu menunggunya di dalam
 * `<Suspense>`, dan promise yang ditolak di sana tidak berhenti di pane lirik:
 * ia naik ke batas error terdekat dan mengganti SELURUH halaman. Karena itu
 * parser pun dibungkus try/catch, meski TTML yang membuatnya melempar belum
 * pernah ditemui.
 */
export async function loadLyrics(appleTrackId: string): Promise<Lyrics | null> {
  const fromApple = await loadAppleLyrics(appleTrackId);
  if (fromApple !== null) return fromApple;

  const track = await loadTrack(appleTrackId);
  if (track === null) return null;

  try {
    return await fetchLrclibLyrics(track);
  } catch {
    return null;
  }
}

/** Jalur utama: TTML word-level dari katalog Apple lewat relay. */
async function loadAppleLyrics(appleTrackId: string): Promise<Lyrics | null> {
  const raw = await apiLyrics(appleTrackId);
  if (!isRec(raw)) return null;

  const ttml = typeof raw.syncedLyrics === 'string' ? raw.syncedLyrics : null;
  if (ttml === null || !ttml.includes('<tt')) return null;

  try {
    const lyrics = parseAppleTtml(ttml);
    return lyrics.lines.length > 0 ? lyrics : null;
  } catch {
    return null;
  }
}
