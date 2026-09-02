/**
 * Indeks demo lirik — permukaan uji mesin lirik dari fixture.
 *
 * BUKAN halaman produk. Ia 404 di produksi (lihat `lib/dev-routes.ts`): isinya
 * lirik lengkap empat lagu dari TTML yang di-commit, dan itu teks berhak cipta.
 * Yang membuatnya tetap ada adalah 32 assertion di
 * `scripts/verify-lyrics.part2.cjs` yang dijalankan terhadap halaman ini.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { loadFixtureTracks } from '@/lib/data/fixtures';
import { DEV_ROUTES_ENABLED } from '@/lib/dev-routes';

function artworkUrl(template: string | null | undefined, size: number): string | null {
  if (!template) return null;
  return template.replace('{w}', String(size)).replace('{h}', String(size));
}

export default async function DemoIndexPage() {
  if (!DEV_ROUTES_ENABLED) notFound();

  const tracks = await loadFixtureTracks();

  return (
    <main className="mx-auto max-w-4xl px-8 py-16">
      <h1 className="font-display text-4xl font-bold tracking-tight">
        Demo lirik LARAS
      </h1>
      <p className="mt-3 max-w-xl text-laras-secondary">
        Empat lagu dengan TTML word-level Apple Music asli, dipasangkan ke audio
        YouTube lewat pencocokan durasi. Klik untuk melihat sapuan per kata.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {tracks.map((entry) => {
          const art = artworkUrl(entry.track.artwork?.template, 300);
          return (
            <li key={entry.slug}>
              <Link
                href={`/demo/${entry.slug}`}
                className="flex items-center gap-4 rounded-[var(--radius-card)] bg-laras-card p-4 transition hover:bg-laras-control"
              >
                {art ? (
                  // URL artwork dibangun runtime dari template Apple, jadi
                  // next/image tidak memberi keuntungan di sini.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={art}
                    alt=""
                    className="h-16 w-16 rounded-[var(--radius-artwork-sm)] object-cover"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-[var(--radius-artwork-sm)] bg-laras-control" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold">{entry.track.title}</p>
                  <p className="truncate text-sm text-laras-secondary">
                    {entry.track.artist}
                  </p>
                  <p className="mt-1 text-xs text-laras-tertiary">
                    {entry.wordSpans} kata tersinkron
                    {entry.track.audio ? ` · ${entry.track.audio.id}` : ' · tanpa audio'}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
