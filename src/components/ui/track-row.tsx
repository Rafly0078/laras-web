'use client';

/**
 * TrackRow — satu baris lagu di daftar (album, playlist, hasil pencarian).
 *
 * Kenapa client component: nomor track BERGANTI menjadi ikon play saat baris
 * di-hover, dan baris ini bisa diklik untuk memutar. Keduanya butuh state
 * dan handler di browser.
 *
 * Kenapa hover pakai state React, bukan `group-hover` CSS: ikon MENGGANTIKAN
 * nomor, bukan menimpanya. Dengan CSS murni kita harus merender dua elemen
 * lalu menyembunyikan salah satu — dan lebar kolom akan ditentukan oleh
 * elemen terlebar, bukan oleh yang sedang terlihat. Satu boolean lebih jujur.
 */

import { useState, type KeyboardEvent } from 'react';

import { NoteIcon, PlayIcon } from './icons';

import type { Track } from '@/lib/types';

export interface TrackRowProps {
  /** Posisi baris dalam daftar (0-based); yang ditampilkan adalah index + 1. */
  index: number;
  track: Track;
  /** URL artwork 40px yang sudah siap pakai; null = pakai placeholder. */
  artworkSrc: string | null;
  /** true kalau lagu ini yang sedang diputar — judul diberi warna aksen. */
  active?: boolean;
  onPlay?: () => void;
}

/**
 * Format m:ss. Durasi tak masuk akal (NaN, Infinity, negatif) dijadikan
 * '0:00' supaya baris tidak pernah menampilkan "NaN:aN" ke pengguna.
 */
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function TrackRow({ index, track, artworkSrc, active = false, onPlay }: TrackRowProps) {
  const [hovered, setHovered] = useState(false);

  function play() {
    if (onPlay) {
      onPlay();
      return;
    }
    /* Fase frontend: pemutar belum tersambung, jadi niat pengguna cuma dicatat. */
    console.log('[TODO player] putar', track.id);
  }

  /* Div dengan role="button" tidak dapat Enter/Space gratis seperti <button>,
     jadi keduanya disediakan manual. Space wajib di-preventDefault supaya
     halaman tidak ikut menggulir. */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    play();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Putar ${track.title} oleh ${track.artist}`}
      onClick={play}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      /* 56px: tinggi baris Apple Music, sekaligus melewati ambang tap 44px. */
      className="flex min-h-[56px] cursor-pointer items-center gap-4 rounded-[var(--radius-card)] px-3 transition hover:bg-white/5"
    >
      {/* Lebar kolom dipaku w-6 supaya nomor dan ikon play menempati ruang yang
          sama — tanpa itu baris akan bergeser sedikit setiap kali di-hover. */}
      <div className="flex w-6 shrink-0 justify-end text-right">
        {hovered ? (
          <PlayIcon className="h-4 w-4 text-laras-text" />
        ) : (
          <span className="text-sm tabular-nums text-laras-tertiary">{index + 1}</span>
        )}
      </div>

      {artworkSrc === null ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-artwork-sm)] bg-laras-card">
          <NoteIcon />
        </div>
      ) : (
        /* Sengaja <img> biasa, bukan next/image: ukurannya cuma 40px (tidak ada
           yang bisa dioptimalkan) dan URL-nya dibangun runtime dari template
           artwork Apple, jadi next/image hanya menambah proxy tanpa manfaat. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={artworkSrc}
          alt=""
          draggable={false}
          className="h-10 w-10 rounded-[var(--radius-artwork-sm)] object-cover shrink-0"
        />
      )}

      {/* min-w-0 wajib: tanpa itu flex item menolak menyusut dan `truncate`
          pada judul/artis tidak pernah aktif. */}
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${active ? 'text-laras-accent' : 'text-laras-text'}`}
        >
          {track.title}
        </p>
        <p className="truncate text-xs text-laras-secondary">{track.artist}</p>
      </div>

      <span className="shrink-0 text-sm tabular-nums text-laras-tertiary">
        {formatDuration(track.durationSeconds)}
      </span>
    </div>
  );
}
