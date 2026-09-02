/**
 * Parser respons pencarian InnerTube YouTube Music.
 *
 * Dipisah dari `youtube.ts` (yang melakukan panggilan jaringan) supaya bisa
 * diuji di Node terhadap fixture respons NYATA. Bentuk pohon InnerTube adalah
 * bagian paling rapuh di seluruh jembatan audio — kalau YouTube mengubahnya,
 * yang pertama gagal adalah test ini, bukan pengguna.
 */

import { parseYouTubeDuration, type AudioCandidate } from '@/lib/data/bridge';

type Json = Record<string, unknown>;

function isRec(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Gabungkan seluruh `runs[].text` menjadi satu string. */
export function runsText(node: unknown): string {
  if (!isRec(node)) return '';
  return asArray(node.runs)
    .map((run) => (isRec(run) && typeof run.text === 'string' ? run.text : ''))
    .join('');
}

/**
 * Telusuri seluruh pohon dan kumpulkan setiap `musicResponsiveListItemRenderer`.
 *
 * Kenapa rekursif, bukan mengikuti jalur tetap: bentuk pohon InnerTube berubah
 * antar versi klien (tabs -> sectionList -> shelf -> contents, dengan sisipan
 * `itemSectionRenderer` yang muncul-hilang). Jalur keras pecah tanpa peringatan;
 * pemindaian rekursif tahan terhadap sisipan itu.
 */
export function collectListItems(node: unknown, out: Json[] = [], depth = 0): Json[] {
  if (depth > 24 || node === null || typeof node !== 'object') return out;

  if (Array.isArray(node)) {
    for (const child of node) collectListItems(child, out, depth + 1);
    return out;
  }

  const rec = node as Json;
  if (isRec(rec.musicResponsiveListItemRenderer)) {
    out.push(rec.musicResponsiveListItemRenderer);
  }

  for (const value of Object.values(rec)) {
    collectListItems(value, out, depth + 1);
  }

  return out;
}

/** Cari videoId pertama yang valid di dalam sebuah subpohon. */
export function findVideoId(node: unknown, depth = 0): string | null {
  if (depth > 12 || node === null || typeof node !== 'object') return null;

  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findVideoId(child, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }

  const rec = node as Json;
  if (typeof rec.videoId === 'string' && /^[\w-]{11}$/.test(rec.videoId)) {
    return rec.videoId;
  }

  for (const value of Object.values(rec)) {
    const found = findVideoId(value, depth + 1);
    if (found !== null) return found;
  }

  return null;
}

/**
 * Ubah satu item hasil menjadi kandidat audio.
 *
 * Struktur yang dipakai: `flexColumns[0]` judul, `flexColumns[1]` baris
 * metadata gabungan ("Tulus • Manusia • 4:02"). Durasi ADA DI TEKS baris itu,
 * bukan di field `lengthSeconds` — field itu tidak dikirim di jalur pencarian.
 */
export function toCandidate(item: unknown): AudioCandidate | null {
  if (!isRec(item)) return null;

  const flexColumns = asArray(item.flexColumns);
  if (flexColumns.length === 0) return null;

  const column = (index: number): string => {
    const col = flexColumns[index];
    if (!isRec(col)) return '';
    const renderer = col.musicResponsiveListItemFlexColumnRenderer;
    if (!isRec(renderer)) return '';
    return runsText(renderer.text);
  };

  const title = column(0);
  if (title.length === 0) return null;

  const videoId = findVideoId(item);
  if (videoId === null) return null;

  // Baris metadata dipisah '•'. Durasi dicari dari BELAKANG karena ia hampir
  // selalu bagian terakhir; mencari dari depan bisa salah mengambil tahun
  // rilis atau jumlah pemutaran yang kebetulan terparse sebagai waktu.
  const parts = column(1)
    .split('•')
    .map((p) => p.trim());

  let durationSeconds: number | null = null;
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const parsed = parseYouTubeDuration(parts[i]);
    if (parsed !== null) {
      durationSeconds = parsed;
      break;
    }
  }

  // Artis = bagian pertama yang bukan durasi.
  const artist =
    parts.find((p) => p.length > 0 && parseYouTubeDuration(p) === null) ?? null;

  return { videoId, title, artist, durationSeconds };
}

/** Semua kandidat dari satu respons pencarian InnerTube. */
export function parseSearchResponse(json: unknown): AudioCandidate[] {
  return collectListItems(json)
    .map(toCandidate)
    .filter((c): c is AudioCandidate => c !== null);
}
