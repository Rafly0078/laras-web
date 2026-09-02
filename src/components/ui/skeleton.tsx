/**
 * Blok placeholder yang dipakai semua skeleton halaman.
 *
 * Bentuk (tinggi, lebar, radius) ditentukan pemanggil lewat `className`;
 * warna dan denyutnya datang dari kelas global `.laras-skeleton`. Jadi kalau
 * denyutnya diubah, satu tempat saja yang disentuh.
 *
 * `delayMs` menggeser fase denyut. Tanpa itu semua blok berkedip serempak dan
 * hasilnya terlihat seperti layar berkedip, bukan sesuatu yang sedang dimuat.
 */

export function SkeletonBlock({
  className = '',
  delayMs = 0,
}: {
  className?: string;
  delayMs?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={`laras-skeleton ${className}`}
      style={delayMs === 0 ? undefined : { animationDelay: `${delayMs}ms` }}
    />
  );
}

/**
 * Lebar judul/artis per baris, dalam persen. Nilai TETAP, bukan `Math.random()`:
 * angka acak saat render berbeda antara server dan klien dan itu hydration
 * mismatch fatal di Next.
 */
const ROW_WIDTHS = [58, 44, 71, 39, 63, 50, 67, 46] as const;

/**
 * Deretan baris lagu palsu, seukuran `TrackRow` sungguhan.
 *
 * Angkanya sengaja sama dengan track-row.tsx: tinggi 56px, kolom nomor w-6,
 * artwork 40px, durasi di kanan. Kalau baris aslinya diubah, ubah di sini juga
 * — kalau tidak, daftar akan melompat saat data masuk.
 */
export function SkeletonTrackRows({ count = 8 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex min-h-[56px] items-center gap-4 px-3">
          <SkeletonBlock className="h-3 w-3 shrink-0 rounded-full" delayMs={i * 90} />
          <SkeletonBlock
            className="h-10 w-10 shrink-0 rounded-[var(--radius-artwork-sm)]"
            delayMs={i * 90}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div style={{ width: `${ROW_WIDTHS[i % ROW_WIDTHS.length]}%` }}>
              <SkeletonBlock className="h-3 rounded-full" delayMs={i * 90} />
            </div>
            <SkeletonBlock className="h-2.5 w-24 rounded-full" delayMs={i * 90 + 40} />
          </div>
          <SkeletonBlock className="h-3 w-8 shrink-0 rounded-full" delayMs={i * 90} />
        </div>
      ))}
    </div>
  );
}
