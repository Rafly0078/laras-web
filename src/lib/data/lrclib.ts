/**
 * LRCLIB — adapter MURNI untuk cadangan lirik saat katalog Apple kosong.
 *
 * Pemisahan file ini dari `lrclib-client.ts` mengikuti pola yang sudah ada di
 * repo: `innertube.ts` (parsing, murni, teruji) dipisah dari `youtube.ts`
 * (fetch). Bagian yang paling mudah salah adalah ATURAN PENERIMAAN, dan aturan
 * itu hanya bisa diuji kalau tidak ada jaringan di modul yang sama.
 *
 * Kenapa cadangan ini perlu: sebagian lagu di katalog Apple memang tanpa lirik,
 * dan itu ditemui cukup sering. Sebelumnya pane lirik hanya menulis "tidak
 * tersedia".
 *
 * Yang HARUS diketahui, terukur pada API-nya sendiri:
 *
 *  - LRCLIB hanya line-level. Tidak ada timing per kata di formatnya, jadi
 *    hasilnya `kind: 'line'` dan animator sengaja tidak menyapunya.
 *  - **Durasi menentukan versi mana yang dikirim.** Permintaan yang sama untuk
 *    "Bertaut" oleh Nadin Amizah membalas `duration: 250` kalau durasi
 *    disertakan, dan `duration: 316` (rekaman lain!) kalau tidak. Karena itu
 *    durasi selalu dikirim DAN hasilnya diverifikasi ulang di sini — sama
 *    seperti jembatan audio YouTube yang mencocokkan durasi, bukan judul.
 *  - `duration` di respons bisa TIDAK cocok dengan timestamp terakhirnya
 *    (bertaut: duration 250 vs timestamp 287,57). Jadi durasi jangan dipakai
 *    untuk memotong lirik.
 */

import { parseLrc } from '@/lib/lyrics/lrc';
import type { Lyrics } from '@/lib/types';

/**
 * Toleransi selisih durasi (detik) sebelum sebuah hasil ditolak.
 *
 * 3 detik: cukup untuk beda pembulatan dan fade-out master yang berbeda, terlalu
 * sempit untuk versi remix atau live yang panjangnya jelas lain.
 */
export const DURATION_TOLERANCE_SECONDS = 3;

export interface LrclibRecord {
  id?: unknown;
  trackName?: unknown;
  artistName?: unknown;
  duration?: unknown;
  instrumental?: unknown;
  plainLyrics?: unknown;
  syncedLyrics?: unknown;
}

function isRec(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Ubah satu record LRCLIB jadi `Lyrics`, atau null kalau tidak layak dipakai.
 *
 * MURNI — tidak ada jaringan di sini, jadi seluruh aturan penerimaan bisa diuji
 * terhadap respons nyata di `fixtures/lrclib/`.
 *
 * `expectedDurationSeconds` wajib diperiksa di sini, bukan dipercayakan ke
 * server: LRCLIB akan dengan senang hati mengirim rekaman lain yang judulnya
 * sama.
 */
export function toLrclibLyrics(
  raw: unknown,
  expectedDurationSeconds: number | null,
): Lyrics | null {
  if (!isRec(raw)) return null;

  const duration = typeof raw.duration === 'number' ? raw.duration : null;
  if (
    expectedDurationSeconds !== null &&
    duration !== null &&
    Math.abs(duration - expectedDurationSeconds) > DURATION_TOLERANCE_SECONDS
  ) {
    return null;
  }

  // Lagu instrumental: LRCLIB menandainya eksplisit. Ini jawaban yang BERGUNA,
  // bukan kegagalan — pane lirik bisa mengatakan "instrumental" dengan yakin.
  if (raw.instrumental === true) {
    return {
      kind: 'static',
      lines: [],
      source: 'lrclib',
      attribution: 'LRCLIB',
      instrumental: true,
    };
  }

  const synced = typeof raw.syncedLyrics === 'string' ? raw.syncedLyrics.trim() : '';
  if (synced.length === 0) {
    // Hanya `plainLyrics` berarti tanpa timing sama sekali. Tidak dipakai:
    // teks tanpa waktu tidak bisa disinkronkan, dan menampilkannya di pane
    // yang menjanjikan sinkronisasi lebih menyesatkan daripada berguna.
    return null;
  }

  const lyrics = parseLrc(synced, {
    durationSeconds: duration ?? undefined,
  });

  return lyrics.lines.length > 0 ? lyrics : null;
}
