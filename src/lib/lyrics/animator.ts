/**
 * Animator lirik — otak dari sapuan per kata.
 *
 * Kelas ini MURNI matematika: ia menerima posisi waktu dan mengeluarkan angka
 * gaya untuk setiap suku kata. Tidak menyentuh DOM sama sekali. Alasannya dua:
 * bisa diuji penuh di Node, dan renderer bebas memutuskan cara menulis nilainya
 * (CSS custom property, style langsung, atau canvas).
 *
 * Struktur per frame:
 *   1. Tentukan keadaan tiap suku kata: NotSung / Active / Sung.
 *   2. Hitung progres (0..1) untuk yang Active.
 *   3. Ambil target dari spline (fungsi progres).
 *   4. Umpankan target ke spring, lalu step() dengan dt.
 * Dua lapis pelembutan (spline lalu spring) itulah yang membuat gerakannya
 * terasa organik, bukan seperti tween CSS biasa.
 */

import {
  BLUR,
  GLOW,
  GRADIENT,
  LINE_OPACITY,
  SPLINE,
  SPRING,
} from '@/lib/lyrics/design-tokens';
import { LarasSpline } from '@/lib/lyrics/spline';
import { LarasSpring } from '@/lib/lyrics/spring';
import type { Lyrics, LyricLine } from '@/lib/types';

export type SyllableState = 'notSung' | 'active' | 'sung';
export type LineState = 'notSung' | 'active' | 'sung';

/** Nilai gaya untuk satu suku kata pada satu frame. */
export interface SyllableStyle {
  /** Posisi gradient dalam persen: -20 (belum) .. 100 (selesai). */
  gradientPosition: number;
  scale: number;
  /** Offset vertikal dalam satuan em (negatif = naik). */
  yOffsetEm: number;
  /** Radius blur text-shadow (px) untuk efek glow. */
  glowBlurPx: number;
  /** Opacity text-shadow glow dalam persen. */
  glowOpacityPercent: number;
  opacity: number;
  state: SyllableState;
}

/** Nilai gaya untuk satu baris pada satu frame. */
export interface LineStyle {
  opacity: number;
  /** Blur baris jauh via text-shadow (px), 0 untuk baris aktif. */
  blurPx: number;
  state: LineState;
  /** Jarak baris ini dari baris aktif (0 = aktif). */
  distance: number;
}

/** Hasil satu frame: gaya per baris + per suku kata + indeks baris aktif. */
export interface AnimationFrame {
  activeLineIndex: number;
  lines: Map<number, LineStyle>;
  /** Kunci: "lineIndex:groupIndex:syllableIndex". groupIndex -1 = lead. */
  syllables: Map<string, SyllableStyle>;
}

/** Kunci stabil untuk satu suku kata. Dipakai renderer untuk memetakan elemen. */
export function syllableKey(
  lineIndex: number,
  groupIndex: number,
  syllableIndex: number,
): string {
  return `${lineIndex}:${groupIndex}:${syllableIndex}`;
}

/** Kumpulan spring untuk satu suku kata. */
interface SyllableSprings {
  scale: LarasSpring;
  yOffset: LarasSpring;
  glow: LarasSpring;
  opacity: LarasSpring;
}

const SPLINES = {
  scale: new LarasSpline(SPLINE.scale),
  scaleEmphasis: new LarasSpline(SPLINE.scaleEmphasis),
  yOffset: new LarasSpline(SPLINE.yOffset),
  glow: new LarasSpline(SPLINE.glow),
  opacity: new LarasSpline(SPLINE.opacity),
} as const;

function stateOf(position: number, start: number, end: number): SyllableState {
  if (position < start) return 'notSung';
  if (position >= end) return 'sung';
  return 'active';
}

function progressOf(position: number, start: number, end: number): number {
  if (position <= start) return 0;
  if (position >= end) return 1;
  const span = end - start;
  // Suku kata berdurasi nol (data rusak) tidak boleh jadi pembagian nol.
  if (span <= 0) return 1;
  return (position - start) / span;
}

export class LyricsAnimator {
  private lyrics: Lyrics;
  private springs = new Map<string, SyllableSprings>();
  /** Indeks baris aktif terakhir, dipakai untuk menghitung jarak blur. */
  private lastActiveLine = 0;

  constructor(lyrics: Lyrics) {
    this.lyrics = lyrics;
  }

  /** Ganti lirik (lagu baru) dan buang seluruh state spring. */
  setLyrics(lyrics: Lyrics): void {
    this.lyrics = lyrics;
    this.springs.clear();
    this.lastActiveLine = 0;
  }

  /**
   * Buang state spring tanpa mengganti lirik — dipakai setelah seek.
   *
   * Tanpa ini, seek ke tengah lagu membuat semua kata "mengejar" dari nilai
   * lamanya, terlihat seperti gelombang animasi yang tidak diminta.
   */
  reset(): void {
    this.springs.clear();
  }

  /**
   * Baris yang sedang dinyanyikan pada posisi tertentu.
   *
   * Kalau posisi jatuh di celah antar baris, yang dikembalikan adalah baris
   * TERAKHIR yang sudah lewat — bukan yang berikutnya. Itu yang membuat
   * auto-scroll tidak melompat maju terlalu dini saat instrumental.
   */
  activeLineIndex(position: number): number {
    const lines = this.lyrics.lines;
    if (lines.length === 0) return 0;

    // Baris terurut, jadi binary search: cari baris terakhir dengan start <= position.
    let lo = 0;
    let hi = lines.length - 1;
    let found = 0;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].start <= position) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    return found;
  }

  private springsFor(key: string, emphasis: boolean): SyllableSprings {
    const existing = this.springs.get(key);
    if (existing) return existing;

    const scaleSpline = emphasis ? SPLINES.scaleEmphasis : SPLINES.scale;
    const created: SyllableSprings = {
      scale: new LarasSpring(
        scaleSpline.at(0),
        SPRING.scale.frequency,
        SPRING.scale.damping,
      ),
      yOffset: new LarasSpring(
        SPLINES.yOffset.at(0),
        SPRING.yOffset.frequency,
        SPRING.yOffset.damping,
      ),
      glow: new LarasSpring(
        SPLINES.glow.at(0),
        SPRING.glow.frequency,
        SPRING.glow.damping,
      ),
      opacity: new LarasSpring(
        SPLINES.opacity.at(0),
        SPRING.opacity.frequency,
        SPRING.opacity.damping,
      ),
    };
    this.springs.set(key, created);
    return created;
  }

  /**
   * Blur untuk baris berjarak `distance` dari baris aktif.
   *
   * Linear × 1.25 dengan batas atas — persis rumus spicy-lyrics. Ini
   * text-shadow, BUKAN filter: blur(), jadi biayanya jauh lebih ringan dan
   * hasilnya "lembut bercahaya" bukan "kabur".
   */
  blurForDistance(distance: number): number {
    if (distance === 0) return 0;
    return Math.min(BLUR.multiplier * distance, BLUR.max);
  }

  /**
   * Hitung satu frame.
   *
   * @param position posisi lagu dalam detik (dari LyricsClock)
   * @param dt waktu yang berlalu sejak frame lalu, dalam DETIK
   * @param visibleLines indeks baris yang benar-benar dirender; hanya ini yang
   *        dihitung. Baris di luar viewport tidak perlu spring-nya di-step —
   *        pada lagu 935 suku kata, menghitung semuanya membuang frame budget.
   */
  frame(position: number, dt: number, visibleLines?: readonly number[]): AnimationFrame {
    const activeLineIndex = this.activeLineIndex(position);
    this.lastActiveLine = activeLineIndex;

    const lineStyles = new Map<number, LineStyle>();
    const syllableStyles = new Map<string, SyllableStyle>();

    const indices =
      visibleLines ?? this.lyrics.lines.map((_, i) => i);

    for (const lineIndex of indices) {
      const line = this.lyrics.lines[lineIndex];
      if (!line) continue;

      const distance = Math.abs(lineIndex - activeLineIndex);
      const lineState: LineState =
        lineIndex === activeLineIndex
          ? 'active'
          : position >= line.end
            ? 'sung'
            : 'notSung';

      lineStyles.set(lineIndex, {
        opacity:
          lineState === 'active'
            ? LINE_OPACITY.active
            : lineState === 'sung'
              ? LINE_OPACITY.sung
              : LINE_OPACITY.notSung,
        blurPx: this.blurForDistance(distance),
        state: lineState,
        distance,
      });

      this.stepGroup(line, lineIndex, -1, position, dt, syllableStyles);
      line.background.forEach((_, groupIndex) => {
        this.stepGroup(line, lineIndex, groupIndex, position, dt, syllableStyles);
      });
    }

    return { activeLineIndex, lines: lineStyles, syllables: syllableStyles };
  }

  private stepGroup(
    line: LyricLine,
    lineIndex: number,
    groupIndex: number,
    position: number,
    dt: number,
    out: Map<string, SyllableStyle>,
  ): void {
    const group = groupIndex === -1 ? line.lead : line.background[groupIndex];
    if (!group) return;

    group.syllables.forEach((syllable, syllableIndex) => {
      const key = syllableKey(lineIndex, groupIndex, syllableIndex);
      const springs = this.springsFor(key, syllable.emphasis);
      const state = stateOf(position, syllable.start, syllable.end);
      const progress = progressOf(position, syllable.start, syllable.end);

      const scaleSpline = syllable.emphasis ? SPLINES.scaleEmphasis : SPLINES.scale;

      // Target spring diambil dari spline. Untuk keadaan NotSung/Sung kita
      // pakai ujung spline (0 atau 1) supaya kata pulang ke posisi diamnya
      // lewat spring yang sama — bukan lompat.
      const splineAt = state === 'active' ? progress : state === 'sung' ? 1 : 0;

      springs.scale.setGoal(scaleSpline.at(splineAt));
      springs.yOffset.setGoal(SPLINES.yOffset.at(splineAt));
      springs.glow.setGoal(SPLINES.glow.at(splineAt));
      springs.opacity.setGoal(SPLINES.opacity.at(splineAt));

      const scale = springs.scale.step(dt);
      const yOffset = springs.yOffset.step(dt);
      const glow = springs.glow.step(dt);
      const opacity = springs.opacity.step(dt);

      const gradientPosition =
        state === 'active'
          ? GRADIENT.positionNotSung + GRADIENT.positionRange * progress
          : state === 'sung'
            ? GRADIENT.positionSung
            : GRADIENT.positionNotSung;

      out.set(key, {
        gradientPosition,
        scale,
        yOffsetEm: yOffset,
        glowBlurPx: GLOW.blurBase + GLOW.blurScale * glow,
        glowOpacityPercent: Math.min(glow * GLOW.opacityFactor, GLOW.opacityMax),
        opacity,
        state,
      });
    });
  }

  /** Indeks baris aktif dari frame terakhir, tanpa menghitung ulang. */
  get currentLineIndex(): number {
    return this.lastActiveLine;
  }
}
