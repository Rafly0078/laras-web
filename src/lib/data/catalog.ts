/**
 * Lapisan katalog tingkat-halaman: memanggil relay, menormalkan, mengembalikan
 * tipe internal. Halaman TIDAK PERNAH memanggil `client.ts` langsung.
 *
 * Semua fungsi mengembalikan bentuk yang aman untuk dirender (null / array
 * kosong saat gagal), sehingga halaman tidak perlu try/catch dan tidak akan
 * jatuh ke layar error hanya karena relay lambat.
 */

import 'server-only';

import { toAlbumResponse, toArtistFromParts, toTrack } from '@/lib/data/apple';
import {
  toPlaylistResponse,
  toSearchResults,
  playlistToShelf,
} from '@/lib/data/apple-collections';
import {
  apiAlbum,
  apiArtist,
  apiArtistAlbums,
  apiArtistSongs,
  apiLyrics,
  apiPlaylist,
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

/** Jumlah kartu maksimum per rak Home (lihat `loadHomeShelf`). */
const HOME_SHELF_SIZE = 30;

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

  const raw = await apiPlaylist(meta.id);
  if (raw === null) return null;

  /* Judul dan kurator tetap dari konstanta lokal: kartu bagikan dan sidebar
     tidak boleh berubah-ubah mengikuti respons relay, dan konstantanya sudah
     diverifikasi cocok dengan Apple. Yang diambil dari relay hanya artwork
     dan deskripsi — dua hal yang tidak mungkin ditebak. */
  const live = toPlaylistResponse(raw);
  if (live === null) return null;
  return {
    ...live,
    id: meta.id,
    title: meta.title,
    curator: live.curator ?? meta.curator,
  };
}

export async function loadHomeShelf(slug: string): Promise<Shelf | null> {
  const meta = homePlaylistBySlug(slug);
  if (!meta) return null;

  const raw = await apiPlaylist(meta.id);
  if (raw === null) return null;

  const shelf = playlistToShelf(
    slug,
    { title: meta.title, curator: meta.curator, description: null, artwork: null },
    raw,
  );
  if (shelf === null) return null;

  /* Rak Home dipotong ke 30 kartu. Dulu `limit` dikirim ke relay; endpoint
     `/playlist` yang baru MENOLAK parameter itu (400 "Limit may not be
     supplied"), jadi pemotongan pindah ke sini. Tanpa batas ini Beranda
     merender 400 baris lagu — empat kali lipat, dan sisanya tidak pernah
     terlihat di atas lipatan. */
  return shelf.items.length > HOME_SHELF_SIZE
    ? { ...shelf, items: shelf.items.slice(0, HOME_SHELF_SIZE) }
    : shelf;
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
  /* TIGA permintaan paralel, bukan satu: `/artist` hanya mengirim identitas
     (nama, foto, genre) — relasi lagunya hilang dan albumnya cuma stub.
     Paralel supaya totalnya selebar permintaan terlambat (~350ms), bukan
     tiga kali latensi. Yang gagal jadi null per-bagian, bukan membatalkan
     artisnya. */
  const [base, songs, albums] = await Promise.all([
    apiArtist(artistId),
    apiArtistSongs(artistId),
    apiArtistAlbums(artistId),
  ]);
  return toArtistFromParts(base, songs, albums);
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
