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
 *
 * URUTAN BLOK DI HALAMAN INI PENTING, dan alasannya terukur: mencari "Teh Hijau"
 * mengembalikan 24 lagu dengan 24 ISRC BERBEDA — bukan duplikat, tapi 23 lagu
 * lain (DJ remix, cover, satu akun yang mengunggah "GREEN TEA DC" tiga kali).
 * Yang asli tenggelam. Karena itu kartu "Hasil teratas" ada di paling atas, dan
 * rak penemuan ("Lagu lain dari …", "Artis serupa") ada di bawah daftar sebagai
 * jalan keluar. Sampahnya TIDAK disaring: menyaring kata "DJ"/"Remix"/"Slow"
 * akan menyembunyikan remix yang sah, dan itu kerusakan yang lebih sulit
 * disadari pengguna daripada daftar yang panjang.
 */

import Link from 'next/link';

import { TopResultCard } from './top-result-card';

import { Artwork } from '@/components/ui/artwork';
import { ShelfRow } from '@/components/ui/shelf-row';
import { TrackList } from '@/components/ui/track-list';
import { artworkUrl } from '@/lib/data/apple';
import { searchWithDiscovery } from '@/lib/data/catalog';
import type { Artist } from '@/lib/types';

/** Lebar kartu album/artis di rak hasil. */
const CARD_SIZE = 160;

/** Kartu artis bulat — dipakai rak "Artis" dan rak "Artis serupa". */
function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <div className="shrink-0 snap-start" style={{ width: CARD_SIZE }}>
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
  );
}

export async function SearchResults({ query }: { query: string }) {
  const { results, top, anchorArtistName, artistTracks, similarArtists } =
    await searchWithDiscovery(query);

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
      {/* Kartu teratas boleh TIDAK ADA: kalau tidak ada hasil yang meyakinkan,
          menampilkan tebakan acak justru mengarahkan pengguna ke tempat salah
          dengan penuh keyakinan. Lihat `pickTopResult`. */}
      {top ? <TopResultCard top={top} /> : null}

      {results.artists.length > 0 ? (
        <ShelfRow title="Artis">
          {results.artists.map((artist) => (
            <ArtistCard key={artist.id} artist={artist} />
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
        <section className="px-3 pb-4 pt-2">
          <h2 className="px-3 pb-3 font-display text-xl font-bold tracking-tight">Lagu</h2>
          <TrackList tracks={results.tracks} />
        </section>
      ) : null}

      {/* ── Penemuan: jalan keluar dari daftar ──────────────────────────
          Keduanya hanya muncul kalau ada artis jangkar yang meyakinkan. Rak
          berjudul "Lagu lain dari <artis>" yang isinya artis salah lebih buruk
          daripada tidak ada rak, jadi ketiadaan jangkar berarti blok ini hilang
          sepenuhnya — bukan tampil kosong. */}
      {artistTracks.length > 0 && anchorArtistName ? (
        <section className="px-3 pb-4 pt-2">
          <h2 className="px-3 pb-3 font-display text-xl font-bold tracking-tight">
            Lagu lain dari {anchorArtistName}
          </h2>
          <TrackList tracks={artistTracks} />
        </section>
      ) : null}

      {similarArtists.length > 0 ? (
        <ShelfRow title="Artis serupa" subtitle={anchorArtistName ? `Mirip ${anchorArtistName}` : null}>
          {similarArtists.map((artist) => (
            <ArtistCard key={`serupa-${artist.id}`} artist={artist} />
          ))}
        </ShelfRow>
      ) : null}
    </>
  );
}
