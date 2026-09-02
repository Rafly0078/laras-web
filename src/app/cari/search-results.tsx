/**
 * Hasil pencarian — bagian yang MENUNGGU relay, dipisah dari `page.tsx`.
 *
 * `/search` terukur 360–950ms di relay, tapi halaman ini meminta empat jenis
 * sekaligus (lagu, album, artis, playlist) dan hasil terukurnya 3,9 detik.
 * Selama itu di-`await` di badan halaman, kotak pencarian pun tertahan — jadi
 * pengguna mengetik, menekan Enter, dan tidak ada apa pun yang bergerak.
 *
 * Pola yang sama dengan `/lagu/[id]`: yang menunggu relay hidup di bawah
 * `<Suspense>`, kerangka halaman dikirim lebih dulu.
 */

import Link from 'next/link';

import { Artwork } from '@/components/ui/artwork';
import { ShelfRow } from '@/components/ui/shelf-row';
import { TrackList } from '@/components/ui/track-list';
import { artworkUrl } from '@/lib/data/apple';
import { searchCatalog } from '@/lib/data/catalog';

/** Lebar kartu album/artis di rak hasil. */
const CARD_SIZE = 160;

export async function SearchResults({ query }: { query: string }) {
  const results = await searchCatalog(query);

  const isEmpty =
    results.tracks.length === 0 &&
    results.albums.length === 0 &&
    results.artists.length === 0;

  if (isEmpty) {
    return (
      <p className="px-6 py-8 text-laras-secondary">
        Tidak ada hasil untuk “{query}”.
      </p>
    );
  }

  return (
    <>
      {results.artists.length > 0 ? (
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

      {results.albums.length > 0 ? (
        <ShelfRow title="Album">
          {results.albums.map((album) => (
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
                <p className="line-clamp-1 text-xs text-laras-secondary">{album.artist}</p>
              </Link>
            </div>
          ))}
        </ShelfRow>
      ) : null}

      {results.tracks.length > 0 ? (
        <section className="px-3 pb-8 pt-2">
          <h2 className="px-3 pb-3 font-display text-xl font-bold tracking-tight">Lagu</h2>
          <TrackList tracks={results.tracks} />
        </section>
      ) : null}
    </>
  );
}
