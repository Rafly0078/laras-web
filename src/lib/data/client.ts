/**
 * Klien HTTP ke katalog Apple Music (lewat relay Lyricsflow).
 *
 * Dua hal yang membuat file ini ada, bukan sekadar `fetch` langsung di halaman:
 *
 * 1. LATENSI. Endpoint `/lyrics` butuh 9,8–11,7 detik untuk lagu yang belum
 *    pernah diminta, lalu 310–620ms sesudahnya (relay cache di sisi mereka).
 *    Sebelas detik tidak boleh ada di jalur render, jadi setiap respons
 *    di-cache di sisi kita juga dengan masa hidup yang berbeda per jenis data.
 *
 * 2. KEGAGALAN. Relay pihak ketiga bisa mati, lambat, atau membalas bentuk
 *    yang berubah. Semua fungsi di sini mengembalikan `null` saat gagal dan
 *    TIDAK PERNAH melempar — halaman memutuskan sendiri apa yang ditampilkan.
 *    Melempar dari server component berarti seluruh halaman jadi layar error.
 */

import type { AppleFetchOptions } from '@/lib/data/api-types';

/** Basis relay. Bisa ditimpa lewat env kalau host berganti. */
const BASE_URL = process.env.APPLE_CATALOG_BASE ?? 'https://api.spicyamll.online';

/** Storefront + bahasa default: Indonesia. */
export const STOREFRONT = 'id';
export const LANGUAGE = 'id';

/**
 * Masa hidup cache per jenis data (detik).
 *
 * Lirik tidak pernah berubah untuk track id yang sama, jadi disimpan sangat
 * lama. Katalog berubah pelan (album baru, playlist editorial dirotasi
 * harian). Pencarian paling pendek karena paling sering diketik ulang.
 */
export const TTL = {
  lyrics: 60 * 60 * 24 * 30,
  album: 60 * 60 * 24,
  artist: 60 * 60 * 12,
  playlist: 60 * 60 * 6,
  search: 60 * 10,
} as const;

/**
 * Batas waktu satu permintaan.
 *
 * Lebih longgar untuk lirik karena 11 detik itu WAJAR di jalur cold. Untuk
 * yang lain, permintaan yang lewat 15 detik lebih baik dianggap gagal daripada
 * menahan render.
 */
const TIMEOUT_MS = {
  lyrics: 25_000,
  default: 15_000,
} as const;

/**
 * Relay menolak permintaan tanpa User-Agent browser dengan 403.
 *
 * Ini sudah terverifikasi pada host sejenis: permintaan identik dengan UA
 * urllib dibalas 403 sementara UA Chrome dibalas 200. Jangan simpulkan key
 * atau host mati sebelum mencoba dengan header ini.
 */
const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

/** Bangun URL dengan query yang sudah di-encode. */
function buildUrl(path: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * Ambil JSON dari relay. Mengembalikan null untuk SEMUA kegagalan.
 *
 * Kegagalan yang ditangani: timeout, jaringan mati, status non-200, dan body
 * yang bukan JSON. Tiga-tiganya pernah terjadi pada host sejenis.
 */
export async function fetchJson(
  path: string,
  params: Record<string, string | number | undefined>,
  options: AppleFetchOptions,
): Promise<unknown> {
  const url = buildUrl(path, params);
  const timeout = options.slow ? TIMEOUT_MS.lyrics : TIMEOUT_MS.default;

  // AbortSignal.timeout tersedia di Node 18+; membungkus fetch supaya
  // permintaan yang menggantung tidak menahan render tanpa batas.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      headers: HEADERS,
      signal: controller.signal,
      // Cache Next: kunci di-derive dari URL + opsi, jadi dua halaman yang
      // meminta data sama dalam satu render hanya memicu satu permintaan.
      next: { revalidate: options.revalidate, tags: options.tags },
    });

    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    // Termasuk AbortError saat timeout. Sengaja tidak dibedakan: pemanggil
    // tidak punya tindakan berbeda untuk masing-masing.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ── Endpoint ──────────────────────────────────────────────────────────── */

export async function apiSearch(
  term: string,
  types: string,
  limit: number,
): Promise<unknown> {
  if (term.trim().length === 0) return null;
  return fetchJson(
    '/search',
    { term, types, limit, storefront: STOREFRONT, l: LANGUAGE },
    { revalidate: TTL.search, tags: ['search'] },
  );
}

export async function apiLyrics(appleTrackId: string): Promise<unknown> {
  return fetchJson(
    '/lyrics',
    { song: appleTrackId },
    { revalidate: TTL.lyrics, tags: [`lyrics:${appleTrackId}`], slow: true },
  );
}

export async function apiAlbum(albumId: string): Promise<unknown> {
  return fetchJson(
    '/album',
    { album: albumId, storefront: STOREFRONT, l: LANGUAGE },
    { revalidate: TTL.album, tags: [`album:${albumId}`] },
  );
}

export async function apiArtist(artistId: string): Promise<unknown> {
  return fetchJson(
    '/artist',
    { artist: artistId, storefront: STOREFRONT, l: LANGUAGE },
    { revalidate: TTL.artist, tags: [`artist:${artistId}`] },
  );
}

/**
 * Daftar track sebuah playlist.
 *
 * CATATAN: endpoint-nya `/playlist/tracks`, BUKAN `/playlist`. Yang kedua
 * membalas 404 — sudah diverifikasi. Metadata playlist (nama, kurator) tidak
 * ada di sini; ambil lewat `/search?types=playlists`.
 */
export async function apiPlaylistTracks(
  playlistId: string,
  limit: number,
): Promise<unknown> {
  return fetchJson(
    '/playlist/tracks',
    { playlist: playlistId, limit, storefront: STOREFRONT, l: LANGUAGE },
    { revalidate: TTL.playlist, tags: [`playlist:${playlistId}`] },
  );
}

export async function apiSong(appleTrackId: string): Promise<unknown> {
  return fetchJson(
    '/song',
    { song: appleTrackId, storefront: STOREFRONT, l: LANGUAGE },
    { revalidate: TTL.album, tags: [`song:${appleTrackId}`] },
  );
}
