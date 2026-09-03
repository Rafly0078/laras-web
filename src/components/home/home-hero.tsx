'use client';

/**
 * Hero Beranda — satu kartu besar di atas rak-rak.
 *
 * Isinya mengikuti riwayat: kalau pengguna pernah memutar lagu, baris pertama
 * adalah "Lanjut diputar" (riwayat terbaru di localStorage). Kalau belum,
 * lagu pertama rak pertama menjadi titik mulai — supaya baris pertama
 * TIDAK PERNAH kosong.
 *
 * Kenapa kartu ini lebih besar dari kartu rak: empat rak identik (176px,
 * pola sama berulang) membuat Beranda monoton. Satu elemen dengan skala
 * berbeda di baris pertama memecah ritme itu, dan memberi satu titik fokus
 * yang jelas sebelum mata turun ke rak-rak.
 *
 * Tombol putar langsung (bukan hanya tautan ke halaman lagu) memakai pola
 * penjembatanan yang sama persis dengan `TrackList`: audio sudah ada →
 * langsung putar; belum → server action `resolveTrackAudio`, lalu putar.
 */

import { useMemo, useState, useTransition } from 'react';

import { resolveTrackAudio } from '@/app/actions';
import { Artwork } from '@/components/ui/artwork';
import { PauseIcon, PlayIcon } from '@/components/ui/icons';
import { artworkUrl } from '@/lib/data/apple';
import { firstTrackOf } from '@/lib/home/hero';
import { useCollection } from '@/lib/player/collection-context';
import { usePlayer } from '@/lib/player/player-context';
import type { Shelf } from '@/lib/types';

export function HomeHero({ shelves }: { shelves: Shelf[] }) {
  const { history } = useCollection();
  const { current, state, play, toggle } = usePlayer();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);

  /* Cadangan dihitung sekali per daftar rak: lagu pertama rak pertama,
     stabil antar kunjungan (tidak diacak). */
  const fallbackTrack = useMemo(() => firstTrackOf(shelves), [shelves]);

  const heroTrack = history[0] ?? fallbackTrack;
  if (heroTrack === null) return null;

  const fromHistory = history.length > 0;
  const isCurrent = current?.id === heroTrack.id;
  const isPlaying = isCurrent && state === 'playing';

  const handlePlay = () => {
    setFailure(null);

    if (isCurrent) {
      toggle();
      return;
    }

    if (heroTrack.audio) {
      play(heroTrack);
      return;
    }

    startTransition(async () => {
      const result = await resolveTrackAudio(heroTrack);
      if (result.audio === null) {
        setFailure(result.reason ?? 'Audio tidak ditemukan.');
        return;
      }
      play({ ...heroTrack, audio: result.audio });
    });
  };

  return (
    <section className="px-6 py-4" aria-label={fromHistory ? 'Lanjut diputar' : 'Mulai dari sini'}>
      <h2 className="pb-3 text-xl font-bold tracking-tight">
        {fromHistory ? 'Lanjut diputar' : 'Mulai dari sini'}
      </h2>

      <div className="flex items-center gap-5 rounded-[var(--radius-sheet)] bg-laras-card/60 p-5">
        <Artwork
          src={artworkUrl(heroTrack.artwork, 400)}
          alt={`Sampul ${heroTrack.album ?? heroTrack.title}`}
          size={220}
          rounded="lg"
          priority
        />

        <div className="min-w-0">
          <p className="text-sm text-laras-tertiary">{heroTrack.artist}</p>
          <h3 className="mt-1 truncate font-display text-2xl font-bold tracking-tight">
            {heroTrack.title}
          </h3>
          {heroTrack.album ? (
            <p className="mt-1 truncate text-sm text-laras-secondary">{heroTrack.album}</p>
          ) : null}

          <button
            type="button"
            onClick={handlePlay}
            disabled={pending}
            className="mt-5 flex h-12 items-center gap-2 rounded-[var(--radius-card)] bg-laras-accent px-6 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            aria-label={isPlaying ? `Jeda ${heroTrack.title}` : `Putar ${heroTrack.title}`}
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
      </div>
    </section>
  );
}
