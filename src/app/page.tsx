/**
 * Beranda LARAS — hero + rak-rak lagu dari playlist editorial Apple Music.
 *
 * Kenapa playlist editorial, bukan /recommendations: endpoint rekomendasi
 * tanpa akun hanya mengembalikan kartu genre (apple-curators) tanpa satu pun
 * lagu. Playlist editorial punya lagu sungguhan dengan artwork resmi, jadi
 * Beranda bisa terisi penuh tanpa login — dan LARAS memang tanpa akun.
 */

import Link from 'next/link';

import { HomeShelf } from './home-shelf';

import { AppShell } from '@/components/shell/app-shell';
import { TopBar } from '@/components/shell/top-bar';
import { HomeAmbient } from '@/components/home/home-ambient';
import { HomeHero } from '@/components/home/home-hero';
import { HomeGreeting } from '@/components/home/home-greeting';
import { HomeRecommendations } from '@/components/home/home-recommendations';
import { loadHomeShelves } from '@/lib/data/catalog';
import { DEV_ROUTES_ENABLED } from '@/lib/dev-routes';
import { SIDEBAR_PLAYLISTS } from '@/lib/data/playlists';

export default async function HomePage() {
  /* Keempat rak diambil paralel; yang gagal dibuang, bukan menjatuhkan
     Beranda. Detail cache & penanganan galat ada di lib/data/catalog.ts. */
  const shelves = await loadHomeShelves();

  return (
    <AppShell active="/" playlists={SIDEBAR_PLAYLISTS}>
      <TopBar title="Beranda" />

      {/* Menyusunkan warna ambient mengikuti lagu yang sedang diputar. */}
      <HomeAmbient />

      <div className="pt-2">
        <header className="px-6 pb-2 pt-6">
          {/* Sapaan waktu: render server merendernya kosong supaya tidak ada
              tabrakan dengan jam pengguna (lihat home-greeting.tsx). */}
          <HomeGreeting />
          <h1 className="font-display text-4xl font-bold tracking-tight">Beranda</h1>
        </header>

        <HomeHero shelves={shelves} />

        {/* Rak personal, di ATAS rak editorial: kalau ada rekomendasi, itulah
            yang paling relevan untuk pengguna ini. Ia merender null saat
            riwayat kosong, jadi pengguna baru tidak melihat celah. */}
        <HomeRecommendations />

        {shelves.map((shelf) => (
          <HomeShelf key={shelf.id} shelf={shelf} />
        ))}

        {shelves.length === 0 ? (
          <p className="px-6 py-12 text-laras-tertiary">
            Belum ada rak yang bisa dimuat.
          </p>
        ) : null}

        {/* Hanya muncul pada build pengembangan. Di produksi `/demo` membalas
            404 (lihat lib/dev-routes.ts), jadi menautkannya berarti memasang
            tautan mati di halaman depan. */}
        {DEV_ROUTES_ENABLED ? (
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
        ) : null}
      </div>
    </AppShell>
  );
}
