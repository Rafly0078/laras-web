import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LyricsAnimator, syllableKey } from '@/lib/lyrics/animator';
import { BLUR, GRADIENT, LINE_OPACITY, SPLINE } from '@/lib/lyrics/design-tokens';
import { LarasSpline } from '@/lib/lyrics/spline';
import { parseAppleTtml } from '@/lib/lyrics/ttml';
import type { Lyrics } from '@/lib/types';

const FRAME = 1 / 60;

function load(slug: string): Lyrics {
  return parseAppleTtml(
    readFileSync(path.join(process.cwd(), 'fixtures', 'ttml', `${slug}.ttml`), 'utf8'),
  );
}

/** Jalankan animator dari 0 sampai `until` detik, kembalikan frame terakhir. */
function runTo(animator: LyricsAnimator, until: number) {
  let last = animator.frame(0, FRAME);
  for (let t = 0; t <= until; t += FRAME) {
    last = animator.frame(t, FRAME);
  }
  return last;
}

describe('LyricsAnimator — pemilihan baris aktif', () => {
  const lyrics = load('die-with-a-smile');
  const animator = new LyricsAnimator(lyrics);

  it('posisi 0 memilih baris pertama', () => {
    expect(animator.activeLineIndex(0)).toBe(0);
  });

  it('memilih baris yang sedang berjalan', () => {
    const target = lyrics.lines.find((l) => !l.interlude && l.start > 20);
    expect(target).toBeDefined();
    if (!target) return;
    const mid = (target.start + target.end) / 2;
    expect(animator.activeLineIndex(mid)).toBe(target.index);
  });

  it('di celah antar baris tetap memegang baris TERAKHIR yang lewat', () => {
    // Kalau ia melompat ke baris berikutnya lebih awal, auto-scroll akan
    // bergerak sebelum penyanyi mulai — terasa salah.
    const lines = lyrics.lines.filter((l) => !l.interlude);
    const a = lines[3];
    const b = lines[4];
    if (b.start - a.end < 0.2) return; // tidak ada celah berarti di sini
    const gapMid = (a.end + b.start) / 2;
    expect(animator.activeLineIndex(gapMid)).toBe(a.index);
  });

  it('posisi setelah baris terakhir memilih baris terakhir', () => {
    const last = lyrics.lines[lyrics.lines.length - 1];
    expect(animator.activeLineIndex(last.end + 60)).toBe(last.index);
  });
});

describe('LyricsAnimator — sapuan gradient', () => {
  const lyrics = load('die-with-a-smile');

  it('kata belum dinyanyikan ada di posisi awal (-20%)', () => {
    const animator = new LyricsAnimator(lyrics);
    const frame = animator.frame(0, FRAME);
    const style = frame.syllables.get(syllableKey(0, -1, 0));
    // Baris 0 adalah interlude di fixture ini; cek baris bertimbang pertama.
    if (style) {
      expect(style.gradientPosition).toBe(GRADIENT.positionNotSung);
    }
    const timed = lyrics.lines.find((l) => !l.interlude);
    expect(timed).toBeDefined();
    if (!timed) return;
    const f2 = animator.frame(0, FRAME, [timed.index]);
    const s2 = f2.syllables.get(syllableKey(timed.index, -1, 0));
    expect(s2?.gradientPosition).toBe(GRADIENT.positionNotSung);
    expect(s2?.state).toBe('notSung');
  });

  it('kata yang sudah lewat ada di posisi akhir (100%)', () => {
    const animator = new LyricsAnimator(lyrics);
    const timed = lyrics.lines.find((l) => !l.interlude);
    if (!timed) return;
    const first = timed.lead.syllables[0];
    const frame = animator.frame(first.end + 5, FRAME, [timed.index]);
    const style = frame.syllables.get(syllableKey(timed.index, -1, 0));
    expect(style?.gradientPosition).toBe(GRADIENT.positionSung);
    expect(style?.state).toBe('sung');
  });

  it('kata aktif bergerak monoton dari -20 ke 100 seiring progres', () => {
    const animator = new LyricsAnimator(lyrics);
    const timed = lyrics.lines.find((l) => !l.interlude);
    if (!timed) return;
    const syl = timed.lead.syllables[0];

    const samples: number[] = [];
    for (let p = 0; p <= 1.0001; p += 0.1) {
      const t = syl.start + (syl.end - syl.start) * Math.min(p, 0.999);
      const frame = animator.frame(t, FRAME, [timed.index]);
      const style = frame.syllables.get(syllableKey(timed.index, -1, 0));
      if (style) samples.push(style.gradientPosition);
    }

    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
    expect(samples[0]).toBeCloseTo(GRADIENT.positionNotSung, 3);
    expect(samples[samples.length - 1]).toBeGreaterThan(80);
  });

  it('rentang gerak persis 120 (dari -20 ke 100)', () => {
    expect(GRADIENT.positionSung - GRADIENT.positionNotSung).toBe(
      GRADIENT.positionRange,
    );
  });
});

describe('LyricsAnimator — skala & emphasis', () => {
  const lyrics = load('die-with-a-smile');

  it('kata diam berada di sekitar skala idle 0.95', () => {
    const animator = new LyricsAnimator(lyrics);
    const timed = lyrics.lines.find((l) => !l.interlude);
    if (!timed) return;
    const frame = animator.frame(0, FRAME, [timed.index]);
    const style = frame.syllables.get(syllableKey(timed.index, -1, 0));
    expect(style?.scale).toBeCloseTo(0.95, 2);
  });

  it('kata aktif tumbuh melewati 1', () => {
    const animator = new LyricsAnimator(lyrics);
    const timed = lyrics.lines.find((l) => !l.interlude);
    if (!timed) return;
    const syl = timed.lead.syllables[0];

    let maxScale = 0;
    for (let t = syl.start; t <= syl.end + 0.5; t += FRAME) {
      const frame = animator.frame(t, FRAME, [timed.index]);
      const style = frame.syllables.get(syllableKey(timed.index, -1, 0));
      if (style) maxScale = Math.max(maxScale, style.scale);
    }
    expect(maxScale).toBeGreaterThan(1);
  });

  it('kata emphasis tumbuh LEBIH tinggi daripada kata biasa', () => {
    // Cari satu kata panjang (emphasis) dan satu kata pendek di fixture nyata.
    const emphasisLine = lyrics.lines.find(
      (l) => !l.interlude && l.lead.syllables.some((s) => s.emphasis),
    );
    const plainLine = lyrics.lines.find(
      (l) => !l.interlude && l.lead.syllables.every((s) => !s.emphasis),
    );
    expect(emphasisLine).toBeDefined();
    expect(plainLine).toBeDefined();
    if (!emphasisLine || !plainLine) return;

    const peak = (lineIndex: number, sylIndex: number, start: number, end: number) => {
      const a = new LyricsAnimator(lyrics);
      let max = 0;
      for (let t = start - 0.2; t <= end + 0.6; t += FRAME) {
        const f = a.frame(t, FRAME, [lineIndex]);
        const s = f.syllables.get(syllableKey(lineIndex, -1, sylIndex));
        if (s) max = Math.max(max, s.scale);
      }
      return max;
    };

    const ei = emphasisLine.lead.syllables.findIndex((s) => s.emphasis);
    const es = emphasisLine.lead.syllables[ei];
    const ps = plainLine.lead.syllables[0];

    const emphasisPeak = peak(emphasisLine.index, ei, es.start, es.end);
    const plainPeak = peak(plainLine.index, 0, ps.start, ps.end);

    expect(emphasisPeak).toBeGreaterThan(plainPeak);
  });
});

describe('LyricsAnimator — blur berdasarkan jarak', () => {
  const animator = new LyricsAnimator(load('die-with-a-smile'));

  it('baris aktif TIDAK diburamkan', () => {
    expect(animator.blurForDistance(0)).toBe(0);
  });

  it('blur naik linear × 1.25 lalu dibatasi', () => {
    expect(animator.blurForDistance(1)).toBeCloseTo(1.25, 6);
    expect(animator.blurForDistance(2)).toBeCloseTo(2.5, 6);
    expect(animator.blurForDistance(3)).toBeCloseTo(3.75, 6);
    expect(animator.blurForDistance(100)).toBeCloseTo(BLUR.max, 6);
  });

  it('batas atas = 1.25×5 + 1.25×0.465 (nilai spicy-lyrics)', () => {
    expect(BLUR.max).toBeCloseTo(6.83125, 6);
  });
});

describe('LyricsAnimator — opacity baris', () => {
  const lyrics = load('die-with-a-smile');
  const animator = new LyricsAnimator(lyrics);

  it('baris aktif opacity 1', () => {
    const timed = lyrics.lines.find((l) => !l.interlude);
    if (!timed) return;
    const mid = (timed.start + timed.end) / 2;
    const frame = animator.frame(mid, FRAME, [timed.index]);
    expect(frame.lines.get(timed.index)?.opacity).toBe(LINE_OPACITY.active);
  });

  it('baris yang sudah lewat LEBIH REDUP dari yang belum (0.497 < 0.51)', () => {
    // Ini bukan salah tulis di token — baris lewat sengaja mundur lebih jauh.
    expect(LINE_OPACITY.sung).toBeLessThan(LINE_OPACITY.notSung);
  });
});

describe('LyricsAnimator — vokal latar', () => {
  const lyrics = load('peradaban');

  it('kelompok background punya gaya sendiri, terpisah dari lead', () => {
    const withBg = lyrics.lines.find((l) => l.background.length > 0);
    expect(withBg).toBeDefined();
    if (!withBg) return;

    const animator = new LyricsAnimator(lyrics);
    const frame = animator.frame(withBg.start + 0.1, FRAME, [withBg.index]);

    expect(frame.syllables.has(syllableKey(withBg.index, -1, 0))).toBe(true);
    expect(frame.syllables.has(syllableKey(withBg.index, 0, 0))).toBe(true);
  });
});

describe('LyricsAnimator — ketahanan', () => {
  it('lagu 935 suku kata: satu frame penuh tetap terhitung tanpa NaN', () => {
    const lyrics = load('peradaban');
    const animator = new LyricsAnimator(lyrics);
    const frame = animator.frame(120, FRAME);
    for (const style of frame.syllables.values()) {
      expect(Number.isFinite(style.scale)).toBe(true);
      expect(Number.isFinite(style.gradientPosition)).toBe(true);
      expect(Number.isFinite(style.opacity)).toBe(true);
    }
  });

  it('visibleLines membatasi perhitungan', () => {
    const lyrics = load('peradaban');
    const animator = new LyricsAnimator(lyrics);
    const all = animator.frame(120, FRAME);
    const few = animator.frame(120, FRAME, [10, 11, 12]);
    expect(few.lines.size).toBe(3);
    expect(all.lines.size).toBeGreaterThan(few.lines.size);
  });

  it('dt nol tidak menghasilkan NaN', () => {
    const lyrics = load('bertaut');
    const animator = new LyricsAnimator(lyrics);
    const frame = animator.frame(60, 0);
    for (const style of frame.syllables.values()) {
      expect(Number.isFinite(style.scale)).toBe(true);
    }
  });

  it('reset() membuang state spring', () => {
    const lyrics = load('bertaut');
    const animator = new LyricsAnimator(lyrics);
    runTo(animator, 30);
    animator.reset();
    const timed = lyrics.lines.find((l) => !l.interlude);
    if (!timed) return;
    const frame = animator.frame(0, FRAME, [timed.index]);
    const style = frame.syllables.get(syllableKey(timed.index, -1, 0));
    // Setelah reset, spring mulai dari nilai idle lagi.
    expect(style?.scale).toBeCloseTo(0.95, 2);
  });

  it('lirik kosong tidak crash', () => {
    const empty: Lyrics = {
      kind: 'static',
      lines: [],
      source: 'fixture',
      attribution: null,
      instrumental: true,
    };
    const animator = new LyricsAnimator(empty);
    const frame = animator.frame(10, FRAME);
    expect(frame.lines.size).toBe(0);
    expect(frame.syllables.size).toBe(0);
    expect(animator.activeLineIndex(10)).toBe(0);
  });

  it('interlude tidak menghasilkan suku kata', () => {
    const lyrics = load('bertaut');
    const animator = new LyricsAnimator(lyrics);
    const interlude = lyrics.lines.find((l) => l.interlude);
    expect(interlude).toBeDefined();
    if (!interlude) return;
    const frame = animator.frame(interlude.start + 0.5, FRAME, [interlude.index]);
    expect(frame.syllables.size).toBe(0);
    expect(frame.lines.has(interlude.index)).toBe(true);
  });
});

describe('LyricsAnimator — lirik line-level TIDAK disapu per kata', () => {
  /**
   * Aturan produk, bukan selera: sumber line-level (LRCLIB) hanya tahu kapan
   * sebuah baris MULAI. Menggeser gradient perlahan di sepanjang baris berarti
   * menampilkan presisi yang tidak ada di datanya — BRIEF menyebutnya "sapuan
   * palsu" dan melarangnya. Baris aktif harus MENYALA penuh, bukan merayap.
   */
  const lineLevel: Lyrics = {
    kind: 'line',
    lines: [
      {
        index: 0,
        start: 10,
        end: 20,
        lead: {
          syllables: [
            { text: 'satu baris utuh', start: 10, end: 20, isPartOfWord: false, emphasis: false },
          ],
          start: 10,
          end: 20,
        },
        background: [],
        oppositeAligned: false,
        interlude: false,
        songPart: null,
        text: 'satu baris utuh',
      },
    ],
    source: 'lrclib',
    attribution: 'LRCLIB',
    instrumental: false,
  };

  const key = syllableKey(0, -1, 0);

  it('di TENGAH baris, gradient sudah penuh — bukan 50%', () => {
    const animator = new LyricsAnimator(lineLevel);
    const frame = animator.frame(15, FRAME, [0]);
    expect(frame.syllables.get(key)?.gradientPosition).toBe(GRADIENT.positionSung);
  });

  it('gradient penuh sejak awal baris, dan tetap penuh sampai akhir', () => {
    const animator = new LyricsAnimator(lineLevel);
    for (const t of [10.01, 12, 15, 18, 19.99, 25]) {
      const frame = animator.frame(t, FRAME, [0]);
      expect(frame.syllables.get(key)?.gradientPosition).toBe(GRADIENT.positionSung);
    }
  });

  it('sebelum baris mulai tetap belum tersapu', () => {
    const animator = new LyricsAnimator(lineLevel);
    const frame = animator.frame(5, FRAME, [0]);
    expect(frame.syllables.get(key)?.gradientPosition).toBe(GRADIENT.positionNotSung);
    expect(frame.syllables.get(key)?.state).toBe('notSung');
  });

  it('lirik word-level pada lagu nyata TETAP menyapu bertahap', () => {
    // Kontrol: perubahan di atas tidak boleh mematikan sapuan Apple.
    const lyrics = load('bertaut');
    const animator = new LyricsAnimator(lyrics);
    const line = lyrics.lines.find((l) => !l.interlude && l.lead.syllables.length > 3);
    expect(line).toBeDefined();
    if (!line) return;

    const syllable = line.lead.syllables[1];
    const mid = (syllable.start + syllable.end) / 2;
    const value = animator.frame(mid, FRAME, [line.index]).syllables.get(
      syllableKey(line.index, -1, 1),
    )?.gradientPosition;

    expect(value).toBeGreaterThan(GRADIENT.positionNotSung);
    expect(value).toBeLessThan(GRADIENT.positionSung);
  });
});

describe('LyricsAnimator — kata yang sudah dinyanyikan PULANG ke skala diam', () => {
  /**
   * Cacat yang ditutup di sini terukur di DOM: satu pane pernah memuat 219 span
   * diam di 1.0505/1.175 bersebelahan dengan 324 span di 0.95 — empat ukuran
   * huruf diam sekaligus, beda terjauh 24%. Karena `scale` tidak mengubah
   * layout, kata yang melebar menabrak tetangganya (jarak tinta -7,30px).
   *
   * Penyebabnya `SPLINE.scale` tanpa simpul `time: 1`: `at()` meng-clamp di
   * simpul terakhir, jadi `at(1)` mengembalikan PUNCAK, dan animator memakai
   * `splineAt = 1` untuk keadaan 'sung'.
   */
  const idle = SPLINE.scale[0].value;

  it('spline scale mengembalikan nilai DIAM di progres 1, bukan puncaknya', () => {
    expect(new LarasSpline(SPLINE.scale).at(1)).toBeCloseTo(idle, 6);
    expect(new LarasSpline(SPLINE.scaleEmphasis).at(1)).toBeCloseTo(idle, 6);
  });

  it('puncaknya tetap utuh di progres 0.7', () => {
    expect(new LarasSpline(SPLINE.scale).at(0.7)).toBeCloseTo(1.0505, 6);
    expect(new LarasSpline(SPLINE.scaleEmphasis).at(0.7)).toBeCloseTo(1.175, 6);
  });

  it('setelah lagu lewat, skala setiap suku kata kembali ke diam', () => {
    const lyrics = load('bertaut');
    const animator = new LyricsAnimator(lyrics);
    const line = lyrics.lines.find((l) => !l.interlude && l.lead.syllables.length > 2);
    expect(line).toBeDefined();
    if (!line) return;

    // Jalankan sampai jauh melewati baris itu supaya spring benar-benar tidur.
    let frame = animator.frame(line.end + 1, FRAME, [line.index]);
    for (let t = 0; t < 3; t += FRAME) {
      frame = animator.frame(line.end + 1 + t, FRAME, [line.index]);
    }

    for (let i = 0; i < line.lead.syllables.length; i += 1) {
      const style = frame.syllables.get(syllableKey(line.index, -1, i));
      expect(style?.state).toBe('sung');
      expect(style?.scale).toBeCloseTo(idle, 3);
    }
  });
});
