import { describe, expect, it } from 'vitest';

import { createRateLimiter } from '@/lib/data/rate-limit';

/**
 * Jam sintetis, bukan `setTimeout`: test yang menunggu waktu nyata itu lambat
 * DAN rapuh. Ini pola yang sama dengan yang dipakai untuk menguji mesin lirik.
 */
function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advanceSeconds(seconds: number) {
      t += seconds * 1000;
    },
  };
}

describe('createRateLimiter', () => {
  it('melewatkan ledakan sebesar kapasitas, lalu menolak', () => {
    const c = clock();
    const limiter = createRateLimiter({ capacity: 5, refillPerSecond: 1, now: c.now });

    const results = Array.from({ length: 6 }, () => limiter.take('1.2.3.4'));
    expect(results.slice(0, 5).every((r) => r.allowed)).toBe(true);
    expect(results[5].allowed).toBe(false);
  });

  it('remaining menghitung turun dan berhenti di nol', () => {
    const c = clock();
    const limiter = createRateLimiter({ capacity: 3, refillPerSecond: 1, now: c.now });

    expect(limiter.take('a').remaining).toBe(2);
    expect(limiter.take('a').remaining).toBe(1);
    expect(limiter.take('a').remaining).toBe(0);
    expect(limiter.take('a')).toMatchObject({ allowed: false, remaining: 0 });
  });

  it('token dipulihkan sesuai waktu yang lewat', () => {
    const c = clock();
    const limiter = createRateLimiter({ capacity: 2, refillPerSecond: 0.5, now: c.now });

    limiter.take('a');
    limiter.take('a');
    expect(limiter.take('a').allowed).toBe(false);

    // 0,5 token/detik: 2 detik = 1 token.
    c.advanceSeconds(2);
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('a').allowed).toBe(false);
  });

  it('tidak pernah melewati kapasitas walau diam lama', () => {
    const c = clock();
    const limiter = createRateLimiter({ capacity: 3, refillPerSecond: 1, now: c.now });

    limiter.take('a');
    c.advanceSeconds(3600);

    const results = Array.from({ length: 4 }, () => limiter.take('a'));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect(results[3].allowed).toBe(false);
  });

  it('retryAfterSeconds masuk akal dan tidak pernah nol saat ditolak', () => {
    const c = clock();
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 0.2, now: c.now });

    limiter.take('a');
    const denied = limiter.take('a');
    expect(denied.allowed).toBe(false);
    // 0,2 token/detik -> satu token butuh 5 detik.
    expect(denied.retryAfterSeconds).toBe(5);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('bucket per kunci terpisah', () => {
    const c = clock();
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 1, now: c.now });

    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('b').allowed).toBe(true);
    expect(limiter.take('a').allowed).toBe(false);
  });

  it('jumlah kunci dibatasi supaya IP yang diputar tidak menghabiskan memori', () => {
    const c = clock();
    const limiter = createRateLimiter({
      capacity: 1,
      refillPerSecond: 1,
      now: c.now,
      maxKeys: 50,
    });

    for (let i = 0; i < 500; i += 1) limiter.take(`ip-${i}`);
    expect(limiter.size).toBeLessThanOrEqual(50);
  });
});
