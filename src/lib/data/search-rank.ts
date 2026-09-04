/**
 * Hasil teratas pencarian — logika MURNI.
 *
 * MASALAH YANG DIPERBAIKI: mencari "Teh Hijau" mengembalikan 24 lagu, dan yang
 * asli (Tulus) hanya satu di antaranya — sisanya DJ remix, cover, dan satu akun
 * yang mengunggah "GREEN TEA DC" tiga kali. Terukur pada 24 hasil itu: 24 ISRC
 * BERBEDA, nol duplikat. Jadi dedup tidak membuang satu baris pun; masalahnya
 * bukan duplikasi, tapi tidak adanya isyarat mana yang dimaksud pengguna.
 *
 * Yang dilakukan di sini: memilih SATU hasil untuk ditonjolkan. Sampahnya tetap
 * ada di daftar bawah — menyaringnya dengan kata kunci ("DJ", "Remix", "Slow")
 * akan menyembunyikan remix yang sah, dan itu kerusakan yang lebih sulit
 * disadari pengguna daripada daftar yang panjang.
 *
 * Relay TIDAK punya `types=top` (terukur: 400 "Unknown type 'top'"), jadi
 * peringkatnya dihitung di sini dari hasil yang sudah diurutkan relevansi oleh
 * Apple.
 */

import type { Album, Artist, SearchResults, Track } from '@/lib/types';

/** Hasil yang ditonjolkan di atas daftar. */
export type TopResult =
  | { kind: 'track'; track: Track; score: number }
  | { kind: 'artist'; artist: Artist; score: number }
  | { kind: 'album'; album: Album; score: number };

/**
 * Normalisasi untuk perbandingan.
 *
 * Apostrof DIHAPUS, bukan diganti spasi: "don't" harus tetap satu token, kalau
 * tidak ia dibandingkan sebagai "don t" dan tidak pernah cocok penuh. Pelajaran
 * yang sama sudah dibayar di matcher lirik Apple (LARAS Android).
 */
export function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Kemiripan nama terhadap kueri, 0..1.
 *
 * Bukan Levenshtein: yang perlu dibedakan di sini adalah "persis", "diawali",
 * dan "memuat" — dan ketiganya sudah cukup untuk memisahkan "Teh Hijau" dari
 * "Party Sentak Teh Hijau". Jarak edit justru memberi skor tinggi pada
 * "Teh Hijau Dulu" yang jelas lagu lain.
 */
export function nameScore(name: string, query: string): number {
  const a = normalise(name);
  const b = normalise(query);
  if (a.length === 0 || b.length === 0) return 0;
  if (a === b) return 1;
  if (a.startsWith(b)) return 0.75;
  if (a.includes(b)) return 0.5;

  /* Kueri yang memuat NAMA (pengguna mengetik "teh hijau tulus"): masih relevan,
     tapi lebih lemah daripada nama yang memuat kueri. */
  if (b.includes(a)) return 0.4;
  return 0;
}

/**
 * Bobot per jenis.
 *
 * Artis diberi bobot tertinggi karena kueri yang cocok PERSIS dengan nama artis
 * hampir selalu berarti "bawa saya ke artis itu" — sedangkan lagu berjudul sama
 * bisa berarti banyak hal. Lagu di atas album karena pencarian di aplikasi musik
 * lebih sering mencari lagu.
 */
const KIND_WEIGHT = { artist: 1.0, track: 0.95, album: 0.85 } as const;

/**
 * Bonus posisi: hasil pertama dari relay lebih dipercaya daripada hasil kelima.
 *
 * Relay sudah mengurutkan tiap grup berdasarkan relevansi Apple (terukur:
 * `songs[0]` untuk "Teh Hijau" adalah versi Tulus yang asli, artists[0] adalah
 * Tulus). Bonus ini memasukkan urutan itu ke dalam perhitungan alih-alih
 * mengabaikannya.
 */
function positionBonus(index: number): number {
  return index === 0 ? 0.12 : index === 1 ? 0.04 : 0;
}

/** Ambang skor minimum. Di bawah ini, tidak ada yang cukup yakin untuk ditonjolkan. */
export const TOP_RESULT_FLOOR = 0.6;

/**
 * Pilih satu hasil untuk ditonjolkan, atau null kalau tidak ada yang meyakinkan.
 *
 * Mengembalikan null adalah jawaban yang sah dan penting: kartu "Hasil teratas"
 * yang menampilkan tebakan acak lebih buruk daripada tidak ada kartu — ia
 * mengarahkan pengguna ke tempat yang salah dengan penuh keyakinan.
 */
export function pickTopResult(results: SearchResults): TopResult | null {
  const candidates: TopResult[] = [];

  results.artists.slice(0, 3).forEach((artist, i) => {
    const score = nameScore(artist.name, results.query) * KIND_WEIGHT.artist + positionBonus(i);
    candidates.push({ kind: 'artist', artist, score });
  });

  results.tracks.slice(0, 3).forEach((track, i) => {
    const score = nameScore(track.title, results.query) * KIND_WEIGHT.track + positionBonus(i);
    candidates.push({ kind: 'track', track, score });
  });

  results.albums.slice(0, 3).forEach((album, i) => {
    const score = nameScore(album.title, results.query) * KIND_WEIGHT.album + positionBonus(i);
    candidates.push({ kind: 'album', album, score });
  });

  if (candidates.length === 0) return null;

  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));
  return best.score >= TOP_RESULT_FLOOR ? best : null;
}

/**
 * Id artis yang jadi jangkar rak penemuan, atau null.
 *
 * Untuk hasil teratas berupa ARTIS, idnya langsung tersedia. Untuk lagu atau
 * album, id artisnya TIDAK ada di respons `/search` (terukur: item hasil
 * pencarian tidak punya `relationships` sama sekali) — jadi jangkarnya dicari
 * dengan mencocokkan nama artis ke daftar artis di hasil yang sama. Kalau tidak
 * ketemu, rak penemuan dilewati; satu permintaan tambahan untuk menebak id
 * bukan harga yang layak.
 */
export function discoveryArtistId(
  top: TopResult | null,
  artists: Artist[],
): string | null {
  if (top === null) return null;
  if (top.kind === 'artist') return top.artist.id;

  const name = top.kind === 'track' ? top.track.artist : top.album.artist;
  const target = normalise(name);
  if (target.length === 0) return null;

  const match = artists.find((a) => normalise(a.name) === target);
  return match?.id ?? null;
}

/**
 * Batas lagu penemuan, dan AMBANG MINIMUM agar raknya layak tampil.
 *
 * Ambangnya ada karena temuan yang mengejutkan: untuk "Teh Hijau" di storefront
 * Indonesia, daftar utama sudah memuat 8 lagu Tulus, jadi setelah dedup rak
 * penemuan tinggal SATU baris. Rak berjudul "Lagu lain dari Tulus" yang isinya
 * satu lagu bukan jalan keluar — ia hanya menambah judul tanpa menambah pilihan.
 *
 * (Catatan untuk yang mengukur ulang: probe dengan storefront default `us`
 * mengembalikan hanya 1 lagu Tulus dari 24 hasil, sehingga masalah "hasil asli
 * tenggelam" tampak jauh lebih parah daripada yang dialami pengguna Indonesia.
 * Selalu probe dengan `storefront=id` — itu yang dipakai app.)
 */
export const DISCOVERY_LIMIT = 10;
export const DISCOVERY_MIN = 3;

/**
 * Buang lagu yang sudah tampil di kartu hasil teratas, dan lagu yang sudah ada
 * di daftar utama.
 *
 * Tanpa ini rak "Lagu lain dari artis ini" mengulang baris yang persis sama
 * dengan yang baru dibaca pengguna dua sentimeter di atasnya.
 *
 * Mengembalikan array KOSONG kalau sisanya di bawah `DISCOVERY_MIN` — lihat
 * catatan di konstanta itu.
 */
export function dedupeDiscovery(
  discovery: Track[],
  top: TopResult | null,
  mainList: Track[],
  limit = DISCOVERY_LIMIT,
  min = DISCOVERY_MIN,
): Track[] {
  const seen = new Set(mainList.map((t) => t.id));
  if (top?.kind === 'track') seen.add(top.track.id);

  const out: Track[] = [];
  for (const track of discovery) {
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    out.push(track);
    if (out.length >= limit) break;
  }
  return out.length >= min ? out : [];
}
