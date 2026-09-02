'use client';

/**
 * Perekam riwayat: satu komponen tanpa tampilan yang menjembatani pemutar dan
 * koleksi.
 *
 * Kenapa komponen terpisah dan bukan efek di dalam `PlayerProvider`: pemutar
 * tidak perlu tahu bahwa riwayat ada. Dengan begini `player-context.tsx` tetap
 * hanya soal memutar, dan fitur koleksi bisa dihapus tanpa menyentuhnya.
 *
 * Dicatat saat lagu MULAI BERBUNYI, bukan saat diklik. Bedanya nyata: mengklik
 * lagu yang audionya gagal dijembatani tidak layak masuk riwayat, dan penjembatanan
 * bisa gagal setelah kliknya.
 */

import { useEffect, useRef } from 'react';

import { useCollection } from '@/lib/player/collection-context';
import { usePlayer } from '@/lib/player/player-context';

export function PlayHistoryRecorder() {
  const { current, state } = usePlayer();
  const { markPlayed } = useCollection();

  /* Id yang sudah dicatat untuk sesi pemutaran ini. Tanpa penjagaan ini, setiap
     jeda-lanjut akan mencatat ulang lagu yang sama dan memindahkannya ke depan
     riwayat berkali-kali. */
  const recordedRef = useRef<string | null>(null);

  useEffect(() => {
    if (current === null) return;
    if (state !== 'playing') return;
    if (recordedRef.current === current.id) return;

    recordedRef.current = current.id;
    markPlayed(current);
  }, [current, state, markPlayed]);

  return null;
}
