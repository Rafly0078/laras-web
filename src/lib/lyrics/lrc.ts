/**
 * Parser LRC — format lirik line-level, dipakai LRCLIB sebagai cadangan saat
 * Apple Music tidak punya lirik untuk sebuah lagu.
 *
 * Yang HARUS dipahami sebelum menyentuh file ini: LRC tidak punya timing per
 * kata. Satu baris hanya tahu kapan ia MULAI. Karena itu hasilnya ditandai
 * `kind: 'line'`, dan animator sengaja tidak menyapunya (lihat komentar di
 * `animator.ts`) — menyapu baris LRC berarti mengarang presisi yang tidak ada
 * di datanya.
 *
 * Bentuk yang benar-benar dikirim LRCLIB, terverifikasi pada dua respons nyata
 * di `fixtures/lrclib/`:
 *
 *   [00:21.38] Bun, hidup berjalan seperti bajingan
 *   [00:29.45]
 *   [00:31.80] Seperti landak yang tak punya teman
 *
 * Perhatikan baris kedua: timestamp TANPA teks. Itu bukan sampah — itu penanda
 * KAPAN baris sebelumnya berakhir, dan satu-satunya sumber `end` yang jujur.
 * Tanpa memakainya, akhir baris hanya bisa ditebak dari awal baris berikutnya,
 * dan baris terakhir sebelum jeda panjang akan tampak menyala belasan detik.
 *
 * Toleransi yang disengaja (LRC di alam liar tidak seragam):
 *  - `[mm:ss.xx]` dan `[mm:ss.xxx]` — dua atau tiga desimal
 *  - `[mm:ss]` tanpa desimal
 *  - beberapa timestamp untuk satu teks: `[00:12.00][01:20.00] refrain`
 *  - tag metadata `[ar:…]`, `[ti:…]`, `[by:…]` — dilewati
 *  - `[offset:+250]` / `[offset:-250]` — digeser, dalam MILIDETIK, dan tandanya
 *    mengikuti konvensi LRC: offset POSITIF berarti lirik ditampilkan LEBIH
 *    AWAL, jadi ia DIKURANGI dari setiap waktu.
 */

import { DOTS } from '@/lib/lyrics/design-tokens';
import type { Lyrics, LyricLine } from '@/lib/types';

/** `[mm:ss.xx]`, `[mm:ss.xxx]`, atau `[mm:ss]`. */
const TIME_TAG = /\[(\d{1,3}):([0-5]?\d)(?:[.:](\d{1,3}))?\]/g;

/** `[offset:+250]` — milidetik. */
const OFFSET_TAG = /\[offset:\s*([+-]?\d+)\s*\]/i;

interface RawLine {
  timeSeconds: number;
  text: string;
}

/** Ubah tiga bagian tangkapan regex jadi detik. */
function toSeconds(minutes: string, seconds: string, fraction: string | undefined): number {
  const m = Number(minutes);
  const s = Number(seconds);
  // "5" berarti 500ms, "05" berarti 50ms, "050" berarti 50ms — jadi dinormalkan
  // ke tiga digit dulu, bukan dibagi 100 secara buta.
  const ms = fraction === undefined ? 0 : Number(fraction.padEnd(3, '0'));
  return m * 60 + s + ms / 1000;
}

/** Baca semua baris bertimestamp, sudah digeser offset dan terurut. */
function readRawLines(text: string): RawLine[] {
  const offsetMatch = OFFSET_TAG.exec(text);
  const offsetSeconds = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;

  const out: RawLine[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    TIME_TAG.lastIndex = 0;
    const stamps: number[] = [];
    let match: RegExpExecArray | null;
    let lastEnd = 0;

    while ((match = TIME_TAG.exec(rawLine)) !== null) {
      // Timestamp hanya sah kalau menempel di awal baris atau langsung setelah
      // timestamp sebelumnya. Angka dalam kurung di TENGAH lirik bukan waktu.
      if (match.index !== lastEnd) break;
      stamps.push(toSeconds(match[1], match[2], match[3]));
      lastEnd = match.index + match[0].length;
    }

    if (stamps.length === 0) continue;

    const body = rawLine.slice(lastEnd).trim();
    for (const stamp of stamps) {
      out.push({ timeSeconds: Math.max(0, stamp - offsetSeconds), text: body });
    }
  }

  // Beberapa timestamp per teks membuat urutan aslinya tidak monoton.
  return out.sort((a, b) => a.timeSeconds - b.timeSeconds);
}

/** Baris interlude sintetis — bentuknya sama dengan yang dibuat parser TTML. */
function makeInterlude(start: number, end: number): LyricLine {
  return {
    index: 0,
    start,
    end,
    lead: { syllables: [], start, end },
    background: [],
    oppositeAligned: false,
    interlude: true,
    songPart: null,
    text: '',
  };
}

/** Satu baris LRC = satu "suku kata" sepanjang baris. */
function makeLine(text: string, start: number, end: number): LyricLine {
  const syllables = [
    { text, start, end, isPartOfWord: false, emphasis: false },
  ];
  return {
    index: 0,
    start,
    end,
    lead: { syllables, start, end },
    background: [],
    // LRC tidak membedakan penyanyi maupun vokal latar; keduanya tidak ada di
    // formatnya, jadi jangan mengarang.
    oppositeAligned: false,
    interlude: false,
    songPart: null,
    text,
  };
}

export interface ParseLrcOptions {
  /** Durasi lagu (detik), untuk menutup baris terakhir. */
  durationSeconds?: number;
  /** Nama penyedia untuk kredit di kaki pane. */
  attribution?: string;
}

export function parseLrc(text: string, options: ParseLrcOptions = {}): Lyrics {
  const raw = readRawLines(text);

  const empty: Lyrics = {
    kind: 'static',
    lines: [],
    source: 'lrclib',
    attribution: options.attribution ?? 'LRCLIB',
    instrumental: false,
  };

  if (raw.length === 0) return empty;

  /* Akhir sebuah baris = timestamp BERIKUTNYA, apa pun isinya. Timestamp
     bertext-kosong karena itu berharga: ia menutup baris sebelumnya tanpa
     membuat baris baru. */
  const timed: LyricLine[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i];
    if (entry.text.length === 0) continue;

    const nextStamp = raw[i + 1]?.timeSeconds;
    const fallbackEnd =
      options.durationSeconds !== undefined && options.durationSeconds > entry.timeSeconds
        ? options.durationSeconds
        : // Tanpa durasi lagu, baris terakhir diberi 4 detik: cukup untuk
          // dibaca, dan tidak menyala sampai lagu selesai.
          entry.timeSeconds + 4;

    timed.push(
      makeLine(entry.text, entry.timeSeconds, nextStamp ?? fallbackEnd),
    );
  }

  if (timed.length === 0) return empty;

  // Interlude disisipkan dengan ambang yang SAMA dengan lirik Apple
  // (DOTS.minGapSeconds), supaya kedua sumber terasa satu aplikasi.
  const withInterludes: LyricLine[] = [];
  if (timed[0].start >= DOTS.minGapSeconds) {
    withInterludes.push(makeInterlude(0, timed[0].start));
  }
  timed.forEach((line, i) => {
    withInterludes.push(line);
    const next = timed[i + 1];
    if (next && next.start - line.end >= DOTS.minGapSeconds) {
      withInterludes.push(makeInterlude(line.end, next.start));
    }
  });

  return {
    kind: 'line',
    lines: withInterludes.map((line, i) => ({ ...line, index: i })),
    source: 'lrclib',
    attribution: options.attribution ?? 'LRCLIB',
    instrumental: false,
  };
}
