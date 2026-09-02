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

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/* ── Playlist editorial untuk Beranda ──────────────────────────────────── */

/**
 * Playlist editorial Beranda, dengan id katalog Apple yang sudah diverifikasi.
 *
 * Id di sini DIAMBIL dari respons `/playlist/tracks` yang sungguhan (field
 * `playlist_id` di fixtures/apple/playlist-*.json) — jangan pernah menebaknya.
 * Id yang ditebak membalas 404 atau, lebih buruk, playlist orang lain.
 *
 * Disimpan sebagai konstanta alih-alih dicari lewat `/search` tiap kali:
 * pencarian menambah satu round-trip 360–950ms per rak tanpa memberi apa pun
 * yang belum kita tahu. `slug` dipakai di URL supaya alamatnya terbaca.
 */
export const HOME_PLAYLISTS = [
  {
    slug: 'top-100-indonesia',
    id: 'pl.2b7e089dc9ef4dd7a18429df9c6e26a3',
    title: 'Top 100: Indonesia',
    curator: 'Apple Music',
  },
  {
    slug: 'indonesian-music-today',
    id: 'pl.9701289a07b845fb91b0a428c12f42c9',
    title: 'Indonesian Music Today',
    curator: 'Apple Music Indonesian Music',
  },
  {
    slug: 'all-time-indonesian-hits',
    id: 'pl.8d6e453de1c04e17b31839c504045455',
    title: 'All-Time Indonesian Hits',
    curator: 'Apple Music Indonesian Music',
  },
  {
    slug: 'top-songs-2025-indonesia',
    id: 'pl.d4cbfd89785f4ed591f4a888885039f4',
    title: 'Top Songs of 2025: Indonesia',
    curator: 'Apple Music',
  },
] as const;

export type HomePlaylistSlug = (typeof HOME_PLAYLISTS)[number]['slug'];

export function homePlaylistBySlug(slug: string) {
  return HOME_PLAYLISTS.find((p) => p.slug === slug) ?? null;
}

/** Daftar untuk sidebar — hanya slug + judul. */
export const SIDEBAR_PLAYLISTS = HOME_PLAYLISTS.map((p) => ({
  slug: p.slug,
  title: p.title,
}));

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
 * Lirik word-level untuk satu track.
 *
 * Relay membalas `{ syncedLyrics: "<tt …>", plainLyrics, hasWordLevel }`.
 * Yang dipakai `syncedLyrics` (TTML); `plainLyrics` hanya teks datar tanpa
 * timing, jadi tidak berguna untuk sapuan.
 *
 * Mengembalikan null kalau tidak ada lirik SAMA SEKALI. Halaman menampilkan
 * pesan; pemutar tetap jalan.
 *
 * Promise ini TIDAK BOLEH ditolak. Halaman lagu menunggunya di dalam
 * `<Suspense>`, dan promise yang ditolak di sana tidak berhenti di pane lirik:
 * ia naik ke batas error terdekat dan mengganti SELURUH halaman. Karena itu
 * parser pun dibungkus try/catch, meski TTML yang membuatnya melempar belum
 * pernah ditemui.
 */
export async function loadLyrics(appleTrackId: string): Promise<Lyrics | null> {
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
