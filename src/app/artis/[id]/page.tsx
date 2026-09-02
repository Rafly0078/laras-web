/**
 * Halaman artis — lagu teratas + diskografi.
 */

import Link from 'next/link';

import { AppShell } from '@/components/shell/app-shell';
import { TopBar } from '@/components/shell/top-bar';
import { Artwork } from '@/components/ui/artwork';
import { ShelfRow } from '@/components/ui/shelf-row';
import { TrackList } from '@/components/ui/track-list';
import { artworkUrl } from '@/lib/data/apple';
import { loadArtist } from '@/lib/data/catalog';
import { SIDEBAR_PLAYLISTS } from '@/lib/data/playlists';
import { artistMetadata } from '@/lib/metadata';

const CARD_SIZE = 176;

/**
 * `loadArtist` dipanggil dua kali (di sini dan di badan halaman) tapi TIDAK jadi
 * dua permintaan: URL-nya identik, jadi coalescer di `data/coalesce.ts` plus
 * Data Cache Next menyatukannya.
 */
export async function generateMetadata({ params }: PageProps<'/artis/[id]'>) {
  const { id } = await params;
  return artistMetadata(id, await loadArtist(id));
}

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const artist = await loadArtist(id);

  if (artist === null) {
    return (
      <AppShell active="" playlists={SIDEBAR_PLAYLISTS}>
        <TopBar title="Artis" />
        <p className="px-6 py-12 text-laras-secondary">
          Artis ini tidak bisa dimuat. Mungkin id-nya tidak ada di katalog, atau
          layanan katalog sedang bermasalah.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell active="" playlists={SIDEBAR_PLAYLISTS}>
      <TopBar title={artist.name} />

      <header className="flex flex-col items-start gap-6 px-6 pb-8 pt-6 sm:flex-row sm:items-end">
        {/* Foto artis dibulatkan penuh — konvensi Apple Music. */}
        <div className="overflow-hidden rounded-full">
          <Artwork
            src={artworkUrl(artist.artwork, 600)}
            alt={`Foto ${artist.name}`}
            size={176}
            rounded="lg"
            priority
          />
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-laras-accent">
            Artis
          </p>
          <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">
            {artist.name}
          </h1>
          {artist.genres.length > 0 ? (
            <p className="mt-2 text-laras-secondary">{artist.genres.join(' · ')}</p>
          ) : null}
        </div>
      </header>

      {artist.topTracks.length > 0 ? (
        <section className="px-3 pb-4">
          <h2 className="px-3 pb-3 font-display text-xl font-bold tracking-tight">
            Lagu teratas
          </h2>
          <TrackList tracks={artist.topTracks} />
        </section>
      ) : null}

      {artist.albums.length > 0 ? (
        <ShelfRow title="Album">
          {artist.albums.map((album) => (
            <div key={album.id} className="shrink-0 snap-start" style={{ width: CARD_SIZE }}>
              <Link href={`/album/${album.id}`} className="block transition hover:opacity-80">
                <Artwork
                  src={artworkUrl(album.artwork, 300)}
                  alt={`Sampul ${album.title}`}
                  size={CARD_SIZE}
                  rounded="md"
                />
                <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug">
                  {album.title}
                </p>
                {album.releaseDate ? (
                  <p className="text-xs text-laras-secondary">
                    {album.releaseDate.slice(0, 4)}
                  </p>
                ) : null}
              </Link>
            </div>
          ))}
        </ShelfRow>
      ) : null}

      {artist.topTracks.length === 0 && artist.albums.length === 0 ? (
        <p className="px-6 py-8 text-laras-tertiary">
          Katalog tidak mengirim lagu atau album untuk artis ini.
        </p>
      ) : null}
    </AppShell>
  );
}
