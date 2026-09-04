/**
 * Rekomendasi "Untukmu" — logika MURNI (tanpa jaringan, tanpa React).
 *
 * Aturannya yang mudah salah, bukan pengambilan datanya: artis mana yang
 * mewakili selera pengguna, bagaimana 120 kandidat lagu dipilih menjadi 30 agar
 * tidak didominasi satu artis, dan bagaimana urutannya tetap SAMA antar
 * kunjungan. Semua itu bisa diuji di Node tanpa browser dan tanpa relay.
 *
 * KENAPA ARTIS MIRIP, BUKAN GENRE: `genreNames` Apple untuk sebuah lagu pop
 * Indonesia terukur hanya `["Pop", "Music"]` — terlalu kasar untuk membedakan
 * apa pun, dan hasilnya nyaris identik dengan rak "Top 100 Indonesia" yang
 * sudah ada di Beranda. `views=similar-artists` mengembalikan artis sungguhan
 * (dari Tulus: Yura Yunita, Raisa, HIVI!, MALIQ & D'Essentials), jadi itulah
 * sinyal yang dipakai.
 */

import type { Track } from '@/lib/types';

/** Artis teratas riwayat yang dijadikan benih. Lihat `seedArtistIds`. */
export const MAX_SEED_ARTISTS = 3;

/**
 * Artis mirip yang lagunya diambil.
 *
 * Terukur: 3 artis benih menghasilkan ~15 artis mirip unik, dan meminta 12 di
 * antaranya (batch `?ids=`) dibalas dalam 2,0 detik / 176KB. Menaikkannya
 * menambah berat tanpa menambah variasi — 12 artis sudah memberi 120 kandidat
 * untuk rak berisi 30.
 */
export const MAX_SIMILAR_ARTISTS = 12;

/** Panjang rak. Sama dengan rak Beranda lain (`HOME_SHELF_SIZE`). */
export const RECOMMENDATION_SIZE = 30;

/**
 * Batas lagu per artis di dalam rak.
 *
 * Tanpa batas ini, artis yang punya 10 top-songs bisa mengisi sepertiga rak dan
 * rekomendasinya terasa seperti halaman artis, bukan penemuan.
 */
export const MAX_PER_ARTIST = 3;

/** Satu lagu kandidat beserta artis mirip yang menyumbangkannya. */
export interface RecommendationCandidate {
  track: Track;
  /** id artis Apple yang top-songs-nya memuat lagu ini. */
  artistId: string;
}

/**
 * Id artis benih: artis dari lagu-lagu TERBARU di riwayat.
 *
 * Terbaru, bukan terbanyak: selera bergerak, dan riwayat 100 entri berarti
 * "terbanyak" bisa didominasi fase mendengarkan bulan lalu. Urutan riwayat
 * (terbaru di depan) sudah dijamin `withPlayed`.
 *
 * Dedup mempertahankan kemunculan pertama, jadi memutar satu artis lima kali
 * berturut-turut tidak menghabiskan kuota benih.
 */
export function seedArtistIds(
  artistIdOf: (track: Track) => string | null,
  history: Track[],
  max = MAX_SEED_ARTISTS,
): string[] {
  const out: string[] = [];
  for (const track of history) {
    const id = artistIdOf(track);
    if (id === null || id.length === 0) continue;
    if (out.includes(id)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Gabungkan daftar artis mirip dari beberapa artis benih.
 *
 * Artis yang muncul di daftar mirip LEBIH DARI SATU benih didahulukan: kalau
 * Raisa mirip dengan dua artis yang kamu dengar, ia lebih relevan daripada
 * artis yang cuma muncul sekali. Selain itu urutan aslinya (peringkat Apple)
 * dipertahankan, jadi pengurutan ini stabil dan tidak butuh pengacakan.
 *
 * Artis benih itu sendiri DIBUANG dari hasil — Apple kadang memasukkan artis
 * ke daftar miripnya sendiri, dan merekomendasikan artis yang baru saja kamu
 * dengar bukan penemuan.
 */
export function mergeSimilarArtists(
  perSeed: string[][],
  seedIds: string[],
  max = MAX_SIMILAR_ARTISTS,
): string[] {
  const seeds = new Set(seedIds);
  const count = new Map<string, number>();
  const firstSeen = new Map<string, number>();

  let position = 0;
  for (const list of perSeed) {
    for (const id of list) {
      if (id.length === 0 || seeds.has(id)) continue;
      count.set(id, (count.get(id) ?? 0) + 1);
      if (!firstSeen.has(id)) firstSeen.set(id, position);
      position += 1;
    }
  }

  return [...count.keys()]
    .sort((a, b) => {
      const byCount = (count.get(b) ?? 0) - (count.get(a) ?? 0);
      if (byCount !== 0) return byCount;
      return (firstSeen.get(a) ?? 0) - (firstSeen.get(b) ?? 0);
    })
    .slice(0, max);
}

/**
 * Hash string 32-bit (FNV-1a).
 *
 * Dipakai sebagai benih pengacakan supaya urutan rak DITENTUKAN oleh riwayat,
 * bukan oleh jam. `Math.random()` akan mengubah rak setiap render — termasuk
 * setiap kali React me-remount komponennya — dan itu membuat pengguna kehilangan
 * lagu yang baru saja ia lihat. Sama seperti pantangan `Math.random()` di
 * initializer state: hasil render harus deterministik.
 */
export function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    /* Math.imul supaya perkalian tetap 32-bit; `*` biasa akan melewati batas
       presisi Number dan hasilnya berbeda antar mesin. */
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Pengacak deterministik (mulberry32) — angka acak yang SAMA untuk benih sama.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Susun rak akhir dari kandidat.
 *
 * Empat aturan, berurutan:
 *  1. Buang lagu yang sudah ada di riwayat — merekomendasikan yang baru saja
 *     diputar adalah kegagalan paling terasa dari fitur ini.
 *  2. Buang duplikat id (satu lagu bisa muncul di top-songs dua artis).
 *  3. Batasi `MAX_PER_ARTIST` per artis, supaya rak tidak dikuasai satu nama.
 *  4. Acak dengan benih dari daftar artis mirip, lalu potong.
 *
 * Pengacakan terjadi TERAKHIR: mengacak sebelum pembatasan per-artis membuat
 * artis mana yang lolos ikut berubah, dan itu membuang keunggulan peringkat
 * Apple (top-songs terurut popularitas).
 */
export function buildRecommendationShelf(
  candidates: RecommendationCandidate[],
  history: Track[],
  options: { size?: number; maxPerArtist?: number; seed?: string } = {},
): Track[] {
  const size = options.size ?? RECOMMENDATION_SIZE;
  const maxPerArtist = options.maxPerArtist ?? MAX_PER_ARTIST;

  const heard = new Set(history.map((t) => t.id));
  const seen = new Set<string>();
  const perArtist = new Map<string, number>();
  const kept: Track[] = [];

  for (const { track, artistId } of candidates) {
    if (heard.has(track.id) || seen.has(track.id)) continue;
    const used = perArtist.get(artistId) ?? 0;
    if (used >= maxPerArtist) continue;

    seen.add(track.id);
    perArtist.set(artistId, used + 1);
    kept.push(track);
  }

  /* Benih default dari susunan kandidat: dua kunjungan dengan riwayat yang sama
     menghasilkan rak yang sama, dan riwayat yang berubah mengubah urutannya. */
  const seedSource =
    options.seed ?? candidates.map((c) => c.artistId).join(',');
  const random = seededRandom(hashSeed(seedSource));

  /* Fisher-Yates dengan pengacak berbenih. */
  for (let i = kept.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [kept[i], kept[j]] = [kept[j], kept[i]];
  }

  return kept.slice(0, size);
}
