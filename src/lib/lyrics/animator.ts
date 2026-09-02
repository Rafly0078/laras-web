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

/** Nilai target satu suku kata pada satu frame, hasil spline sebelum spring. */
interface SyllableTargets {
  scale: number;
  yOffset: number;
  glow: number;
  opacity: number;
}

const SPLINES = {
  scale: new LarasSpline(SPLINE.scale),
  scaleEmphasis: new LarasSpline(SPLINE.scaleEmphasis),
  yOffset: new LarasSpline(SPLINE.yOffset),
  glow: new LarasSpline(SPLINE.glow),
  opacity: new LarasSpline(SPLINE.opacity),
} as const;

/**
 * Keadaan satu suku kata pada posisi tertentu.
 *
 * Guard span pertama menangani data TTML rusak: durasi nol (start === end),
 * durasi negatif (end < start), dan NaN. Tanpa itu, `end` NaN membuat kedua
 * perbandingan di bawah bernilai false sekaligus — suku kata tersangkut
 * 'active' selamanya dan seluruh nilai gayanya jadi NaN.
 */
function stateOf(position: number, start: number, end: number): SyllableState {
  if (!(end > start)) return position < start ? 'notSung' : 'sung';
  if (position < start) return 'notSung';
  if (position >= end) return 'sung';
  return 'active';
}

function progressOf(position: number, start: number, end: number): number {
  const span = end - start;
  // Sama seperti stateOf: span nol/negatif/NaN tidak boleh jadi pembagian nol
  // atau NaN. Suku kata seperti itu tidak punya "tengah" — begitu posisi
  // mencapai start ia langsung dianggap selesai.
  if (!(span > 0)) return position < start ? 0 : 1;
  if (position <= start) return 0;
  if (position >= end) return 1;
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

  /**
   * Spring untuk satu suku kata, dibuat saat pertama kali dibutuhkan.
   *
   * KENAPA spring baru dimulai DI TARGET SEKARANG, bukan di nilai idle:
   * `frame()` hanya menghitung baris yang terlihat, jadi spring sebuah suku
   * kata baru lahir saat barisnya masuk jendela. Untuk suku kata yang belum
   * dinyanyikan itu tidak ada bedanya (target-nya memang nilai idle). Tapi
   * setelah seek — atau saat jendela bergeser cepat — suku kata yang sudah
   * 'sung' juga baru lahir di sana, dan kalau ia mulai dari idle ia akan
   * MENGEJAR target-nya sepanjang ~1,5 detik. Terukur: skala merangkak
   * 0.95041 → 1.05050 (Δ 0.1001) selama 90 frame untuk SELURUH blok kata yang
   * sudah lewat sekaligus. Itu gelombang yang justru dilarang oleh komentar
   * `reset()` di atas — dan `reset()` sendiri yang memicunya.
   */
  private springsFor(key: string, initial: SyllableTargets): SyllableSprings {
    const existing = this.springs.get(key);
    if (existing) return existing;

    const created: SyllableSprings = {
      scale: new LarasSpring(
        initial.scale,
        SPRING.scale.frequency,
        SPRING.scale.damping,
      ),
      yOffset: new LarasSpring(
        initial.yOffset,
        SPRING.yOffset.frequency,
        SPRING.yOffset.damping,
      ),
      glow: new LarasSpring(
        initial.glow,
        SPRING.glow.frequency,
        SPRING.glow.damping,
      ),
      opacity: new LarasSpring(
        initial.opacity,
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

    /*
     * Sapuan per kata hanya sah kalau sumbernya MEMANG punya timing per kata.
     *
     * Lirik LRCLIB (kind 'line') cuma tahu kapan sebuah baris mulai. Baris itu
     * masuk sebagai SATU suku kata sepanjang baris, jadi kalau ia diperlakukan
     * seperti kata biasa, gradient akan merayap dari kiri ke kanan selama lima
     * detik — gerakan yang terlihat presisi padahal datanya tidak ada. BRIEF
     * menyebutnya "sapuan palsu" dan melarangnya.
     *
     * Jadi untuk kind selain 'syllable': baris aktif MENYALA penuh (spring tetap
     * dipakai supaya nyalanya tidak mengedip), tanpa gerakan horizontal.
     */
    const sweeps = this.lyrics.kind === 'syllable';

    group.syllables.forEach((syllable, syllableIndex) => {
      const key = syllableKey(lineIndex, groupIndex, syllableIndex);
      const state = stateOf(position, syllable.start, syllable.end);
      const progress = progressOf(position, syllable.start, syllable.end);

      const scaleSpline = syllable.emphasis ? SPLINES.scaleEmphasis : SPLINES.scale;

      // Target spring diambil dari spline. Untuk keadaan NotSung/Sung kita
      // pakai ujung spline (0 atau 1) supaya kata bergerak ke posisi diamnya
      // lewat spring yang sama — bukan lompat.
      const splineAt =
        state === 'notSung' ? 0 : state === 'sung' ? 1 : sweeps ? progress : 1;

      const target: SyllableTargets = {
        scale: scaleSpline.at(splineAt),
        yOffset: SPLINES.yOffset.at(splineAt),
        glow: SPLINES.glow.at(splineAt),
        opacity: SPLINES.opacity.at(splineAt),
      };

      const springs = this.springsFor(key, target);
      springs.scale.setGoal(target.scale);
      springs.yOffset.setGoal(target.yOffset);
      springs.glow.setGoal(target.glow);
      springs.opacity.setGoal(target.opacity);

      const scale = springs.scale.step(dt);
      const yOffset = springs.yOffset.step(dt);
      const glow = springs.glow.step(dt);
      const opacity = springs.opacity.step(dt);

      const gradientPosition =
        state === 'notSung'
          ? GRADIENT.positionNotSung
          : state === 'sung' || !sweeps
            ? GRADIENT.positionSung
            : GRADIENT.positionNotSung + GRADIENT.positionRange * progress;

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
