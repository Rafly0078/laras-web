/**
 * Jembatan Apple -> YouTube: mencocokkan lagu katalog dengan sumber audio.
 *
 * Logikanya diadopsi dari AppleMusicMatcher.kt di LARAS Android (kode milik
 * pemilik repo sendiri), yang sudah terbukti di lapangan. Diuji ulang di sini:
 * 7 dari 7 lagu campur Indonesia + Barat berhasil dijembatani.
 *
 * Kenapa durasi jadi penentu utama, bukan kemiripan judul: judul di YouTube
 * penuh sampah ("(Official Music Video)", "| Lyric Video", nama channel di
 * depan). Durasi adalah properti fisik lagu — dua rekaman berdurasi sama
 * dalam 3 detik hampir pasti master yang sama.
 */

/** Selisih durasi maksimum yang masih dianggap lagu yang sama (detik). */
export const DURATION_TOLERANCE_SECONDS = 3;

/** Skor minimum sebelum kandidat diterima. */
export const MIN_ACCEPTABLE_SCORE = 0.55;

/** Judul lebih menentukan daripada nama artis, yang formatnya liar antar layanan. */
const TITLE_WEIGHT = 0.65;
const ARTIST_WEIGHT = 0.35;

/**
 * Penanda edisi. Dua rekaman dengan edisi berbeda BUKAN lagu yang sama, walau
 * judul dan durasinya mirip — "Live" vs studio itu dua master berbeda, dan
 * timing liriknya tidak akan cocok.
 */
const EDITION_MARKERS = [
  'live',
  'remix',
  'acoustic',
  'akustik',
  'instrumental',
  'karaoke',
  'sped up',
  'slowed',
  'reverb',
  'cover',
  'demo',
  'remaster',
  'radio edit',
  'extended',
  'deluxe',
  'reprise',
  'version',
  'versi',
  'mix',
] as const;

/** Sampah yang khas judul YouTube dan tidak pernah bagian dari nama lagu. */
const YOUTUBE_NOISE = [
  'official music video',
  'official video',
  'official audio',
  'official lyric video',
  'lyric video',
  'lyrics video',
  'music video',
  'video klip',
  'video lirik',
  'audio only',
  'hq audio',
  'full album',
  'visualizer',
  'topic',
] as const;

/**
 * Normalisasi untuk perbandingan.
 *
 * Apostrof DIHAPUS, bukan diganti spasi: kalau diganti spasi, "don't" jadi dua
 * token ("don" + "t") dan skor kemiripan jatuh tanpa alasan. Ini jebakan yang
 * sudah pernah kena di implementasi Android.
 */
export function normalise(raw: string): string {
  let text = raw.toLowerCase();

  for (const noise of YOUTUBE_NOISE) {
    text = text.split(noise).join(' ');
  }

  return text
    .replace(/['\u2019\u02bc`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Penanda edisi yang muncul di sebuah judul. */
export function editionsOf(raw: string): Set<string> {
  const lower = raw.toLowerCase();
  const found = new Set<string>();
  for (const marker of EDITION_MARKERS) {
    if (lower.includes(marker)) found.add(marker);
  }
  return found;
}

/**
 * Kemiripan berbasis irisan token (Jaccard yang dibobot ke sisi lebih pendek).
 *
 * Dipakai sisi terpendek sebagai pembagi supaya judul YouTube yang panjang
 * ("Tulus - Hati-Hati di Jalan (Official Lyric Video)") tidak dihukum hanya
 * karena punya token tambahan.
 */
export function similarity(a: string, b: string): number {
  const left = new Set(normalise(a).split(' ').filter(Boolean));
  const right = new Set(normalise(b).split(' ').filter(Boolean));

  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }

  return shared / Math.min(left.size, right.size);
}

/** Kandidat audio dari penyedia (YouTube Music). */
export interface AudioCandidate {
  videoId: string;
  title: string | null;
  artist: string | null;
  durationSeconds: number | null;
}

export interface MatchTarget {
  title: string;
  artist: string;
  durationSeconds: number;
}

export interface MatchResult {
  candidate: AudioCandidate;
  score: number;
  durationDelta: number;
}

/**
 * Skor satu kandidat, atau null kalau ditolak.
 *
 * Penolakan keras (bukan pengurangan skor) untuk dua hal:
 *  1. Durasi di luar toleransi — master berbeda, lirik tidak akan sinkron.
 *  2. Edisi berbeda — "Live" bukan versi studio.
 * Menghukum lewat skor saja membuat kandidat salah tetap bisa menang ketika
 * tidak ada kandidat lain, dan lirik yang tidak sinkron lebih buruk daripada
 * tidak ada audio.
 */
export function scoreCandidate(
  candidate: AudioCandidate,
  target: MatchTarget,
): MatchResult | null {
  if (candidate.durationSeconds === null) return null;

  const delta = candidate.durationSeconds - target.durationSeconds;
  if (Math.abs(delta) > DURATION_TOLERANCE_SECONDS) return null;

  const candidateTitle = candidate.title ?? '';
  const targetEditions = editionsOf(target.title);
  const candidateEditions = editionsOf(candidateTitle);

  if (targetEditions.size !== candidateEditions.size) return null;
  for (const edition of targetEditions) {
    if (!candidateEditions.has(edition)) return null;
  }

  const titleScore = similarity(candidateTitle, target.title);
  // Judul YouTube sering memuat nama artis; kalau field artis kosong, pakai
  // judulnya sebagai bahan perbandingan artis daripada memberi skor 0.
  const artistScore = similarity(candidate.artist ?? candidateTitle, target.artist);

  const combined = TITLE_WEIGHT * titleScore + ARTIST_WEIGHT * artistScore;
  if (combined < MIN_ACCEPTABLE_SCORE) return null;

  return { candidate, score: combined, durationDelta: delta };
}

/**
 * Kandidat terbaik dari daftar, atau null kalau tak ada yang layak.
 *
 * Urutan tie-break: skor dulu, lalu selisih durasi terkecil. Dua rekaman
 * berjudul sama dengan skor sama — yang durasinya paling dekat lebih mungkin
 * master yang benar.
 */
export function bestMatch(
  candidates: readonly AudioCandidate[],
  target: MatchTarget,
): MatchResult | null {
  let best: MatchResult | null = null;

  for (const candidate of candidates) {
    const result = scoreCandidate(candidate, target);
    if (!result) continue;

    if (
      best === null ||
      result.score > best.score ||
      (result.score === best.score &&
        Math.abs(result.durationDelta) < Math.abs(best.durationDelta))
    ) {
      best = result;
    }
  }

  return best;
}

/**
 * Ubah durasi YouTube menjadi detik.
 *
 * JEBAKAN NYATA: dengan hl=id YouTube memformat durasi "4.02" (TITIK), dengan
 * hl=en "4:02". Parser yang hanya menerima titik dua membuat seluruh jembatan
 * gagal 0/7 tanpa satu pun error — kegagalan senyap yang mahal.
 */
export function parseYouTubeDuration(raw: string): number | null {
  const parts = raw.replace(/\./g, ':').trim().split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;

  const numbers = parts.map((p) => Number.parseInt(p, 10));
  const seconds =
    numbers.length === 2
      ? numbers[0] * 60 + numbers[1]
      : numbers[0] * 3600 + numbers[1] * 60 + numbers[2];

  // Batas kewajaran HANYA untuk menangkap hasil parse yang jelas salah.
  // Kelayakan durasi sebenarnya diputuskan scoreCandidate lewat toleransi
  // terhadap durasi katalog — bukan di sini. Ambang 6 jam cukup longgar untuk
  // mixtape/album utuh tanpa memaafkan angka yang tak masuk akal.
  if (seconds < 5 || seconds > 6 * 3600) return null;
  return seconds;
}
