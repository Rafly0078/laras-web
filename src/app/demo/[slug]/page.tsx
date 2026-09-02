/**
 * Halaman demo lirik — bukti bahwa mesinnya benar-benar jalan.
 *
 * Ini halaman kerja untuk fase frontend: ia membaca fixture NYATA dari disk
 * (TTML Apple asli + videoId hasil jembatan), mem-parse-nya di server, lalu
 * menyerahkan hasilnya ke Now Playing di klien. Tidak ada satu pun panggilan
 * jaringan ke relay di sini — sesuai aturan fase ini.
 */

import { notFound } from 'next/navigation';

import { NowPlaying } from '@/components/player/now-playing';
import { loadFixtureTrack, loadFixtureTracks, loadFixtureTtml } from '@/lib/data/fixtures';
import { DEV_ROUTES_ENABLED } from '@/lib/dev-routes';
import { parseAppleTtml } from '@/lib/lyrics/ttml';

/** Isi template artwork Apple ({w}/{h}) dengan ukuran yang diminta. */
function artworkUrl(template: string | null | undefined, size: number): string | null {
  if (!template) return null;
  return template.replace('{w}', String(size)).replace('{h}', String(size));
}

export async function generateStaticParams() {
  // Tanpa flag, nol halaman dipra-render — dan badan halaman tetap 404,
  // karena `dynamicParams` default membolehkan render on-demand.
  if (!DEV_ROUTES_ENABLED) return [];
  const tracks = await loadFixtureTracks();
  return tracks.map((entry) => ({ slug: entry.slug }));
}

export default async function LyricsDemoPage({
  params,
}: {
  // Tipe eksplisit, bukan PageProps<'/demo/[slug]'>: helper itu dihasilkan
  // Next saat build, jadi `tsc --noEmit` pada tree yang belum pernah di-build
  // akan menolaknya. Bentuk manual ini valid di kedua keadaan.
  params: Promise<{ slug: string }>;
}) {
  if (!DEV_ROUTES_ENABLED) notFound();

  const { slug } = await params;

  const entry = await loadFixtureTrack(slug);
  if (!entry) notFound();

  // Parsing TTML terjadi di server: 935 suku kata tidak perlu memakan waktu
  // start-up di perangkat pengguna, dan hasilnya bisa di-cache nanti.
  const lyrics = parseAppleTtml(await loadFixtureTtml(slug));

  return (
    <main className="h-full">
      <NowPlaying
        track={entry.track}
        lyrics={lyrics}
        artworkUrl={artworkUrl(entry.track.artwork?.template, 1200)}
        artworkSmallUrl={artworkUrl(entry.track.artwork?.template, 300)}
      />
    </main>
  );
}
