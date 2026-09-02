'use client';

/**
 * Panel antrean — daftar lagu berikutnya, bisa diubah.
 *
 * Muncul sebagai sheet di atas mini player. Kenapa bukan halaman sendiri:
 * antrean hanya berarti dalam konteks lagu yang sedang berbunyi, dan navigasi ke
 * halaman lain untuk mengaturnya berarti kehilangan konteks itu.
 *
 * Urutan yang ditampilkan adalah URUTAN MAIN, bukan urutan antrean asli — jadi
 * saat shuffle menyala, yang terlihat memang yang akan diputar. Nomor yang
 * dipakai untuk `jumpTo`/`removeFromQueue` tetap indeks antrean asli
 * (`queueIndex`), karena itulah kunci yang stabil.
 */

import { artworkUrl } from '@/lib/data/apple';
import { usePlayer } from '@/lib/player/player-context';

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const { current, upcoming, jumpTo, removeFromQueue, clearQueue, shuffle } = usePlayer();

  return (
    <div
      className="absolute bottom-full right-2 mb-2 max-h-[60vh] w-[min(420px,calc(100vw-1rem))] overflow-hidden rounded-[var(--radius-sheet)] border border-laras-outline/40 bg-laras-elevated/95 shadow-2xl backdrop-blur-xl"
      role="dialog"
      aria-label="Antrean"
    >
      <div className="flex items-center gap-2 border-b border-laras-outline/30 px-4 py-3">
        <h2 className="flex-1 font-display text-sm font-semibold">
          Berikutnya
          {shuffle ? (
            <span className="ml-2 text-xs font-normal text-laras-tertiary">(acak)</span>
          ) : null}
        </h2>

        {upcoming.length > 0 ? (
          <button
            type="button"
            onClick={clearQueue}
            className="h-9 rounded-[var(--radius-card)] px-3 text-xs text-laras-secondary transition hover:bg-white/10 hover:text-laras-text"
          >
            Kosongkan
          </button>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup antrean"
          className="flex h-9 w-9 items-center justify-center rounded-full text-laras-secondary transition hover:bg-white/10 hover:text-laras-text"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path d="M6.4 5 5 6.4l5.6 5.6L5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z" />
          </svg>
        </button>
      </div>

      {current !== null ? (
        <p className="truncate border-b border-laras-outline/20 px-4 py-2 text-xs text-laras-tertiary">
          Sedang diputar: <span className="text-laras-secondary">{current.title}</span>
        </p>
      ) : null}

      <div className="max-h-[42vh] overflow-y-auto py-1">
        {upcoming.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-laras-tertiary">
            Tidak ada lagu berikutnya.
          </p>
        ) : (
          upcoming.map(({ queueIndex, track }) => {
            const art = artworkUrl(track.artwork, 80);
            return (
              <div
                key={`${queueIndex}-${track.id}`}
                className="flex min-h-[52px] items-center gap-3 px-3 transition hover:bg-white/5"
              >
                <button
                  type="button"
                  onClick={() => jumpTo(queueIndex)}
                  className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left"
                  aria-label={`Lompat ke ${track.title} oleh ${track.artist}`}
                >
                  {art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={art}
                      alt=""
                      draggable={false}
                      className="h-9 w-9 shrink-0 rounded-[var(--radius-artwork-sm)] object-cover"
                    />
                  ) : (
                    <div className="h-9 w-9 shrink-0 rounded-[var(--radius-artwork-sm)] bg-laras-card" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{track.title}</span>
                    <span className="block truncate text-xs text-laras-secondary">
                      {track.artist}
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => removeFromQueue(queueIndex)}
                  aria-label={`Keluarkan ${track.title} dari antrean`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-laras-tertiary transition hover:bg-white/10 hover:text-laras-text"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                    <path d="M6.4 5 5 6.4l5.6 5.6L5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
