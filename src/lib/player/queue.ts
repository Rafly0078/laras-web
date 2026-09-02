/**
 * Antrean pemutar sebagai REDUCER MURNI.
 *
 * Kenapa bukan sekumpulan `useState` di dalam konteks: lima nilai di sini saling
 * bergantung (daftar lagu, urutan main, posisi, shuffle, repeat). Menghapus satu
 * lagu dari antrean harus menyesuaikan urutan main DAN posisi sekaligus — dengan
 * `useState` terpisah itu tiga pemanggil setState yang masing-masing hanya
 * melihat sebagian kebenaran, dan bug-nya muncul sebagai "kadang melompat ke
 * lagu yang salah". Sebagai fungsi murni, seluruh aturannya bisa diuji.
 *
 * KEPUTUSAN PENTING: shuffle TIDAK mengacak `tracks`.
 *
 * `tracks` selalu urutan asli playlist; yang diacak adalah `order`, daftar
 * indeks ke dalamnya. Alasannya perilaku yang diharapkan pengguna: mematikan
 * shuffle harus MENGEMBALIKAN urutan album, bukan meninggalkan hasil acak
 * sebagai urutan baru. Kalau `tracks` yang diacak, urutan aslinya hilang
 * selamanya.
 *
 * `cursor` menunjuk ke posisi di `order`, bukan ke `tracks`. Lagu yang sedang
 * diputar = `tracks[order[cursor]]`.
 */

import type { AudioSource, RepeatMode, Track } from '@/lib/types';

export interface QueueState {
  /** Antrean dalam urutan ASLI. Tidak pernah diacak. */
  tracks: Track[];
  /** Urutan main: indeks ke `tracks`. Diacak saat shuffle menyala. */
  order: number[];
  /** Posisi di `order`. -1 = belum ada yang diputar. */
  cursor: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

export const emptyQueue: QueueState = {
  tracks: [],
  order: [],
  cursor: -1,
  shuffle: false,
  repeat: 'off',
};

export type QueueAction =
  /** Mulai memutar satu lagu, opsional dengan antrean di sekitarnya. */
  | { type: 'play'; track: Track; tracks?: Track[] }
  | { type: 'next' }
  | { type: 'previous' }
  /** Lompat ke lagu tertentu berdasarkan posisinya di `tracks`. */
  | { type: 'jump'; queueIndex: number }
  /** Taruh di akhir antrean. */
  | { type: 'append'; track: Track }
  /** Taruh tepat setelah lagu yang sedang diputar. */
  | { type: 'playNext'; track: Track }
  | { type: 'remove'; queueIndex: number }
  /**
   * Audio sebuah lagu baru selesai dijembatani.
   *
   * Aksi tersendiri, BUKAN `play` ulang: `play` membangun antrean dari nol, jadi
   * memakainya untuk menambal satu lagu akan menghapus 99 lagu lain di antrean.
   * Sudah pernah salah begitu.
   */
  | { type: 'resolvedAudio'; trackId: string; audio: AudioSource }
  | { type: 'clear' }
  | { type: 'setShuffle'; on: boolean }
  | { type: 'setRepeat'; mode: RepeatMode };

/** Permutasi acak — bisa diganti di test supaya hasilnya bisa diprediksi. */
export type Permute = (indices: number[]) => number[];

/**
 * Fisher–Yates. `Math.random()` di sini AMAN meski jebakan hydration melarang
 * nilai acak: fungsi ini hanya dipanggil dari event handler (klik tombol
 * shuffle), bukan saat render, jadi server dan klien tidak pernah harus
 * menghasilkan nilai yang sama.
 */
export const shufflePermute: Permute = (indices) => {
  const out = [...indices];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Indeks lagu yang sedang diputar di dalam `tracks`, atau -1. */
export function currentIndex(state: QueueState): number {
  if (state.cursor < 0 || state.cursor >= state.order.length) return -1;
  const index = state.order[state.cursor];
  return index >= 0 && index < state.tracks.length ? index : -1;
}

export function currentTrack(state: QueueState): Track | null {
  const index = currentIndex(state);
  return index === -1 ? null : state.tracks[index];
}

/**
 * Bangun urutan main untuk `length` lagu.
 *
 * Saat shuffle menyala, lagu yang sedang diputar DIPAKSA ke posisi pertama:
 * menyalakan shuffle tidak boleh mengganti lagu yang sedang berbunyi.
 */
function buildOrder(
  length: number,
  shuffle: boolean,
  startIndex: number,
  permute: Permute,
): number[] {
  const all = Array.from({ length }, (_, i) => i);
  if (!shuffle) return all;
  if (startIndex < 0) return permute(all);
  return [startIndex, ...permute(all.filter((i) => i !== startIndex))];
}

/**
 * Sisipkan satu lagu, kembalikan state baru dengan `order` yang konsisten.
 *
 * `where` sengaja SEMANTIK, bukan angka posisi. Alasannya bug yang sudah
 * ditangkap test: kalau lagu yang disisipkan SUDAH ada di antrean, ia dicabut
 * dulu dari `order` — dan pencabutan itu bisa menggeser posisi lagu yang sedang
 * diputar. Angka posisi yang dihitung sebelum pencabutan jadi salah satu.
 * Karena itu posisi dihitung ULANG setelah pencabutan, di dalam fungsi ini.
 */
function withInserted(
  state: QueueState,
  track: Track,
  where: 'end' | 'afterCurrent',
): QueueState {
  /* Lagu yang SUDAH ada di antrean tidak diduplikasi; ia hanya dipindahkan ke
     posisi baru. Antrean berisi lagu yang sama dua kali membuat "lagu
     berikutnya" jadi ambigu dan tidak ada pengguna yang memintanya. */
  const existing = state.tracks.findIndex((t) => t.id === track.id);
  const currentQueueIndex = currentIndex(state);

  if (existing !== -1) {
    const withoutIt = state.order.filter((i) => i !== existing);
    const currentPosition =
      currentQueueIndex === -1 ? -1 : withoutIt.indexOf(currentQueueIndex);
    const at = where === 'end' ? withoutIt.length : currentPosition + 1;
    const order = [...withoutIt.slice(0, at), existing, ...withoutIt.slice(at)];
    return {
      ...state,
      order,
      cursor:
        currentQueueIndex === -1 ? state.cursor : order.indexOf(currentQueueIndex),
    };
  }

  const tracks = [...state.tracks, track];
  const newIndex = tracks.length - 1;
  const at =
    where === 'end'
      ? state.order.length
      : state.cursor < 0
        ? 0
        : state.cursor + 1;
  return {
    ...state,
    tracks,
    order: [...state.order.slice(0, at), newIndex, ...state.order.slice(at)],
  };
}

export function queueReducer(
  state: QueueState,
  action: QueueAction,
  permute: Permute = shufflePermute,
): QueueState {
  switch (action.type) {
    case 'play': {
      const tracks =
        action.tracks && action.tracks.length > 0 ? action.tracks : [action.track];
      const at = tracks.findIndex((t) => t.id === action.track.id);
      const startIndex = at >= 0 ? at : 0;
      const order = buildOrder(tracks.length, state.shuffle, startIndex, permute);
      return {
        ...state,
        tracks,
        order,
        // Saat shuffle, lagu yang diklik ada di posisi 0 (lihat buildOrder).
        cursor: state.shuffle ? 0 : startIndex,
      };
    }

    case 'next': {
      if (state.cursor < 0) return state;
      /* repeat 'one' TIDAK ditangani di sini. Mengulang lagu yang sama berarti
         seek(0) pada pemutar, bukan memindahkan antrean — dan reducer ini tidak
         boleh tahu apa pun soal pemutar. Konteks yang memutuskan. */
      if (state.cursor + 1 < state.order.length) {
        return { ...state, cursor: state.cursor + 1 };
      }
      // Di ujung antrean: hanya repeat 'all' yang memutar dari awal.
      return state.repeat === 'all' && state.order.length > 0
        ? { ...state, cursor: 0 }
        : state;
    }

    case 'previous': {
      if (state.cursor < 0) return state;
      if (state.cursor > 0) return { ...state, cursor: state.cursor - 1 };
      return state.repeat === 'all' && state.order.length > 0
        ? { ...state, cursor: state.order.length - 1 }
        : state;
    }

    case 'jump': {
      const position = state.order.indexOf(action.queueIndex);
      return position === -1 ? state : { ...state, cursor: position };
    }

    case 'append':
      return withInserted(state, action.track, 'end');

    case 'playNext':
      return withInserted(state, action.track, 'afterCurrent');

    case 'remove': {
      const { queueIndex } = action;
      if (queueIndex < 0 || queueIndex >= state.tracks.length) return state;

      const removedPosition = state.order.indexOf(queueIndex);
      const tracks = state.tracks.filter((_, i) => i !== queueIndex);
      // Indeks di atas yang dihapus bergeser turun satu.
      const order = state.order
        .filter((i) => i !== queueIndex)
        .map((i) => (i > queueIndex ? i - 1 : i));

      /* Kursor: kalau yang dihapus ADA DI BELAKANG lagu sekarang, posisi lagu
         sekarang tidak berubah. Kalau di depan, kursor ikut turun satu. Kalau
         yang dihapus adalah lagu yang sedang diputar, kursor tetap di angka yang
         sama — yang berarti lagu berikutnya naik ke posisi itu, persis yang
         diharapkan pengguna saat menghapus baris yang sedang berbunyi. */
      let cursor = state.cursor;
      if (removedPosition !== -1 && removedPosition < state.cursor) cursor -= 1;
      if (order.length === 0) cursor = -1;
      else cursor = Math.max(0, Math.min(cursor, order.length - 1));

      return { ...state, tracks, order, cursor };
    }

    case 'resolvedAudio': {
      const at = state.tracks.findIndex((t) => t.id === action.trackId);
      if (at === -1) return state;
      const tracks = [...state.tracks];
      tracks[at] = { ...tracks[at], audio: action.audio };
      // order & cursor sengaja TIDAK disentuh: lagu yang sama, hanya lebih tahu.
      return { ...state, tracks };
    }

    case 'clear':
      return { ...emptyQueue, shuffle: state.shuffle, repeat: state.repeat };

    case 'setShuffle': {
      if (action.on === state.shuffle) return state;
      const index = currentIndex(state);
      const order = buildOrder(state.tracks.length, action.on, index, permute);
      return {
        ...state,
        shuffle: action.on,
        order,
        cursor: index === -1 ? state.cursor : order.indexOf(index),
      };
    }

    case 'setRepeat':
      return { ...state, repeat: action.mode };

    default:
      return state;
  }
}

/** Urutan siklus tombol repeat: mati → semua → satu → mati. */
export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  return mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off';
}

/** Antrean yang akan diputar setelah lagu sekarang, dalam urutan main. */
export function upcoming(state: QueueState): { queueIndex: number; track: Track }[] {
  if (state.cursor < 0) return [];
  return state.order
    .slice(state.cursor + 1)
    .map((queueIndex) => ({ queueIndex, track: state.tracks[queueIndex] }))
    .filter((entry): entry is { queueIndex: number; track: Track } => entry.track !== undefined);
}
