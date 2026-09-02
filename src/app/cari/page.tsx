/**
 * Halaman pencarian — hasil live dari katalog Apple Music.
 *
 * Query hidup di URL (?q=), jadi hasilnya bisa dibagikan dan tombol Kembali
 * bekerja. Halaman ini server component; hanya kotak masukannya yang klien.
 */

import Link from 'next/link';

import { SearchBox } from './search-box';

import { AppShell } from '@/components/shell/app-shell';
import { TopBar } from '@/components/shell/top-bar';
import { Artwork } from '@/components/ui/artwork';
import { ShelfRow } from '@/components/ui/shelf-row';
import { TrackList } from '@/components/ui/track-list';
import { artworkUrl } from '@/lib/data/apple';
import { SIDEBAR_PLAYLISTS, searchCatalog } from '@/lib/data/catalog';

/** Lebar kartu album/artis di rak hasil. */
const CARD_SIZE = 160;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? '').trim();

  const results = query.length > 0 ? await searchCatalog(query) : null;
  const isEmpty =
    results !== null &&
    results.tracks.length === 0 &&
    results.albums.length === 0 &&
    results.artists.length === 0;

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
      ) : null}

      {isEmpty ? (
        <p className="px-6 py-8 text-laras-secondary">
          Tidak ada hasil untuk “{query}”.
        </p>
      ) : null}

      {results !== null && results.artists.length > 0 ? (
        <ShelfRow title="Artis">
          {results.artists.map((artist) => (
            <div key={artist.id} className="shrink-0 snap-start" style={{ width: CARD_SIZE }}>
              <Link
                href={`/artis/${artist.id}`}
                className="block text-center transition hover:opacity-80"
              >
                {/* Artwork artis dibulatkan penuh — konvensi Apple Music. */}
                <div className="overflow-hidden rounded-full">
                  <Artwork
                    src={artworkUrl(artist.artwork, 300)}
                    alt={`Foto ${artist.name}`}
                    size={CARD_SIZE}
                    rounded="lg"
                  />
                </div>
                <p className="mt-2 line-clamp-1 text-sm font-medium">{artist.name}</p>
                <p className="text-xs text-laras-secondary">Artis</p>
              </Link>
            </div>
          ))}
        </ShelfRow>
      ) : null}

      {results !== null && results.albums.length > 0 ? (
        <ShelfRow title="Album">
          {results.albums.map((album) => (
            <div key={album.id} className="shrink-0 snap-start" style={{ width: CARD_SIZE }}>
              <Link
                href={`/album/${album.id}`}
                className="block transition hover:opacity-80"
              >
                <Artwork
                  src={artworkUrl(album.artwork, 300)}
                  alt={`Sampul ${album.title}`}
                  size={CARD_SIZE}
                  rounded="md"
                />
                <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug">
                  {album.title}
                </p>
                <p className="line-clamp-1 text-xs text-laras-secondary">{album.artist}</p>
              </Link>
            </div>
          ))}
        </ShelfRow>
      ) : null}

      {results !== null && results.tracks.length > 0 ? (
        <section className="px-3 pb-8 pt-2">
          <h2 className="px-3 pb-3 font-display text-xl font-bold tracking-tight">Lagu</h2>
          <TrackList tracks={results.tracks} />
        </section>
      ) : null}
    </AppShell>
  );
}
