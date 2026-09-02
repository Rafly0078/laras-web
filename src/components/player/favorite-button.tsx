'use client';

/**
 * Tombol favorit (hati).
 *
 * Dipakai di mini player dan di halaman lagu, jadi ukurannya bisa diatur.
 *
 * Saat render server, koleksi selalu kosong (localStorage tidak ada di sana),
 * jadi hati baru terisi setelah hidrasi. Itu tidak berbahaya: setiap penulisan
 * membaca ULANG penyimpanan lebih dulu (lihat `update` di collection-context),
 * jadi klik yang terjadi lebih awal tidak bisa menimpa favorit yang sudah ada.
 */

import { useCollection } from '@/lib/player/collection-context';
import type { Track } from '@/lib/types';

export function FavoriteButton({
  track,
  size = 'md',
}: {
  track: Track;
  size?: 'sm' | 'md';
}) {
  const { isFavorite, toggleFavorite } = useCollection();
  const marked = isFavorite(track.id);

  const box = size === 'sm' ? 'h-11 w-11' : 'h-12 w-12';
  const icon = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  return (
    <button
      type="button"
      onClick={() => toggleFavorite(track)}
      aria-pressed={marked}
      aria-label={marked ? `Hapus ${track.title} dari favorit` : `Tandai ${track.title} sebagai favorit`}
      className={`flex ${box} items-center justify-center rounded-full transition hover:bg-white/10 ${
        marked ? 'text-laras-accent' : 'text-laras-secondary hover:text-laras-text'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className={icon}
        // Terisi saat ditandai, garis luar saat belum: bentuknya sendiri yang
        // menyampaikan keadaan, bukan hanya warnanya. Warna saja tidak cukup
        // untuk pengguna yang tidak bisa membedakan merah dari abu.
        fill={marked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={marked ? 0 : 1.8}
        aria-hidden="true"
      >
        <path d="M12 20.3l-1.1-1C6.1 15 3 12.2 3 8.8 3 6.1 5.1 4 7.8 4c1.5 0 3 .7 4.2 2.1C13.2 4.7 14.7 4 16.2 4 18.9 4 21 6.1 21 8.8c0 3.4-3.1 6.2-7.9 10.5z" />
      </svg>
    </button>
  );
}
