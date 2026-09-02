/* PROBE SEMENTARA — dihapus setelah angka dicatat. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LyricsAnimator, syllableKey } from '@/lib/lyrics/animator';
import { SPLINE, SPRING } from '@/lib/lyrics/design-tokens';
import { LarasSpline } from '@/lib/lyrics/spline';
import { LarasSpring } from '@/lib/lyrics/spring';
import { parseAppleTtml } from '@/lib/lyrics/ttml';
import type { Lyrics } from '@/lib/types';

const FRAME = 1 / 60;
const SLUGS = ['die-with-a-smile', 'bertaut', 'hati-hati-di-jalan', 'peradaban'];

function load(slug: string): Lyrics {
  return parseAppleTtml(
    readFileSync(path.join(process.cwd(), 'fixtures', 'ttml', `${slug}.ttml`), 'utf8'),
  );
}

function fmt(n: number): string {
  return n.toFixed(5);
}

describe('probe', () => {
  it('tabel spline', () => {
    const ts = [0, 0.25, 0.5, 0.6, 0.7, 0.85, 0.9, 1.0];
    for (const [name, pts] of Object.entries(SPLINE)) {
      const s = new LarasSpline(pts);
      const row = ts.map((t) => `${t}=${fmt(s.at(t))}`).join('  ');
      console.log(`SPLINE.${name}: ${row}`);
    }
    // min/max di dalam 0..1 untuk deteksi overshoot cubic
    for (const [name, pts] of Object.entries(SPLINE)) {
      const s = new LarasSpline(pts);
      let lo = Infinity;
      let hi = -Infinity;
      let loAt = 0;
      let hiAt = 0;
      for (let t = 0; t <= 1.0000001; t += 0.0005) {
        const v = s.at(t);
        if (v < lo) { lo = v; loAt = t; }
        if (v > hi) { hi = v; hiAt = t; }
      }
      console.log(`SPLINE.${name} min=${fmt(lo)}@${loAt.toFixed(3)} max=${fmt(hi)}@${hiAt.toFixed(3)}`);
    }
    expect(true).toBe(true);
  });

  it('respons spring', () => {
    for (const [name, cfg] of Object.entries(SPRING)) {
      const s = new LarasSpring(0, cfg.frequency, cfg.damping, 1);
      const trace: number[] = [];
      for (let i = 0; i < 60 * 6; i += 1) trace.push(s.step(FRAME));
      const t90 = trace.findIndex((v) => v >= 0.9);
      const t63 = trace.findIndex((v) => v >= 0.632);
      const peak = Math.max(...trace);
      const peakAt = trace.indexOf(peak);
      const sample = [0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 0.8, 1.0]
        .map((t) => `${t}s=${fmt(trace[Math.round(t * 60) - 1])}`)
        .join('  ');
      console.log(
        `SPRING.${name} f=${cfg.frequency}Hz d=${cfg.damping} | t63=${(t63 / 60).toFixed(3)}s t90=${(t90 / 60).toFixed(3)}s peak=${fmt(peak)}@${(peakAt / 60).toFixed(3)}s | ${sample}`,
      );
    }
    expect(true).toBe(true);
  });

  it('statistik durasi suku kata fixture', () => {
    for (const slug of SLUGS) {
      const l = load(slug);
      const durs: number[] = [];
      let zero = 0;
      let negative = 0;
      let overlap = 0;
      let total = 0;
      for (const line of l.lines) {
        for (const g of [line.lead, ...line.background]) {
          for (let i = 0; i < g.syllables.length; i += 1) {
            const s = g.syllables[i];
            total += 1;
            const d = s.end - s.start;
            durs.push(d);
            if (d === 0) zero += 1;
            if (d < 0) negative += 1;
            const next = g.syllables[i + 1];
            if (next && s.end > next.start + 1e-9) overlap += 1;
          }
        }
      }
      durs.sort((a, b) => a - b);
      const q = (p: number) => durs[Math.min(durs.length - 1, Math.floor(p * durs.length))];
      console.log(
        `${slug}: n=${total} p10=${fmt(q(0.1))} p25=${fmt(q(0.25))} med=${fmt(q(0.5))} p75=${fmt(q(0.75))} p90=${fmt(q(0.9))} max=${fmt(durs[durs.length - 1])} zero=${zero} neg=${negative} overlap=${overlap}`,
      );
    }
    expect(true).toBe(true);
  });

  it('jejak nyata satu kata: seberapa jauh spring sampai di akhir suku kata', () => {
    const lyrics = load('bertaut');
    const line = lyrics.lines.find(
      (l) => !l.interlude && l.lead.syllables.length > 4,
    );
    if (!line) throw new Error('tidak ada baris');
    for (const idx of [0, 1, 2]) {
      const syl = line.lead.syllables[idx];
      const a = new LyricsAnimator(lyrics);
      // warm-up dari 2 detik sebelum baris supaya springs sudah ada
      const key = syllableKey(line.index, -1, idx);
      let peakScale = 0;
      let peakAt = 0;
      let atEnd = 0;
      let glowAtEnd = 0;
      let peakGlow = 0;
      for (let t = line.start - 2; t <= syl.end + 3; t += FRAME) {
        const f = a.frame(t, FRAME, [line.index]);
        const s = f.syllables.get(key);
        if (!s) continue;
        if (s.scale > peakScale) { peakScale = s.scale; peakAt = t; }
        peakGlow = Math.max(peakGlow, s.glowOpacityPercent);
        if (t <= syl.end) { atEnd = s.scale; glowAtEnd = s.glowOpacityPercent; }
      }
      console.log(
        `kata ${idx} dur=${fmt(syl.end - syl.start)} | scale@end=${fmt(atEnd)} peak=${fmt(peakScale)} peakSetelahEnd=${fmt(peakAt - syl.end)}s | glow%@end=${fmt(glowAtEnd)} glow%peak=${fmt(peakGlow)}`,
      );
    }
    expect(true).toBe(true);
  });

  it('nilai kata SUNG jangka panjang (apakah pulang ke idle?)', () => {
    const lyrics = load('bertaut');
    const line = lyrics.lines.find((l) => !l.interlude && l.lead.syllables.length > 4);
    if (!line) throw new Error('x');
    const a = new LyricsAnimator(lyrics);
    const syl = line.lead.syllables[0];
    let last;
    for (let t = line.start - 1; t <= syl.end + 8; t += FRAME) {
      last = a.frame(t, FRAME, [line.index]).syllables.get(syllableKey(line.index, -1, 0));
    }
    console.log(
      `SUNG 8s setelah selesai: scale=${fmt(last?.scale ?? NaN)} y=${fmt(last?.yOffsetEm ?? NaN)} glowBlur=${fmt(last?.glowBlurPx ?? NaN)} glow%=${fmt(last?.glowOpacityPercent ?? NaN)} opacity=${fmt(last?.opacity ?? NaN)} state=${last?.state}`,
    );
    expect(true).toBe(true);
  });

  it('lompatan setelah seek: spring dibuat pada nilai idle padahal target 1.0505', () => {
    const lyrics = load('bertaut');
    // Ambil baris di tengah lagu, seek langsung ke akhir barisnya.
    const line = lyrics.lines.filter((l) => !l.interlude)[10];
    const a = new LyricsAnimator(lyrics);
    const pos = line.end - 0.01; // hampir semua suku kata sudah 'sung'
    const key = syllableKey(line.index, -1, 0);
    const trace: number[] = [];
    for (let i = 0; i < 90; i += 1) {
      const f = a.frame(pos, FRAME, [line.index]);
      const s = f.syllables.get(key);
      if (s) trace.push(s.scale);
    }
    console.log(
      `seek: frame0=${fmt(trace[0])} f10=${fmt(trace[9])} f30=${fmt(trace[29])} f60=${fmt(trace[59])} f90=${fmt(trace[89])} delta=${fmt(trace[89] - trace[0])}`,
    );
    expect(true).toBe(true);
  });

  it('grup background: apakah spring/spline sama dengan lead', () => {
    const lyrics = load('peradaban');
    const line = lyrics.lines.find((l) => l.background.length > 0);
    if (!line) throw new Error('x');
    const bg = line.background[0];
    const a = new LyricsAnimator(lyrics);
    const syl = bg.syllables[0];
    const mid = (syl.start + syl.end) / 2;
    let lead;
    let back;
    for (let t = line.start - 1; t <= mid; t += FRAME) {
      const f = a.frame(t, FRAME, [line.index]);
      lead = f.syllables.get(syllableKey(line.index, -1, 0));
      back = f.syllables.get(syllableKey(line.index, 0, 0));
    }
    console.log(
      `bg: lead scale=${fmt(lead?.scale ?? NaN)} grad=${fmt(lead?.gradientPosition ?? NaN)} | bg scale=${fmt(back?.scale ?? NaN)} grad=${fmt(back?.gradientPosition ?? NaN)} state=${back?.state}`,
    );
    console.log(
      `bg count baris=${line.background.length} syl=${bg.syllables.length} emphasis=${bg.syllables.filter((s) => s.emphasis).length}`,
    );
    expect(true).toBe(true);
  });

  it('data rusak: durasi nol / negatif / tumpang tindih', () => {
    const mk = (start: number, end: number): Lyrics => ({
      kind: 'syllable',
      lines: [
        {
          index: 0,
          start: Math.min(start, end),
          end: Math.max(start, end) + 1,
          lead: {
            syllables: [{ text: 'x', start, end, isPartOfWord: false, emphasis: false }],
            start,
            end,
          },
          background: [],
          oppositeAligned: false,
          interlude: false,
          songPart: null,
          text: 'x',
        },
      ],
      source: 'fixture',
      attribution: null,
      instrumental: false,
    });
    for (const [s, e] of [[5, 5], [5, 3], [5, 6]]) {
      const a = new LyricsAnimator(mk(s, e));
      for (const p of [4, 4.999, 5, 5.5, 6, 7]) {
        const f = a.frame(p, FRAME, [0]).syllables.get(syllableKey(0, -1, 0));
        console.log(
          `syl[${s},${e}] pos=${p} state=${f?.state} grad=${fmt(f?.gradientPosition ?? NaN)} scale=${fmt(f?.scale ?? NaN)}`,
        );
      }
    }
    expect(true).toBe(true);
  });

  it('gradient di progres 1 tepat 100', () => {
    console.log('grad@1 =', -20 + 120 * 1);
    console.log('grad@0.999 =', -20 + 120 * 0.999);
    expect(true).toBe(true);
  });
});
