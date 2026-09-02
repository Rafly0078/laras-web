'use client';

/**
 * Batas error untuk seluruh aplikasi.
 *
 * KENAPA PENTING DI APP INI: sejak lirik di-stream di bawah `<Suspense>`,
 * kegagalan tidak lagi terjadi sebelum render dimulai — ia bisa muncul di
 * tengah stream. Tanpa file ini, React memakai batas error bawaan Next dan
 * seluruh dokumen diganti layar error generik.
 *
 * Yang TIDAK diganti oleh file ini: root layout. `error.tsx` membungkus
 * `page.tsx` dan layout di bawahnya, bukan layout di atasnya — jadi
 * `PlayerProvider`, `VideoDock`, dan `MiniPlayer` tetap hidup dan lagu yang
 * sedang berjalan TIDAK berhenti hanya karena satu halaman gagal. Itu bukan
 * kebetulan; itu alasan pemutar ditaruh di root layout sejak awal.
 *
 * Error boundary React wajib client component, jadi konstanta sidebar-nya
 * diambil dari `lib/data/playlists.ts` (bukan `catalog.ts` yang `server-only`).
 */

import Link from 'next/link';
import { useEffect } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { TopBar } from '@/components/shell/top-bar';
import { SIDEBAR_PLAYLISTS } from '@/lib/data/playlists';

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // Next 16: prop-nya `retry`, BUKAN `reset` seperti versi sebelumnya.
  retry: () => void;
}) {
  useEffect(() => {
    // Satu-satunya jejak yang tersisa di sisi klien. Pesan aslinya tidak
    // dikirim ke browser di produksi — yang cocok dengan log server hanya
    // `digest`, jadi ia ikut dicetak.
    console.error('[laras] render gagal', error.digest ?? '(tanpa digest)', error);
  }, [error]);

  return (
    <AppShell active="" playlists={SIDEBAR_PLAYLISTS}>
      <TopBar title="Ada yang gagal" />

      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Halaman ini gagal dimuat
        </h1>

        <p className="max-w-md text-laras-secondary">
          Katalog dan lirik datang dari layanan pihak ketiga yang kadang lambat
          atau mati sesaat. Kalau lagu sedang berjalan, ia tetap berjalan —
          pemutar tidak ikut terganggu.
        </p>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="flex h-11 items-center rounded-[var(--radius-card)] bg-laras-accent px-5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Coba lagi
          </button>
          {/* Router dan layout masih utuh — yang gagal hanya segmen halaman —
              jadi navigasi klien biasa sudah cukup, tidak perlu muat ulang. */}
          <Link
            href="/"
            className="flex h-11 items-center rounded-[var(--radius-card)] bg-laras-card px-5 text-sm font-medium transition hover:bg-laras-control"
          >
            Ke Beranda
          </Link>
        </div>

        {error.digest ? (
          <p className="pt-2 font-mono text-xs text-laras-tertiary">
            Kode: {error.digest}
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
