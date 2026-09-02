/**
 * Halaman album — daftar track dengan nomor asli dari katalog.
 *
 * Dinamis penuh: id album tak terbatas, jadi tidak ada generateStaticParams.
 * Cache 24 jam di sisi klien API menjaga permintaan tetap sedikit.
 */

import Link from 'next/link';

import { AppShell } from '@/components/shell/app-shell';
import { TopBar } from '@/components/shell/top-bar';
import { Artwork } from '@/components/ui/artwork';
import { TrackList } from '@/components/ui/track-list';
import { artworkUrl } from '@/lib/data/apple';
import { loadAlbum } from '@/lib/data/catalog';
import { SIDEBAR_PLAYLISTS } from '@/lib/data/playlists';
import { albumMetadata } from '@/lib/metadata';

function formatYear(releaseDate: string | null): string | null {
  if (!releaseDate) return null;
  const year = releaseDate.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

/**
 * `loadAlbum` dipanggil dua kali (di sini dan di badan halaman) tapi TIDAK jadi
 * dua permintaan: URL-nya identik, jadi coalescer di `data/coalesce.ts` plus
 * Data Cache Next menyatukannya.
 */
export async function generateMetadata({ params }: PageProps<'/album/[id]'>) {
  const { id } = await params;
  return albumMetadata(id, await loadAlbum(id));
}

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const album = await loadAlbum(id);

  if (album === null) {
    return (
      <AppShell active="" playlists={SIDEBAR_PLAYLISTS}>
        <TopBar title="Album" />
        <p className="px-6 py-12 text-laras-secondary">
          Album ini tidak bisa dimuat. Mungkin id-nya tidak ada di katalog, atau
          layanan katalog sedang bermasalah.
        </p>
      </AppShell>
    );
  }

  const year = formatYear(album.releaseDate);

  return (
    <AppShell active="" playlists={SIDEBAR_PLAYLISTS}>
      <TopBar title={album.title} />

      <header className="flex flex-col gap-6 px-6 pb-8 pt-6 sm:flex-row sm:items-end">
        <Artwork
          src={artworkUrl(album.artwork, 600)}
          alt={`Sampul ${album.title}`}
          size={208}
          rounded="lg"
          priority
        />

        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-laras-accent">
            Album
          </p>
          <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">
            {album.title}
          </h1>
          <p className="mt-2 text-lg text-laras-secondary">{album.artist}</p>
          <p className="mt-1 text-sm text-laras-tertiary">
            {[album.genres[0], year, `${album.trackCount} lagu`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </header>

      <div className="px-3 pb-4">
        {album.tracks.length > 0 ? (
          <TrackList tracks={album.tracks} useTrackNumbers />
        ) : (
          <p className="px-3 py-8 text-laras-tertiary">
            Daftar lagu album ini tidak tersedia.
          </p>
        )}
      </div>

      {album.notes ? (
        <section className="px-6 pb-8">
          <h2 className="pb-2 font-display text-lg font-bold tracking-tight">
            Tentang album ini
          </h2>
          {/* Catatan editorial Apple memuat HTML sederhana; ditampilkan sebagai
              teks datar supaya tidak ada markup pihak ketiga yang dieksekusi. */}
          <p className="max-w-2xl whitespace-pre-line text-sm leading-relaxed text-laras-secondary">
            {album.notes.replace(/<[^>]*>/g, '')}
          </p>
        </section>
      ) : null}

      {album.copyright ? (
        <p className="px-6 pb-8 text-xs text-laras-tertiary">{album.copyright}</p>
      ) : null}

      <p className="px-6 pb-8 text-sm">
        <Link href="/cari" className="text-laras-accent hover:underline">
          Cari album lain
        </Link>
      </p>
    </AppShell>
  );
}
