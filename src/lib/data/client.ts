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
import { relayCoalescer } from '@/lib/data/coalesce';

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
 * Ambil JSON dari sebuah URL absolut. Mengembalikan null untuk SEMUA kegagalan.
 *
 * Dipakai bersama oleh relay Apple dan LRCLIB — keduanya butuh perilaku yang
 * sama persis (timeout, penggabungan, null saat gagal) dan hanya berbeda header
 * serta batas waktunya. Menulisnya dua kali berarti dua tempat yang bisa lupa
 * memasang AbortSignal.
 *
 * Kegagalan yang ditangani: timeout, jaringan mati, status non-200, dan body
 * yang bukan JSON. Tiga-tiganya pernah terjadi pada host sejenis.
 *
 * Permintaan dengan URL yang sama dan sedang berjalan DIGABUNG jadi satu
 * (lihat `coalesce.ts`): cache Next belum berisi apa pun selama sepuluh detik
 * pertama sebuah lagu baru, jadi tanpa penggabungan sepuluh pengunjung berarti
 * sepuluh panggilan keluar.
 *
 * Konsekuensinya: dua pemanggil bisa menerima objek yang SAMA, bukan salinan.
 * Jangan memutasi hasil fungsi ini — perlakukan sebagai read-only. Semua
 * adapter di `apple.ts`/`innertube.ts` memang hanya membaca.
 */
export async function requestJson(
  url: string,
  init: {
    headers: Record<string, string>;
    timeoutMs: number;
    revalidate: number;
    tags?: string[];
  },
): Promise<unknown> {
  return relayCoalescer.run(url, async () => {
    // AbortSignal dipasang manual, bukan AbortSignal.timeout: timer-nya perlu
    // dibersihkan di `finally` supaya proses tidak ditahan menunggu timer mati.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs);

    try {
      const response = await fetch(url, {
        headers: init.headers,
        signal: controller.signal,
        // Cache Next: kunci di-derive dari URL + opsi, jadi dua halaman yang
        // meminta data sama dalam satu render hanya memicu satu permintaan.
        next: { revalidate: init.revalidate, tags: init.tags },
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
  });
}

/** Ambil JSON dari relay Apple. */
export async function fetchJson(
  path: string,
  params: Record<string, string | number | undefined>,
  options: AppleFetchOptions,
): Promise<unknown> {
  return requestJson(buildUrl(path, params), {
    headers: HEADERS,
    timeoutMs: options.slow ? TIMEOUT_MS.lyrics : TIMEOUT_MS.default,
    revalidate: options.revalidate,
    tags: options.tags,
  });
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
 * Satu playlist editorial: metadata + seluruh track sekaligus.
 *
 * CATATAN (berubah 2026-09, terverifikasi ulang terhadap openapi relay):
 * `/playlist/tracks` MATI — balas 404 untuk id yang dulu jalan. Yang hidup
 * `/playlist?playlist=`; ia mengirim `data[0].relationships.tracks.data`
 * (bentuk Apple penuh, 100 track) plus metadata playlist (nama, kurator,
 * artwork). `limit` DILARANG di endpoint ini — relay membalas 400 "Limit may
 * not be supplied on this request", jadi parameter itu sengaja tidak dikirim.
 */
export async function apiPlaylist(playlistId: string): Promise<unknown> {
  return fetchJson(
    '/playlist',
    { playlist: playlistId, storefront: STOREFRONT, l: LANGUAGE },
    { revalidate: TTL.playlist, tags: [`playlist:${playlistId}`] },
  );
}

/**
 * Metadata satu lagu.
 *
 * `/song?song=` MATI (404) sejak relay berganti rute; yang hidup bentuk path
 * `/song/<id>` (alias dinamis `/{resource}/{id}`, storefront default `us` —
 * karena itu `storefront` tetap dikirim eksplisit supaya artwork/preview id
 * storefront Indonesia). Bentuk responsnya sama: `{ data: [ { attributes } ] }`.
 */
export async function apiSong(appleTrackId: string): Promise<unknown> {
  return fetchJson(
    `/song/${encodeURIComponent(appleTrackId)}`,
    { storefront: STOREFRONT },
    { revalidate: TTL.album, tags: [`song:${appleTrackId}`] },
  );
}

/** Lagu teratas seorang artis — `/artist` tidak lagi mengirimnya inline. */
export async function apiArtistSongs(artistId: string): Promise<unknown> {
  return fetchJson(
    '/artist/songs',
    { artist: artistId, storefront: STOREFRONT, l: LANGUAGE },
    { revalidate: TTL.artist, tags: [`artist-songs:${artistId}`] },
  );
}

/** Diskografi seorang artis dengan attributes penuh (relasi di `/artist`
 *  hanya stub `{id,type,href}` — tanpa judul, tanpa artwork). */
export async function apiArtistAlbums(artistId: string): Promise<unknown> {
  return fetchJson(
    '/artist/albums',
    { artist: artistId, storefront: STOREFRONT, l: LANGUAGE },
    { revalidate: TTL.artist, tags: [`artist-albums:${artistId}`] },
  );
}

/* ── Batch (jalur `/v1/catalog/...`) ──────────────────────────────────────
 *
 * Relay meneruskan bentuk MusicKit penuh di `/v1/catalog/<storefront>/...`,
 * dan di jalur itu dua kemampuan yang tidak ada di endpoint pendek jadi
 * tersedia — keduanya terukur, bukan diasumsikan:
 *
 *  - `?ids=a,b,c` mengambil BANYAK sumber daya dalam satu permintaan. Terukur:
 *    12 artis + `views=top-songs` dibalas dalam 2,0 detik / 176KB. Tanpa batch
 *    itu 12 permintaan berurutan.
 *  - `?views=...` menyertakan relasi turunan yang tidak punya endpoint sendiri.
 *    `similar-artists` (10 artis) dan `top-songs` (10 lagu) hanya bisa didapat
 *    lewat ini; `/v1/catalog/us/artists/<id>/similar-artists` membalas 400
 *    "No relationship found".
 *
 * Bentuk balasannya `{ data: [ { id, attributes, views: { <nama>: { data } } } ] }`.
 */

/** Batas panjang daftar id per permintaan — URL yang terlalu panjang ditolak. */
const MAX_BATCH_IDS = 25;

function batchPath(resource: 'songs' | 'artists'): string {
  return `/v1/catalog/${STOREFRONT}/${resource}`;
}

/**
 * Beberapa lagu sekaligus, LENGKAP dengan `relationships.artists`.
 *
 * Kenapa perlu: `/search` dan riwayat localStorage sama-sama tidak membawa id
 * artis (terukur: hasil `/search` tidak punya `relationships` sama sekali),
 * sedangkan rekomendasi butuh id itu sebagai titik awal. `/song/<id>` membawanya
 * tapi satu per satu.
 */
export async function apiSongsBatch(trackIds: string[]): Promise<unknown> {
  const ids = trackIds.slice(0, MAX_BATCH_IDS);
  if (ids.length === 0) return null;
  return fetchJson(
    batchPath('songs'),
    { ids: ids.join(','), l: LANGUAGE },
    { revalidate: TTL.album, tags: ['songs-batch'] },
  );
}

/**
 * Beberapa artis sekaligus dengan view yang diminta.
 *
 * `views` dikirim apa adanya (mis. `'similar-artists,top-songs'`). TTL memakai
 * `artist` (12 jam): daftar artis mirip dan lagu teratas berubah pelan, dan
 * rekomendasi tidak perlu mutakhir sampai ke menit.
 */
export async function apiArtistsBatch(
  artistIds: string[],
  views: string,
): Promise<unknown> {
  const ids = artistIds.slice(0, MAX_BATCH_IDS);
  if (ids.length === 0) return null;
  return fetchJson(
    batchPath('artists'),
    { ids: ids.join(','), views, l: LANGUAGE },
    { revalidate: TTL.artist, tags: ['artists-batch'] },
  );
}
