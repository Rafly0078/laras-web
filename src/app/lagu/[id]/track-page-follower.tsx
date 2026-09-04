'use client';

/**
 * Halaman lagu mengikuti lagu yang sedang diputar.
 *
 * Komponen tanpa tampilan, dirender di `/lagu/[id]`. Ia yang memindahkan
 * halaman ketika antrean maju — lagu habis, atau pengguna menekan lanjut di
 * mini player — supaya artwork, judul, DAN lirik tidak tertinggal di lagu
 * sebelumnya.
 *
 * `router.replace`, bukan `push`: dengan `push`, setiap lagu yang lewat
 * menumpuk satu entri riwayat browser dan tombol Back berubah jadi "lagu
 * sebelumnya" — Back tidak bisa lagi dipakai untuk keluar dari halaman lagu.
 *
 * PREFETCH: rute lagu berikutnya diminta selagi lagu sekarang masih berbunyi.
 * Tanpa itu, `replace` harus menunggu render server (`/song` ~0,6-1s) sebelum
 * apa pun berubah, dan perpindahan yang seharusnya mulus terasa seperti klik
 * biasa. Lirik lagu baru tetap menyusul di bawah `<Suspense>` — itu memang
 * jalur yang sudah ada dan tidak diubah di sini.
 *
 * PENUNDAAN: kalau pengguna sedang menggulir lirik, halaman yang tiba-tiba
 * berganti terasa seperti kehilangan tempat. Aturan kapan boleh berpindah ada
 * di `lib/player/follow.ts` (murni, 10 unit test); di sini hanya jembatannya ke
 * router dan ke event DOM.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { decideFollow } from '@/lib/player/follow';
import { usePlayer } from '@/lib/player/player-context';

/**
 * Selektor pane lirik.
 *
 * Sengaja mencari `[data-laras-lyrics]` dan bukan kelas CSS module: nama kelas
 * module di-hash saat build, jadi mencocokkannya dari luar berarti bergantung
 * pada detail bundler.
 */
const LYRICS_SELECTOR = '[data-laras-lyrics]';

export function TrackPageFollower({ trackId }: { trackId: string }) {
  const router = useRouter();
  const { current, upcoming } = usePlayer();

  /** `performance.now()` saat pengguna terakhir menyentuh area lirik. */
  const lastInteractionAt = useRef<number | null>(null);

  /*
   * Rekam interaksi di area lirik.
   *
   * Listener di `document` dengan capture, bukan di elemennya: pane lirik
   * dirender di bawah `<Suspense>` sehingga ia BELUM ADA saat efek ini pertama
   * jalan, dan `scroll` tidak menggelembung sehingga listener bubble di
   * document tidak akan pernah menerimanya.
   *
   * `wheel` dan `touchstart` ikut disimak karena keduanya menandai niat
   * menggulir bahkan ketika posisi scroll belum berubah (mis. sudah di ujung).
   */
  useEffect(() => {
    const note = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const element = target instanceof Element ? target : target.parentElement;
      if (element?.closest(LYRICS_SELECTOR) == null) return;
      lastInteractionAt.current = performance.now();
    };

    document.addEventListener('scroll', note, { capture: true, passive: true });
    document.addEventListener('wheel', note, { capture: true, passive: true });
    document.addEventListener('touchstart', note, { capture: true, passive: true });

    return () => {
      document.removeEventListener('scroll', note, { capture: true });
      document.removeEventListener('wheel', note, { capture: true });
      document.removeEventListener('touchstart', note, { capture: true });
    };
  }, []);

  /* Prefetch lagu berikutnya selagi yang sekarang masih berbunyi. Efek
     terpisah dari perpindahan: ia bergantung pada ANTREAN, bukan pada lagu yang
     diputar, dan menggabungkannya berarti prefetch ikut dijalankan ulang setiap
     kali penundaan dicoba lagi. */
  const nextId = upcoming[0]?.track.id ?? null;
  useEffect(() => {
    if (nextId === null) return;
    router.prefetch(`/lagu/${nextId}`);
  }, [nextId, router]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const evaluate = () => {
      const decision = decideFollow({
        pageTrackId: trackId,
        currentTrackId: current?.id ?? null,
        lastInteractionAt: lastInteractionAt.current,
        now: performance.now(),
      });

      if (decision.action === 'pindah') {
        router.replace(`/lagu/${decision.toTrackId}`);
        return;
      }
      if (decision.action === 'tunda') {
        /* Dijadwalkan ulang, bukan diabaikan: kalau pengguna berhenti
           menggulir, halaman harus tetap menyusul. `decideFollow` yang
           menghitung sisa jedanya. */
        timer = setTimeout(evaluate, decision.retryInMs);
      }
    };

    evaluate();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [current?.id, trackId, router]);

  return null;
}
