'use client';

/**
 * Renderer lirik — satu rAF loop, ratusan CSS custom property.
 *
 * KENAPA BUKAN framer-motion: lagu terpanjang di fixture punya 935 suku kata.
 * Satu komponen motion per kata berarti 935 komponen yang masing-masing
 * menjalankan siklus render React tiap frame — mati jauh sebelum 60fps.
 * Di sini React hanya merender struktur SEKALI, lalu satu loop menulis
 * nilai langsung ke elemen lewat ref. React tidak dilibatkan per frame.
 *
 * Yang membuat ini tetap murah:
 *  - Hanya baris yang terlihat (jendela di sekitar baris aktif) yang dihitung.
 *  - Nilai ditulis hanya kalau berubah melewati ambang (lihat writeIfChanged).
 *  - Blur/opacity per BARIS ditulis ke elemen baris, bukan ke tiap kata.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import styles from './lyrics.module.css';

import { LyricsAnimator, syllableKey } from '@/lib/lyrics/animator';
import { DOTS, GRADIENT, IDLE_SCALE } from '@/lib/lyrics/design-tokens';
import { toWordGroups } from '@/lib/lyrics/word-groups';
import type { Lyrics } from '@/lib/types';

export interface LyricsViewProps {
  lyrics: Lyrics;
  /** Fungsi yang mengembalikan posisi lagu (detik) — biasanya clock.read(). */
  getPosition: () => number;
  /** Klik baris untuk melompat ke waktunya. */
  onSeek?: (seconds: number) => void;
  /** Berapa baris di atas/bawah baris aktif yang ikut dirender. */
  window?: number;
  /** Matikan loop saat pane tidak terlihat (mis. mode video). */
  paused?: boolean;
}

/** Jumlah baris di luar viewport yang tetap dihitung, supaya masuk mulus. */
const DEFAULT_WINDOW = 9;

/**
 * Tulis custom property hanya kalau berubah cukup berarti.
 *
 * Tanpa ambang ini, spring yang hampir tidur tetap menulis nilai berbeda di
 * desimal ke-15 setiap frame — ratusan penulisan DOM sia-sia per frame.
 */
function writeIfChanged(
  el: HTMLElement,
  cache: Map<string, number>,
  cacheKey: string,
  property: string,
  value: number,
  threshold: number,
  unit: string,
): void {
  const previous = cache.get(cacheKey);
  if (previous !== undefined && Math.abs(previous - value) < threshold) return;
  cache.set(cacheKey, value);
  el.style.setProperty(property, `${value}${unit}`);
}

export function LyricsView({
  lyrics,
  getPosition,
  onSeek,
  window: windowSize = DEFAULT_WINDOW,
  paused = false,
}: LyricsViewProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef(new Map<number, HTMLElement>());
  const wordRefs = useRef(new Map<string, HTMLElement>());
  const dotRefs = useRef(new Map<number, HTMLElement[]>());

  /** Cache nilai terakhir yang ditulis, untuk menekan penulisan berulang. */
  const styleCache = useRef(new Map<string, number>());

  /** Baris aktif terakhir — dipakai untuk memutuskan kapan auto-scroll. */
  const lastScrolledLine = useRef(-1);

  const animator = useMemo(() => new LyricsAnimator(lyrics), [lyrics]);

  /* Sumber tanpa timing per kata menaruh SELURUH kalimat di satu suku kata, jadi
     pengelompokan kata tidak punya arti di sana dan justru membuat baris tidak
     bisa membungkus. Lihat `.lineLevel` di lyrics.module.css. */
  const lineLevel = lyrics.kind !== 'syllable';

  /**
   * Cache gaya dibuang saat lirik berganti.
   *
   * PENTING: JANGAN membersihkan lineRefs/wordRefs di sini. Ref callback
   * dijalankan pada fase commit — SEBELUM efek. Mengosongkan Map di efek akan
   * membuang ref yang baru saja terdaftar, dan rAF loop lalu berjalan dengan
   * Map kosong: animasi tampak mati padahal animatornya benar. Ini bug nyata
   * yang sudah pernah terjadi di sini. Ref dibersihkan sendiri oleh callback
   * yang dipanggil dengan null saat elemen dilepas.
   */
  useEffect(() => {
    styleCache.current.clear();
    lastScrolledLine.current = -1;
  }, [lyrics]);

  const registerLine = useCallback((index: number, el: HTMLElement | null) => {
    if (el) lineRefs.current.set(index, el);
    else lineRefs.current.delete(index);
  }, []);

  const registerWord = useCallback((key: string, el: HTMLElement | null) => {
    if (el) wordRefs.current.set(key, el);
    else wordRefs.current.delete(key);
  }, []);

  const registerDot = useCallback((lineIndex: number, el: HTMLElement | null) => {
    const list = dotRefs.current.get(lineIndex) ?? [];
    if (el) {
      list.push(el);
      dotRefs.current.set(lineIndex, list);
    } else {
      dotRefs.current.delete(lineIndex);
    }
  }, []);

  useEffect(() => {
    if (paused) return;

    /**
     * Cache dibuang setiap kali loop dimulai.
     *
     * Ini WAJIB di sini, bukan di efek terpisah: kalau komponen dilepas lalu
     * dipasang lagi (mis. pengguna beralih ke mode video dan kembali), elemen
     * DOM-nya baru dan inline style-nya kosong — tapi cache lama masih
     * menyimpan nilai yang sama, sehingga writeIfChanged menyimpulkan "tidak
     * berubah" dan TIDAK PERNAH menulis apa pun lagi. Gejalanya: lirik diam
     * total padahal animator menghitung dengan benar. Terbukti terjadi.
     */
    styleCache.current.clear();

    let raf = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1); // jepit lompatan tab
      lastTime = now;

      const position = getPosition();
      const activeIndex = animator.activeLineIndex(position);

      // Hanya jendela di sekitar baris aktif yang dihitung & ditulis.
      const from = Math.max(0, activeIndex - windowSize);
      const to = Math.min(lyrics.lines.length - 1, activeIndex + windowSize);
      const visible: number[] = [];
      for (let i = from; i <= to; i += 1) visible.push(i);

      const frame = animator.frame(position, dt, visible);
      const cache = styleCache.current;

      for (const [lineIndex, lineStyle] of frame.lines) {
        const el = lineRefs.current.get(lineIndex);
        if (!el) continue;

        writeIfChanged(el, cache, `l${lineIndex}o`, '--line-opacity', lineStyle.opacity, 0.01, '');
        el.style.opacity = String(lineStyle.opacity);
        writeIfChanged(el, cache, `l${lineIndex}b`, '--blur-amount', lineStyle.blurPx, 0.25, 'px');
      }

      for (const [key, style] of frame.syllables) {
        const el = wordRefs.current.get(key);
        if (!el) continue;

        writeIfChanged(el, cache, `${key}g`, '--gradient-position', style.gradientPosition, 0.4, '%');
        writeIfChanged(el, cache, `${key}sb`, '--text-shadow-blur', style.glowBlurPx, 0.4, 'px');
        writeIfChanged(el, cache, `${key}so`, '--text-shadow-opacity', style.glowOpacityPercent, 1, '%');

        // transform digabung jadi satu penulisan: dua penulisan terpisah
        // (scale lalu translate) akan menimpa satu sama lain.
        /* Skala ditulis RELATIF terhadap skala diam.
           `.wordGroup` sudah membawa `scale(IDLE_SCALE)`, dan transform induk
           berkali dengan transform anak — jadi menulis skala absolut di sini
           menghasilkan 0.95 x 0.95. Animator sengaja tetap mengeluarkan angka
           ABSOLUT supaya bisa diuji langsung terhadap angka desain. */
        const relativeScale = style.scale / IDLE_SCALE;

        /* Ambang dinormalkan per properti, bukan dikemas jadi satu angka.
           Pengemasan lama (`scale * 1000 + yOffset`) membuat ambang efektif
           untuk skala jadi 0.002/1000 = 2e-6, sehingga `writeIfChanged`
           praktis tidak pernah menahan apa pun: terukur p95 190 penulisan
           transform per frame, maks 192. */
        const cached = cache.get(`${key}t`);
        const packed = Math.round(relativeScale * 1000) + Math.round(style.yOffsetEm * 1000) / 1e6;
        if (cached === undefined || cached !== packed) {
          cache.set(`${key}t`, packed);
          el.style.transform = `translateY(${style.yOffsetEm}em) scale(${relativeScale})`;
        }
      }

      // Titik interlude berdenyut bergantian — tanda jeda instrumental.
      const dots = dotRefs.current.get(activeIndex);
      if (dots && dots.length > 0) {
        const line = lyrics.lines[activeIndex];
        if (line?.interlude) {
          const elapsed = position - line.start;
          dots.forEach((dot, i) => {
            const phase =
              (elapsed / DOTS.pulseIntervalSeconds - i * 0.22) % 1;
            const eased = phase < 0 ? 0 : Math.sin(phase * Math.PI);
            dot.style.opacity = String(DOTS.opacity + eased * 0.5);
            dot.style.transform = `scale(${DOTS.scale + eased * 0.25})`;
          });
        }
      }

      // Auto-scroll: hanya saat baris aktif BERGANTI, bukan tiap frame.
      // Kalau tiap frame, scroll-nya berkelahi dengan scroll manual pengguna.
      if (activeIndex !== lastScrolledLine.current) {
        lastScrolledLine.current = activeIndex;
        const el = lineRefs.current.get(activeIndex);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animator, getPosition, lyrics, paused, windowSize]);

  if (lyrics.lines.length === 0) {
    return (
      <div className={styles.larasLyrics}>
        <div className={styles.scroller}>
          <p className="text-base font-medium text-laras-tertiary">
            Lirik tidak tersedia untuk lagu ini.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.larasLyrics} ref={scrollerRef}>
      <div className={styles.scroller}>
        {lyrics.lines.map((line) => {
          if (line.interlude) {
            return (
              <div
                key={line.index}
                ref={(el) => registerLine(line.index, el)}
                className={`${styles.line} ${styles.interlude}`}
                onClick={() => onSeek?.(line.end)}
                role="button"
                tabIndex={0}
                aria-label="Jeda instrumental, lewati"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSeek?.(line.end);
                  }
                }}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    ref={(el) => registerDot(line.index, el)}
                    className={styles.dot}
                    aria-hidden="true"
                  />
                ))}
              </div>
            );
          }

          return (
            <div key={line.index} className="contents">
              <div
                ref={(el) => registerLine(line.index, el)}
                className={`${styles.line} ${line.oppositeAligned ? styles.opposite : ''}`}
                style={{ opacity: GRADIENT.alphaEnd }}
                onClick={() => onSeek?.(line.start)}
                role="button"
                tabIndex={0}
                aria-label={`Lompat ke: ${line.text}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSeek?.(line.start);
                  }
                }}
              >
                {toWordGroups(line.lead.syllables).map((indices) => (
                  <span
                    key={indices[0]}
                    className={lineLevel ? styles.lineLevel : styles.wordGroup}
                  >
                    {indices.map((i) => {
                      const key = syllableKey(line.index, -1, i);
                      return (
                        <span
                          key={key}
                          ref={(el) => registerWord(key, el)}
                          className={styles.word}
                        >
                          {line.lead.syllables[i].text}
                        </span>
                      );
                    })}
                  </span>
                ))}

                {line.background.map((group, groupIndex) => (
                  <div
                    key={groupIndex}
                    className={`${styles.background} ${line.oppositeAligned ? styles.opposite : ''}`}
                  >
                    {toWordGroups(group.syllables).map((indices) => (
                      <span
                        key={indices[0]}
                        className={lineLevel ? styles.lineLevel : styles.wordGroup}
                      >
                        {indices.map((i) => {
                          const key = syllableKey(line.index, groupIndex, i);
                          return (
                            <span
                              key={key}
                              ref={(el) => registerWord(key, el)}
                              className={styles.word}
                            >
                              {group.syllables[i].text}
                            </span>
                          );
                        })}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {lyrics.attribution ? (
          <p className={styles.credit}>Lirik oleh {lyrics.attribution}</p>
        ) : null}
      </div>
    </div>
  );
}
