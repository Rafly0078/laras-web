'use client';

/**
 * Tombol putar besar di halaman lagu.
 *
 * Terpisah dari halaman (server component) karena ia butuh pemutar global dan
 * server action untuk menjembatani audio.
 */

import { useState, useTransition } from 'react';

import { resolveTrackAudio } from '@/app/actions';
import { PauseIcon, PlayIcon } from '@/components/ui/icons';
import { usePlayer } from '@/lib/player/player-context';
import type { Track } from '@/lib/types';

export function PlayTrackButton({ track }: { track: Track }) {
  const { current, state, play, toggle } = usePlayer();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);

  const isCurrent = current?.id === track.id;
  const isPlaying = isCurrent && state === 'playing';

  const handleClick = () => {
    setFailure(null);

    // Sudah lagu ini: cukup jeda/lanjut, jangan menjembatani ulang.
    if (isCurrent) {
      toggle();
      return;
    }

    if (track.audio) {
      play(track);
      return;
    }

    startTransition(async () => {
      const result = await resolveTrackAudio(track);
      if (result.audio === null) {
        setFailure(result.reason ?? 'Audio tidak ditemukan.');
        return;
      }
      play({ ...track, audio: result.audio });
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="flex h-12 items-center gap-2 rounded-[var(--radius-card)] bg-laras-accent px-6 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        aria-label={isPlaying ? `Jeda ${track.title}` : `Putar ${track.title}`}
      >
        {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
        {pending ? 'Mencari audio…' : isPlaying ? 'Jeda' : 'Putar'}
      </button>

      {failure ? (
        <p className="mt-2 max-w-sm text-xs text-laras-accent" role="alert">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
