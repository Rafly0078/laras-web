/**
 * Saklar untuk rute pengembangan (`/demo`, `/dev/lirik`).
 *
 * KENAPA DIGATE, BUKAN DIHAPUS.
 *
 * `HANDOFF.md` §5 sebelumnya menyebut `/demo` dan `now-playing.tsx` sebagai
 * "peninggalan yang boleh dihapus". Itu keliru, dan pemeriksaan yang membuktikannya
 * gampang: `scripts/verify-lyrics.part2.cjs` — 32 assertion — dijalankan
 * TERHADAP `/demo/<slug>`. Di antaranya satu-satunya bukti otomatis untuk aturan
 * yang BRIEF sebut final dan tidak opsional: saat mode video menyala, lirik
 * hilang sepenuhnya dari DOM. Menghapus `/demo` berarti menghapus bukti itu dan
 * hanya menyisakan janji di dokumen.
 *
 * Sementara itu `/demo` juga tidak layak terbuka di produksi: ia menyajikan
 * lirik lengkap empat lagu dari TTML yang ikut di-commit, dan itu teks berhak
 * cipta penerbit, bukan data teknis.
 *
 * Jadi keduanya tetap ada tapi 404 di produksi. Harness dijalankan terhadap
 * build yang dibuat dengan `LARAS_ENABLE_DEV=1` (lihat HANDOFF §7).
 *
 * Dibaca sebagai konstanta modul, bukan fungsi: nilainya ditentukan saat build
 * dan tidak pernah berubah selama proses hidup.
 */

export const DEV_ROUTES_ENABLED =
  process.env.NODE_ENV !== 'production' || process.env.LARAS_ENABLE_DEV === '1';
