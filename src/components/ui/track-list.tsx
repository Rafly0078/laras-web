'use client';

/**
 * Daftar lagu yang bisa diklik untuk memutar.
 *
 * Ini komponen klien tipis di atas TrackRow. Tugasnya satu: mengubah klik
 * menjadi (1) resolusi audio lewat server action, lalu (2) memerintahkan
 * pemutar global. Halaman yang memakainya tetap server component.
 */

import { useState, useTransition } from 'react';

import { resolveTrackAudio } from '@/app/actions';
import { TrackRow } from '@/components/ui/track-row';
import { artworkUrl } from '@/lib/data/apple';
import { usePlayer } from '@/lib/player/player-context';
import type { Track } from '@/lib/types';

export interface TrackListProps {
  tracks: Track[];
  /** Nomor baris dimulai dari sini (album memakai trackNumber asli). */
  useTrackNumbers?: boolean;
}

export function TrackList({ tracks, useTrackNumbers = false }: TrackListProps) {
  const { current, play } = usePlayer();
  const [pending, startTransition] = useTransition();
  /** Lagu yang sedang dijembatani — untuk menandai baris mana yang menunggu. */
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ id: string; reason: string } | null>(null);

  const handlePlay = (track: Track) => {
    setFailure(null);

    // Audio sudah diketahui: mainkan langsung, tanpa round-trip.
    if (track.audio) {
      play(track, tracks);
      return;
    }

    setResolvingId(track.id);

    startTransition(async () => {
      const result = await resolveTrackAudio(track);
      setResolvingId(null);

      if (result.audio === null) {
        setFailure({ id: track.id, reason: result.reason ?? 'Audio tidak ditemukan.' });
        return;
      }

      // Antrean dibangun dengan track ini SUDAH membawa audionya; lagu lain
      // dijembatani nanti saat gilirannya tiba.
      const resolved: Track = { ...track, audio: result.audio };
      const queue = tracks.map((t) => (t.id === track.id ? resolved : t));
      play(resolved, queue);
    });
  };

  return (
    <div className="flex flex-col">
      {tracks.map((track, i) => (
        <div key={track.id}>
          <TrackRow
            index={useTrackNumbers ? (track.trackNumber ?? i + 1) - 1 : i}
            track={track}
            artworkSrc={artworkUrl(track.artwork, 80)}
            active={current?.id === track.id}
            onPlay={() => handlePlay(track)}
          />

          {resolvingId === track.id && pending ? (
            <p className="px-3 pb-2 text-xs text-laras-tertiary" role="status">
              Mencari audio…
            </p>
          ) : null}

          {failure?.id === track.id ? (
            <p className="px-3 pb-2 text-xs text-laras-accent" role="alert">
              {failure.reason}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
