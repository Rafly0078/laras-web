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
 *
 * Keadaan antreannya sendiri TIDAK disimpan di sini melainkan di reducer murni
 * `lib/player/queue.ts`. Lima nilainya (daftar lagu, urutan main, posisi,
 * shuffle, repeat) saling bergantung, dan sebagai `useState` terpisah setiap
 * perubahan hanya melihat sebagian kebenaran. Sebagai reducer, aturannya bisa
 * diuji tanpa React.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { resolveTrackAudio } from '@/app/actions';
import { useYouTubePlayer } from '@/components/player/use-youtube-player';
import {
  currentIndex as queueCurrentIndex,
  currentTrack as queueCurrentTrack,
  emptyQueue,
  nextRepeatMode,
  queueReducer,
  upcoming as queueUpcoming,
  type QueueAction,
  type QueueState,
} from '@/lib/player/queue';
import type { PlaybackState, RepeatMode, Track } from '@/lib/types';

export interface QueueEntry {
  /** Posisi di antrean asli — dipakai `jumpTo` dan `removeFromQueue`. */
  queueIndex: number;
  track: Track;
}

export interface PlayerContextValue {
  /** Lagu yang sedang dimuat, atau null saat belum ada. */
  current: Track | null;
  /** Antrean dalam urutan ASLI (tidak ikut diacak shuffle). */
  queue: Track[];
  /** Posisi `current` di dalam `queue`, atau -1. */
  index: number;
  /** Lagu berikutnya dalam urutan main — sudah memperhitungkan shuffle. */
  upcoming: QueueEntry[];

  state: PlaybackState;
  duration: number;
  volume: number;
  muted: boolean;
  ready: boolean;
  error: string | null;
  /** true saat audio lagu sekarang masih dicari di YouTube Music. */
  resolving: boolean;

  shuffle: boolean;
  repeat: RepeatMode;

  /** Posisi HALUS untuk animasi. Panggil di dalam rAF, jangan simpan di state. */
  readPosition: () => number;

  /** Mulai memutar satu lagu, opsional dengan antrean di sekitarnya. */
  play: (track: Track, queue?: Track[]) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;

  toggleShuffle: () => void;
  /** Siklus mati → semua → satu → mati. */
  cycleRepeat: () => void;

  /** Sisipkan tepat setelah lagu yang sedang diputar. */
  playNext: (track: Track) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (queueIndex: number) => void;
  jumpTo: (queueIndex: number) => void;
  clearQueue: () => void;

  /** Iframe membesar jadi permukaan utama. Lirik disembunyikan saat true. */
  videoExpanded: boolean;
  setVideoExpanded: (expanded: boolean) => void;

  /** Dipakai VideoDock untuk memasang iframe. Jangan dipakai komponen lain. */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

/**
 * `useReducer` hanya memanggil reducer dengan (state, action).
 *
 * `queueReducer` menerima argumen KETIGA — fungsi permutasi — supaya shuffle
 * bisa diuji secara deterministik. React tidak tahu soal itu, jadi di sini
 * argumennya dibiarkan memakai default (`shufflePermute`, Fisher-Yates asli).
 */
function playerQueueReducer(state: QueueState, action: QueueAction): QueueState {
  return queueReducer(state, action);
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [queueState, dispatch] = useReducer(playerQueueReducer, emptyQueue);
  const [videoExpanded, setVideoExpanded] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  const current = queueCurrentTrack(queueState);
  const index = queueCurrentIndex(queueState);

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

  const {
    readPosition,
    play: resume,
    toggle,
    seek,
    volume,
    setVolume,
    setMuted,
  } = player;

  /*
   * Jembatani audio saat GILIRANNYA tiba.
   *
   * TrackList sengaja hanya menjembatani lagu yang diklik dan menaruh sisanya di
   * antrean tanpa audio — menjembatani 100 lagu di muka berarti 100 permintaan
   * ke YouTube Music hanya untuk menampilkan daftar. Konsekuensinya: begitu
   * antrean maju ke lagu yang belum dijembatani, `videoId` bernilai null dan
   * TIDAK ADA yang berbunyi. Efek inilah yang menutup lubang itu.
   *
   * Kegagalan TIDAK melompat otomatis ke lagu berikutnya. Kalau melompat, satu
   * antrean yang seluruhnya gagal (mis. jaringan mati) akan berputar sampai
   * ujung — dan dengan repeat 'all', berputar selamanya. Lebih baik berhenti
   * dan mengatakan alasannya.
   */
  const resolvedIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (current === null || current.audio !== null) return;

    const trackId = current.id;
    // Sudah pernah dicoba dan gagal: jangan ulangi tiap render.
    if (resolvedIdsRef.current.has(trackId)) return;
    resolvedIdsRef.current.add(trackId);

    let cancelled = false;
    setResolving(true);
    setBridgeError(null);

    resolveTrackAudio(current)
      .then((result) => {
        if (cancelled) return;
        if (result.audio === null) {
          setBridgeError(result.reason ?? 'Audio tidak ditemukan untuk lagu ini.');
          return;
        }
        // Tambal lagu ini DI TEMPAT. `play` akan membangun antrean dari nol
        // dan menghapus sisa lagunya.
        dispatch({ type: 'resolvedAudio', trackId: trackId, audio: result.audio });
      })
      .catch(() => {
        if (!cancelled) setBridgeError('Gagal mencari audio untuk lagu ini.');
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [current]);

  /* Ref disegarkan di EFEK, bukan saat render: menulis ke ref selama render
     dilarang React 19 (react-hooks/refs) karena render bisa dibuang sementara
     mutasinya tertinggal. Efek tanpa array dependensi jalan setelah setiap
     commit, jadi ref selalu memegang versi terbaru sebelum ada event apa pun. */
  const repeatOne = queueState.repeat === 'one';
  useEffect(() => {
    advanceRef.current = () => {
      if (repeatOne) {
        /* repeat 'one' berarti memutar ULANG lagu yang sama. Itu operasi
           PEMUTAR (seek ke 0 lalu play), bukan operasi antrean — reducer tidak
           tahu apa pun soal pemutar, jadi keputusannya di sini. */
        seek(0);
        resume();
        return;
      }
      dispatch({ type: 'next' });
    };
  });

  const next = useCallback(() => dispatch({ type: 'next' }), []);
  const previous = useCallback(() => dispatch({ type: 'previous' }), []);

  const play = useCallback(
    (track: Track, nextQueue?: Track[]) => {
      dispatch({ type: 'play', track, tracks: nextQueue });
      // Lagu yang gagal dijembatani boleh dicoba lagi kalau pengguna mengkliknya
      // sendiri; yang tidak boleh adalah mencoba ulang otomatis tiap render.
      resolvedIdsRef.current.delete(track.id);
      setBridgeError(null);

      // Kalau lagu yang sama diklik ulang, videoId tidak berubah sehingga
      // pemutar tidak memuat apa pun — jadi lanjutkan secara eksplisit.
      if (current?.id === track.id) resume();
    },
    [current?.id, resume],
  );

  const toggleShuffle = useCallback(() => {
    dispatch({ type: 'setShuffle', on: !queueState.shuffle });
  }, [queueState.shuffle]);

  const cycleRepeat = useCallback(() => {
    dispatch({ type: 'setRepeat', mode: nextRepeatMode(queueState.repeat) });
  }, [queueState.repeat]);

  const playNext = useCallback((track: Track) => {
    dispatch({ type: 'playNext', track });
  }, []);

  const addToQueue = useCallback((track: Track) => {
    dispatch({ type: 'append', track });
  }, []);

  const removeFromQueue = useCallback((queueIndex: number) => {
    dispatch({ type: 'remove', queueIndex });
  }, []);

  const jumpTo = useCallback((queueIndex: number) => {
    dispatch({ type: 'jump', queueIndex });
  }, []);

  const clearQueue = useCallback(() => dispatch({ type: 'clear' }), []);

  const upcoming = useMemo(() => queueUpcoming(queueState), [queueState]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      current,
      queue: queueState.tracks,
      index,
      upcoming,
      state: player.state,
      duration: player.duration,
      volume,
      muted: player.muted,
      ready: player.ready,
      // Kegagalan penjembatanan dan kegagalan pemutar sama-sama "tidak bisa
      // diputar" bagi pengguna, jadi disatukan jadi satu pesan.
      error: player.error ?? bridgeError,
      resolving,
      shuffle: queueState.shuffle,
      repeat: queueState.repeat,
      readPosition,
      play,
      toggle,
      next,
      previous,
      seek,
      setVolume,
      setMuted,
      toggleShuffle,
      cycleRepeat,
      playNext,
      addToQueue,
      removeFromQueue,
      jumpTo,
      clearQueue,
      videoExpanded,
      setVideoExpanded,
      containerRef,
    }),
    [
      current,
      queueState.tracks,
      queueState.shuffle,
      queueState.repeat,
      index,
      upcoming,
      player.state,
      player.duration,
      player.muted,
      player.ready,
      player.error,
      bridgeError,
      resolving,
      volume,
      readPosition,
      play,
      toggle,
      next,
      previous,
      seek,
      setVolume,
      setMuted,
      toggleShuffle,
      cycleRepeat,
      playNext,
      addToQueue,
      removeFromQueue,
      jumpTo,
      clearQueue,
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
