/**
 * Klien HTTP ke YouTube Music InnerTube.
 *
 * Parsing respons ADA DI `innertube.ts` supaya bisa diuji tanpa jaringan; file
 * ini hanya soal cara mengambilnya. Pemisahan itu penting karena bentuk pohon
 * InnerTube adalah bagian yang paling mungkin berubah di luar kendali kita.
 */

import { bestMatch } from '@/lib/data/bridge';
import type { AudioCandidate } from '@/lib/data/bridge';
import { parseSearchResponse } from '@/lib/data/innertube';
import type { AudioSource, Track } from '@/lib/types';

/**
 * Endpoint InnerTube YouTube Music.
 *
 * Kunci ini publik dan tertanam di halaman music.youtube.com — bukan kredensial
 * dan tidak terikat akun. Tanpa login, tanpa kuota.
 */
const INNERTUBE_URL =
  'https://music.youtube.com/youtubei/v1/search?key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30&prettyPrint=false';

/** Filter "lagu" — hasilnya rekaman audio, bukan video klip atau live. */
const SONGS_FILTER = 'EgWKAQIIAWoKEAoQAxAEEAkQBQ%3D%3D';

const CLIENT_VERSION = '1.20240102.01.00';

/** Batas waktu: pencarian audio tidak boleh menahan interaksi lama. */
const TIMEOUT_MS = 12_000;

/** Panggil InnerTube dan kembalikan kandidat, atau array kosong saat gagal. */
export async function searchYouTubeMusic(query: string): Promise<AudioCandidate[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(INNERTUBE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': '67',
        'X-YouTube-Client-Version': CLIENT_VERSION,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
        Origin: 'https://music.youtube.com',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: CLIENT_VERSION,
            hl: 'en',
            gl: 'ID',
          },
        },
        query,
        params: SONGS_FILTER,
      }),
      signal: controller.signal,
      // Hasil pencarian audio untuk judul yang sama tidak berubah cepat, dan
      // satu minggu cukup lama untuk membuat pemutaran berulang terasa instan.
      next: { revalidate: 60 * 60 * 24 * 7, tags: ['youtube-search'] },
    });

    if (!response.ok) return [];
    return parseSearchResponse((await response.json()) as unknown);
  } catch {
    // Termasuk AbortError saat timeout. Tidak dibedakan: pemanggil tidak punya
    // tindakan berbeda untuk masing-masing.
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cari sumber audio untuk satu track katalog.
 *
 * Dua percobaan query, berhenti pada yang pertama berhasil:
 *  1. "judul artis" — paling spesifik
 *  2. "judul artis album" — membantu lagu berjudul umum ("Bertaut", "Hati")
 *
 * Mengembalikan null kalau tidak ada kandidat yang lolos gate matcher. Null di
 * sini BUKAN kegagalan yang harus disembunyikan: lebih baik tanpa audio
 * daripada audio yang salah, karena lirik akan tidak sinkron.
 */
export async function resolveAudio(track: Track): Promise<AudioSource | null> {
  const target = {
    title: track.title,
    artist: track.artist,
    durationSeconds: track.durationSeconds,
  };

  const queries = [`${track.title} ${track.artist}`];
  if (track.album) queries.push(`${track.title} ${track.artist} ${track.album}`);

  for (const query of queries) {
    const candidates = await searchYouTubeMusic(query);
    if (candidates.length === 0) continue;

    const match = bestMatch(candidates, target);
    if (match) {
      return {
        provider: 'youtube',
        id: match.candidate.videoId,
        durationSeconds: match.candidate.durationSeconds,
        durationDelta: match.durationDelta,
        matchedTitle: match.candidate.title,
      };
    }
  }

  return null;
}
