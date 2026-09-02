import { describe, expect, it } from 'vitest';

import { IDLE_SCALE, SPLINE, SPRING } from '@/lib/lyrics/design-tokens';
import { LarasSpline } from '@/lib/lyrics/spline';
import { LarasSpring } from '@/lib/lyrics/spring';

/** Jalankan spring selama `seconds` dengan langkah tetap, kembalikan jejaknya. */
function simulate(spring: LarasSpring, seconds: number, dt: number): number[] {
  const trace: number[] = [];
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) trace.push(spring.step(dt));
  return trace;
}

describe('LarasSpring', () => {
  it('underdamped MELEWATI goal (overshoot) — ini yang bikin kata terasa memantul', () => {
    const s = new LarasSpring(0, SPRING.scale.frequency, SPRING.scale.damping);
    s.setGoal(1);
    const trace = simulate(s, 4, 1 / 60);
    expect(Math.max(...trace)).toBeGreaterThan(1);
  });

  it('critically damped TIDAK PERNAH melewati goal', () => {
    const s = new LarasSpring(0, 1.2, 1);
    s.setGoal(1);
    const trace = simulate(s, 4, 1 / 60);
    // Toleransi kecil untuk galat pembulatan float, bukan untuk overshoot nyata.
    expect(Math.max(...trace)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('overdamped juga tidak melewati goal', () => {
    const s = new LarasSpring(0, 1.2, 1.8);
    s.setGoal(1);
    const trace = simulate(s, 6, 1 / 60);
    expect(Math.max(...trace)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('independen frame-rate: 60fps dan 120fps konvergen ke nilai sama', () => {
    const a = new LarasSpring(0, SPRING.yOffset.frequency, SPRING.yOffset.damping, 1);
    const b = new LarasSpring(0, SPRING.yOffset.frequency, SPRING.yOffset.damping, 1);
    simulate(a, 0.5, 1 / 60);
    simulate(b, 0.5, 1 / 120);
    expect(Math.abs(a.currentValue - b.currentValue)).toBeLessThan(0.02);
  });

  it('bahkan pada dt ekstrem (1/24 vs 1/240) tetap dalam toleransi', () => {
    const a = new LarasSpring(0, SPRING.glow.frequency, SPRING.glow.damping, 1);
    const b = new LarasSpring(0, SPRING.glow.frequency, SPRING.glow.damping, 1);
    simulate(a, 1, 1 / 24);
    simulate(b, 1, 1 / 240);
    expect(Math.abs(a.currentValue - b.currentValue)).toBeLessThan(0.02);
  });

  it('akhirnya TIDUR persis di goal (berhenti menulis DOM)', () => {
    const s = new LarasSpring(0, SPRING.scale.frequency, SPRING.scale.damping, 1);
    simulate(s, 8, 1 / 60);
    expect(s.currentValue).toBe(1);
  });

  it('setGoal di tengah gerak tidak melompat posisi', () => {
    const s = new LarasSpring(0, SPRING.scale.frequency, SPRING.scale.damping, 1);
    simulate(s, 0.2, 1 / 60);
    const before = s.currentValue;
    s.setGoal(0.3);
    const after = s.step(1 / 60);
    // Satu frame di 60fps tidak boleh menggeser lebih dari nilai yang wajar.
    expect(Math.abs(after - before)).toBeLessThan(0.1);
  });

  it('dt nol / negatif aman (tab kembali aktif, timestamp ganda)', () => {
    const s = new LarasSpring(0.5, 1.2, 0.5, 1);
    expect(s.step(0)).toBe(0.5);
    expect(s.step(-1)).toBe(0.5);
    expect(Number.isNaN(s.currentValue)).toBe(false);
  });

  it('damping mendekati 1 tidak menghasilkan NaN (jalur seri Taylor)', () => {
    for (const d of [0.999999, 0.9999999, 1.0000001]) {
      const s = new LarasSpring(0, 1.2, d, 1);
      simulate(s, 2, 1 / 60);
      expect(Number.isNaN(s.currentValue)).toBe(false);
    }
  });

  it('reset membuang kecepatan', () => {
    const s = new LarasSpring(0, 1.45, 0.4, 1);
    simulate(s, 0.3, 1 / 60);
    s.reset(0);
    expect(s.currentValue).toBe(0);
    // Setelah reset, satu langkah dari 0 harus kecil (mulai dari diam).
    const first = s.step(1 / 60);
    expect(Math.abs(first)).toBeLessThan(0.05);
  });
});

describe('LarasSpline', () => {
  const pts = [
    { time: 0, value: 0 },
    { time: 0.5, value: 1 },
    { time: 1, value: 0.2 },
  ];

  it('mengembalikan nilai simpul persis di titik simpul', () => {
    const s = new LarasSpline(pts);
    for (const p of pts) expect(s.at(p.time)).toBeCloseTo(p.value, 9);
  });

  it('CLAMP di luar rentang, bukan ekstrapolasi', () => {
    const s = new LarasSpline(pts);
    expect(s.at(-999)).toBe(0);
    expect(s.at(999)).toBe(0.2);
  });

  it('urutan input acak menghasilkan hasil identik', () => {
    const a = new LarasSpline(pts);
    const b = new LarasSpline([pts[2], pts[0], pts[1]]);
    for (const t of [0, 0.13, 0.37, 0.5, 0.78, 1]) {
      expect(b.at(t)).toBeCloseTo(a.at(t), 12);
    }
  });

  it('satu titik = konstan', () => {
    const s = new LarasSpline([{ time: 0.4, value: 7 }]);
    expect(s.at(-1)).toBe(7);
    expect(s.at(0.4)).toBe(7);
    expect(s.at(99)).toBe(7);
  });

  it('dua titik = linear murni', () => {
    const s = new LarasSpline([
      { time: 0, value: 0 },
      { time: 1, value: 10 },
    ]);
    expect(s.at(0.25)).toBeCloseTo(2.5, 9);
    expect(s.at(0.5)).toBeCloseTo(5, 9);
  });

  it('tidak pernah NaN untuk rentang progres kata 0..1', () => {
    const s = new LarasSpline(pts);
    for (let t = -0.2; t <= 1.2; t += 0.01) {
      expect(Number.isFinite(s.at(t))).toBe(true);
    }
  });

  it('mulus: tidak ada lonjakan tajam antar sampel berdekatan', () => {
    const s = new LarasSpline(pts);
    let prev = s.at(0);
    for (let t = 0.001; t <= 1; t += 0.001) {
      const cur = s.at(t);
      expect(Math.abs(cur - prev)).toBeLessThan(0.05);
      prev = cur;
    }
  });
});

describe('nilai desain NYATA dari design-tokens', () => {
  it('SPLINE.scale: diam = IDLE_SCALE, puncak 1.0505 di progres 0.7', () => {
    /* Nilai diam DISENGAJA berbeda dari spicy-lyrics (0.95). Dengan diam 0.95,
       pertumbuhan kata 10,58% dan separuhnya (0,52ch untuk kata terlebar 371px)
       melebihi jarak antar kata 0,32ch — kata yang menyala menabrak tetangganya.
       Diam 1.0 memangkas pertumbuhan jadi 5,05% sehingga muat. Assertion ini
       mengikat ke tokennya, bukan ke angka, supaya perubahan berikutnya tetap
       konsisten di kedua ujung kurva. */
    const s = new LarasSpline(SPLINE.scale);
    expect(s.at(0)).toBeCloseTo(IDLE_SCALE, 9);
    expect(s.at(1)).toBeCloseTo(IDLE_SCALE, 9);
    expect(s.at(0.7)).toBeCloseTo(1.0505, 9);
    // Pertumbuhan harus lebih kecil dari jarak antar kata 0.32ch.
    expect((1.0505 - IDLE_SCALE) / IDLE_SCALE).toBeLessThan(0.08);
  });

  it('SPLINE.scaleEmphasis memuncak jauh lebih tinggi (1.175)', () => {
    const s = new LarasSpline(SPLINE.scaleEmphasis);
    expect(s.at(0.7)).toBeCloseTo(1.175, 9);
    expect(s.at(0.7)).toBeGreaterThan(new LarasSpline(SPLINE.scale).at(0.7));
  });

  it('SPLINE.yOffset naik ke atas (negatif) di sekitar progres 0.9', () => {
    const s = new LarasSpline(SPLINE.yOffset);
    expect(s.at(0)).toBeCloseTo(0, 9);
    expect(s.at(0.9)).toBeCloseTo(-(1 / 60), 9);
    expect(s.at(0.9)).toBeLessThan(0);
  });

  it('SPLINE.opacity: 0.35 saat diam, 1 di progres 0.6', () => {
    const s = new LarasSpline(SPLINE.opacity);
    expect(s.at(0)).toBeCloseTo(0.35, 9);
    expect(s.at(0.6)).toBeCloseTo(1, 9);
  });

  it('SPLINE.glow menyala cepat lalu bertahan di 1', () => {
    const s = new LarasSpline(SPLINE.glow);
    expect(s.at(0)).toBeCloseTo(0, 9);
    expect(s.at(0.15)).toBeCloseTo(1, 9);
    expect(s.at(0.6)).toBeCloseTo(1, 9);
  });
});
