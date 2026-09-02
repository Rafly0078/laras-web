/**
 * Halaman pencarian — hasil live dari katalog Apple Music.
 *
 * Query hidup di URL (?q=), jadi hasilnya bisa dibagikan dan tombol Kembali
 * bekerja. Halaman ini server component; hanya kotak masukannya yang klien.
 *
 * KENAPA TIDAK ADA loading.tsx DI SINI: `loading.tsx` mengganti SELURUH segmen,
 * termasuk kotak pencarian. Karena kotak itu menavigasi tiap 400ms saat
 * diketik, mengganti seluruh segmen berarti input dilepas-pasang dan fokus
 * (serta huruf yang belum terkirim) hilang di tengah pengetikan. Jadi yang
 * dipakai `<Suspense>` di sekitar HASIL saja — kotaknya tidak pernah dilepas.
 */

import { Suspense } from 'react';

import { SearchBox } from './search-box';
import { SearchResults } from './search-results';
import { SearchSkeleton } from './search-skeleton';

import { AppShell } from '@/components/shell/app-shell';
import { TopBar } from '@/components/shell/top-bar';
import { SIDEBAR_PLAYLISTS } from '@/lib/data/playlists';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  /* Di-await di sini, bukan diteruskan ke bawah: nilainya dibutuhkan kotak
     masukan (client component) yang ada di kerangka, dan menunggunya tidak
     memakan waktu — tidak ada jaringan yang terlibat. */
  const { q } = await searchParams;
  const query = (q ?? '').trim();

  return (
    <AppShell active="/cari" playlists={SIDEBAR_PLAYLISTS}>
      {/* Kotak pencarian bar disembunyikan: halaman ini punya kotaknya sendiri.
          Dua landmark `search` di satu halaman membuat pembaca layar ambigu. */}
      <TopBar title="Cari" showSearch={false} />

      <h1 className="px-6 pt-6 font-display text-4xl font-bold tracking-tight">Cari</h1>

      <SearchBox initialQuery={query} />

      {query.length === 0 ? (
        <p className="px-6 py-8 text-laras-secondary">
          Ketik nama lagu, album, atau artis untuk mulai mencari.
        </p>
      ) : (
        /* key={query}: tanpa ini React menganggap batas Suspense yang sama sudah
           selesai dan menahan hasil kueri LAMA di layar sampai yang baru siap.
           Dengan key berganti, batasnya dipasang ulang dan skeleton muncul lagi
           — pengguna melihat bahwa pencariannya berganti. */
        <Suspense key={query} fallback={<SearchSkeleton query={query} />}>
          <SearchResults query={query} />
        </Suspense>
      )}
    </AppShell>
  );
}
