'use client';

/**
 * Halaman dev: menguji mesin lirik TANPA YouTube.
 *
 * Kenapa perlu: di lingkungan uji otomatis (dan di browser tanpa interaksi
 * pengguna), pemutar YouTube tidak mau berjalan — autoplay diblokir dan embed
 * bisa ditolak. Tanpa halaman ini, satu-satunya cara memeriksa sapuan adalah
 * dengan mata, dan mata tidak bisa membuktikan angka.
 *
 * Di sini posisi digerakkan jam sintetis yang bisa dikendalikan, termasuk dari
 * luar lewat window.__laras (dipakai scripts/verify-lyrics.cjs). Halaman ini
 * TIDAK ADA di produksi — lihat notFound() di layout dev.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { LyricsView } from '@/components/lyrics/lyrics-view';
import type { Lyrics } from '@/lib/types';

/** Kontrol yang dibuka ke harness verifikasi. */
interface LarasDevHandle {
  setPosition: (seconds: number) => void;
  getPosition: () => number;
  setPlaying: (playing: boolean) => void;
}

declare global {
  interface Window {
    __laras?: LarasDevHandle;
  }
}

export interface LyricsProbeProps {
  lyrics: Lyrics;
  durationSeconds: number;
  title: string;
  artist: string;
}

export function LyricsProbe({
  lyrics,
  durationSeconds,
  title,
  artist,
}: LyricsProbeProps) {
  /** Posisi disimpan di ref, bukan state: berubah 60× per detik. */
  const positionRef = useRef(0);
  const playingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  /** Hanya untuk label waktu, diperbarui 4× per detik saja. */
  const [label, setLabel] = useState(0);

  const getPosition = useCallback(() => positionRef.current, []);

  /* Jam sintetis: maju dengan waktu nyata saat playing. */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (playingRef.current) {
        positionRef.current = Math.min(positionRef.current + dt, durationSeconds);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationSeconds]);

  /* Label waktu terpisah supaya render React tidak ikut 60fps. */
  useEffect(() => {
    const id = window.setInterval(() => setLabel(positionRef.current), 250);
    return () => window.clearInterval(id);
  }, []);

  /* Jembatan untuk harness verifikasi. */
  useEffect(() => {
    window.__laras = {
      setPosition: (seconds: number) => {
        positionRef.current = Math.max(0, Math.min(seconds, durationSeconds));
      },
      getPosition: () => positionRef.current,
      setPlaying: (next: boolean) => {
        playingRef.current = next;
        setPlaying(next);
      },
    };
    return () => {
      delete window.__laras;
    };
  }, [durationSeconds]);

  const toggle = () => {
    playingRef.current = !playingRef.current;
    setPlaying(playingRef.current);
  };

  const seek = useCallback(
    (seconds: number) => {
      positionRef.current = Math.max(0, Math.min(seconds, durationSeconds));
      setLabel(positionRef.current);
    },
    [durationSeconds],
  );

  return (
    <div className="flex h-full flex-col bg-laras-black">
      <header className="flex items-center gap-4 border-b border-laras-outline/40 px-6 py-4">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold">{title}</p>
          <p className="truncate text-sm text-laras-secondary">{artist}</p>
        </div>

        <button
          type="button"
          onClick={toggle}
          className="ml-auto h-11 rounded-full bg-laras-text px-5 text-sm font-semibold text-laras-black"
        >
          {playing ? 'Jeda' : 'Putar'}
        </button>

        <span className="w-24 text-right text-sm tabular-nums text-laras-tertiary">
          {Math.floor(label / 60)}:{String(Math.floor(label % 60)).padStart(2, '0')} /{' '}
          {Math.floor(durationSeconds / 60)}:
          {String(Math.floor(durationSeconds % 60)).padStart(2, '0')}
        </span>

        <input
          type="range"
          min={0}
          max={Math.floor(durationSeconds)}
          value={Math.floor(label)}
          onChange={(e) => seek(Number(e.target.value))}
          className="w-64 accent-laras-accent"
          aria-label="Geser posisi lagu"
        />
      </header>

      <div className="min-h-0 flex-1">
        <LyricsView lyrics={lyrics} getPosition={getPosition} onSeek={seek} />
      </div>
    </div>
  );
}
