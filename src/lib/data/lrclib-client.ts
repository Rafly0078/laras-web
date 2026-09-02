/**
 * LRCLIB — sisi jaringan. Adapter dan aturan penerimaannya ada di `lrclib.ts`.
 *
 * Pemisahan ini sama dengan `youtube.ts` (fetch) vs `innertube.ts` (parsing):
 * bentuk respons pihak ketiga adalah bagian paling rapuh, jadi ia diuji sebagai
 * fungsi murni terhadap fixture nyata. File ini hanya mengurus HTTP.
 *
 * LRCLIB meminta User-Agent yang mengidentifikasi aplikasi. Itu syarat wajar
 * untuk layanan gratis tanpa kunci, jadi dipenuhi — bukan dipalsukan jadi
 * browser seperti yang harus dilakukan pada relay Apple.
 */

import 'server-only';

import { requestJson } from '@/lib/data/client';
import { toLrclibLyrics } from '@/lib/data/lrclib';
import type { Lyrics, Track } from '@/lib/types';

const BASE_URL = 'https://lrclib.net';

/** LRCLIB cepat (ratusan ms). Kalau lewat 8 detik, ia sedang bermasalah. */
const TIMEOUT_MS = 8000;

/** Lirik tidak berubah; simpan selama TTL lirik Apple (30 hari). */
const REVALIDATE_SECONDS = 60 * 60 * 24 * 30;

const HEADERS: Record<string, string> = {
  'User-Agent': 'LARAS/0.1 (pemutar musik web dengan lirik tersinkron)',
  Accept: 'application/json',
};

function isRec(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Ambil lirik LRCLIB untuk satu track. Null untuk semua kegagalan. */
export async function fetchLrclibLyrics(track: Track): Promise<Lyrics | null> {
  const title = track.title.trim();
  const artist = track.artist.trim();
  if (title.length === 0 || artist.length === 0) return null;

  const duration =
    Number.isFinite(track.durationSeconds) && track.durationSeconds > 0
      ? Math.round(track.durationSeconds)
      : null;

  const url = new URL('/api/get', BASE_URL);
  url.searchParams.set('track_name', title);
  url.searchParams.set('artist_name', artist);
  if (track.album) url.searchParams.set('album_name', track.album);
  if (duration !== null) url.searchParams.set('duration', String(duration));

  const raw = await requestJson(url.toString(), {
    headers: HEADERS,
    timeoutMs: TIMEOUT_MS,
    revalidate: REVALIDATE_SECONDS,
    tags: [`lrclib:${track.id}`],
  });

  const exact = toLrclibLyrics(raw, duration);
  if (exact !== null) return exact;

  /* `/api/get` menuntut kecocokan yang ketat; kalau gagal, cari lalu cocokkan
     durasinya sendiri. Ini jalur yang sama dengan jembatan audio: judul boleh
     berbeda ejaan, durasi yang memutuskan. */
  return searchLrclib(title, artist, duration);
}

/** Cari lalu pilih kandidat dengan selisih durasi terkecil. */
async function searchLrclib(
  title: string,
  artist: string,
  duration: number | null,
): Promise<Lyrics | null> {
  const url = new URL('/api/search', BASE_URL);
  url.searchParams.set('track_name', title);
  url.searchParams.set('artist_name', artist);

  const raw = await requestJson(url.toString(), {
    headers: HEADERS,
    timeoutMs: TIMEOUT_MS,
    revalidate: REVALIDATE_SECONDS,
    tags: ['lrclib:search'],
  });

  if (!Array.isArray(raw)) return null;

  const scored = raw
    .filter(isRec)
    .map((record) => ({
      record,
      delta:
        duration === null || typeof record.duration !== 'number'
          ? Number.POSITIVE_INFINITY
          : Math.abs(record.duration - duration),
    }))
    .sort((a, b) => a.delta - b.delta);

  for (const candidate of scored) {
    const lyrics = toLrclibLyrics(candidate.record, duration);
    if (lyrics !== null) return lyrics;
  }

  return null;
}
