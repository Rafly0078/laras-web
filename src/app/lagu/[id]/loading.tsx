/**
 * Skeleton halaman lagu saat navigasi.
 *
 * Kenapa perlu meski lirik sudah di-stream: kerangka halaman baru bisa dikirim
 * setelah `/song` menjawab (terukur 0,6–1,8 detik). Selama itu Next masih
 * menampilkan halaman SEBELUMNYA — pengguna mengklik lagu dan tidak ada apa pun
 * yang berubah. File ini yang mengisi jeda itu.
 *
 * Bentuknya dijaga sama dengan `page.tsx`: artwork 380px di kiri, pane lirik
 * `h-[min(70vh,640px)]` di kanan. Pane-nya memakai `LyricsSkeleton` yang sama
 * dengan fallback `<Suspense>`, jadi peralihan skeleton → skeleton → lirik tidak
 * menggeser apa pun.
 */

import { LyricsSkeleton } from '@/components/lyrics/lyrics-skeleton';
import { AppShell } from '@/components/shell/app-shell';
import { TopBar } from '@/components/shell/top-bar';
import { SkeletonBlock } from '@/components/ui/skeleton';
import { SIDEBAR_PLAYLISTS } from '@/lib/data/playlists';

export default function LoadingTrack() {
  return (
    <AppShell active="" playlists={SIDEBAR_PLAYLISTS}>
      <TopBar />

      <div className="flex flex-col gap-8 p-6 lg:flex-row">
        <div className="flex w-full shrink-0 flex-col gap-5 lg:w-[380px]">
          <SkeletonBlock className="aspect-square w-full max-w-[380px] rounded-[var(--radius-artwork-lg)]" />

          <div className="space-y-3">
            <SkeletonBlock className="h-8 w-3/4 rounded-full" />
            <SkeletonBlock className="h-5 w-1/2 rounded-full" delayMs={80} />
            <SkeletonBlock className="h-4 w-2/5 rounded-full" delayMs={160} />
          </div>

          <SkeletonBlock className="h-12 w-32 rounded-[var(--radius-card)]" delayMs={240} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="h-[min(70vh,640px)]">
            <LyricsSkeleton />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
