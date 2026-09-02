/**
 * Beranda LARAS — rak-rak lagu dari playlist editorial Apple Music.
 *
 * Kenapa playlist editorial, bukan /recommendations: endpoint rekomendasi
 * tanpa akun hanya mengembalikan kartu genre (apple-curators) tanpa satu pun
 * lagu. Playlist editorial punya lagu sungguhan dengan artwork resmi, jadi
 * Beranda bisa terisi penuh tanpa login — dan LARAS memang tanpa akun.
 *
 * Fase frontend: data dari fixture di disk, nol panggilan jaringan.
 */

import Link from 'next/link';

import { HomeShelf } from './home-shelf';

import { AppShell } from '@/components/shell/app-shell';
import { TopBar } from '@/components/shell/top-bar';
import { SIDEBAR_PLAYLISTS, loadHomeShelves } from '@/lib/data/catalog';

export default async function HomePage() {
  /* Keempat rak diambil paralel; yang gagal dibuang, bukan menjatuhkan
     Beranda. Detail cache & penanganan galat ada di lib/data/catalog.ts. */
  const shelves = await loadHomeShelves();

  return (
    <AppShell active="/" playlists={SIDEBAR_PLAYLISTS}>
      <TopBar title="Beranda" />

      <div className="pt-2">
        <header className="px-6 pb-2 pt-6">
          <h1 className="font-display text-4xl font-bold tracking-tight">Beranda</h1>
          <p className="mt-2 max-w-xl text-laras-secondary">
            Kurasi editorial Apple Music, diputar lewat YouTube. Lirik tersinkron
            per kata tersedia untuk lagu yang punya datanya.
          </p>
        </header>

        {shelves.map((shelf) => (
          <HomeShelf key={shelf.id} shelf={shelf} />
        ))}

        {shelves.length === 0 ? (
          <p className="px-6 py-12 text-laras-tertiary">
            Belum ada rak yang bisa dimuat.
          </p>
        ) : null}

        <section className="px-6 py-10">
          <h2 className="font-display text-xl font-bold tracking-tight">
            Uji mesin lirik
          </h2>
          <p className="mt-1 text-sm text-laras-secondary">
            Empat lagu dengan TTML word-level Apple Music asli.
          </p>
          <Link
            href="/demo"
            className="mt-4 inline-flex h-11 items-center rounded-[var(--radius-card)] bg-laras-card px-5 text-sm font-medium transition hover:bg-laras-control"
          >
            Buka demo lirik
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
