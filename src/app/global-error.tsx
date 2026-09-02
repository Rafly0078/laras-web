'use client';

/**
 * Batas error terakhir: dipakai kalau ROOT LAYOUT sendiri yang gagal.
 *
 * File ini mengganti seluruh dokumen, jadi ia wajib membawa `<html>` dan
 * `<body>` sendiri. Konsekuensi yang mudah terlewat: `globals.css` TIDAK ikut
 * dimuat di sini, sehingga kelas `laras-*` dan token radius tidak ada artinya.
 * Karena itu gayanya inline — bukan kemalasan, tapi satu-satunya cara agar
 * layar ini tetap gelap dan terbaca ketika stylesheet tidak tersedia.
 *
 * Kalau pengguna sampai melihat layar ini, pemutar juga sudah mati: root layout
 * yang gagal berarti `PlayerProvider` tidak ada. Jadi tidak ada yang bisa
 * diselamatkan selain memuat ulang.
 */

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          background: '#000',
          color: '#f5f5f7',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        {/* metadata/generateMetadata tidak didukung di client component;
            <title> React yang menggantikannya. */}
        <title>LARAS — gagal dimuat</title>

        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          LARAS gagal dimuat
        </h1>
        <p style={{ color: '#aeaeb2', maxWidth: 420, margin: 0, lineHeight: 1.5 }}>
          Kerangka aplikasi tidak bisa dirender. Muat ulang halaman; kalau tetap
          gagal, layanan katalognya sedang bermasalah.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            height: 44,
            padding: '0 20px',
            borderRadius: 12,
            border: 0,
            background: '#fa2d48',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Coba lagi
        </button>
        {error.digest ? (
          <p style={{ color: '#8e8e93', fontSize: 12, margin: 0 }}>
            Kode: {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
