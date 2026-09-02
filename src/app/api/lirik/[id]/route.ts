/**
 * `GET /api/lirik/[id]` — lirik ternormalisasi untuk satu track id Apple.
 *
 * KENAPA ADA, dan kenapa halaman TIDAK memakainya:
 *
 * Server component memanggil `loadLyrics()` langsung dari `lib/data`. Itu
 * disengaja — memanggil route handler sendiri dari server berarti satu
 * round-trip HTTP tambahan ke proses kita sendiri dan Data Cache Next tidak
 * ikut bekerja. Jangan "menyeragamkan" keduanya.
 *
 * Yang dilayani endpoint ini: pemakaian dari sisi KLIEN dan dari luar app —
 * misalnya memeriksa apakah sebuah lagu punya lirik tanpa merender halaman, dan
 * satu titik yang stabil kalau nanti ada klien lain (ekstensi, app Android
 * LARAS). Ia juga tempat rate limit dipasang, karena hanya jalur inilah yang
 * bisa dipanggil siapa saja sebanyak yang mereka mau.
 *
 * Bentuk balasan sengaja TIDAK 404 saat lirik tidak ada: "lagu ini tanpa lirik"
 * adalah jawaban yang sah dan layak di-cache, bukan kesalahan. Yang 404 hanya
 * id yang bentuknya tidak mungkin.
 */

import type { NextRequest } from 'next/server';

import { enforceRateLimit, lyricsLimiter } from '@/lib/api/guard';
import { loadLyrics } from '@/lib/data/catalog';
import { TTL } from '@/lib/data/client';

/**
 * Id katalog Apple selalu angka. Menolaknya di sini menghemat satu panggilan
 * relay untuk setiap pemindai yang mencoba `/api/lirik/../../etc/passwd`.
 */
const ID_PATTERN = /^\d{1,20}$/;

export async function GET(request: NextRequest, ctx: RouteContext<'/api/lirik/[id]'>) {
  const limited = enforceRateLimit(request, lyricsLimiter);
  if (limited) return limited;

  const { id } = await ctx.params;

  if (!ID_PATTERN.test(id)) {
    return Response.json(
      { error: 'id tidak valid', pesan: 'Id katalog Apple berupa angka.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const lyrics = await loadLyrics(id);

  /* s-maxage sama dengan TTL lirik (30 hari): TTML untuk satu track id tidak
     pernah berubah. max-age=0 menjaga browser tetap menanyakan ke tepi, supaya
     perbaikan adapter tidak tertahan di cache pribadi orang selama sebulan. */
  const cacheControl =
    lyrics === null
      ? // Ketiadaan lirik di-cache jauh lebih pendek: bisa jadi relay yang
        // sedang gagal, bukan lagu yang memang tanpa lirik, dan kita tidak
        // bisa membedakan keduanya dari sini.
        'public, max-age=0, s-maxage=3600, stale-while-revalidate=600'
      : `public, max-age=0, s-maxage=${TTL.lyrics}, stale-while-revalidate=86400`;

  return Response.json(
    {
      id,
      ditemukan: lyrics !== null,
      lirik: lyrics,
    },
    { headers: { 'Cache-Control': cacheControl } },
  );
}
