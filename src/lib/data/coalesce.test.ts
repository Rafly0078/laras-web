import { describe, expect, it, vi } from 'vitest';

import { createCoalescer } from '@/lib/data/coalesce';

/**
 * Yang diuji di sini bukan "kodenya jalan", tapi tiga perilaku yang justru
 * gagal di implementasi naif: penggabungan itu sendiri, pembersihan setelah
 * GAGAL, dan bahwa permintaan berikutnya tidak ikut menunggu yang sudah selesai.
 */

/** Promise yang bisa diselesaikan dari luar — pengganti timer di test. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createCoalescer', () => {
  it('sepuluh pemanggil dengan kunci sama memicu SATU pekerjaan', async () => {
    const c = createCoalescer();
    const d = deferred<string>();
    const task = vi.fn(() => d.promise);

    const waiters = Array.from({ length: 10 }, () => c.run('lyrics:1', task));
    expect(task).toHaveBeenCalledTimes(1);
    expect(c.pending).toBe(1);

    d.resolve('ttml');
    expect(await Promise.all(waiters)).toEqual(Array(10).fill('ttml'));
  });

  it('kunci berbeda tidak saling menunggu', async () => {
    const c = createCoalescer();
    const a = vi.fn(async () => 'a');
    const b = vi.fn(async () => 'b');

    expect(await Promise.all([c.run('k1', a), c.run('k2', b)])).toEqual(['a', 'b']);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('entri dibuang setelah selesai, jadi permintaan berikutnya jalan lagi', async () => {
    const c = createCoalescer();
    const task = vi.fn(async () => 'ok');

    await c.run('k', task);
    expect(c.pending).toBe(0);

    await c.run('k', task);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('KEGAGALAN tidak melekat: entri dibuang, dan semua penunggu dapat error yang sama', async () => {
    const c = createCoalescer();
    const d = deferred<string>();
    const failing = vi.fn(() => d.promise);

    const first = c.run('k', failing);
    const second = c.run('k', failing);
    d.reject(new Error('relay mati'));

    await expect(first).rejects.toThrow('relay mati');
    await expect(second).rejects.toThrow('relay mati');
    expect(failing).toHaveBeenCalledTimes(1);
    expect(c.pending).toBe(0);

    // Ini yang penting: kegagalan tadi TIDAK disajikan lagi.
    const recovered = vi.fn(async () => 'pulih');
    expect(await c.run('k', recovered)).toBe('pulih');
  });

  it('lempar sinkron diteruskan tanpa meninggalkan entri hantu', () => {
    const c = createCoalescer();
    expect(() =>
      c.run('k', () => {
        throw new Error('bug pemanggil');
      }),
    ).toThrow('bug pemanggil');
    expect(c.pending).toBe(0);
  });
});
