'use client';

/**
 * Daftar favorit & riwayat — client component, karena datanya di localStorage.
 *
 * Kenapa tidak ada keadaan "memuat": `useSyncExternalStore` memberi koleksi
 * kosong pada render server dan nilai sungguhan langsung setelah hidrasi, jadi
 * satu-satunya keadaan yang mungkin terlihat pengguna adalah keadaan akhirnya.
 * Yang perlu dibedakan hanya "belum ada apa-apa" versus "ada isinya".
 */

import Link from 'next/link';

import { TrackList } from '@/components/ui/track-list';
import { useCollection } from '@/lib/player/collection-context';

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="px-6 py-8 text-laras-secondary">{children}</p>;
}

export function CollectionLists() {
  const { favorites, history, clearHistory } = useCollection();

  return (
    <>
      <section className="pb-6">
        <div className="flex items-baseline gap-3 px-6 pb-3 pt-2">
          <h2 className="font-display text-xl font-bold tracking-tight">Favorit</h2>
          {favorites.length > 0 ? (
            <span className="text-sm text-laras-tertiary">{favorites.length} lagu</span>
          ) : null}
        </div>

        {favorites.length === 0 ? (
          <EmptyNote>
            Belum ada favorit. Tekan ikon hati di pemutar atau di halaman lagu
            untuk menyimpannya di sini.
          </EmptyNote>
        ) : (
          <div className="px-3">
            <TrackList tracks={favorites} />
          </div>
        )}
      </section>

      <section className="pb-10">
        <div className="flex items-baseline gap-3 px-6 pb-3">
          <h2 className="font-display text-xl font-bold tracking-tight">
            Terakhir diputar
          </h2>
          {history.length > 0 ? (
            <>
              <span className="text-sm text-laras-tertiary">{history.length} lagu</span>
              <button
                type="button"
                onClick={clearHistory}
                className="ml-auto h-11 rounded-[var(--radius-card)] px-3 text-sm text-laras-secondary transition hover:bg-white/10 hover:text-laras-text"
              >
                Kosongkan riwayat
              </button>
            </>
          ) : null}
        </div>

        {history.length === 0 ? (
          <EmptyNote>
            Belum ada riwayat.{' '}
            <Link href="/" className="text-laras-accent hover:underline">
              Mulai dari Beranda
            </Link>
            .
          </EmptyNote>
        ) : (
          <div className="px-3">
            <TrackList tracks={history} />
          </div>
        )}
      </section>
    </>
  );
}
