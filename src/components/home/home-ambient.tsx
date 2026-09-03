'use client';

/**
 * Ambient Beranda — warna latar hidup dari artwork lagu yang sedang diputar.
 *
 * Beranda tadinya hitam pekat tanpa sumber warna sama sekali: ambient yang
 * kaya warna hanya hidup di halaman /lagu. Komponen ini memulainya ke halaman
 * depan — warnanya mengikuti lagu yang SEDANG BERBUNYI (bukan rak pertama),
 * jadi setelah lagu diputar dari mana pun, kembali ke Beranda terasa
 * berkesinambungan.
 *
 * Angka saturasi/brightness sengaja lebih redup daripada AMBIENT halaman
 * lagu (2.8/0.9 → 1.7/0.62). Di /lagu latar harus kuat karena di baliknya
 * hanya satu artwork; di Beranda di baliknya ada 120+ kartu artwork, dan
 * latar yang terlalu pekat membuat artwork justru tenggelam.
 *
 * Warna disalurkan lewat CSS custom property `--laras-ambient-*` (token yang
 * sudah ada di globals.css, tadinya tidak terpakai). Alasan teknis memakai
 * custom property dan BUKAN state React di tiap kartu: transisi `1.5s ease-out`
 * di atasnya membuat warna MELLELEH antar lagu, bukan berkedip — sama seperti
 * perilaku halaman lagu.
 */

import { useEffect } from 'react';

import { usePlayer } from '@/lib/player/player-context';

/**
 * 'r g b' (dipisah SPASI — lihat catatan di ambient-backdrop.tsx: alpha
 * garis miring `rgb(r g b / x)` hanya sah dengan spasi).
 */
function hexToRgbString(hex: string): string | null {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const value = Number.parseInt(clean, 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

export function HomeAmbient() {
  const { current } = usePlayer();

  useEffect(() => {
    const root = document.documentElement;

    const set = (value: string | null) => {
      if (value === null) root.style.removeProperty('--laras-ambient-live');
      else root.style.setProperty('--laras-ambient-live', value);
    };

    if (!current?.artwork?.bgColor) {
      // Tidak ada lagu, atau metadata warna tidak ada: kembalikan hitam
      // netral. Transisi 1.5s di CSS membuat peralihannya lembut.
      set(null);
      return;
    }

    const rgb = hexToRgbString(current.artwork.bgColor);
    if (rgb === null) {
      set(null);
      return;
    }
    set(rgb);
  }, [current?.artwork?.bgColor]);

  return null;
}
