/**
 * Halaman dev untuk menguji mesin lirik dengan jam sintetis.
 *
 * notFound() di produksi: ini alat pengembangan, bukan fitur.
 */

import { notFound } from 'next/navigation';

import { LyricsProbe } from './lyrics-probe';

import { loadFixtureTrack, loadFixtureTracks, loadFixtureTtml } from '@/lib/data/fixtures';
import { parseAppleTtml } from '@/lib/lyrics/ttml';

export async function generateStaticParams() {
  if (process.env.NODE_ENV === 'production' && process.env.LARAS_ENABLE_DEV !== '1') {
    return [];
  }
  const tracks = await loadFixtureTracks();
  return tracks.map((entry) => ({ slug: entry.slug }));
}

export default async function DevLyricsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const entry = await loadFixtureTrack(slug);
  if (!entry) notFound();

  const lyrics = parseAppleTtml(await loadFixtureTtml(slug));

  return (
    <main className="h-full">
      <LyricsProbe
        lyrics={lyrics}
        durationSeconds={entry.track.durationSeconds}
        title={entry.track.title}
        artist={entry.track.artist}
      />
    </main>
  );
}
