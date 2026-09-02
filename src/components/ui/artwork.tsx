import Image from 'next/image';

import { NoteIcon } from '@/components/ui/icons';

/**
 * Artwork — kotak sampul berukuran tetap dengan placeholder saat sumber kosong.
 *
 * Server component: tidak ada state, dan bila dibiarkan di server maka
 * <Image> ikut dirender di HTML awal (tanpa biaya hidrasi per sampul —
 * satu grid bisa memuat puluhan).
 *
 * Ukuran diberikan lewat `style` inline, bukan kelas Tailwind, karena nilainya
 * datang dari data (grid berbeda memakai px berbeda) dan Tailwind tidak bisa
 * membangkitkan kelas dari nilai runtime.
 */

type ArtworkRadius = 'sm' | 'md' | 'lg';

export interface ArtworkProps {
  src: string | null;
  alt: string;
  size: number;
  rounded?: ArtworkRadius;
  className?: string;
  priority?: boolean;
}

/**
 * Radius ditulis sebagai string literal utuh agar terlihat pemindai Tailwind;
 * kelas yang disusun lewat interpolasi tidak akan pernah dibangkitkan.
 */
const RADIUS: Record<ArtworkRadius, string> = {
  sm: 'rounded-[var(--radius-artwork-sm)]',
  md: 'rounded-[var(--radius-artwork)]',
  lg: 'rounded-[var(--radius-artwork-lg)]',
};

export function Artwork({
  src,
  alt,
  size,
  rounded = 'md',
  className = '',
  priority = false,
}: ArtworkProps) {
  return (
    <div
      // Digabung lewat filter+join, bukan template string, supaya className
      // kosong tidak meninggalkan spasi menggantung di atribut class.
      className={['relative shrink-0 overflow-hidden', RADIUS[rounded], className]
        .filter(Boolean)
        .join(' ')}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={size}
          height={size}
          // Ukuran render selalu sama dengan `size`, jadi beri tahu browser
          // secara pasti supaya tidak mengunduh kandidat srcset yang lebih besar.
          sizes={`${size}px`}
          // Next 16 mengganti `priority` dengan `preload`; nama prop di luar
          // tetap `priority` supaya pemanggil tidak perlu ikut berubah.
          preload={priority}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center bg-laras-card text-laras-tertiary"
          // Placeholder tetap punya nama aksesibel bila sampulnya bermakna;
          // kalau alt kosong (dekoratif), biarkan tanpa peran sama sekali.
          role={alt ? 'img' : undefined}
          aria-label={alt || undefined}
        >
          <NoteIcon />
        </div>
      )}
    </div>
  );
}
