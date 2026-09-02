/**
 * Penjaga permukaan HTTP publik: identitas pemanggil + rate limit.
 *
 * Dipisah dari route handler-nya supaya batas dan alasannya berada di SATU
 * tempat. Kalau angkanya tersebar di tiap route, cepat atau lambat ada route
 * yang lupa dipasangi penjaga.
 */

import type { NextRequest } from 'next/server';

import { createRateLimiter, type RateLimiter } from '@/lib/data/rate-limit';

/**
 * Batas untuk `/api/lirik`: 10 permintaan sekaligus, lalu 1 tiap 4 detik.
 *
 * Angkanya diturunkan dari biaya sebenarnya, bukan dikira-kira: satu lagu yang
 * belum pernah diminta membuat relay bekerja 9,5–11,5 detik. 15 per menit sudah
 * jauh di atas kebiasaan manusia (membuka lagu, membaca liriknya, lanjut),
 * tapi cukup untuk menahan skrip yang menyapu seluruh playlist.
 */
export const lyricsLimiter = createRateLimiter({ capacity: 10, refillPerSecond: 0.25 });

/** Batas untuk `/api/health`: 5 sekaligus, lalu 1 tiap 10 detik. */
export const healthLimiter = createRateLimiter({ capacity: 5, refillPerSecond: 0.1 });

/**
 * Alamat pemanggil.
 *
 * Di belakang proxy (Vercel selalu), alamat soket adalah milik proxy — yang
 * benar ada di `x-forwarded-for`, entri PERTAMA (paling kiri = klien asli;
 * entri kanan ditambahkan tiap hop). Header ini bisa dipalsukan kalau app
 * dijalankan tanpa proxy di depan, jadi ini penghalang penyalahgunaan biasa,
 * bukan kendali keamanan.
 */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'tanpa-alamat';
}

/**
 * Terapkan batas. Mengembalikan `Response` 429 kalau ditolak, `null` kalau
 * boleh lanjut — jadi pemakaiannya satu baris di awal handler.
 */
export function enforceRateLimit(
  request: NextRequest,
  limiter: RateLimiter,
): Response | null {
  const decision = limiter.take(clientIp(request));
  if (decision.allowed) return null;

  return Response.json(
    {
      error: 'terlalu banyak permintaan',
      // Pesan dalam bahasa Indonesia seperti sisa UI; ini terlihat pengguna
      // kalau mereka membuka endpoint-nya langsung.
      pesan: `Coba lagi dalam ${decision.retryAfterSeconds} detik.`,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(decision.retryAfterSeconds),
        // Jangan pernah men-cache penolakan: yang di-cache akan menolak
        // pengunjung lain yang tidak melakukan apa-apa.
        'Cache-Control': 'no-store',
      },
    },
  );
}
