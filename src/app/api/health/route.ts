/**
 * `GET /api/health` — apakah app ini benar-benar bisa melayani, bukan cuma hidup.
 *
 * Bedanya penting: proses Next bisa menjawab 200 sementara relay katalog mati,
 * dan dalam keadaan itu setiap halaman tampak kosong. Jadi health check ini
 * MENYENTUH relay sekali dan melaporkan latensinya.
 *
 * Konsekuensinya ia tidak gratis (360–950ms) dan tidak boleh dipanggil tiap
 * detik — karena itu ada rate limit-nya sendiri yang lebih ketat, dan
 * `no-store` supaya tidak ada tepi yang menyajikan status basi.
 */

import type { NextRequest } from 'next/server';

import { enforceRateLimit, healthLimiter } from '@/lib/api/guard';
import { apiSearch } from '@/lib/data/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, healthLimiter);
  if (limited) return limited;

  const startedAt = Date.now();
  /* Kueri paling murah yang masih membuktikan relay menjawab dengan JSON yang
     benar: satu hasil saja. `apiSearch` mengembalikan null untuk SEMUA
     kegagalan, jadi tidak ada yang perlu di-try/catch. */
  const probe = await apiSearch('a', 'songs', 1);
  const elapsedMs = Date.now() - startedAt;

  const relayOk = probe !== null;

  return Response.json(
    {
      ok: relayOk,
      waktu: new Date().toISOString(),
      relay: {
        terjangkau: relayOk,
        ms: elapsedMs,
      },
    },
    {
      // 503 kalau relay mati: monitoring apa pun akan mengenalinya tanpa perlu
      // membaca body. 200 dengan `ok: false` akan lolos dari hampir semua alat.
      status: relayOk ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
