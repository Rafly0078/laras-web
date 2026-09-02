/**
 * Rate limit token bucket — penjaga permukaan `/api` yang terbuka ke publik.
 *
 * KENAPA ADA: setiap `/api/lirik/<id>` yang belum pernah diminta membebani
 * relay pihak ketiga selama ~10 detik. Tanpa penjaga, satu skrip bisa
 * menghabiskan kesabaran relay dalam semenit dan yang mati adalah katalog untuk
 * semua pengunjung.
 *
 * Token bucket, bukan jendela tetap: bucket membolehkan ledakan kecil (buka tiga
 * lagu sekaligus itu perilaku manusia normal) tapi tetap membatasi laju
 * rata-rata. Jendela tetap akan menolak ledakan yang wajar dan tetap
 * melewatkan dua kali batas di perbatasan jendela.
 *
 * `now` bisa disuntik supaya logikanya bisa diuji dengan jam sintetis, bukan
 * dengan `setTimeout` di test.
 *
 * BATASNYA SAMA dengan coalescer: memori satu proses. Di Vercel, batas ini
 * berlaku per instance. Ini memperlambat penyalahgunaan, bukan menutupnya.
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** Sisa token setelah keputusan ini, dibulatkan ke bawah. */
  remaining: number;
  /** Berapa detik lagi sebelum satu token tersedia. 0 kalau diizinkan. */
  retryAfterSeconds: number;
}

export interface RateLimiterOptions {
  /** Isi maksimum bucket = ukuran ledakan yang diizinkan. */
  capacity: number;
  /** Token yang dipulihkan per detik = laju rata-rata yang diizinkan. */
  refillPerSecond: number;
  /** Sumber waktu dalam milidetik. Disuntik di test. */
  now?: () => number;
  /**
   * Batas jumlah kunci yang diingat. Tanpa ini, satu pemindai yang memutar
   * alamat IP membuat peta tumbuh tanpa batas sampai proses kehabisan memori.
   */
  maxKeys?: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimiter {
  take(key: string): RateLimitDecision;
  readonly size: number;
}

export function createRateLimiter({
  capacity,
  refillPerSecond,
  now = Date.now,
  maxKeys = 10_000,
}: RateLimiterOptions): RateLimiter {
  const buckets = new Map<string, Bucket>();

  return {
    take(key: string): RateLimitDecision {
      const t = now();
      const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: t };

      // Pulihkan token sesuai waktu yang lewat, dibatasi kapasitas.
      const elapsedSeconds = Math.max(0, (t - bucket.updatedAt) / 1000);
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSeconds * refillPerSecond);
      bucket.updatedAt = t;

      if (bucket.tokens < 1) {
        const deficit = 1 - bucket.tokens;
        buckets.set(key, bucket);
        return {
          allowed: false,
          remaining: 0,
          // Dibulatkan ke ATAS: memberi tahu klien "0 detik" untuk sesuatu yang
          // belum siap hanya memancing percobaan ulang yang langsung gagal.
          retryAfterSeconds: Math.max(1, Math.ceil(deficit / refillPerSecond)),
        };
      }

      bucket.tokens -= 1;

      /* Buang entri paling tua saat peta penuh. Map JS mempertahankan urutan
         penyisipan, jadi kunci pertama adalah yang paling lama tidak dibuat
         ulang — cukup baik untuk penjaga memori, dan jauh lebih murah daripada
         menyortir seluruh peta. */
      if (!buckets.has(key) && buckets.size >= maxKeys) {
        const oldest = buckets.keys().next();
        if (!oldest.done) buckets.delete(oldest.value);
      }
      buckets.set(key, bucket);

      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        retryAfterSeconds: 0,
      };
    },

    get size() {
      return buckets.size;
    },
  };
}
