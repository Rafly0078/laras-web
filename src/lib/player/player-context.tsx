'use client';

/**
 * Konteks pemutar global — SATU pemutar untuk seluruh aplikasi.
 *
 * Kenapa harus di root layout, bukan di halaman:
 *
 * Iframe YouTube TIDAK BISA dipindahkan di DOM. Memindahkannya ke induk lain
 * (atau me-remount komponennya) membuat browser memuat ulang iframe dari nol —
 * audio berhenti, posisi hilang. Jadi kalau pemutar hidup di dalam halaman,
 * setiap navigasi memutus lagu yang sedang jalan.
 *
 * Solusinya: satu iframe yang dirender di layout dan tidak pernah dilepas.
 * Ukuran serta posisinya diubah lewat CSS (`position: fixed` + geometri dari
 * state), bukan dengan memindahkan node. Itulah sebabnya "mode video" hanya
 * mengubah angka, bukan struktur.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useYouTubePlayer } from '@/components/player/use-youtube-player';
import type { PlaybackState, Track } from '@/lib/types';

export interface PlayerContextValue {
  /** Lagu yang sedang dimuat, atau null saat belum ada. */
  current: Track | null;
  /** Antrean lengkap; `current` adalah queue[index]. */
  queue: Track[];
  index: number;

  state: PlaybackState;
  duration: number;
  muted: boolean;
  ready: boolean;
  error: string | null;

  /** Posisi HALUS untuk animasi. Panggil di dalam rAF, jangan simpan di state. */
  readPosition: () => number;

  /** Mulai memutar satu lagu, opsional dengan antrean di sekitarnya. */
  play: (track: Track, queue?: Track[]) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setMuted: (muted: boolean) => void;

  /** Iframe membesar jadi permukaan utama. Lirik disembunyikan saat true. */
  videoExpanded: boolean;
  setVideoExpanded: (expanded: boolean) => void;

  /** Dipakai VideoDock untuk memasang iframe. Jangan dipakai komponen lain. */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(-1);
  const [videoExpanded, setVideoExpanded] = useState(false);

  const current = index >= 0 && index < queue.length ? queue[index] : null;

  /**
   * Lanjut otomatis saat lagu habis.
   *
   * Disimpan di ref supaya identitasnya stabil: `useYouTubePlayer` memakainya
   * di dalam event handler yang dipasang sekali saat player dibuat.
   */
  const advanceRef = useRef<() => void>(() => {});

  const player = useYouTubePlayer({
    videoId: current?.audio?.id ?? null,
    containerRef,
    onEnded: () => advanceRef.current(),
  });

  const { readPosition, play: resume, toggle, seek, setMuted } = player;

  const next = useCallback(() => {
    setIndex((prev) => {
      // Berhenti di akhir antrean alih-alih memutar ulang: mengulang tanpa
      // diminta lebih mengganggu daripada berhenti.
      if (prev < 0 || prev + 1 >= queue.length) return prev;
      return prev + 1;
    });
  }, [queue.length]);

  /*
   * Segarkan ref di dalam efek, BUKAN saat render.
   *
   * `onEnded` dipasang sekali saat player YouTube dibuat, jadi ia butuh ref
   * supaya selalu memanggil versi `next` terbaru. Tapi menulis ke ref selama
   * render dilarang React 19 (react-hooks/refs): dengan concurrent rendering,
   * sebuah render bisa dibuang dan mutasinya tetap tertinggal. Efek tanpa
   * array dependensi berjalan setelah setiap commit, jadi ref selalu mutakhir
   * sebelum event apa pun bisa memakainya.
   */
  useEffect(() => {
    advanceRef.current = next;
  });

  const previous = useCallback(() => {
    setIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const play = useCallback(
    (track: Track, nextQueue?: Track[]) => {
      const list = nextQueue && nextQueue.length > 0 ? nextQueue : [track];
      const position = list.findIndex((t) => t.id === track.id);

      setQueue(list);
      setIndex(position >= 0 ? position : 0);

      // Kalau lagu yang sama diklik ulang, videoId tidak berubah sehingga
      // pemutar tidak memuat apa pun — jadi lanjutkan secara eksplisit.
      if (current?.id === track.id) resume();
    },
    [current?.id, resume],
  );

  const value = useMemo<PlayerContextValue>(
    () => ({
      current,
      queue,
      index,
      state: player.state,
      duration: player.duration,
      muted: player.muted,
      ready: player.ready,
      error: player.error,
      readPosition,
      play,
      toggle,
      next,
      previous,
      seek,
      setMuted,
      videoExpanded,
      setVideoExpanded,
      containerRef,
    }),
    [
      current,
      queue,
      index,
      player.state,
      player.duration,
      player.muted,
      player.ready,
      player.error,
      readPosition,
      play,
      toggle,
      next,
      previous,
      seek,
      setMuted,
      videoExpanded,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

/**
 * Akses pemutar. Melempar kalau dipakai di luar provider — itu kesalahan
 * pemrograman, bukan keadaan yang perlu ditangani saat runtime.
 */
export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (ctx === null) {
    throw new Error('usePlayer harus dipakai di dalam <PlayerProvider>');
  }
  return ctx;
}

/** Varian yang aman dipakai komponen yang bisa hidup tanpa pemutar. */
export function usePlayerOptional(): PlayerContextValue | null {
  return useContext(PlayerContext);
}
