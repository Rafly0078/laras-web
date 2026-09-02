'use client';

/**
 * Mini player — bar tetap di bawah, ala Apple Music.
 *
 * Posisinya di dalam DOM tidak mengandung iframe (itu tugas VideoDock), jadi
 * bar ini bebas dirender ulang tanpa memutus audio.
 *
 * Progres dibaca lewat rAF, BUKAN state React: posisi berubah 60× per detik
 * dan menaruhnya di state berarti 60 render per detik untuk seluruh bar.
 * Label waktu diperbarui 4× per detik saja — cukup untuk mata, murah untuk CPU.
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { PauseIcon, PlayIcon, NoteIcon } from '@/components/ui/icons';
import { artworkUrl } from '@/lib/data/apple';
import { usePlayer } from '@/lib/player/player-context';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function MiniPlayer() {
  const {
    current,
    state,
    duration,
    readPosition,
    toggle,
    next,
    previous,
    seek,
    error,
    videoExpanded,
    setVideoExpanded,
  } = usePlayer();

  const fillRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState(0);

  /* Bar progres digerakkan langsung lewat ref, tanpa render React. */
  useEffect(() => {
    if (current === null) return;

    let raf = 0;
    let lastLabel = 0;

    const tick = () => {
      const position = readPosition();
      const fraction = duration > 0 ? Math.min(position / duration, 1) : 0;

      if (fillRef.current) {
        // scaleX lebih murah daripada mengubah width: tidak memicu layout.
        fillRef.current.style.transform = `scaleX(${fraction})`;
      }

      // Label cukup 4× per detik.
      if (position - lastLabel > 0.25 || position < lastLabel) {
        lastLabel = position;
        setLabel(position);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [current, duration, readPosition]);

  if (current === null) return null;

  const art = artworkUrl(current.artwork, 120);
  const playing = state === 'playing';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-laras-outline/40 bg-laras-black/85 backdrop-blur-xl">
      {/* Bar progres bisa diklik untuk seek. Tinggi 4px terlalu kecil untuk
          target tap, jadi area kliknya dilebarkan lewat padding transparan. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Posisi lagu"
        aria-valuemin={0}
        aria-valuemax={Math.max(1, Math.floor(duration))}
        aria-valuenow={Math.floor(label)}
        className="group absolute -top-2 left-0 right-0 h-4 cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const fraction = (e.clientX - rect.left) / rect.width;
          seek(fraction * duration);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            seek(readPosition() + 5);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            seek(Math.max(0, readPosition() - 5));
          }
        }}
      >
        <div className="absolute top-2 h-1 w-full bg-white/10 transition-all group-hover:h-1.5">
          <div
            ref={fillRef}
            className="h-full w-full origin-left bg-laras-accent"
            style={{ transform: 'scaleX(0)' }}
          />
        </div>
      </div>

      <div className="flex h-[72px] items-center gap-4 px-4">
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={art}
            alt=""
            className="h-12 w-12 shrink-0 rounded-[var(--radius-artwork-sm)] object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-artwork-sm)] bg-laras-card">
            <NoteIcon />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <Link
            href={`/lagu/${current.id}`}
            className="block truncate text-sm font-medium hover:underline"
          >
            {current.title}
          </Link>
          <p className="truncate text-xs text-laras-secondary">{current.artist}</p>
          {error ? (
            <p className="truncate text-xs text-laras-accent" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <span className="hidden shrink-0 text-xs tabular-nums text-laras-tertiary sm:block">
          {formatTime(label)} / {formatTime(duration)}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={previous}
            className="flex h-11 w-11 items-center justify-center rounded-full text-laras-secondary transition hover:bg-white/10 hover:text-laras-text"
            aria-label="Lagu sebelumnya"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M6 5h2v14H6zm3.5 7L18 5v14z" />
            </svg>
          </button>

          <button
            type="button"
            onClick={toggle}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-laras-text text-laras-black transition hover:scale-105"
            aria-label={playing ? 'Jeda' : 'Putar'}
          >
            {playing ? <PlayPauseIcon paused={false} /> : <PlayPauseIcon paused />}
          </button>

          <button
            type="button"
            onClick={next}
            className="flex h-11 w-11 items-center justify-center rounded-full text-laras-secondary transition hover:bg-white/10 hover:text-laras-text"
            aria-label="Lagu berikutnya"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M16 5h2v14h-2zM6 5l8.5 7L6 19z" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => setVideoExpanded(!videoExpanded)}
            className="ml-1 hidden h-11 items-center rounded-[var(--radius-card)] px-3 text-xs font-medium text-laras-secondary transition hover:bg-white/10 hover:text-laras-text sm:flex"
            aria-pressed={videoExpanded}
          >
            {videoExpanded ? 'Kecilkan' : 'Video'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Ikon putar/jeda dipisah supaya markup tombolnya tetap terbaca. */
function PlayPauseIcon({ paused }: { paused: boolean }) {
  return paused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />;
}
