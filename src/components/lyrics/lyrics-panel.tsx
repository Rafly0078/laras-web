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
    return (
      <div className="flex h-full items-center justify-center px-8">
        <p className="max-w-xs text-center text-base font-medium text-laras-tertiary">
          Lirik tersinkron tidak tersedia untuk lagu ini.
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
