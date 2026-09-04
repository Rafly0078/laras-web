/**
 * Radio: mengisi antrean sendiri saat lagu terakhir tiba — logika MURNI.
 *
 * KENAPA FITUR INI ADA, dan kenapa ia prasyarat fitur lain:
 *
 * Membuka `/lagu/<id>` lalu menekan Putar membuat antrean berisi SATU lagu
 * (lihat `queueReducer` case 'play' — `tracks` jatuh ke `[action.track]`).
 * Akibatnya lagu tidak pernah "maju": `advanceRef` memanggil `next`, reducer
 * melihat cursor sudah di ujung, dan pemutar berhenti. Jadi tanpa pengisian
 * otomatis, "halaman ikut lagu yang sedang diputar" adalah fitur yang tidak
 * mungkin terpicu.
 *
 * Sumber isiannya rekomendasi artis mirip — mesin yang sama dengan rak
 * "Untukmu" (`lib/home/recommend.ts`). Konsekuensinya radio tidak pernah
 * mentok: setiap lagu yang diputar masuk riwayat, dan riwayat itulah benih
 * rekomendasi berikutnya.
 *
 * Aturan di sini murni supaya bisa diuji tanpa pemutar, tanpa jaringan, dan
 * tanpa React — bagian yang mudah salah adalah KAPAN mengisi dan apa yang
 * boleh masuk, bukan pengambilan datanya.
 */

import type { Track } from '@/lib/types';

/**
 * Lagu yang ditambahkan sekali isi.
 *
 * Bukan seluruh 30 rekomendasi: antrean yang tiba-tiba berisi 30 lagu membuat
 * panel antrean tidak terbaca, dan radio jadi "sudah memutuskan" terlalu jauh
 * ke depan. Sepuluh cukup untuk ~35 menit tanpa jeda, dan pengisian berikutnya
 * memakai riwayat yang sudah bertambah — jadi arahnya ikut bergerak.
 */
export const RADIO_BATCH = 10;

/**
 * Ambang pengisian: isi saat sisa antrean di bawah angka ini.
 *
 * 1, bukan 0: mengisi saat antrean SUDAH habis berarti pemutar sempat berhenti
 * dulu — jeda yang terdengar. Dengan ambang 1, isian datang selagi lagu
 * terakhir masih berbunyi.
 */
export const RADIO_THRESHOLD = 1;

export interface RadioDecision {
  /** true kalau antrean layak diisi sekarang. */
  fill: boolean;
  /** Alasan, untuk pesan log/uji — bukan untuk ditampilkan ke pengguna. */
  reason:
    | 'tidak-ada-lagu'
    | 'antrean-masih-panjang'
    | 'sudah-diisi-untuk-lagu-ini'
    | 'radio-mati'
    | 'isi';
}

export interface RadioContext {
  /** Lagu yang sedang diputar, atau null. */
  currentId: string | null;
  /** Jumlah lagu yang masih menunggu setelah lagu sekarang. */
  upcomingCount: number;
  /** Id lagu saat pengisian terakhir dilakukan. */
  lastFilledFor: string | null;
  /** false untuk mematikan radio sepenuhnya (mis. pengguna menolaknya). */
  enabled?: boolean;
  threshold?: number;
}

/**
 * Haruskah antrean diisi sekarang?
 *
 * `lastFilledFor` yang mencegah putaran tanpa henti: kalau rekomendasi
 * mengembalikan nol lagu (relay gagal, atau semuanya sudah didengar), tanpa
 * penjagaan ini efeknya akan mencoba lagi setiap render sampai relay ambruk.
 */
export function shouldFillQueue({
  currentId,
  upcomingCount,
  lastFilledFor,
  enabled = true,
  threshold = RADIO_THRESHOLD,
}: RadioContext): RadioDecision {
  if (!enabled) return { fill: false, reason: 'radio-mati' };
  if (currentId === null) return { fill: false, reason: 'tidak-ada-lagu' };
  if (upcomingCount >= threshold) return { fill: false, reason: 'antrean-masih-panjang' };
  if (lastFilledFor === currentId) {
    return { fill: false, reason: 'sudah-diisi-untuk-lagu-ini' };
  }
  return { fill: true, reason: 'isi' };
}

/**
 * Pilih lagu yang boleh masuk antrean.
 *
 * Dua hal dibuang: lagu yang SUDAH ada di antrean (menambahkannya bukan
 * menduplikasi tapi MEMINDAHKAN — lihat `withInserted` — jadi radio akan
 * mengocok antrean yang sudah disusun pengguna), dan lagu yang sedang diputar.
 */
export function pickRadioTracks(
  candidates: Track[],
  queue: Track[],
  currentId: string | null,
  batch = RADIO_BATCH,
): Track[] {
  const known = new Set(queue.map((t) => t.id));
  if (currentId !== null) known.add(currentId);

  const out: Track[] = [];
  for (const track of candidates) {
    if (known.has(track.id)) continue;
    known.add(track.id);
    out.push(track);
    if (out.length >= batch) break;
  }
  return out;
}
