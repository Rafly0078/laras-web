'use client';

/**
 * Dok video: SATU tempat di mana iframe YouTube hidup, selamanya.
 *
 * Iframe tidak pernah dipindah di DOM dan tidak pernah dilepas — kalau
 * dipindah, browser memuat ulang dan audio berhenti. Yang berubah hanyalah
 * gaya wrapper-nya:
 *
 *  - videoExpanded = false  →  petak 200×200 di kanan bawah, di atas mini
 *    player. Tetap TERLIHAT (bukan display:none, bukan 0×0) karena kebijakan
 *    YouTube melarang menyembunyikan pemutar untuk membuat pengalaman
 *    audio-only.
 *  - videoExpanded = true   →  panel besar di tengah; lirik disembunyikan
 *    sepenuhnya oleh halaman, karena tidak boleh ada apa pun di depan pemutar
 *    yang terlihat.
 *
 * Saat belum ada lagu, dok dipindahkan ke luar layar lewat `translate` alih-alih
 * dilepas. Melepasnya berarti ref container hilang dan pemutar harus dibangun
 * ulang saat lagu pertama diputar.
 */

import { usePlayer } from '@/lib/player/player-context';

export function VideoDock() {
  const { current, videoExpanded, setVideoExpanded, containerRef } = usePlayer();

  const hasTrack = current !== null;

  return (
    <div
      className={[
        'fixed z-40 overflow-hidden bg-black shadow-2xl ring-1 ring-white/10',
        'transition-all duration-300 ease-out',
        videoExpanded
          ? 'bottom-24 left-1/2 h-[min(56vw,405px)] w-[min(90vw,720px)] -translate-x-1/2 rounded-[var(--radius-sheet,16px)]'
          : 'bottom-24 right-4 h-[200px] w-[200px] rounded-[var(--radius-artwork)]',
        // Di luar layar saat belum ada lagu — TIDAK dilepas dari DOM.
        hasTrack ? 'opacity-100' : 'pointer-events-none translate-y-[200vh] opacity-0',
      ].join(' ')}
      aria-hidden={!hasTrack}
    >
      <div ref={containerRef} className="h-full w-full" />

      {hasTrack ? (
        <button
          type="button"
          onClick={() => setVideoExpanded(!videoExpanded)}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80"
          aria-label={videoExpanded ? 'Perkecil video' : 'Perbesar video'}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {videoExpanded ? (
              <path d="M9 15 4 20m0-5v5h5M15 9l5-5m0 5V4h-5" />
            ) : (
              <path d="M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7" />
            )}
          </svg>
        </button>
      ) : null}
    </div>
  );
}
