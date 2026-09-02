/**
 * Satu rak Beranda: judul + deretan kartu lagu yang digulir horizontal.
 *
 * Server component. Kartu adalah tautan ke halaman lagu (`/lagu/<id>`), tempat
 * lirik dan tombol putar berada. Memutar langsung dari kartu sengaja TIDAK
 * dilakukan: penjembatanan audio butuh ~1 detik dan tanpa konteks halaman,
 * pengguna tidak punya tempat melihat progresnya.
 */

import Link from 'next/link';

import { Artwork } from '@/components/ui/artwork';
import { ShelfRow } from '@/components/ui/shelf-row';
import { artworkUrl } from '@/lib/data/apple';
import type { Shelf } from '@/lib/types';

/** Lebar kartu rak — dipatok supaya snap-x punya langkah yang konsisten. */
const CARD_SIZE = 176;

export function HomeShelf({ shelf }: { shelf: Shelf }) {
  return (
    <ShelfRow title={shelf.title} subtitle={shelf.subtitle}>
      {shelf.items.map((item, index) => {
        if (item.kind !== 'track') return null;
        const track = item.track;

        return (
          <div
            key={`${shelf.id}-${track.id}`}
            className="shrink-0 snap-start"
            style={{ width: CARD_SIZE }}
          >
            <Link
              href={`/lagu/${track.id}`}
              className="block rounded-[var(--radius-card)] transition hover:opacity-80"
              aria-label={`Buka ${track.title} oleh ${track.artist}`}
            >
              <Artwork
                src={artworkUrl(track.artwork, 300)}
                alt={`Sampul ${track.album ?? track.title}`}
                size={CARD_SIZE}
                rounded="md"
                // Kartu pertama tiap rak ikut jalur LCP, jadi tidak di-lazy.
                priority={index === 0}
              />
              <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug">
                {track.title}
              </p>
              <p className="line-clamp-1 text-xs text-laras-secondary">{track.artist}</p>
            </Link>
          </div>
        );
      })}
    </ShelfRow>
  );
}
