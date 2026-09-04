/**
 * Kartu "Hasil teratas" — satu hasil yang ditonjolkan di atas daftar.
 *
 * KENAPA ADA: mencari "Teh Hijau" mengembalikan 24 lagu, dan yang asli (Tulus)
 * hanya satu di antaranya. Terukur pada 24 hasil itu: 24 ISRC BERBEDA, nol
 * duplikat — jadi isinya bukan duplikat tapi lagu lain (DJ remix, cover, spam
 * unggahan). Karena bukan duplikasi, menyaringnya berarti membuang remix yang
 * sah; yang dibutuhkan pengguna adalah isyarat MANA yang ia maksud.
 *
 * Server component: kartunya tidak punya state. Tombol putar untuk hasil berupa
 * lagu memakai `TrackList` berisi satu baris — komponen itu sudah tahu cara
 * menjembatani audio, dan menulis ulang logikanya di sini berarti dua tempat
 * yang bisa berbeda perilaku.
 */

import Link from 'next/link';

import { Artwork } from '@/components/ui/artwork';
import { TrackList } from '@/components/ui/track-list';
import { artworkUrl } from '@/lib/data/apple';
import type { TopResult } from '@/lib/data/search-rank';

/** Artwork kartu teratas. Lebih besar dari kartu rak (176px) supaya menonjol. */
const ART_SIZE = 132;

/** Label jenis, dalam bahasa Indonesia seperti sisa UI. */
const KIND_LABEL = {
  track: 'Lagu',
  artist: 'Artis',
  album: 'Album',
} as const;

export function TopResultCard({ top }: { top: TopResult }) {
  /* Tiga bentuk berbagi kerangka yang sama (artwork + label + nama + subjudul),
     jadi datanya dipipihkan dulu alih-alih menulis tiga blok JSX yang mirip. */
  const view =
    top.kind === 'artist'
      ? {
          href: `/artis/${top.artist.id}`,
          artwork: top.artist.artwork,
          alt: `Foto ${top.artist.name}`,
          name: top.artist.name,
          sub: null,
          /* Foto artis dibulatkan penuh — konvensi Apple Music, dan konsisten
             dengan rak Artis di bawahnya. */
          circle: true,
        }
      : top.kind === 'album'
        ? {
            href: `/album/${top.album.id}`,
            artwork: top.album.artwork,
            alt: `Sampul ${top.album.title}`,
            name: top.album.title,
            sub: top.album.artist,
            circle: false,
          }
        : {
            href: `/lagu/${top.track.id}`,
            artwork: top.track.artwork,
            alt: `Sampul ${top.track.album ?? top.track.title}`,
            name: top.track.title,
            sub: top.track.artist,
            circle: false,
          };

  return (
    <section className="px-6 pb-2 pt-4" aria-label="Hasil teratas">
      <h2 className="pb-3 font-display text-xl font-bold tracking-tight">
        Hasil teratas
      </h2>

      <div className="flex items-center gap-5 rounded-[var(--radius-sheet)] bg-laras-card/60 p-4">
        <Link
          href={view.href}
          className="shrink-0 transition hover:opacity-80"
          aria-label={`Buka ${view.name}`}
        >
          <div className={view.circle ? 'overflow-hidden rounded-full' : undefined}>
            <Artwork
              src={artworkUrl(view.artwork, 300)}
              alt={view.alt}
              size={ART_SIZE}
              rounded="lg"
              /* Kartu ini paling atas di area hasil, jadi ia yang ikut jalur LCP. */
              priority
            />
          </div>
        </Link>

        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-laras-tertiary">
            {KIND_LABEL[top.kind]}
          </p>
          <Link href={view.href} className="hover:underline">
            <h3 className="mt-1 truncate font-display text-2xl font-bold tracking-tight">
              {view.name}
            </h3>
          </Link>
          {view.sub ? (
            <p className="mt-1 truncate text-sm text-laras-secondary">{view.sub}</p>
          ) : null}

          {/* Hanya lagu yang bisa langsung diputar; artis dan album adalah
              halaman, bukan sesuatu yang berbunyi. */}
          {top.kind === 'track' ? (
            <div className="mt-2 -ml-3">
              <TrackList tracks={[top.track]} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
