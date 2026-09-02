'use client';

/**
 * Panel lirik yang terhubung ke pemutar GLOBAL.
 *
 * Bedanya dengan LyricsView: komponen ini yang tahu soal pemutar. LyricsView
 * tetap murni — ia hanya menerima `getPosition` dan tidak peduli dari mana
 * posisinya datang. Pemisahan itu yang membuat mesin lirik bisa diuji dengan
 * jam sintetis di halaman dev.
 *
 * Lirik disembunyikan sepenuhnya saat video diperbesar: kebijakan YouTube
 * melarang menampilkan elemen apa pun di depan pemutar yang terlihat.
 */

import { useCallback } from 'react';

import { LyricsView } from '@/components/lyrics/lyrics-view';
import { usePlayer } from '@/lib/player/player-context';
import type { Lyrics, Track } from '@/lib/types';

export interface LyricsPanelProps {
  track: Track;
  lyrics: Lyrics | null;
}

export function LyricsPanel({ track, lyrics }: LyricsPanelProps) {
  const { current, readPosition, seek, videoExpanded } = usePlayer();

  /* Bergantung pada readPosition (stabil), BUKAN objek pemutar (baru setiap
     render) — kalau tidak, efek rAF di LyricsView dibongkar-pasang terus. */
  const getPosition = useCallback(() => readPosition(), [readPosition]);

  /** Lagu ini sedang benar-benar diputar? Kalau bukan, lirik tidak bergerak. */
  const isCurrent = current?.id === track.id;

  if (videoExpanded) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <p className="max-w-xs text-center text-sm text-laras-tertiary">
          Lirik disembunyikan saat video diperbesar: kebijakan YouTube melarang
          menampilkan elemen apa pun di depan pemutar yang terlihat.
        </p>
      </div>
    );
  }

  if (lyrics === null || lyrics.lines.length === 0) {
    /* Tiga keadaan yang tampak sama di layar tapi berbeda artinya, dan pengguna
       berhak tahu bedanya: lagu yang MEMANG instrumental, versus lirik yang
       tidak ada di sumber mana pun. Menyamakan keduanya membuat lagu
       instrumental terlihat seperti aplikasi yang gagal. */
    const message = lyrics?.instrumental
      ? 'Lagu ini instrumental — tidak ada lirik untuk disinkronkan.'
      : 'Lirik tersinkron tidak tersedia untuk lagu ini.';

    return (
      <div className="flex h-full items-center justify-center px-8">
        <p className="max-w-xs text-center text-base font-medium text-laras-tertiary">
          {message}
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      {!isCurrent ? (
        <p className="absolute inset-x-0 top-0 z-10 bg-laras-black/70 px-6 py-2 text-center text-xs text-laras-tertiary backdrop-blur-sm">
          Putar lagu ini untuk menyinkronkan lirik.
        </p>
      ) : null}

      {/* Sumber line-level (LRCLIB) tidak punya timing per kata. Dikatakan
          terus terang, karena pengguna yang tahu lagunya punya lirik per kata
          di tempat lain akan menyangka mesinnya rusak. */}
      {lyrics.kind === 'line' ? (
        <p
          className={`absolute inset-x-0 z-10 px-6 py-1 text-center text-[11px] text-laras-tertiary ${
            isCurrent ? 'top-0' : 'top-8'
          }`}
        >
          Lirik per baris — sumber ini tidak punya timing per kata.
        </p>
      ) : null}

      <LyricsView
        lyrics={lyrics}
        getPosition={getPosition}
        onSeek={seek}
        // Loop dihentikan kalau lagu ini bukan yang sedang diputar: menghitung
        // spring untuk lirik yang tidak bergerak hanya membakar CPU.
        paused={!isCurrent}
      />
    </div>
  );
}
