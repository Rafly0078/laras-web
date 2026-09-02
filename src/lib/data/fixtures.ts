/**
 * Adapter fixture — SATU-SATUNYA jalur data selama fase frontend.
 *
 * Aturan fase ini: nol panggilan jaringan. Semua data dibaca dari folder
 * `fixtures/` yang isinya hasil fetch NYATA dari Apple Music + YouTube Music
 * (bukan karangan). Ketika fase backend tiba, yang berubah hanya isi file ini —
 * halaman dan renderer tidak perlu disentuh, karena keduanya hanya bicara
 * lewat tipe di `@/lib/types`.
 *
 * Kenapa membaca dari disk lewat fs, bukan import JSON: fixture TTML berukuran
 * puluhan KB dan hanya dibutuhkan di server component. Membacanya lewat fs
 * membuatnya tidak pernah ikut ke bundle klien.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Artwork, AudioSource, Track } from '@/lib/types';

/** Akar folder fixtures, relatif terhadap cwd proses Next. */
const FIXTURE_ROOT = path.join(process.cwd(), 'fixtures');

/* ── Bentuk mentah tracks.json (ditulis oleh skrip fetch fixture) ────────── */

interface RawTrackManifest {
  slug: string;
  appleId: string;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number;
  isrc: string | null;
  hasLyrics: boolean | null;
  hasWordLevel: boolean | null;
  wordSpans: number;
  artworkTemplate: string | null;
  artworkBg: string | null;
  youtube: {
    videoId: string;
    title: string | null;
    artist: string | null;
    durationSeconds: number | null;
  } | null;
  youtubeCandidates: number;
}

/** Entri fixture: track siap pakai + slug untuk memuat TTML-nya. */
export interface FixtureTrack {
  slug: string;
  track: Track;
  /** Jumlah span kata di TTML — dipakai test & panel diagnostik. */
  wordSpans: number;
}

async function readJson<T>(relative: string): Promise<T> {
  const raw = await readFile(path.join(FIXTURE_ROOT, relative), 'utf8');
  return JSON.parse(raw) as T;
}

function toArtwork(template: string | null, bgColor: string | null): Artwork | null {
  if (!template) return null;
  return {
    template,
    // Fixture manifest tidak menyimpan dimensi asli; artwork Apple selalu
    // persegi dan bisa diminta sampai 3000px, jadi nilai ini cukup.
    width: null,
    height: null,
    bgColor,
    textColors: [],
  };
}

function toAudio(raw: RawTrackManifest): AudioSource | null {
  const yt = raw.youtube;
  if (!yt) return null;
  const catalogSeconds = Math.round(raw.durationMs / 1000);
  return {
    provider: 'youtube',
    id: yt.videoId,
    durationSeconds: yt.durationSeconds,
    durationDelta:
      yt.durationSeconds === null ? null : yt.durationSeconds - catalogSeconds,
    matchedTitle: yt.title,
  };
}

function toTrack(raw: RawTrackManifest): Track {
  return {
    id: raw.appleId,
    title: raw.title,
    artist: raw.artist,
    album: raw.album,
    durationSeconds: raw.durationMs / 1000,
    isrc: raw.isrc,
    hasLyrics: raw.hasLyrics === true,
    artwork: toArtwork(raw.artworkTemplate, raw.artworkBg),
    trackNumber: null,
    discNumber: null,
    explicit: false,
    audio: toAudio(raw),
  };
}

/** Semua lagu fixture, urut seperti di manifest. */
export async function loadFixtureTracks(): Promise<FixtureTrack[]> {
  const raw = await readJson<RawTrackManifest[]>('tracks.json');
  return raw.map((entry) => ({
    slug: entry.slug,
    track: toTrack(entry),
    wordSpans: entry.wordSpans,
  }));
}

/** Satu lagu fixture berdasarkan slug, atau null kalau tidak ada. */
export async function loadFixtureTrack(slug: string): Promise<FixtureTrack | null> {
  const all = await loadFixtureTracks();
  return all.find((entry) => entry.slug === slug) ?? null;
}

/** TTML mentah untuk satu slug. Pemanggil yang mem-parse. */
export async function loadFixtureTtml(slug: string): Promise<string> {
  return readFile(path.join(FIXTURE_ROOT, 'ttml', `${slug}.ttml`), 'utf8');
}

/**
 * Respons katalog Apple mentah, apa adanya.
 *
 * Tipe kembaliannya `unknown` dengan sengaja: adapter katalog-lah yang
 * bertanggung jawab memvalidasi dan menormalkan bentuknya, bukan pembaca file.
 */
export async function loadAppleFixture(name: string): Promise<unknown> {
  return readJson<unknown>(path.join('apple', `${name}.json`));
}
