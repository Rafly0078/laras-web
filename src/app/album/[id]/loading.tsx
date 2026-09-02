/**
 * Skeleton halaman album — `/album/[id]` dinamis dan terukur 1,9 detik.
 *
 * Bentuknya mengikuti `page.tsx`: artwork 208px, blok judul di sebelahnya, lalu
 * daftar lagu. Jumlah baris dipatok 10 karena album Indonesia rata-rata 8–12
 * lagu; kalau albumnya lebih pendek, daftar menyusut sekali saat data masuk dan
 * itu lebih baik daripada halaman yang tumbuh dari nol.
 */

import { AppShell } from '@/components/shell/app-shell';
import { TopBar } from '@/components/shell/top-bar';
import { SkeletonBlock, SkeletonTrackRows } from '@/components/ui/skeleton';
import { SIDEBAR_PLAYLISTS } from '@/lib/data/playlists';

export default function LoadingAlbum() {
  return (
    <AppShell active="" playlists={SIDEBAR_PLAYLISTS}>
      <TopBar />

      <header className="flex flex-col gap-6 px-6 pb-8 pt-6 sm:flex-row sm:items-end">
        <SkeletonBlock className="h-[208px] w-[208px] shrink-0 rounded-[var(--radius-artwork-lg)]" />

        <div className="min-w-0 flex-1 space-y-3">
          <SkeletonBlock className="h-3 w-16 rounded-full" />
          <SkeletonBlock className="h-9 w-2/3 rounded-full" delayMs={80} />
          <SkeletonBlock className="h-5 w-1/3 rounded-full" delayMs={160} />
          <SkeletonBlock className="h-4 w-1/4 rounded-full" delayMs={240} />
        </div>
      </header>

      <div className="px-3 pb-4">
        <SkeletonTrackRows count={10} />
      </div>
    </AppShell>
  );
}
