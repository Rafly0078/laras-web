/**
 * Lapisan katalog tingkat-halaman: memanggil relay, menormalkan, mengembalikan
 * tipe internal. Halaman TIDAK PERNAH memanggil `client.ts` langsung.
 *
 * Semua fungsi mengembalikan bentuk yang aman untuk dirender (null / array
 * kosong saat gagal), sehingga halaman tidak perlu try/catch dan tidak akan
 * jatuh ke layar error hanya karena relay lambat.
 */

import 'server-only';

import {
  artistIdsBySong,
  similarArtistIds,
  similarArtistsOf,
  toAlbumResponse,
  toArtistFromParts,
  toTrack,
  topSongsByArtist,
} from '@/lib/data/apple';
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
  apiArtistsBatch,
  apiLyrics,
  apiPlaylist,
  apiSearch,
  apiSong,
  apiSongsBatch,
} from '@/lib/data/client';
import { fetchLrclibLyrics } from '@/lib/data/lrclib-client';
import { homePlaylistBySlug, HOME_PLAYLISTS } from '@/lib/data/playlists';
import {
  dedupeDiscovery,
  discoveryArtistId,
  pickTopResult,
  type TopResult,
} from '@/lib/data/search-rank';
import {
  MAX_SEED_ARTISTS,
  buildRecommendationShelf,
  mergeSimilarArtists,
  type RecommendationCandidate,
} from '@/lib/home/recommend';
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

/**
 * Hasil pencarian yang sudah diperkaya: kartu teratas + rak penemuan.
 *
 * `top` bisa null — itu jawaban yang sah dan penting (lihat `pickTopResult`).
 * `artistTracks` dan `similarArtists` kosong kalau tidak ada artis jangkar yang
 * meyakinkan; halaman merender apa yang ada, bukan tempat kosong berjudul.
 */
export interface SearchWithDiscovery {
  results: SearchResults;
  top: TopResult | null;
  /** Nama artis jangkar, untuk judul rak ("Lagu lain dari Tulus"). */
  anchorArtistName?: string;
  artistTracks: Track[];
  similarArtists: Artist[];
}

type Rec = Record<string, unknown>;

/** Jumlah kartu maksimum per rak Home (lihat `loadHomeShelf`). */
const HOME_SHELF_SIZE = 30;

/**
 * Lagu riwayat terbaru yang di-lookup id artisnya.
 *
 * `seedArtistIds` berhenti di 3 artis, tapi tiga lagu pertama bisa berasal dari
 * artis yang sama — jadi jendelanya lebih lebar dari jumlah benih supaya
 * pengguna yang baru saja memutar satu album tetap dapat tiga artis benih.
 */
const RECOMMENDATION_LOOKUP = 12;

function isRec(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/* ── Pencarian ─────────────────────────────────────────────────────────── */

export async function searchCatalog(query: string): Promise<SearchResults> {
  const raw = await apiSearch(query, 'songs,albums,artists,playlists', 24);
  // toSearchResults sudah tahan terhadap null/sampah, jadi tidak perlu cabang.
  return toSearchResults(query, raw);
}

/**
 * Hasil pencarian + kartu "Hasil teratas" + rak penemuan.
 *
 * KENAPA ADA LAPIS TAMBAHAN INI: mencari "Teh Hijau" mengembalikan 24 lagu yang
 * SEMUANYA punya ISRC berbeda — bukan duplikat, tapi 23 lagu lain (DJ remix,
 * cover, satu akun yang mengunggah "GREEN TEA DC" tiga kali). Yang asli tenggelam
 * di antara mereka. Karena bukan duplikasi, dedup tidak menyelesaikan apa pun;
 * yang dibutuhkan adalah isyarat MANA yang dimaksud, dan jalan keluar dari
 * daftar itu.
 *
 * DUA permintaan relay, PARALEL setelah yang pertama selesai:
 *  1. `/search` — hasil apa adanya.
 *  2. `views=top-songs,similar-artists` untuk artis jangkar — "lagu lain dari
 *     artis ini" dan "artis serupa". Relay TIDAK mengirim id artis di hasil
 *     pencarian (terukur: item hasil tidak punya `relationships`), jadi
 *     jangkarnya dicocokkan dari nama — lihat `discoveryArtistId`.
 *
 * Permintaan kedua DILEWATI kalau tidak ada jangkar yang meyakinkan. Rak
 * penemuan yang menampilkan artis salah lebih buruk daripada tidak ada rak.
 */
export async function searchWithDiscovery(query: string): Promise<SearchWithDiscovery> {
  const results = await searchCatalog(query);

  const top = pickTopResult(results);
  const artistId = discoveryArtistId(top, results.artists);

  if (artistId === null) {
    return { results, top, artistTracks: [], similarArtists: [] };
  }

  const raw = await apiArtistsBatch([artistId], 'top-songs,similar-artists');

  /* Nama artis jangkar diambil dari hasil pencarian, bukan dari respons batch:
     keduanya sama, dan memakai yang sudah ada menghemat satu penelusuran. */
  const anchorName =
    top?.kind === 'artist'
      ? top.artist.name
      : top?.kind === 'track'
        ? top.track.artist
        : (top?.album.artist ?? '');

  return {
    results,
    top,
    anchorArtistName: anchorName,
    artistTracks: dedupeDiscovery(
      topSongsByArtist(raw).get(artistId) ?? [],
      top,
      results.tracks,
    ),
    similarArtists: similarArtistsOf(raw).get(artistId) ?? [],
  };
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

/* ── Rekomendasi ───────────────────────────────────────────────────────── */

/**
 * Lagu yang direkomendasikan dari riwayat pengguna.
 *
 * TIGA permintaan relay, berurutan karena masing-masing butuh hasil sebelumnya
 * (terukur total ~3,9 detik / 176KB):
 *
 *  1. `apiSongsBatch(idRiwayat)` → id artis tiap lagu. Riwayat di localStorage
 *     hanya menyimpan bentuk `Track`, yang TIDAK punya id artis — dan hasil
 *     `/search` juga tidak membawanya, jadi lookup ini tidak bisa dihindari.
 *  2. `views=similar-artists` untuk artis benih → daftar artis mirip.
 *  3. `views=top-songs` untuk artis mirip → kandidat lagunya.
 *
 * Ketiganya BATCH (`?ids=a,b,c`), jadi jumlah artis tidak menambah jumlah
 * permintaan — hanya ukuran responsnya. Tanpa batch, langkah 3 sendirian
 * berarti 12 permintaan berurutan.
 *
 * Kegagalan di langkah mana pun mengembalikan array kosong, bukan melempar:
 * rak yang tidak muncul jauh lebih baik daripada Beranda yang jadi layar error
 * karena relay sedang lambat.
 *
 * Penyusunan akhirnya (buang yang sudah didengar, batasi per artis, acak
 * berbenih) ada di `lib/home/recommend.ts` — logika murni, teruji tanpa
 * jaringan.
 */
export async function loadRecommendations(historyIds: string[]): Promise<Track[]> {
  if (historyIds.length === 0) return [];

  /* Hanya lagu terbaru yang di-lookup. Meminta 100 id riwayat berarti respons
     besar yang 97 barisnya tidak pernah dipakai — `seedArtistIds` berhenti di
     tiga artis pertama. */
  const lookupIds = historyIds.slice(0, RECOMMENDATION_LOOKUP);

  const songsRaw = await apiSongsBatch(lookupIds);
  const artistOfSong = artistIdsBySong(songsRaw);
  if (artistOfSong.size === 0) return [];

  /* Urutan riwayat DIPERTAHANKAN: peta di atas tidak menjamin urutan relay,
     sementara "artis terbaru" adalah inti aturan benih. */
  const seeds: string[] = [];
  for (const id of lookupIds) {
    const artistId = artistOfSong.get(id);
    if (artistId === undefined || seeds.includes(artistId)) continue;
    seeds.push(artistId);
    if (seeds.length >= MAX_SEED_ARTISTS) break;
  }
  if (seeds.length === 0) return [];

  const similarRaw = await apiArtistsBatch(seeds, 'similar-artists');
  const similarPerSeed = similarArtistIds(similarRaw);
  const similar = mergeSimilarArtists(
    seeds.map((id) => similarPerSeed.get(id) ?? []),
    seeds,
  );
  if (similar.length === 0) return [];

  const topRaw = await apiArtistsBatch(similar, 'top-songs');
  const topPerArtist = topSongsByArtist(topRaw);

  const candidates: RecommendationCandidate[] = [];
  for (const artistId of similar) {
    for (const track of topPerArtist.get(artistId) ?? []) {
      candidates.push({ track, artistId });
    }
  }

  /* Riwayat penuh dikirim sebagai daftar "sudah didengar" — bukan hanya yang
     di-lookup. Lagu yang diputar bulan lalu tetap bukan penemuan. */
  const heard: Track[] = historyIds.map((id) => ({
    id,
    title: '',
    artist: '',
    album: null,
    durationSeconds: 0,
    isrc: null,
    hasLyrics: false,
    artwork: null,
    trackNumber: null,
    discNumber: null,
    explicit: false,
    audio: null,
  }));

  return buildRecommendationShelf(candidates, heard, {
    /* Benih dari riwayat, bukan dari daftar kandidat: dua pengunjung dengan
       riwayat berbeda mendapat urutan berbeda walau artis miripnya sama. */
    seed: lookupIds.join(','),
  });
}
