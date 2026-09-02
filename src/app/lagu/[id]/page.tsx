/**
 * Halaman lagu — artwork besar, kontrol, dan lirik word-level LIVE.
 *
 * Ini pengganti halaman /demo untuk data sungguhan. Lirik diambil dari relay
 * (cold ~10 detik, warm ~500ms) dan di-cache 30 hari: TTML untuk satu track id
 * tidak pernah berubah.
 *
 * Lirik di-parse di SERVER. Satu lagu bisa punya 935 suku kata; mem-parse-nya
 * di perangkat pengguna menambah kerja start-up tanpa alasan, karena hasilnya
 * sama untuk semua orang.
 *
 * KENAPA LIRIK TIDAK DI-AWAIT DI HALAMAN INI: relay `/lyrics` butuh 9,8–11,7
 * detik untuk lagu yang belum pernah diminta. Selama `await`-nya ada di badan
 * halaman, React tidak boleh mengirim apa pun — artwork, judul, dan tombol
 * putar tertahan sepuluh detik padahal `/song` sudah selesai dalam sedetik.
 * Jadi promise-nya dibuat di sini (supaya jalan berbarengan dengan `/song`),
 * tapi yang menunggunya komponen di dalam `<Suspense>`.
 */

import Link from 'next/link';
import { Suspense } from 'react';

import { LyricsKindNote, LyricsSection } from './lyrics-section';
import { PlayTrackButton } from './play-button';

import { LyricsSkeleton } from '@/components/lyrics/lyrics-skeleton';
import { AmbientBackdrop } from '@/components/player/ambient-backdrop';
import { AppShell } from '@/components/shell/app-shell';
import { TopBar } from '@/components/shell/top-bar';
import { Artwork } from '@/components/ui/artwork';
import { artworkUrl } from '@/lib/data/apple';
import { SIDEBAR_PLAYLISTS, loadLyrics, loadTrack } from '@/lib/data/catalog';

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default async function TrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  /* Permintaan lirik DIMULAI di sini supaya berjalan berbarengan dengan
     `/song` — bukan menunggu metadata selesai dulu. Yang tidak dilakukan:
     me-`await`-nya. Promise-nya diteruskan ke bawah batas <Suspense>. */
  const lyricsPromise = loadLyrics(id);

  const track = await loadTrack(id);

  if (track === null) {
    return (
      <AppShell active="" playlists={SIDEBAR_PLAYLISTS}>
        <TopBar title="Lagu" />
        <p className="px-6 py-12 text-laras-secondary">
          Lagu ini tidak bisa dimuat.{' '}
          <Link href="/cari" className="text-laras-accent hover:underline">
            Coba cari lagu lain
          </Link>
          .
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell active="" playlists={SIDEBAR_PLAYLISTS}>
      <TopBar title={track.title} />

      <div className="relative min-h-full">
        <AmbientBackdrop
          artworkUrl={artworkUrl(track.artwork, 300)}
          bgColor={track.artwork?.bgColor ?? null}
          textColors={track.artwork?.textColors ?? []}
        />

        <div className="relative z-10 flex flex-col gap-8 p-6 lg:flex-row">
          {/* Kolom kiri: identitas lagu + kontrol */}
          <div className="flex w-full shrink-0 flex-col gap-5 lg:w-[380px]">
            <Artwork
              src={artworkUrl(track.artwork, 1200)}
              alt={`Sampul ${track.album ?? track.title}`}
              size={380}
              rounded="lg"
              priority
              className="max-w-full"
            />

            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight">
                {track.title}
              </h1>
              <p className="mt-1 text-lg text-laras-secondary">{track.artist}</p>
              {track.album ? (
                <p className="text-sm text-laras-tertiary">{track.album}</p>
              ) : null}
              <p className="mt-1 text-sm text-laras-tertiary">
                {formatDuration(track.durationSeconds)}
                {track.explicit ? ' · Explicit' : ''}
                {/* Batas Suspense sendiri, dengan fallback kosong: keterangan
                    ini hanya beberapa kata, jadi menampilkannya belakangan
                    tidak menggeser apa pun. */}
                <Suspense fallback={null}>
                  <LyricsKindNote lyrics={lyricsPromise} />
                </Suspense>
              </p>
            </div>

            <PlayTrackButton track={track} />
          </div>

          {/* Kolom kanan: lirik. Tinggi dipatok supaya pane-nya menggulir
              sendiri, bukan memanjangkan halaman. */}
          <div className="min-w-0 flex-1">
            <div className="h-[min(70vh,640px)]">
              {/* Satu-satunya bagian halaman yang menunggu relay lirik.
                  Tinggi pane sudah dipatok di atas, jadi skeleton dan lirik
                  sungguhan menempati kotak yang sama persis. */}
              <Suspense fallback={<LyricsSkeleton />}>
                <LyricsSection track={track} lyrics={lyricsPromise} />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
