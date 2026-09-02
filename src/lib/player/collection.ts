/**
 * Riwayat & favorit — logika MURNI, tanpa localStorage dan tanpa React.
 *
 * Kenapa dipisah begitu: yang mudah salah di fitur ini bukan penyimpanannya,
 * tapi ATURAN-nya — urutan riwayat, deduplikasi, batas jumlah, dan yang paling
 * penting: bertahan terhadap isi localStorage yang tidak sesuai harapan.
 * localStorage adalah data yang dikendalikan pengguna: bisa diedit tangan, bisa
 * berisi bentuk dari versi app yang lebih lama, bisa terpotong. Kalau parsernya
 * melempar, seluruh aplikasi ikut mati saat dimuat.
 *
 * Tanpa akun dan tanpa database — itu keputusan final di BRIEF.md. Konsekuensi
 * yang harus diterima: koleksi terikat pada satu browser di satu perangkat.
 */

import type { Track } from '@/lib/types';

/**
 * Versi skema. Dinaikkan kalau bentuk `Track` berubah tidak kompatibel; data
 * versi lama DIBUANG, bukan ditebak-migrasikan. Riwayat putar bukan data yang
 * layak dipertahankan dengan risiko merender bentuk yang salah.
 */
export const COLLECTION_VERSION = 1;

/** Riwayat dibatasi supaya localStorage tidak tumbuh tanpa batas. */
export const MAX_HISTORY = 100;

/** Favorit jauh lebih besar: ini yang sengaja dikumpulkan pengguna. */
export const MAX_FAVORITES = 500;

export interface Collection {
  version: number;
  /** Terbaru di DEPAN. */
  history: Track[];
  /** Terbaru di DEPAN, supaya yang baru ditandai langsung terlihat. */
  favorites: Track[];
}

export const emptyCollection: Collection = {
  version: COLLECTION_VERSION,
  history: [],
  favorites: [],
};

function isRec(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Terima sebuah entri hanya kalau field yang BENAR-BENAR dipakai renderer ada
 * dan bertipe benar. Sisanya diisi nilai aman.
 *
 * `audio` sengaja selalu dibuang: sumber audio YouTube kedaluwarsa dan
 * menyimpannya berarti mencoba memutar videoId yang mungkin sudah mati. Ia
 * dijembatani ulang saat lagunya diklik.
 */
function toStoredTrack(value: unknown): Track | null {
  if (!isRec(value)) return null;
  if (typeof value.id !== 'string' || value.id.length === 0) return null;
  if (typeof value.title !== 'string' || typeof value.artist !== 'string') return null;

  const artwork = isRec(value.artwork) && typeof value.artwork.template === 'string'
    ? {
        template: value.artwork.template,
        width: typeof value.artwork.width === 'number' ? value.artwork.width : null,
        height: typeof value.artwork.height === 'number' ? value.artwork.height : null,
        bgColor: typeof value.artwork.bgColor === 'string' ? value.artwork.bgColor : null,
        textColors: Array.isArray(value.artwork.textColors)
          ? value.artwork.textColors.filter((c): c is string => typeof c === 'string')
          : [],
      }
    : null;

  return {
    id: value.id,
    title: value.title,
    artist: value.artist,
    album: typeof value.album === 'string' ? value.album : null,
    durationSeconds:
      typeof value.durationSeconds === 'number' && Number.isFinite(value.durationSeconds)
        ? value.durationSeconds
        : 0,
    isrc: typeof value.isrc === 'string' ? value.isrc : null,
    hasLyrics: value.hasLyrics === true,
    artwork,
    trackNumber: typeof value.trackNumber === 'number' ? value.trackNumber : null,
    discNumber: typeof value.discNumber === 'number' ? value.discNumber : null,
    explicit: value.explicit === true,
    audio: null,
  };
}

/** Bentuk yang disimpan: `audio` dibuang, sisanya apa adanya. */
export function forStorage(track: Track): Track {
  return { ...track, audio: null };
}

/**
 * Baca isi localStorage. TIDAK PERNAH melempar dan tidak pernah mengembalikan
 * bentuk setengah benar — entri yang tidak lolos validasi dibuang satu per satu,
 * jadi satu entri rusak tidak menghapus seluruh koleksi.
 */
export function parseCollection(raw: string | null): Collection {
  if (raw === null || raw.length === 0) return emptyCollection;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyCollection;
  }

  if (!isRec(parsed)) return emptyCollection;
  if (parsed.version !== COLLECTION_VERSION) return emptyCollection;

  const readList = (value: unknown, max: number): Track[] => {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const entry of value) {
      const track = toStoredTrack(entry);
      if (track === null || seen.has(track.id)) continue;
      seen.add(track.id);
      out.push(track);
      if (out.length >= max) break;
    }
    return out;
  };

  return {
    version: COLLECTION_VERSION,
    history: readList(parsed.history, MAX_HISTORY),
    favorites: readList(parsed.favorites, MAX_FAVORITES),
  };
}

/**
 * Catat satu lagu sebagai baru diputar.
 *
 * Lagu yang sudah ada DIPINDAHKAN ke depan alih-alih ditambahkan lagi: riwayat
 * yang berisi lagu yang sama sepuluh kali berturut-turut karena pengguna
 * memutarnya berulang bukan riwayat, itu log.
 */
export function withPlayed(collection: Collection, track: Track): Collection {
  const stored = forStorage(track);
  const rest = collection.history.filter((t) => t.id !== stored.id);
  return {
    ...collection,
    history: [stored, ...rest].slice(0, MAX_HISTORY),
  };
}

export function isFavorite(collection: Collection, trackId: string): boolean {
  return collection.favorites.some((t) => t.id === trackId);
}

/** Tambah kalau belum ada, buang kalau sudah. */
export function withFavoriteToggled(collection: Collection, track: Track): Collection {
  if (isFavorite(collection, track.id)) {
    return {
      ...collection,
      favorites: collection.favorites.filter((t) => t.id !== track.id),
    };
  }
  return {
    ...collection,
    favorites: [forStorage(track), ...collection.favorites].slice(0, MAX_FAVORITES),
  };
}

export function withHistoryCleared(collection: Collection): Collection {
  return { ...collection, history: [] };
}
