/**
 * Playlist editorial Beranda — konstanta murni, TANPA `server-only`.
 *
 * Kenapa dipisah dari `catalog.ts`: daftar ini juga dibutuhkan komponen KLIEN
 * (mis. `app/error.tsx`, yang wajib client component karena error boundary React)
 * untuk merender sidebar. `catalog.ts` menandai dirinya `server-only` supaya
 * kunci relay dan logika fetch tidak pernah ikut ke bundel browser — jadi apa
 * pun yang dibutuhkan kedua sisi harus hidup di file lain. Di sini tidak ada
 * fetch, tidak ada rahasia: hanya id dan judul.
 *
 * Id di sini DIAMBIL dari respons `/playlist/tracks` yang sungguhan (field
 * `playlist_id` di fixtures/apple/playlist-*.json) — jangan pernah menebaknya.
 * Id yang ditebak membalas 404 atau, lebih buruk, playlist orang lain.
 * (Endpoint itu sekarang `/playlist?playlist=` — lihat `client.ts` — dan id
 * yang sama tetap valid di sana, terverifikasi 2026-09-03.)
 *
 * Disimpan sebagai konstanta alih-alih dicari lewat `/search` tiap kali:
 * pencarian menambah satu round-trip 360–950ms per rak tanpa memberi apa pun
 * yang belum kita tahu. `slug` dipakai di URL supaya alamatnya terbaca.
 */

export const HOME_PLAYLISTS = [
  {
    slug: 'top-100-indonesia',
    id: 'pl.2b7e089dc9ef4dd7a18429df9c6e26a3',
    title: 'Top 100: Indonesia',
    curator: 'Apple Music',
  },
  {
    slug: 'indonesian-music-today',
    id: 'pl.9701289a07b845fb91b0a428c12f42c9',
    title: 'Indonesian Music Today',
    curator: 'Apple Music Indonesian Music',
  },
  {
    slug: 'all-time-indonesian-hits',
    id: 'pl.8d6e453de1c04e17b31839c504045455',
    title: 'All-Time Indonesian Hits',
    curator: 'Apple Music Indonesian Music',
  },
  {
    slug: 'top-songs-2025-indonesia',
    id: 'pl.d4cbfd89785f4ed591f4a888885039f4',
    title: 'Top Songs of 2025: Indonesia',
    curator: 'Apple Music',
  },
] as const;

export type HomePlaylistSlug = (typeof HOME_PLAYLISTS)[number]['slug'];

export function homePlaylistBySlug(slug: string) {
  return HOME_PLAYLISTS.find((p) => p.slug === slug) ?? null;
}

/** Daftar untuk sidebar — hanya slug + judul. */
export const SIDEBAR_PLAYLISTS = HOME_PLAYLISTS.map((p) => ({
  slug: p.slug,
  title: p.title,
}));
