'use client';

/**
 * Kotak pencarian yang mengubah URL, bukan state lokal.
 *
 * Kenapa lewat URL: hasil pencarian jadi bisa di-bookmark, dibagikan, dan
 * tombol Kembali browser bekerja seperti yang diharapkan. Kalau query hanya
 * hidup di state, semua itu hilang.
 *
 * Debounce 400ms: tanpa itu, "tulus" memicu 5 navigasi berturut-turut dan
 * setiap navigasi memicu satu permintaan ke relay.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { SearchIcon } from '@/components/ui/icons';

const DEBOUNCE_MS = 400;

export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Query terakhir yang sudah dinavigasikan, untuk menghindari navigasi ulang. */
  const lastPushed = useRef(initialQuery);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === lastPushed.current) return;

    const timer = setTimeout(() => {
      lastPushed.current = trimmed;
      // replace, bukan push: mengetik satu kueri tidak boleh menumpuk 20 entri
      // riwayat yang harus ditekan Kembali satu per satu.
      router.replace(trimmed.length > 0 ? `/cari?q=${encodeURIComponent(trimmed)}` : '/cari');
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [router, value]);

  /* Fokus otomatis: halaman ini tidak punya tujuan lain selain mengetik. */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <form
      role="search"
      className="px-6 pb-4 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        lastPushed.current = trimmed;
        router.replace(trimmed.length > 0 ? `/cari?q=${encodeURIComponent(trimmed)}` : '/cari');
      }}
    >
      <div className="relative flex items-center">
        <span className="pointer-events-none absolute left-3 text-laras-tertiary">
          <SearchIcon className="h-4 w-4" />
        </span>
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Cari lagu, album, atau artis"
          aria-label="Cari di katalog"
          className="h-12 w-full rounded-[var(--radius-card)] bg-laras-card pl-10 pr-4 text-base placeholder:text-laras-tertiary focus:outline-none focus:ring-2 focus:ring-laras-accent"
        />
      </div>
    </form>
  );
}
