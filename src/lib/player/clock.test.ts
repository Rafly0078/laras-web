import { describe, expect, it } from 'vitest';

import { LyricsClock } from '@/lib/player/clock';

/**
 * Semua test memakai waktu SINTETIS. Tidak ada performance.now(), tidak ada
 * timer nyata — jam ini murni fungsi dari nowMs yang kita suntikkan, dan itu
 * memang alasan desainnya begitu.
 */

const FRAME = 1000 / 60;

/** Jalankan sejumlah frame, opsional dengan callback per frame. */
function run(
  clock: LyricsClock,
  startMs: number,
  frames: number,
  onFrame?: (t: number, pos: number, i: number) => void,
): number {
  let t = startMs;
  for (let i = 0; i < frames; i += 1) {
    t += FRAME;
    const pos = clock.read(t);
    onFrame?.(t, pos, i);
  }
  return t;
}

describe('LyricsClock — dasar', () => {
  it('sebelum jangkar pertama, read() = 0', () => {
    const c = new LyricsClock();
    expect(c.read(0)).toBe(0);
    expect(c.read(5_000)).toBe(0);
  });

  it('maju linear saat playing', () => {
    const c = new LyricsClock();
    c.setPlaying(true, 0);
    c.anchor(10, 0);
    expect(c.read(1_000)).toBeCloseTo(11, 3);
    expect(c.read(2_500)).toBeCloseTo(12.5, 3);
  });

  it('DIAM saat paused walau waktu berjalan', () => {
    const c = new LyricsClock();
    c.anchor(10, 0);
    c.setPlaying(false, 0);
    expect(c.read(3_000)).toBeCloseTo(10, 6);
    expect(c.read(9_000)).toBeCloseTo(10, 6);
  });

  it('rate 2 memajukan dua kali lebih cepat', () => {
    const c = new LyricsClock({ rate: 2 });
    c.setPlaying(true, 0);
    c.anchor(0, 0);
    expect(c.read(1_000)).toBeCloseTo(2, 3);
  });

  it('setRate di tengah jalan tidak melompat', () => {
    const c = new LyricsClock();
    c.setPlaying(true, 0);
    c.anchor(0, 0);
    const before = c.read(1_000);
    c.setRate(2, 1_000);
    expect(c.read(1_000)).toBeCloseTo(before, 6);
    expect(c.read(2_000)).toBeCloseTo(before + 2, 3);
  });

  it('pause lalu resume melanjutkan dari posisi yang sama', () => {
    const c = new LyricsClock();
    c.setPlaying(true, 0);
    c.anchor(0, 0);
    const at1s = c.read(1_000);
    c.setPlaying(false, 1_000);
    expect(c.read(5_000)).toBeCloseTo(at1s, 6);
    c.setPlaying(true, 5_000);
    expect(c.read(6_000)).toBeCloseTo(at1s + 1, 3);
  });

  it('dt nol aman (timestamp sama dua kali)', () => {
    const c = new LyricsClock();
    c.setPlaying(true, 0);
    c.anchor(1, 0);
    const a = c.read(500);
    const b = c.read(500);
    expect(b).toBe(a);
    expect(Number.isNaN(b)).toBe(false);
  });

  it('posisi tidak pernah negatif', () => {
    const c = new LyricsClock();
    c.anchor(0.05, 0);
    c.setPlaying(false, 0);
    c.anchor(0, 100);
    expect(c.read(200)).toBeGreaterThanOrEqual(0);
  });
});

describe('LyricsClock — koreksi drift', () => {
  it('drift KECIL tidak menyebabkan lompatan pada nowMs yang sama', () => {
    const c = new LyricsClock();
    c.setPlaying(true, 0);
    c.anchor(10, 0);

    const before = c.read(1_000);
    // Pemutar melaporkan 0.1s lebih maju dari perkiraan kita.
    c.anchor(before + 0.1, 1_000);
    const after = c.read(1_000);

    expect(Math.abs(after - before)).toBeLessThan(0.005);
  });

  it('drift kecil AKHIRNYA terkoreksi', () => {
    const c = new LyricsClock();
    c.setPlaying(true, 0);
    c.anchor(10, 0);

    const pos = c.read(1_000);
    const target = pos + 0.1;
    c.anchor(target, 1_000);

    // 3 detik simulasi ber-frame; nilai resmi terus maju bersama waktu nyata.
    let t = 1_000;
    for (let i = 0; i < 180; i += 1) {
      t += FRAME;
      c.read(t);
    }
    const expected = target + (t - 1_000) / 1000;
    expect(Math.abs(c.read(t) - expected)).toBeLessThan(0.02);
  });

  it('drift BESAR (2s) langsung SNAP', () => {
    const c = new LyricsClock();
    c.setPlaying(true, 0);
    c.anchor(10, 0);
    c.read(1_000);

    c.anchor(60, 1_000);
    expect(c.read(1_000)).toBeCloseTo(60, 3);
  });

  it('lastDrift melaporkan selisih terukur', () => {
    const c = new LyricsClock();
    c.setPlaying(true, 0);
    c.anchor(10, 0);
    const pos = c.read(1_000);
    c.anchor(pos + 0.12, 1_000);
    expect(c.lastDrift).toBeCloseTo(0.12, 3);
  });

  it('MONOTONIK: jangkar yang mundur tidak pernah membuat read() turun', () => {
    const c = new LyricsClock();
    c.setPlaying(true, 0);
    c.anchor(10, 0);

    let prev = c.read(0);
    let violations = 0;
    let t = 0;

    for (let i = 0; i < 200; i += 1) {
      t += FRAME;
      // Di tengah, pemutar melaporkan posisi 0.05s LEBIH MUNDUR.
      if (i === 100) c.anchor(c.read(t) - 0.05, t);
      const cur = c.read(t);
      if (cur < prev - 1e-9) violations += 1;
      prev = cur;
    }

    expect(violations).toBe(0);
  });

  it('monotonik juga di bawah rentetan jangkar mundur berulang', () => {
    const c = new LyricsClock();
    c.setPlaying(true, 0);
    c.anchor(30, 0);

    let prev = c.read(0);
    let violations = 0;

    run(c, 0, 300, (t, _pos, i) => {
      if (i % 15 === 0) c.anchor(c.read(t) - 0.03, t);
      const cur = c.read(t);
      if (cur < prev - 1e-9) violations += 1;
      prev = cur;
    });

    expect(violations).toBe(0);
  });

  it('koreksi tidak bergantung frame-rate', () => {
    const make = () => {
      const c = new LyricsClock();
      c.setPlaying(true, 0);
      c.anchor(10, 0);
      c.read(1_000);
      c.anchor(10.9 + 0.1, 1_000);
      return c;
    };

    const slow = make();
    const fast = make();

    let t = 1_000;
    for (let i = 0; i < 60; i += 1) {
      t += 1000 / 30;
      slow.read(t);
    }
    let t2 = 1_000;
    for (let i = 0; i < 240; i += 1) {
      t2 += 1000 / 120;
      fast.read(t2);
    }

    expect(Math.abs(slow.read(t) - fast.read(t2))).toBeLessThan(0.02);
  });
});

describe('LyricsClock — hardReset', () => {
  it('membuang drift dan memulai dari posisi baru', () => {
    const c = new LyricsClock();
    c.setPlaying(true, 0);
    c.anchor(10, 0);
    c.read(1_000);
    c.anchor(11.2, 1_000);
    expect(c.lastDrift).not.toBe(0);

    c.hardReset(120, 1_000);
    expect(c.lastDrift).toBe(0);
    expect(c.read(1_000)).toBeCloseTo(120, 6);
    expect(c.read(2_000)).toBeCloseTo(121, 3);
  });

  it('posisi negatif dijepit ke 0', () => {
    const c = new LyricsClock();
    c.hardReset(-5, 0);
    expect(c.read(0)).toBe(0);
  });
});
