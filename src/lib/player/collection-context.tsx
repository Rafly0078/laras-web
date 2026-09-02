'use client';

/**
 * Konteks koleksi — riwayat putar & favorit di localStorage.
 *
 * Tanpa akun dan tanpa database (keputusan final di BRIEF.md), jadi koleksi
 * terikat pada satu browser. Itu diterima; yang tidak diterima adalah aplikasi
 * yang rusak karena localStorage.
 *
 * KENAPA `useSyncExternalStore`, BUKAN `useState` + efek:
 *
 * localStorage adalah store di luar React, dan ini hook yang memang dibuat
 * untuk itu. Membacanya dengan `useState` + `useEffect` membawa tiga masalah
 * yang semuanya hilang di sini:
 *
 *  1. Hydration. localStorage tidak ada di server. `getServerSnapshot`
 *     mengembalikan koleksi kosong untuk render server, dan React sendiri yang
 *     mengurus peralihan ke nilai klien — bukan kita dengan flag `loaded`.
 *  2. `setState` di dalam efek. Dilarang React 19
 *     (`react-hooks/set-state-in-effect`), dan larangannya benar: itu render
 *     kedua yang tidak perlu.
 *  3. Menimpa data dengan koleksi kosong. Setiap penulisan di sini membaca ULANG
 *     penyimpanan lebih dulu (`update`), jadi tidak ada jalan untuk menyimpan
 *     state basi di atas data yang sudah ada.
 *
 * Bonus yang didapat gratis: event `storage` membuat dua tab tetap sinkron.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import {
  emptyCollection,
  isFavorite as collectionHasFavorite,
  parseCollection,
  withFavoriteToggled,
  withHistoryCleared,
  withPlayed,
  type Collection,
} from '@/lib/player/collection';
import type { Track } from '@/lib/types';

const STORAGE_KEY = 'laras.collection.v1';

/* ── Store di luar React ───────────────────────────────────────────────── */

const listeners = new Set<() => void>();

/**
 * Snapshot terakhir, DIINGAT.
 *
 * `getSnapshot` wajib mengembalikan referensi yang sama selama data tidak
 * berubah. Mem-parse JSON setiap kali dipanggil akan menghasilkan objek baru
 * terus-menerus dan React akan merender tanpa henti.
 */
let snapshot: Collection = emptyCollection;
let snapshotRaw: string | null = null;

function readStorage(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    /* localStorage bisa dilarang sepenuhnya (mode privat ketat, kebijakan
       perusahaan). Itu bukan alasan menjatuhkan aplikasi — koleksi sekadar
       tidak bertahan antar kunjungan. */
    return null;
  }
}

function getSnapshot(): Collection {
  const raw = readStorage();
  if (raw !== snapshotRaw) {
    snapshotRaw = raw;
    snapshot = parseCollection(raw);
  }
  return snapshot;
}

/** Server tidak punya localStorage; koleksi kosong adalah jawaban yang benar. */
function getServerSnapshot(): Collection {
  return emptyCollection;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Perubahan dari TAB LAIN datang lewat event ini.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Baca-ubah-tulis. Selalu membaca dari penyimpanan lebih dulu, jadi dua
 * komponen yang menulis berurutan tidak saling menimpa.
 */
function update(change: (previous: Collection) => Collection): void {
  const next = change(getSnapshot());
  const serialized = JSON.stringify(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Kuota penuh atau penyimpanan diblokir: perubahan tetap berlaku untuk sesi
    // ini, hanya tidak bertahan. Lebih baik daripada tombol yang tidak bereaksi.
  }
  snapshotRaw = serialized;
  snapshot = next;
  for (const listener of listeners) listener();
}

/* ── React ─────────────────────────────────────────────────────────────── */

export interface CollectionContextValue {
  /** Terbaru di depan. */
  history: Track[];
  favorites: Track[];
  isFavorite: (trackId: string) => boolean;
  markPlayed: (track: Track) => void;
  toggleFavorite: (track: Track) => void;
  clearHistory: () => void;
}

const CollectionContext = createContext<CollectionContextValue | null>(null);

export function CollectionProvider({ children }: { children: ReactNode }) {
  const collection = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const markPlayed = useCallback((track: Track) => {
    update((previous) => withPlayed(previous, track));
  }, []);

  const toggleFavorite = useCallback((track: Track) => {
    update((previous) => withFavoriteToggled(previous, track));
  }, []);

  const clearHistory = useCallback(() => {
    update(withHistoryCleared);
  }, []);

  const isFavorite = useCallback(
    (trackId: string) => collectionHasFavorite(collection, trackId),
    [collection],
  );

  const value = useMemo<CollectionContextValue>(
    () => ({
      history: collection.history,
      favorites: collection.favorites,
      isFavorite,
      markPlayed,
      toggleFavorite,
      clearHistory,
    }),
    [collection.history, collection.favorites, isFavorite, markPlayed, toggleFavorite, clearHistory],
  );

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

export function useCollection(): CollectionContextValue {
  const ctx = useContext(CollectionContext);
  if (ctx === null) {
    throw new Error('useCollection harus dipakai di dalam <CollectionProvider>');
  }
  return ctx;
}
