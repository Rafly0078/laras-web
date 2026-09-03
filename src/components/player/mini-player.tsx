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

import { FavoriteButton } from '@/components/player/favorite-button';
import { QueuePanel } from '@/components/player/queue-panel';
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
    resolving,
    shuffle,
    repeat,
    toggleShuffle,
    cycleRepeat,
    volume,
    setVolume,
    muted,
    setMuted,
    upcoming,
  } = usePlayer();

  const fillRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState(0);
  const [queueOpen, setQueueOpen] = useState(false);

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
          {resolving ? (
            <p className="truncate text-xs text-laras-tertiary" role="status">
              Mencari audio…
            </p>
          ) : error ? (
            <p className="truncate text-xs text-laras-accent" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <span className="hidden shrink-0 text-xs tabular-nums text-laras-tertiary sm:block">
          {formatTime(label)} / {formatTime(duration)}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          <FavoriteButton track={current} size="sm" />

          {/* Shuffle & repeat sengaja di KIRI kontrol transport, seperti Apple
              Music: keduanya setelan yang bertahan, bukan aksi sekali pakai. */}
          <button
            type="button"
            onClick={toggleShuffle}
            aria-pressed={shuffle}
            aria-label={shuffle ? 'Matikan acak' : 'Nyalakan acak'}
            className={`hidden h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/10 sm:flex ${
              shuffle ? 'text-laras-accent' : 'text-laras-secondary hover:text-laras-text'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M17 3l4 4-4 4V8.5h-1.6c-1.2 0-2 .5-2.8 1.7l-.7 1.1-1.2-1.9.6-.9C12.5 6.6 13.9 6 15.4 6H17zM3 6h2.6c1.6 0 3 .7 4.1 2.4l4 6.2c.7 1.2 1.5 1.7 2.7 1.7H17V15l4 4-4 4v-3.5h-1.6c-1.6 0-3-.7-4.1-2.4l-4-6.2C6.6 8.6 5.8 8 4.6 8H3zm4.9 9.8 1.2 1.9-.6.9C7.5 17.4 6.1 18 4.6 18H3v-2h1.6c1.2 0 2-.5 2.8-1.7z" />
            </svg>
          </button>

          <button
            type="button"
            onClick={cycleRepeat}
            aria-pressed={repeat !== 'off'}
            aria-label={
              repeat === 'off'
                ? 'Ulangi: mati'
                : repeat === 'all'
                  ? 'Ulangi: semua'
                  : 'Ulangi: satu lagu'
            }
            className={`relative hidden h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/10 sm:flex ${
              repeat === 'off' ? 'text-laras-secondary hover:text-laras-text' : 'text-laras-accent'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M7 7h10v2.5l4-4-4-4V4H5v7h2zm10 10H7v-2.5l-4 4 4 4V20h12v-7h-2z" />
            </svg>
            {/* Angka 1 kecil membedakan "ulangi satu" dari "ulangi semua".
                Tanpa penanda ini kedua mode terlihat identik. */}
            {repeat === 'one' ? (
              <span className="absolute bottom-1.5 right-2 text-[9px] font-bold leading-none">
                1
              </span>
            ) : null}
          </button>

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

          {/* Volume: slider asli <input type=range>, bukan div kustom. Ia sudah
              punya keyboard, ARIA, dan dukungan pembaca layar gratis — menulis
              ulang semua itu dengan div hanya menghasilkan versi yang lebih
              buruk. Tombol mute di sebelahnya karena volume 0 dan muted itu
              dua keadaan berbeda di IFrame API. */}
          <div className="ml-1 hidden items-center gap-1 lg:flex">
            <button
              type="button"
              onClick={() => setMuted(!muted)}
              aria-pressed={muted}
              aria-label={muted ? 'Lepas bisu' : 'Bisukan'}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/10 ${
                muted ? 'text-laras-accent' : 'text-laras-secondary hover:text-laras-text'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                {muted ? (
                  <path d="M3 9h3l5-4v14l-5-4H3zm12.5.5 1.4-1.4 2.1 2.1 2.1-2.1 1.4 1.4L20.4 12l2.1 2.1-1.4 1.4-2.1-2.1-2.1 2.1-1.4-1.4L17.6 12z" />
                ) : (
                  <path d="M3 9h3l5-4v14l-5-4H3zm13.5 3c0-1.8-1-3.3-2.5-4v8c1.5-.7 2.5-2.2 2.5-4zm2.5 0c0 3-1.7 5.5-4 6.6l.8 1.7c3-1.4 5.2-4.5 5.2-8.3s-2.2-6.9-5.2-8.3l-.8 1.7c2.3 1.1 4 3.6 4 6.6z" />
                )}
              </svg>
            </button>

            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={muted ? 0 : Math.round(volume)}
              onChange={(e) => {
                const next = Number(e.target.value);
                setVolume(next);
                // Menyeret slider dari nol jelas berarti "aku mau dengar".
                if (next > 0 && muted) setMuted(false);
              }}
              aria-label="Volume"
              className="h-1 w-24 cursor-pointer accent-laras-accent"
            />
          </div>

          <button
            type="button"
            onClick={() => setQueueOpen((open) => !open)}
            aria-expanded={queueOpen}
            aria-label="Antrean"
            className={`ml-1 flex h-11 items-center gap-1.5 rounded-[var(--radius-card)] px-3 text-xs font-medium transition hover:bg-white/10 ${
              queueOpen ? 'text-laras-text' : 'text-laras-secondary hover:text-laras-text'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M3 6h12v2H3zm0 5h12v2H3zm0 5h8v2H3zm14-9 5 4-5 4z" />
            </svg>
            {upcoming.length > 0 ? <span className="tabular-nums">{upcoming.length}</span> : null}
          </button>
        </div>
      </div>

      {queueOpen ? <QueuePanel onClose={() => setQueueOpen(false)} /> : null}
    </div>
  );
}

/** Ikon putar/jeda dipisah supaya markup tombolnya tetap terbaca. */
function PlayPauseIcon({ paused }: { paused: boolean }) {
  return paused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />;
}
