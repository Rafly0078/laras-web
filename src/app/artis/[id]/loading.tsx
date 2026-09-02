/**
 * Skeleton halaman artis. `/artis/[id]` terukur 0,6 detik — paling cepat di
 * antara rute dinamis, tapi tanpa file ini navigasinya tetap terasa menggantung
 * karena halaman lama bertahan sampai data baru siap.
 *
 * Foto artis bulat penuh, sama seperti `page.tsx` (konvensi Apple Music).
 */

import { AppShell } from '@/components/shell/app-shell';
import { TopBar } from '@/components/shell/top-bar';
import { SkeletonBlock, SkeletonTrackRows } from '@/components/ui/skeleton';
import { SIDEBAR_PLAYLISTS } from '@/lib/data/playlists';

/** Sama dengan CARD_SIZE di page.tsx supaya rak album tidak bergeser. */
const CARD_SIZE = 160;

export default function LoadingArtist() {
  return (
    <AppShell active="" playlists={SIDEBAR_PLAYLISTS}>
      <TopBar />

      <header className="flex flex-col items-start gap-6 px-6 pb-8 pt-6 sm:flex-row sm:items-end">
        <SkeletonBlock className="h-[176px] w-[176px] shrink-0 rounded-full" />

        <div className="min-w-0 flex-1 space-y-3">
          <SkeletonBlock className="h-3 w-12 rounded-full" />
          <SkeletonBlock className="h-9 w-56 rounded-full" delayMs={80} />
          <SkeletonBlock className="h-4 w-40 rounded-full" delayMs={160} />
        </div>
      </header>

      <section className="px-3 pb-4">
        <SkeletonBlock className="mx-3 mb-3 h-6 w-32 rounded-full" />
        <SkeletonTrackRows count={6} />
      </section>

      <section className="px-6 pb-8">
        <SkeletonBlock className="mb-3 h-6 w-20 rounded-full" />
        <div className="flex gap-4 overflow-hidden">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="shrink-0 space-y-2" style={{ width: CARD_SIZE }}>
              <SkeletonBlock
                className="h-[160px] w-[160px] rounded-[var(--radius-artwork)]"
                delayMs={i * 110}
              />
              <SkeletonBlock className="h-3 w-full rounded-full" delayMs={i * 110 + 50} />
              <SkeletonBlock className="h-2.5 w-2/3 rounded-full" delayMs={i * 110 + 90} />
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
