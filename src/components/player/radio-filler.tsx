'use client';

/**
 * Radio: mengisi antrean sendiri saat lagu terakhir tiba.
 *
 * Komponen tanpa tampilan, dirender di root layout bersama `PlayHistoryRecorder`.
 * Alasannya sama seperti perekam riwayat: `player-context.tsx` tetap hanya soal
 * MEMUTAR, dan fitur ini bisa dihapus tanpa menyentuhnya. Pemutar tidak perlu
 * tahu bahwa rekomendasi ada.
 *
 * KENAPA FITUR INI PRASYARAT, BUKAN TAMBAHAN: membuka `/lagu/<id>` lalu menekan
 * Putar membuat antrean berisi SATU lagu (`queueReducer` case 'play' jatuh ke
 * `[action.track]`). Lagu itu tidak pernah "maju" — `advanceRef` memanggil
 * `next`, reducer melihat cursor sudah di ujung, pemutar berhenti. Tanpa
 * pengisian otomatis, "halaman ikut lagu yang sedang diputar" adalah fitur yang
 * tidak mungkin terpicu sama sekali.
 *
 * Sumber isiannya `POST /api/rekomendasi` — mesin yang sama dengan rak
 * "Untukmu". Konsekuensinya radio tidak pernah mentok: setiap lagu yang diputar
 * masuk riwayat, dan riwayat itulah benih pengisian berikutnya.
 *
 * Aturan KAPAN mengisi dan APA yang boleh masuk ada di `lib/player/radio.ts`
 * (murni, 16 unit test). Di sini hanya jembatannya ke React dan jaringan.
 */

import { useEffect, useRef } from 'react';

import { useCollection } from '@/lib/player/collection-context';
import { usePlayer } from '@/lib/player/player-context';
import { pickRadioTracks, shouldFillQueue } from '@/lib/player/radio';
import type { Track } from '@/lib/types';

/**
 * Riwayat terbaru yang dikirim sebagai benih.
 *
 * Sama dengan `RECOMMENDATION_LOOKUP` di `lib/data/catalog.ts` dan
 * `LOOKUP_SIZE` di `home-recommendations.tsx` — ketiganya harus sama supaya
 * radio dan rak "Untukmu" memakai kunci cache yang identik, sehingga pengisian
 * antrean gratis kalau raknya sudah dimuat (dan sebaliknya).
 */
const LOOKUP_SIZE = 12;

/** Baca `{ lagu: Track[] }` tanpa memercayai bentuk respons. */
function tracksOf(data: unknown): Track[] {
  if (typeof data !== 'object' || data === null) return [];
  const lagu = (data as { lagu?: unknown }).lagu;
  return Array.isArray(lagu) ? (lagu as Track[]) : [];
}

export function RadioFiller() {
  const { current, queue, upcoming, addToQueue } = usePlayer();
  const { history } = useCollection();

  /**
   * Id lagu saat pengisian TERAKHIR dicoba.
   *
   * Di ref, bukan state: nilainya tidak pernah dirender, dan menaruhnya di
   * state berarti setiap pengisian memicu render ulang seluruh subtree yang
   * membaca konteks pemutar. Ia juga yang mencegah putaran tanpa henti — kalau
   * rekomendasi mengembalikan nol lagu, jangan coba lagi untuk lagu yang sama.
   */
  const lastFilledFor = useRef<string | null>(null);

  /* Efek TIDAK boleh bergantung pada `history` (objek baru setiap perubahan
     koleksi) — hanya pada kunci turunannya, kalau tidak radio ikut terpicu
     setiap lagu masuk riwayat. */
  const historyKey = history
    .slice(0, LOOKUP_SIZE)
    .map((t) => t.id)
    .join(',');

  useEffect(() => {
    const decision = shouldFillQueue({
      currentId: current?.id ?? null,
      upcomingCount: upcoming.length,
      lastFilledFor: lastFilledFor.current,
    });
    if (!decision.fill) return;

    const currentId = current?.id ?? null;
    if (currentId === null) return;

    /* Ditandai SEBELUM permintaan dikirim, bukan sesudah. Rantai relay-nya
       beberapa detik dan efek ini bisa jalan lagi di tengah jalan (mis. posisi
       antrean berubah); menandainya belakangan berarti dua permintaan untuk
       satu lagu. */
    lastFilledFor.current = currentId;

    /* Benih: riwayat kalau ada, kalau belum ada pakai lagu yang sedang diputar.
       Kasus kedua nyata dan justru yang paling sering — riwayat dicatat saat
       lagu MULAI berbunyi, jadi pada lagu pertama sesi baru, riwayat masih
       kosong tepat saat radio dibutuhkan. */
    const seed = historyKey.length > 0 ? historyKey.split(',') : [currentId];

    const controller = new AbortController();

    fetch('/api/rekomendasi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ riwayat: seed }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        const picked = pickRadioTracks(tracksOf(data), queue, currentId);
        /* `addToQueue` menaruh di AKHIR antrean satu per satu. Tidak ada aksi
           reducer untuk menambah banyak sekaligus, dan menambahkannya di sini
           berarti menyentuh `queue.ts` untuk kenyamanan — sepuluh dispatch
           berurutan diproses React dalam satu batch commit, jadi biayanya nol. */
        for (const track of picked) addToQueue(track);
      })
      .catch(() => {
        /* Termasuk AbortError. Kegagalan dibiarkan diam: pemutar berhenti di
           ujung antrean seperti sebelum fitur ini ada, dan itu perilaku yang
           bisa dipahami pengguna. Menampilkan pesan error untuk fitur yang
           tidak pernah diminta secara eksplisit hanya membingungkan. */
      });

    return () => controller.abort();
    /* `queue` sengaja TIDAK jadi dependensi: ia berubah setiap kali radio
       menambahkan lagu, dan itu akan menjalankan efek ini lagi. Nilai
       terbarunya tidak dibutuhkan — yang penting `upcoming.length`, yang sudah
       ada di daftar. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, upcoming.length, historyKey, addToQueue]);

  return null;
}
