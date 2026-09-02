/**
 * Dua potongan halaman lagu yang bergantung pada lirik, dipisah dari
 * `page.tsx` supaya masing-masing bisa dibungkus `<Suspense>` sendiri.
 *
 * Kenapa dipisah, bukan di-await di halaman: relay `/lyrics` butuh 9,8–11,7
 * detik untuk lagu yang belum pernah diminta. Selama `await` itu ada di badan
 * halaman, React tidak bisa mengirim apa pun — artwork, judul, dan tombol putar
 * ikut tertahan meski datanya sudah siap. Dengan `await` pindah ke sini,
 * kerangka halaman dikirim lebih dulu dan potongan ini menyusul lewat stream.
 *
 * Keduanya menunggu promise yang SAMA (dibuat sekali di halaman), jadi hanya
 * ada satu permintaan ke relay meski ada dua batas Suspense.
 *
 * Tetap Server Component: TTML di-parse di server, karena hasilnya identik
 * untuk semua orang dan satu lagu bisa berisi 935 suku kata.
 */

import { LyricsPanel } from '@/components/lyrics/lyrics-panel';
import type { Lyrics, Track } from '@/lib/types';

export interface LyricsSectionProps {
  track: Track;
  /** Promise dari `loadLyrics`, sengaja BELUM di-await oleh halaman. */
  lyrics: Promise<Lyrics | null>;
}

/** Pane lirik kanan. LyricsPanel tetap menerima nilai biasa, bukan promise. */
export async function LyricsSection({ track, lyrics }: LyricsSectionProps) {
  return <LyricsPanel track={track} lyrics={await lyrics} />;
}

/**
 * Keterangan "· lirik per kata" di baris metadata kolom kiri.
 *
 * Ikut menunggu lirik, jadi ia punya batas Suspense sendiri: kalau digabung ke
 * kerangka halaman, satu kata keterangan ini akan menahan seluruh halaman
 * selama sepuluh detik.
 */
export async function LyricsKindNote({
  lyrics,
}: {
  lyrics: Promise<Lyrics | null>;
}) {
  const resolved = await lyrics;
  if (resolved === null) return null;
  return <>{` · lirik ${resolved.kind === 'syllable' ? 'per kata' : 'per baris'}`}</>;
}
