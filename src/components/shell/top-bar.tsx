'use client';

/**
 * Top bar — tombol riwayat + kotak pencarian, menempel di atas area scroll.
 *
 * Client component karena memegang handler tombol dan submit form.
 * Sengaja sticky (bukan fixed): induknya adalah kontainer scroll di app-shell,
 * jadi bar ini ikut lebar konten tanpa perlu tahu lebar sidebar.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useRef } from 'react';
import type { FormEvent } from 'react';

import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '@/components/ui/icons';

export interface TopBarProps {
  title?: string;
  /**
   * Sembunyikan kotak pencarian bar.
   *
   * Dipakai halaman /cari, yang punya kotak pencariannya sendiri berukuran
   * besar. Dua kotak pencarian di satu halaman membingungkan pengguna DAN
   * membuat pembaca layar mengumumkan dua landmark `search` — keduanya cacat
   * aksesibilitas, bukan sekadar soal selera.
   */
  showSearch?: boolean;
}

const NAV_BUTTON =
  'flex h-9 w-9 items-center justify-center rounded-full text-laras-secondary transition-colors hover:bg-white/10 hover:text-laras-text';

export function TopBar({ title, showSearch = true }: TopBarProps) {
  const router = useRouter();

  /**
   * Input tidak dikontrol state: nilainya hanya dibutuhkan saat submit, dan
   * state per ketikan berarti seluruh bar ikut render tiap huruf.
   */
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const q = inputRef.current?.value.trim() ?? '';
      if (!q) return;
      router.push(`/cari?q=${encodeURIComponent(q)}`);
    },
    [router],
  );

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-laras-outline/30 bg-laras-black/70 px-6 backdrop-blur-xl">
      <button
        type="button"
        onClick={() => router.back()}
        className={NAV_BUTTON}
        aria-label="Kembali"
      >
        <ChevronLeftIcon />
      </button>

      <button
        type="button"
        onClick={() => router.forward()}
        className={NAV_BUTTON}
        aria-label="Maju"
      >
        <ChevronRightIcon />
      </button>

      {/* Judul di bar dirender sebagai <p>, BUKAN <h1>.
          Alasannya: halaman sudah punya <h1> sendiri di badan konten, dan dua
          <h1> pada satu halaman membuat urutan heading untuk pembaca layar
          ambigu. Bar ini label orientasi, bukan judul dokumen. */}
      {title ? (
        <p className="truncate font-display text-base font-semibold">{title}</p>
      ) : null}

      {showSearch ? (
        <form onSubmit={handleSubmit} role="search" className="ml-auto">
          <div className="relative flex items-center">
            {/* Ikon di dalam kotak, jadi input butuh pl-9 supaya teks tidak
                tertimpa; pointer-events-none agar klik tetap jatuh ke input. */}
            <SearchIcon className="pointer-events-none absolute left-3 h-4 w-4 shrink-0 text-laras-tertiary" />
            <input
              ref={inputRef}
              type="search"
              name="q"
              aria-label="Cari lagu, album, atau artis"
              placeholder="Cari"
              className="h-9 w-72 rounded-[var(--radius-card)] bg-laras-card pl-9 pr-3 text-sm text-laras-text placeholder:text-laras-tertiary"
            />
          </div>
        </form>
      ) : null}
    </header>
  );
}
