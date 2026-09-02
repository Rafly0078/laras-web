/**
 * Skeleton pane lirik — yang tampil selama relay masih dijemput.
 *
 * KENAPA ADA: `/lyrics` butuh 9,8–11,7 detik untuk lagu yang belum pernah
 * diminta. Selama itu pane lirik kosong. Kotak kosong sepuluh detik terbaca
 * sebagai rusak, jadi ruangnya diisi bentuk yang menjanjikan teks.
 *
 * Sengaja memakai kelas .larasLyrics + .scroller yang SAMA dengan renderer
 * sungguhan: geometri (font-size container-query, padding 25cqh, mask tepi)
 * datang dari satu tempat, sehingga baris lirik yang masuk mendarat di posisi
 * yang hampir sama dan tidak ada lompatan tata letak.
 *
 * Tidak ada framer-motion di sini, sama seperti sisa mesin lirik: denyutnya
 * satu animasi CSS per bar.
 */

import styles from './lyrics.module.css';

/**
 * Lebar bar dalam persen — tidak seragam supaya terbaca sebagai baris lirik
 * berbeda panjang, bukan tabel.
 *
 * Nilai TETAP, bukan `Math.random()`: nilai acak yang dihitung saat render
 * berbeda antara server dan klien, dan itu hydration mismatch fatal di Next.
 */
const BAR_WIDTHS = [88, 71, 94, 62, 83, 69] as const;

/** Jarak antar denyut bar (ms) — cukup untuk terbaca sebagai gelombang. */
const STAGGER_MS = 120;

export function LyricsSkeleton() {
  return (
    <div className="relative h-full">
      {/* Bentuk dan posisi sama dengan petunjuk "Putar lagu ini untuk
          menyinkronkan lirik" di keadaan termuat, jadi pane tidak berubah
          bentuk saat lirik akhirnya masuk. */}
      <p
        role="status"
        className="absolute inset-x-0 top-0 z-10 bg-laras-black/70 px-6 py-2 text-center text-xs text-laras-tertiary backdrop-blur-sm"
      >
        Memuat lirik…
      </p>

      <div className={styles.larasLyrics}>
        {/* aria-hidden: bar-nya hiasan. Yang diumumkan pembaca layar cukup
            teks "Memuat lirik…" di atas. */}
        <div className={styles.scroller} aria-hidden="true">
          {BAR_WIDTHS.map((width, index) => (
            <div
              key={index}
              className={styles.skeletonLine}
              style={{
                width: `${width}%`,
                animationDelay: `${index * STAGGER_MS}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
