'use client';

/**
 * Baris kontrol di halaman lagu: putar, favorit, dan antrean.
 *
 * Terpisah dari halaman (server component) karena semuanya butuh pemutar global
 * dan server action untuk menjembatani audio.
 *
 * "Putar berikutnya" dan "Tambah ke antrean" TIDAK menjembatani audio di sini.
 * Sengaja: lagu itu belum tentu akan sampai gilirannya, dan menjembataninya di
 * muka berarti satu permintaan ke YouTube Music untuk sesuatu yang mungkin
 * dibatalkan. Penjembatanan terjadi di konteks pemutar saat gilirannya tiba.
 */

import { useState, useTransition } from 'react';

import { resolveTrackAudio } from '@/app/actions';
import { FavoriteButton } from '@/components/player/favorite-button';
import { PauseIcon, PlayIcon } from '@/components/ui/icons';
import { usePlayer } from '@/lib/player/player-context';
import type { Track } from '@/lib/types';

const SECONDARY =
  'flex h-11 items-center rounded-[var(--radius-card)] bg-laras-card px-4 text-sm font-medium text-laras-secondary transition hover:bg-laras-control hover:text-laras-text';

export function PlayTrackButton({ track }: { track: Track }) {
  const { current, state, play, toggle, playNext, addToQueue } = usePlayer();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const [queued, setQueued] = useState<string | null>(null);

  const isCurrent = current?.id === track.id;
  const isPlaying = isCurrent && state === 'playing';

  const handleClick = () => {
    setFailure(null);
    setQueued(null);

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
      <div className="flex flex-wrap items-center gap-2">
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

        <FavoriteButton track={track} />

        <button
          type="button"
          onClick={() => {
            playNext(track);
            setQueued('Ditaruh setelah lagu yang sedang diputar.');
          }}
          className={SECONDARY}
        >
          Putar berikutnya
        </button>

        <button
          type="button"
          onClick={() => {
            addToQueue(track);
            setQueued('Ditambahkan ke akhir antrean.');
          }}
          className={SECONDARY}
        >
          Ke antrean
        </button>
      </div>

      {/* Konfirmasi tekstual, bukan animasi: antrean tidak terlihat dari sini,
          jadi tanpa kalimat ini tombolnya terasa tidak melakukan apa pun. */}
      {queued ? (
        <p className="mt-2 text-xs text-laras-tertiary" role="status">
          {queued}
        </p>
      ) : null}

      {failure ? (
        <p className="mt-2 max-w-sm text-xs text-laras-accent" role="alert">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
