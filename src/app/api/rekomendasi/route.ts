/**
 * `POST /api/rekomendasi` — lagu yang direkomendasikan dari riwayat pengguna.
 *
 * KENAPA POST, BUKAN GET: id riwayat adalah data pribadi ringan (apa yang kamu
 * dengar), dan GET akan menaruhnya di URL — tempat ia masuk log akses server,
 * log CDN, dan Referer. Body POST tidak. Konsekuensinya diterima: respons ini
 * tidak bisa di-cache CDN, sehingga cache-nya hidup di Data Cache Next di
 * dalam `loadRecommendations` (TTL 12 jam untuk artis, 24 jam untuk lagu) —
 * yang justru lebih tepat, karena bagian yang mahal adalah panggilan RELAY,
 * bukan perakitan raknya.
 *
 * KENAPA ADA PERMUKAAN `/api` SAMA SEKALI: riwayat hidup di localStorage, yang
 * tidak ada di server. Beranda sendiri ISR 6 jam dan dibagi seluruh pengunjung,
 * jadi rak personal MUSTAHIL dirender di sana. Klien yang punya riwayat harus
 * memintanya sendiri setelah mount.
 */

import type { NextRequest } from 'next/server';

import { enforceRateLimit, recommendationLimiter } from '@/lib/api/guard';
import { loadRecommendations } from '@/lib/data/catalog';

/** Id katalog Apple selalu angka — sama seperti `/api/lirik/[id]`. */
const ID_PATTERN = /^\d{1,20}$/;

/**
 * Batas jumlah id yang diterima.
 *
 * Bukan sekadar sanitasi: `loadRecommendations` memakai id ini untuk
 * membangun daftar "sudah didengar", dan body 10.000 id akan membuat server
 * bekerja tanpa hasil yang lebih baik. Riwayat sendiri dibatasi 100 entri
 * (`MAX_HISTORY`), jadi angka ini sudah longgar.
 */
const MAX_IDS = 100;

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, recommendationLimiter);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'body tidak valid', pesan: 'Kirim JSON { "riwayat": ["id", ...] }.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const raw =
    typeof body === 'object' && body !== null && 'riwayat' in body
      ? (body as { riwayat: unknown }).riwayat
      : null;

  if (!Array.isArray(raw)) {
    return Response.json(
      { error: 'body tidak valid', pesan: 'Field "riwayat" harus berupa array id.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  /* Id yang bentuknya tidak mungkin DIBUANG, bukan membatalkan permintaan:
     satu entri localStorage yang rusak tidak boleh membuat seluruh rak hilang.
     Sama dengan sikap `parseCollection` terhadap entri rusak. */
  const ids = raw.filter((v): v is string => typeof v === 'string' && ID_PATTERN.test(v));

  if (ids.length === 0) {
    /* Riwayat kosong bukan kesalahan — itu keadaan pengguna baru. Balas 200
       dengan rak kosong supaya klien tidak perlu membedakan dua jalur. */
    return Response.json(
      { lagu: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const tracks = await loadRecommendations(ids.slice(0, MAX_IDS));

  return Response.json(
    { lagu: tracks },
    /* `private` supaya CDN tidak pernah menyimpannya (isinya personal), dan
       `max-age=300` supaya berpindah halaman lalu kembali ke Beranda dalam
       lima menit tidak memicu tiga panggilan relay lagi. */
    { headers: { 'Cache-Control': 'private, max-age=300' } },
  );
}
