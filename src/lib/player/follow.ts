/**
 * "Halaman ikut lagu yang sedang diputar" — logika MURNI.
 *
 * MASALAHNYA: `/lagu/<id>` menampilkan artwork, judul, dan lirik untuk id di
 * URL. Ketika antrean maju (lagu habis, atau pengguna menekan lanjut di mini
 * player), pemutar berpindah lagu tetapi halaman tidak — jadi lirik yang
 * terlihat adalah lirik lagu SEBELUMNYA, dan artwork serta judulnya pun salah.
 * Bukan hanya liriknya yang ketinggalan; seluruh halaman ketinggalan.
 *
 * SOLUSINYA: `router.replace` ke lagu baru. `replace`, bukan `push`: dengan
 * `push`, setiap lagu yang lewat menumpuk satu entri riwayat browser, dan
 * tombol Back menjadi "lagu sebelumnya" — perilaku yang tidak diminta siapa pun
 * dan membuat Back tidak bisa dipakai untuk keluar dari halaman lagu.
 *
 * YANG DITUNDA: kalau pengguna sedang menggulir lirik, halaman yang tiba-tiba
 * berganti terasa seperti kehilangan tempat. Jadi perpindahan menunggu sampai
 * ia berhenti. Ambangnya waktu, bukan posisi scroll — yang penting "baru saja
 * menyentuh", dan itu sudah cukup untuk membedakan membaca dari menonton.
 */

export interface FollowContext {
  /** Id lagu yang sedang DITAMPILKAN halaman (dari URL). */
  pageTrackId: string;
  /** Id lagu yang sedang DIPUTAR, atau null kalau belum ada. */
  currentTrackId: string | null;
  /** `performance.now()` saat pengguna terakhir menyentuh area lirik. */
  lastInteractionAt: number | null;
  /** `performance.now()` sekarang. */
  now: number;
  /** Jeda tenang sebelum halaman boleh berpindah. */
  graceMs?: number;
}

export type FollowDecision =
  /** Tidak ada yang perlu dilakukan. */
  | { action: 'tetap'; reason: 'belum-ada-lagu' | 'sudah-lagu-ini' }
  /** Pindah sekarang. */
  | { action: 'pindah'; toTrackId: string }
  /** Pengguna sedang membaca; coba lagi setelah `retryInMs`. */
  | { action: 'tunda'; toTrackId: string; retryInMs: number };

/**
 * Jeda tenang setelah interaksi terakhir.
 *
 * 2,5 detik: cukup lama untuk tidak memotong gulir yang masih berlangsung
 * (sapuan jari berhenti sesaat lalu lanjut), cukup singkat untuk tidak membuat
 * halaman terasa macet setelah pengguna benar-benar selesai. Angkanya tidak
 * bisa dibuktikan dengan test — yang bisa diuji adalah bahwa penundaannya
 * BEKERJA dan akhirnya selalu berpindah.
 */
export const FOLLOW_GRACE_MS = 2500;

export function decideFollow({
  pageTrackId,
  currentTrackId,
  lastInteractionAt,
  now,
  graceMs = FOLLOW_GRACE_MS,
}: FollowContext): FollowDecision {
  if (currentTrackId === null) {
    return { action: 'tetap', reason: 'belum-ada-lagu' };
  }
  if (currentTrackId === pageTrackId) {
    return { action: 'tetap', reason: 'sudah-lagu-ini' };
  }

  if (lastInteractionAt !== null) {
    const quietFor = now - lastInteractionAt;
    if (quietFor < graceMs) {
      return {
        action: 'tunda',
        toTrackId: currentTrackId,
        /* Sisa waktu, dijepit ke minimum 1 supaya pemanggil tidak pernah
           menjadwalkan timer 0ms yang langsung berjalan lagi dalam putaran
           ketat kalau jamnya bergerak mundur (Date.now bisa; performance.now
           tidak, tapi jangan bergantung pada itu). */
        retryInMs: Math.max(1, Math.ceil(graceMs - quietFor)),
      };
    }
  }

  return { action: 'pindah', toTrackId: currentTrackId };
}
