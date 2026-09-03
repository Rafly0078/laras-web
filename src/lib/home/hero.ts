/**
 * Hero Beranda — logika MURNI.
 *
 * Hero menampilkan satu lagu: terbaru dari riwayat, atau lagu pertama rak
 * pertama sebagai cadangan. Memilihnya adalah aturan data (bukan urusan
 * React), jadi dipisah supaya bisa diuji di Node.
 */

import type { Shelf, Track } from '@/lib/types';

/**
 * Lagu pertama yang ditemukan di rak berurutan, atau null kalau semuanya
 * kosong. Rak pertama yang punya lagu menentukan cadangannya — tidak
 * diacak, supaya hasil render stabil antar kunjungan.
 */
export function firstTrackOf(shelves: Shelf[]): Track | null {
  for (const shelf of shelves) {
    for (const item of shelf.items) {
      if (item.kind === 'track') return item.track;
    }
  }
  return null;
}
