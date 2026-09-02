/**
 * Skeleton hasil pencarian — bentuknya mengikuti `search-results.tsx`:
 * rak artis bulat, rak album persegi, lalu daftar lagu.
 *
 * Yang diumumkan pembaca layar cuma satu baris status; bar-nya hiasan.
 */

import { SkeletonBlock, SkeletonTrackRows } from '@/components/ui/skeleton';

/** Sama dengan CARD_SIZE di search-results.tsx. */
const CARD_SIZE = 160;

function CardRow({ round }: { round: boolean }) {
  const radius = round ? 'rounded-full' : 'rounded-[var(--radius-artwork)]';
  return (
    <div className="flex gap-4 overflow-hidden px-6">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="shrink-0 space-y-2" style={{ width: CARD_SIZE }}>
          <SkeletonBlock
            className={`h-[160px] w-[160px] ${radius}`}
            delayMs={i * 110}
          />
          <SkeletonBlock className="h-3 w-full rounded-full" delayMs={i * 110 + 50} />
          <SkeletonBlock className="h-2.5 w-2/3 rounded-full" delayMs={i * 110 + 90} />
        </div>
      ))}
    </div>
  );
}

export function SearchSkeleton({ query }: { query: string }) {
  return (
    <div>
      <p role="status" className="px-6 pb-4 text-sm text-laras-tertiary">
        Mencari “{query}”…
      </p>

      <div className="space-y-6 pb-8">
        <div className="space-y-3">
          <SkeletonBlock className="mx-6 h-6 w-20 rounded-full" />
          <CardRow round />
        </div>

        <div className="space-y-3">
          <SkeletonBlock className="mx-6 h-6 w-24 rounded-full" />
          <CardRow round={false} />
        </div>

        <div className="space-y-3 px-3">
          <SkeletonBlock className="mx-3 h-6 w-16 rounded-full" />
          <SkeletonTrackRows count={8} />
        </div>
      </div>
    </div>
  );
}
