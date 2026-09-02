// @vitest-environment jsdom
/*
 * Uji rangkaian (smoke test) untuk mesin lirik spicy-lyrics yang di-vendor.
 *
 * Bukan uji animasi — matematika sapuan sudah punya ujinya sendiri di
 * `src/lib/lyrics/animator.test.ts`. Yang dijaga di sini hanya SATU hal: bahwa
 * rantai Applyer -> shim container -> shim virtualizer -> Animator benar-benar
 * nyambung, sehingga adapter React berikutnya tidak mewarisi pane kosong yang
 * penyebabnya tak kelihatan (nol error di konsol, nol DOM).
 *
 * Semua "lirik" di file ini suku kata karangan (aa/bb/cc) — bukan teks lagu.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { ApplySyllableLyrics } from '../utils/Lyrics/Applyer/Synced/Syllable';
import { Animate } from '../utils/Lyrics/Animator/Lyrics/LyricsAnimator';
import { TimeSetter } from '../utils/Lyrics/Animator/Lyrics/LyricsSetter';
import { LyricsObject } from './lyrics';
import { setLyricsPageContainer } from './PageView';
import { $currentLyricsType } from './stores';

/**
 * Waktu dalam DETIK, seperti payload upstream (Applyer mengalikan 1000 sendiri).
 * Suku kata 1 detik penuh ("cc", "gg") sengaja dipakai: `IsLetterCapable`
 * memecah kata >= 1000ms jadi huruf-per-huruf lewat `Emphasize`.
 */
const DATA = {
  Type: 'Syllable',
  StartTime: 4,
  Content: [
    {
      Lead: {
        StartTime: 4,
        EndTime: 6,
        Syllables: [
          { Text: 'aa ', StartTime: 4, EndTime: 4.4 },
          { Text: 'bb ', StartTime: 4.4, EndTime: 5 },
          { Text: 'cc', StartTime: 5, EndTime: 6 },
        ],
      },
    },
    {
      Lead: {
        StartTime: 6.5,
        EndTime: 7.5,
        Syllables: [
          { Text: 'dd ', StartTime: 6.5, EndTime: 7 },
          { Text: 'ee', StartTime: 7, EndTime: 7.5 },
        ],
      },
      Background: [
        {
          StartTime: 6.6,
          EndTime: 7.4,
          Syllables: [{ Text: 'ff', StartTime: 6.6, EndTime: 7.4 }],
        },
      ],
      OppositeAligned: true,
    },
    {
      // Jarak 4,5 detik dari baris sebelumnya (>= 3) -> memicu baris titik.
      Lead: {
        StartTime: 12,
        EndTime: 13,
        Syllables: [{ Text: 'gg', StartTime: 12, EndTime: 13 }],
      },
    },
  ],
};

function mount(): HTMLElement {
  document.body.innerHTML = '';
  const host = document.createElement('div');
  document.body.appendChild(host);
  // Kerangka .LyricsContainer/.LyricsContent dibuat shim PageView sendiri.
  setLyricsPageContainer(host);
  ApplySyllableLyrics(DATA);
  return host;
}

describe('mesin lirik vendor — rangkaian shim', () => {
  beforeEach(() => {
    $currentLyricsType.set('Syllable');
  });

  it('memasang seluruh baris ke DOM lewat shim virtualizer', () => {
    const host = mount();

    const content = host.querySelector('.LyricsContainer .LyricsContent');
    expect(content).not.toBeNull();
    expect(content?.querySelector('.SpicyLyricsScrollContainer')).not.toBeNull();

    const virtual = host.querySelector('.VirtualLyricsContainer');
    expect(virtual).not.toBeNull();

    // 2 baris titik (awal + jeda) + 3 baris lead + 1 baris latar.
    expect(virtual?.querySelectorAll('.line').length).toBe(6);
    expect(virtual?.querySelectorAll('.musical-line').length).toBe(2);
    expect(virtual?.querySelectorAll('.bg-line').length).toBe(1);
    expect(virtual?.querySelectorAll('.dotGroup .dot').length).toBe(6);
    expect(virtual?.querySelectorAll('.OppositeAligned').length).toBe(2);

    // Papan tulis animator ikut terisi dan urutannya sama dengan DOM.
    expect(LyricsObject.Types.Syllable.Lines.length).toBe(6);
    expect(LyricsObject.Types.Syllable.Lines[1].Syllables?.Lead.length).toBe(3);

    // Suku kata 1 detik jadi kelompok huruf; yang pendek tetap satu .word.
    expect(virtual?.querySelectorAll('.letterGroup').length).toBe(2);
    expect(
      virtual?.querySelectorAll('.letterGroup .letter.Emphasis').length,
    ).toBe(4);
  });

  it('Animate menulis kelas dan custom property ke elemen yang terpasang', () => {
    const host = mount();
    const lines = LyricsObject.Types.Syllable.Lines;

    // 4600ms = di tengah suku kata kedua baris pertama.
    TimeSetter(4600);
    Animate(4600);

    const activeLine = lines[1].HTMLElement;
    expect(activeLine.classList.contains('Active')).toBe(true);
    expect(lines[5].HTMLElement.classList.contains('Active')).toBe(false);

    // Blur deterministik: nol untuk baris aktif, > 0 untuk yang jauh.
    expect(activeLine.style.getPropertyValue('--BlurAmount')).toBe('0px');
    expect(
      parseFloat(lines[5].HTMLElement.style.getPropertyValue('--BlurAmount')),
    ).toBeGreaterThan(0);

    // Sapuan kata: posisi gradient bergerak dari -20% saat kata itu aktif.
    const words = lines[1].Syllables?.Lead ?? [];
    const swept = words[1].HTMLElement.style.getPropertyValue(
      '--gradient-position',
    );
    expect(parseFloat(swept)).toBeGreaterThan(-20);

    // Kata yang belum dinyanyikan tetap di posisi awalnya.
    TimeSetter(0);
    Animate(0);
    expect(lines[1].HTMLElement.classList.contains('Active')).toBe(false);
  });
});
