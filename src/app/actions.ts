'use server';

/**
 * Server action: cari sumber audio YouTube untuk satu lagu, saat diminta.
 *
 * Kenapa server action dan bukan diselesaikan saat render halaman:
 *
 * Satu playlist berisi 30–100 lagu. Menjembatani semuanya di muka berarti
 * 30–100 permintaan ke YouTube Music hanya untuk MENAMPILKAN daftar — padahal
 * pengguna paling banyak memutar satu. Jadi penjembatanan ditunda sampai lagu
 * benar-benar diklik.
 *
 * Efeknya pada UX: ada jeda ~1 detik antara klik dan audio mulai. Itu harga
 * yang jauh lebih murah daripada menahan render daftar selama 30 detik.
 */

import { resolveAudio } from '@/lib/data/youtube';
import type { AudioSource, Track } from '@/lib/types';

export interface ResolveResult {
  audio: AudioSource | null;
  /** Alasan kegagalan, untuk ditampilkan ke pengguna. */
  reason: string | null;
}

export async function resolveTrackAudio(track: Track): Promise<ResolveResult> {
  // Sudah punya audio (mis. dari fixture) — tidak perlu memanggil apa pun.
  if (track.audio) return { audio: track.audio, reason: null };

  const audio = await resolveAudio(track);

  if (audio === null) {
    return {
      audio: null,
      // Pesan ini SENGAJA menyebut alasannya: tidak ada rekaman berdurasi
      // cocok. Menyembunyikannya membuat pengguna menyangka aplikasinya rusak.
      reason:
        'Tidak ditemukan rekaman YouTube yang durasinya cocok dengan versi katalog ini.',
    };
  }

  return { audio, reason: null };
}
