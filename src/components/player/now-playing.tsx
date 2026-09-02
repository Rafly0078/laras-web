'use client';

/**
 * Now Playing — artwork besar, kontrol, dan lirik.
 *
 * KEPUTUSAN PRODUK (final): ada dua mode tampilan.
 *  - Artwork: artwork besar + lirik. Iframe YouTube tetap ada di DOM dengan
 *    ukuran nyata (bukan disembunyikan) — hanya diletakkan sebagai panel kecil.
 *  - Video: iframe menjadi permukaan utama, dan LIRIK DISEMBUNYIKAN SEPENUHNYA
 *    dengan tombol lirik dinonaktifkan.
 *
 * Kenapa begitu: kebijakan YouTube melarang menaruh overlay atau elemen visual
 * apa pun DI DEPAN player yang terlihat. Menyembunyikan lirik sepenuhnya adalah
 * jalan yang paling jelas patuh, dan itu keputusan pemilik produk.
 */

import { useCallback, useRef, useState } from 'react';

import { AmbientBackdrop } from './ambient-backdrop';
import { useYouTubePlayer } from './use-youtube-player';

import { LyricsView } from '@/components/lyrics/lyrics-view';
import type { Lyrics, NowPlayingView, Track } from '@/lib/types';

export interface NowPlayingProps {
  track: Track;
  lyrics: Lyrics | null;
  /** URL artwork siap pakai (template sudah diisi). */
  artworkUrl: string | null;
  /** URL artwork kecil untuk ekstraksi warna ambient. */
  artworkSmallUrl: string | null;
  onNext?: () => void;
  onPrevious?: () => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function NowPlaying({
  track,
  lyrics,
  artworkUrl,
  artworkSmallUrl,
  onNext,
  onPrevious,
}: NowPlayingProps) {
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<NowPlayingView>('artwork');

  const player = useYouTubePlayer({
    videoId: track.audio?.id ?? null,
    containerRef: playerContainerRef,
    onEnded: onNext,
  });

  /**
   * Diteruskan ke LyricsView dan dipanggil di dalam rAF-nya.
   *
   * Sengaja BUKAN state React: posisi berubah 60× per detik, dan menaruhnya di
   * state berarti 60 render per detik untuk seluruh subtree.
   *
   * Bergantung pada `player.readPosition` (yang stabil), BUKAN pada `player`
   * (objek baru setiap render). Kalau bergantung pada objeknya, identitas
   * getPosition berubah tiap render dan efek rAF di LyricsView dibongkar-pasang
   * terus — yang pada gilirannya membuat cache gaya di sana tidak pernah valid.
   */
  const { readPosition } = player;
  const getPosition = useCallback(() => readPosition(), [readPosition]);

  const videoMode = view === 'video';
  const hasLyrics = lyrics !== null && lyrics.lines.length > 0;
  /* Mode video menonaktifkan lirik — sesuai kebijakan di atas. */
  const lyricsEnabled = hasLyrics && !videoMode;

  return (
    <section className="relative flex h-full flex-col overflow-hidden bg-laras-black">
      <AmbientBackdrop
        artworkUrl={artworkSmallUrl}
        bgColor={track.artwork?.bgColor ?? null}
        textColors={track.artwork?.textColors ?? []}
      />

      <div className="relative z-10 flex min-h-0 flex-1 gap-8 p-8">
        {/* Kolom kiri: artwork / video + info + kontrol */}
        <div className="flex w-[min(42%,520px)] flex-col gap-6">
          <div
            className={[
              'relative aspect-square w-full overflow-hidden',
              'rounded-[var(--radius-artwork-lg)] bg-laras-card shadow-2xl',
              videoMode ? 'aspect-video' : 'aspect-square',
            ].join(' ')}
          >
            {/* Artwork hanya ditampilkan di mode artwork.
                Pakai <img> mentah, bukan next/image: URL dibangun runtime dari
                template Apple ({w}x{h}) sehingga optimasi next/image tidak
                memberi keuntungan, sementara wrapper-nya menyulitkan layout
                aspect-ratio di sini. */}
            {!videoMode && artworkUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={artworkUrl}
                alt={`Artwork ${track.album ?? track.title}`}
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : null}

            {/*
              Container iframe. SELALU di DOM dengan ukuran nyata — tidak pernah
              display:none, tidak pernah 0×0. Di mode artwork ia duduk sebagai
              panel kecil di sudut (tetap ≥200×200px sesuai syarat viewport).
            */}
            <div
              className={
                videoMode
                  ? 'absolute inset-0'
                  : 'absolute bottom-3 right-3 h-[200px] w-[200px] overflow-hidden rounded-[var(--radius-artwork)] shadow-lg ring-1 ring-white/10'
              }
            >
              <div ref={playerContainerRef} className="h-full w-full" />
            </div>
          </div>

          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-laras-text">
              {track.title}
            </h1>
            <p className="mt-1 text-lg text-laras-secondary">{track.artist}</p>
            {track.album ? (
              <p className="text-sm text-laras-tertiary">{track.album}</p>
            ) : null}
          </div>

          {player.error ? (
            <p
              className="rounded-[var(--radius-card)] bg-laras-accent/15 px-4 py-3 text-sm text-laras-text"
              role="alert"
            >
              {player.error}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onPrevious}
              className="flex h-11 w-11 items-center justify-center rounded-full text-laras-secondary transition hover:bg-white/10 hover:text-laras-text"
              aria-label="Lagu sebelumnya"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M6 5h2v14H6zm3.5 7L18 5v14z" />
              </svg>
            </button>

            <button
              type="button"
              onClick={player.toggle}
              disabled={!player.ready}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-laras-text text-laras-black transition hover:scale-105 disabled:opacity-40"
              aria-label={player.state === 'playing' ? 'Jeda' : 'Putar'}
            >
              {player.state === 'playing' ? (
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                  <path d="M7 5h4v14H7zm6 0h4v14h-4z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                  <path d="M8 5l12 7-12 7z" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={onNext}
              className="flex h-11 w-11 items-center justify-center rounded-full text-laras-secondary transition hover:bg-white/10 hover:text-laras-text"
              aria-label="Lagu berikutnya"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M16 5h2v14h-2zM6 5l8.5 7L6 19z" />
              </svg>
            </button>

            <span className="ml-2 text-sm tabular-nums text-laras-tertiary">
              {formatTime(track.durationSeconds)}
            </span>

            <div className="ml-auto flex items-center gap-1 rounded-full bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setView('artwork')}
                className={[
                  'h-9 rounded-full px-4 text-sm font-medium transition',
                  view === 'artwork'
                    ? 'bg-laras-text text-laras-black'
                    : 'text-laras-secondary hover:text-laras-text',
                ].join(' ')}
                aria-pressed={view === 'artwork'}
              >
                Artwork
              </button>
              <button
                type="button"
                onClick={() => setView('video')}
                className={[
                  'h-9 rounded-full px-4 text-sm font-medium transition',
                  videoMode
                    ? 'bg-laras-text text-laras-black'
                    : 'text-laras-secondary hover:text-laras-text',
                ].join(' ')}
                aria-pressed={videoMode}
              >
                Video
              </button>
            </div>
          </div>

          {videoMode ? (
            <p className="text-xs leading-relaxed text-laras-tertiary">
              Lirik dinonaktifkan saat mode video: kebijakan YouTube melarang
              menampilkan elemen apa pun di depan pemutar yang terlihat.
            </p>
          ) : null}
        </div>

        {/* Kolom kanan: lirik. Dilepas dari DOM di mode video. */}
        <div className="relative min-h-0 flex-1">
          {lyricsEnabled && lyrics ? (
            <LyricsView
              lyrics={lyrics}
              getPosition={getPosition}
              onSeek={player.seek}
              paused={videoMode}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="max-w-xs text-center text-base font-medium text-laras-tertiary">
                {videoMode
                  ? 'Beralih ke mode Artwork untuk melihat lirik.'
                  : 'Lirik tidak tersedia untuk lagu ini.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
