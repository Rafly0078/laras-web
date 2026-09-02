/**
 * Halaman 404 — dipakai `notFound()` dan URL yang tidak cocok rute apa pun.
 *
 * Server component, jadi ia dapat kerangka lengkap (sidebar + top bar) dan
 * pengguna punya jalan keluar, bukan cuma layar kosong. `/playlist/[slug]`
 * memakai `dynamicParams = false`, jadi slug asing mendarat di sini.
 */

import Link from 'next/link';

import { AppShell } from '@/components/shell/app-shell';
import { TopBar } from '@/components/shell/top-bar';
import { SIDEBAR_PLAYLISTS } from '@/lib/data/playlists';

export default function NotFound() {
  return (
    <AppShell active="" playlists={SIDEBAR_PLAYLISTS}>
      <TopBar title="Tidak ditemukan" />

      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-display text-6xl font-bold tracking-tight text-laras-tertiary">
          404
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Halaman ini tidak ada
        </h1>
        <p className="max-w-md text-laras-secondary">
          Alamatnya mungkin salah tulis, atau lagu dan album yang dituju sudah
          tidak ada di katalog.
        </p>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="flex h-11 items-center rounded-[var(--radius-card)] bg-laras-accent px-5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Ke Beranda
          </Link>
          <Link
            href="/cari"
            className="flex h-11 items-center rounded-[var(--radius-card)] bg-laras-card px-5 text-sm font-medium transition hover:bg-laras-control"
          >
            Cari lagu
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
