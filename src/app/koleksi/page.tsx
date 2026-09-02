/**
 * Halaman Koleksi — favorit & riwayat putar.
 *
 * Kerangkanya server component (statis, bisa di-prerender), isinya client
 * component karena datanya hidup di localStorage perangkat ini. Tidak ada
 * permintaan jaringan sama sekali di halaman ini.
 *
 * Tanpa akun berarti koleksi tidak ikut pindah perangkat. Itu dikatakan terus
 * terang di halamannya, bukan disembunyikan — pengguna yang mengumpulkan 200
 * favorit lalu kehilangan semuanya karena mengganti browser berhak tahu sejak
 * awal.
 */

import type { Metadata } from 'next';

import { CollectionLists } from './collection-lists';

import { AppShell } from '@/components/shell/app-shell';
import { TopBar } from '@/components/shell/top-bar';
import { SIDEBAR_PLAYLISTS } from '@/lib/data/playlists';

export const metadata: Metadata = {
  title: 'Koleksi',
  description: 'Lagu favorit dan riwayat putar di perangkat ini.',
};

export default function CollectionPage() {
  return (
    <AppShell active="/koleksi" playlists={SIDEBAR_PLAYLISTS}>
      <TopBar title="Koleksi" />

      <h1 className="px-6 pt-6 font-display text-4xl font-bold tracking-tight">
        Koleksi
      </h1>
      <p className="px-6 pb-2 pt-2 text-sm text-laras-tertiary">
        Disimpan di browser ini saja — LARAS tidak punya akun, jadi tidak ada
        yang dikirim ke server.
      </p>

      <CollectionLists />
    </AppShell>
  );
}
