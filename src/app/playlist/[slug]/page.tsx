/**
 * Halaman playlist — daftar lagu dari playlist editorial Apple Music.
 *
 * Data diambil live dari relay dan di-cache 6 jam (playlist editorial dirotasi
 * harian, jadi lebih pendek tidak memberi apa-apa).
 */

import { notFound } from 'next/navigation';

import { AppShell } from '@/components/shell/app-shell';
import { TopBar } from '@/components/shell/top-bar';
import { Artwork } from '@/components/ui/artwork';
import { TrackList } from '@/components/ui/track-list';
import { artworkUrl } from '@/lib/data/apple';
import { loadPlaylist } from '@/lib/data/catalog';
import {
  HOME_PLAYLISTS,
  SIDEBAR_PLAYLISTS,
  homePlaylistBySlug,
} from '@/lib/data/playlists';
import { playlistMetadata } from '@/lib/metadata';

export async function generateStaticParams() {
  return HOME_PLAYLISTS.map((p) => ({ slug: p.slug }));
}

/** Jangan pra-render playlist yang tidak dikenal. */
export const dynamicParams = false;

/**
 * Judul dan kurator diambil dari konstanta lokal, jadi kartu bagikan tetap
 * benar meski relay gagal — yang hilang hanya jumlah lagu dan sampulnya.
 *
 * `loadPlaylist` dipanggil dua kali (di sini dan di badan halaman) tapi TIDAK
 * jadi dua permintaan: URL-nya identik, jadi coalescer di `data/coalesce.ts`
 * plus Data Cache Next menyatukannya.
 */
export async function generateMetadata({ params }: PageProps<'/playlist/[slug]'>) {
  const { slug } = await params;
  const meta = homePlaylistBySlug(slug);
  return playlistMetadata(slug, meta, meta === null ? null : await loadPlaylist(slug));
}

export default async function PlaylistPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const meta = homePlaylistBySlug(slug);
  if (!meta) notFound();

  const playlist = await loadPlaylist(slug);

  /* Artwork playlist: `/playlist` sekarang mengirim artwork-nya sendiri;
     lagu pertama hanya cadangan kalau relay mengirim item tanpa sampul. */
  const cover = playlist?.artwork ?? playlist?.tracks[0]?.artwork ?? null;

  return (
    <AppShell active={`/playlist/${slug}`} playlists={SIDEBAR_PLAYLISTS}>
      <TopBar title={meta.title} />

      <header className="flex flex-col gap-6 px-6 pb-8 pt-6 sm:flex-row sm:items-end">
        <Artwork
          src={artworkUrl(cover, 600)}
          alt={`Sampul ${meta.title}`}
          size={208}
          rounded="lg"
          priority
        />

        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-laras-accent">
            Playlist
          </p>
          <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">
            {meta.title}
          </h1>
          <p className="mt-2 text-laras-secondary">{meta.curator}</p>
          {playlist ? (
            <p className="mt-1 text-sm text-laras-tertiary">
              {playlist.tracks.length} lagu
            </p>
          ) : null}
        </div>
      </header>

      <div className="px-3 pb-8">
        {playlist === null ? (
          <p className="px-3 py-8 text-laras-tertiary">
            Playlist ini sedang tidak bisa dimuat. Coba lagi sebentar lagi.
          </p>
        ) : playlist.tracks.length === 0 ? (
          <p className="px-3 py-8 text-laras-tertiary">Playlist ini kosong.</p>
        ) : (
          <TrackList tracks={playlist.tracks} />
        )}
      </div>
    </AppShell>
  );
}
