'use client';

/**
 * Pemutar YouTube IFrame + jam lirik, dibungkus jadi satu hook.
 *
 * Aturan ToS YouTube yang DIPATUHI di sini (bukan opsional):
 *  - iframe TIDAK PERNAH disembunyikan untuk membuat pengalaman audio-only.
 *    Elemen container-nya selalu ada di DOM dengan ukuran nyata.
 *  - Tidak ada overlay di depan player saat player terlihat. Itu diurus
 *    komponen Now Playing: mode video menyembunyikan lirik sepenuhnya.
 *  - Autoplay dimulai muted; browser modern juga menolak selain itu.
 *
 * Kenapa memuat script IFrame API sendiri alih-alih memakai paket npm:
 * satu file, tanpa dependensi, dan kita butuh kontrol penuh atas kapan
 * jangkar waktu diambil (polling 250ms yang mengumpani LyricsClock).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { LyricsClock } from '@/lib/player/clock';
import type { PlaybackState } from '@/lib/types';

/* ── Tipe minimal IFrame API (hanya yang kita pakai) ─────────────────── */

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setVolume(volume: number): void;
  getVolume(): number;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  loadVideoById(videoId: string): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement | string,
    options: {
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YTPlayer }) => void;
        onStateChange?: (event: { data: number; target: YTPlayer }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** Kode state IFrame API (angka mentah, karena YT.PlayerState belum ada saat modul dimuat). */
const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

/** Seberapa sering posisi resmi pemutar diambil sebagai jangkar (ms). */
const ANCHOR_INTERVAL_MS = 250;

/** Muat script IFrame API sekali saja, walau hook dipakai beberapa kali. */
let apiPromise: Promise<YTNamespace> | null = null;

function loadIframeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IFrame API hanya bisa dimuat di browser'));
      return;
    }
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }

    // YouTube memanggil callback global ini setelah script siap.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
      else reject(new Error('IFrame API dimuat tetapi window.YT kosong'));
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => reject(new Error('Gagal memuat IFrame API YouTube'));
    document.head.appendChild(script);
  });

  return apiPromise;
}

export interface UseYouTubePlayerOptions {
  /** videoId 11 karakter, atau null saat belum ada lagu. */
  videoId: string | null;
  /** Elemen tempat iframe dipasang. WAJIB terlihat (ToS). */
  containerRef: React.RefObject<HTMLDivElement | null>;
  onEnded?: () => void;
}

export interface YouTubePlayerHandle {
  state: PlaybackState;
  duration: number;
  /** Posisi HALUS untuk animasi — panggil di dalam rAF, bukan sebagai state. */
  readPosition: () => number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  /** Volume 0..100 menurut pemutar. */
  volume: number;
  setVolume: (volume: number) => void;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  ready: boolean;
  error: string | null;
}

export function useYouTubePlayer({
  videoId,
  containerRef,
  onEnded,
}: UseYouTubePlayerOptions): YouTubePlayerHandle {
  const playerRef = useRef<YTPlayer | null>(null);
  const clockRef = useRef(new LyricsClock());

  const [state, setState] = useState<PlaybackState>('idle');
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);
  const [muted, setMutedState] = useState(true);
  /*
   * 100 sebagai nilai awal, bukan 0: slider harus menunjukkan keadaan yang
   * PALING MUNGKIN benar sebelum pemutar siap. YouTube memulai dari volume
   * penuh dan muted, jadi 0 akan membuat slider tampak di bawah padahal
   * pengguna hanya perlu melepas mute.
   */
  const [volume, setVolumeState] = useState(100);
  const [error, setError] = useState<string | null>(null);

  const onEndedRef = useRef(onEnded);
  /*
   * Menyegarkan ref di dalam efek, BUKAN saat render.
   *
   * Menulis `onEndedRef.current = onEnded` langsung di badan komponen adalah
   * mutasi selama render — React 19 melarangnya (react-hooks/refs) karena
   * dengan concurrent rendering, render bisa dibuang dan mutasinya tetap
   * tertinggal. Efek tanpa array dependensi berjalan setelah SETIAP commit,
   * jadi ref selalu memegang callback terbaru tepat sebelum ada event yang
   * mungkin memakainya.
   */
  useEffect(() => {
    onEndedRef.current = onEnded;
  });

  /* Buat player sekali; ganti lagu lewat loadVideoById, bukan bikin ulang. */
  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container || !videoId) return;

    if (playerRef.current) {
      playerRef.current.loadVideoById(videoId);
      clockRef.current.hardReset(0, performance.now());
      return;
    }

    loadIframeApi()
      .then((YT) => {
        if (cancelled || !containerRef.current) return;

        playerRef.current = new YT.Player(containerRef.current, {
          videoId,
          playerVars: {
            // Kontrol asli DIBIARKAN menyala: menyembunyikannya lalu menimpa
            // dengan kontrol sendiri melanggar aturan "jangan blokir fungsi
            // player standar".
            controls: 1,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            // origin wajib supaya postMessage tidak ditolak.
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              setReady(true);
              setDuration(event.target.getDuration());
              setMutedState(event.target.isMuted());
              setVolumeState(event.target.getVolume());
              clockRef.current.hardReset(
                event.target.getCurrentTime(),
                performance.now(),
              );
            },
            onStateChange: (event) => {
              if (cancelled) return;
              const now = performance.now();
              const clock = clockRef.current;

              switch (event.data) {
                case YT_STATE.PLAYING:
                  setState('playing');
                  setDuration(event.target.getDuration());
                  clock.anchor(event.target.getCurrentTime(), now);
                  clock.setPlaying(true, now);
                  break;
                case YT_STATE.PAUSED:
                  setState('paused');
                  clock.setPlaying(false, now);
                  clock.anchor(event.target.getCurrentTime(), now);
                  break;
                case YT_STATE.BUFFERING:
                  setState('loading');
                  // Saat buffering, waktu berhenti berjalan. Membiarkan jam
                  // tetap maju akan membuat lirik mendahului audio.
                  clock.setPlaying(false, now);
                  break;
                case YT_STATE.ENDED:
                  setState('ended');
                  clock.setPlaying(false, now);
                  onEndedRef.current?.();
                  break;
                case YT_STATE.CUED:
                case YT_STATE.UNSTARTED:
                  setState('idle');
                  clock.setPlaying(false, now);
                  break;
                default:
                  break;
              }
            },
            onError: (event) => {
              if (cancelled) return;
              // 101/150 = pemilik melarang embed. Ini sering terjadi pada
              // music video resmi, jadi pesannya harus jelas ke pengguna.
              const message =
                event.data === 101 || event.data === 150
                  ? 'Lagu ini tidak diizinkan diputar di luar YouTube.'
                  : `Pemutar YouTube gagal (kode ${event.data}).`;
              setError(message);
              setState('error');
            },
          },
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat pemutar');
        setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [containerRef, videoId]);

  /* Buang player saat komponen benar-benar dilepas. */
  useEffect(() => {
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  /* Polling jangkar: ini SATU-SATUNYA sumber kebenaran posisi dari YouTube. */
  useEffect(() => {
    if (!ready) return;

    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const position = player.getCurrentTime();
      if (Number.isFinite(position)) {
        clockRef.current.anchor(position, performance.now());
      }
    }, ANCHOR_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [ready]);

  const readPosition = useCallback(() => {
    return clockRef.current.read(performance.now());
  }, []);

  const play = useCallback(() => {
    playerRef.current?.playVideo();
  }, []);

  const pause = useCallback(() => {
    playerRef.current?.pauseVideo();
  }, []);

  const toggle = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.getPlayerState() === YT_STATE.PLAYING) player.pauseVideo();
    else player.playVideo();
  }, []);

  const seek = useCallback((seconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    const clamped = Math.max(0, seconds);
    player.seekTo(clamped, true);
    // hardReset, bukan anchor: seek adalah lompatan yang disengaja, jadi
    // jangan dicicil — lirik harus langsung pindah ke posisi baru.
    clockRef.current.hardReset(clamped, performance.now());
  }, []);

  const setVolume = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(100, next));
    /* State disetel walau pemutar belum ada: slider harus tetap bergerak saat
       pengguna menyeretnya sebelum lagu pertama diputar, dan nilainya dipakai
       begitu pemutar siap. */
    setVolumeState(clamped);
    playerRef.current?.setVolume(clamped);
  }, []);

  const setMuted = useCallback((next: boolean) => {
    const player = playerRef.current;
    if (!player) return;
    if (next) player.mute();
    else player.unMute();
    setMutedState(next);
  }, []);

  return {
    state,
    duration,
    readPosition,
    play,
    pause,
    toggle,
    seek,
    volume,
    setVolume,
    muted,
    setMuted,
    ready,
    error,
  };
}
