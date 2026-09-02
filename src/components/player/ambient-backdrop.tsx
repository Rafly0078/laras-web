'use client';

/**
 * Ambient background — mesh gradient dari warna artwork.
 *
 * Kunci "kaya warna"-nya spicy-lyrics: SATURASI 2.5×. Blur + gelapkan saja
 * menghasilkan abu-abu mati; saturasi berlebihlah yang membuat latar terasa
 * menyala dari artwork.
 *
 * Warna diambil dari dua sumber, berurutan:
 *  1. Apple sudah menyediakan bgColor + textColor1..4 di metadata artwork —
 *     ini gratis, tanpa unduh gambar, tanpa canvas. Dipakai lebih dulu.
 *  2. Kalau tidak ada, baru ekstraksi dari piksel artwork lewat canvas
 *     (aman karena mzstatic mengirim Access-Control-Allow-Origin: *).
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { AMBIENT } from '@/lib/lyrics/design-tokens';

export interface AmbientBackdropProps {
  /** URL artwork ukuran kecil (cukup 300px — kita hanya butuh warnanya). */
  artworkUrl: string | null;
  /** Warna dari metadata Apple, hex TANPA '#'. */
  bgColor?: string | null;
  textColors?: readonly string[];
  /** Kurangi gerakan/beban di perangkat lemah. */
  reducedMotion?: boolean;
}

/** Rerata warna satu petak gambar, dikembalikan sebagai 'r,g,b'. */
function averageRegion(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): string {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;

  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * width + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n += 1;
    }
  }

  if (n === 0) return '28,28,30';
  return `${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)}`;
}

function hexToRgbString(hex: string): string | null {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const value = Number.parseInt(clean, 16);
  return `${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`;
}

export function AmbientBackdrop({
  artworkUrl,
  bgColor,
  textColors,
  reducedMotion = false,
}: AmbientBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /** Warna dari metadata Apple — tersedia langsung, tanpa unduh gambar. */
  const metaColors = useMemo(() => {
    const list: string[] = [];
    const bg = bgColor ? hexToRgbString(bgColor) : null;
    if (bg) list.push(bg);
    for (const c of textColors ?? []) {
      const rgb = hexToRgbString(c);
      if (rgb) list.push(rgb);
    }
    return list;
  }, [bgColor, textColors]);

  const [pixelColors, setPixelColors] = useState<string[] | null>(null);

  /* Ekstraksi piksel hanya dijalankan kalau metadata Apple tidak cukup. */
  useEffect(() => {
    if (!artworkUrl || metaColors.length >= 3) return;

    let cancelled = false;
    const image = new Image();
    // mzstatic mengirim ACAO '*', jadi canvas tidak ter-taint dan
    // getImageData boleh dipanggil.
    image.crossOrigin = 'anonymous';

    image.onload = () => {
      if (cancelled) return;
      const canvas = canvasRef.current ?? document.createElement('canvas');
      canvasRef.current = canvas;

      // 48×48 cukup: kita cuma butuh warna rata-rata per kuadran, dan
      // resolusi kecil membuat getImageData nyaris gratis.
      const size = 48;
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(image, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      const half = size / 2;

      setPixelColors([
        averageRegion(data, size, 0, 0, half, half),
        averageRegion(data, size, half, 0, size, half),
        averageRegion(data, size, 0, half, half, size),
        averageRegion(data, size, half, half, size, size),
      ]);
    };

    // Gagal memuat bukan error fatal: latar tinggal memakai warna netral.
    image.onerror = () => {
      if (!cancelled) setPixelColors(null);
    };

    image.src = artworkUrl;

    return () => {
      cancelled = true;
    };
  }, [artworkUrl, metaColors.length]);

  const colors = pixelColors ?? metaColors;

  const [c1, c2, c3, c4] = [
    colors[0] ?? '28,28,30',
    colors[1] ?? colors[0] ?? '20,20,20',
    colors[2] ?? colors[0] ?? '10,10,10',
    colors[3] ?? colors[1] ?? '0,0,0',
  ];

  const filter = reducedMotion
    ? `saturate(${AMBIENT.static.saturate}) brightness(${AMBIENT.static.brightness})`
    : `saturate(${AMBIENT.animated.saturate}) brightness(${AMBIENT.animated.brightness})`;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Empat radial gradient di sudut = mesh sederhana yang murah.
          Transisi 1.5s supaya ganti lagu terasa meleleh, bukan berkedip. */}
      <div
        className="absolute inset-0"
        style={{
          filter,
          transition: `background ${AMBIENT.colorTransition} ease-out`,
          background: [
            `radial-gradient(circle at 15% 15%, rgb(${c1} / 0.95), transparent 55%)`,
            `radial-gradient(circle at 85% 20%, rgb(${c2} / 0.9), transparent 55%)`,
            `radial-gradient(circle at 20% 85%, rgb(${c3} / 0.9), transparent 55%)`,
            `radial-gradient(circle at 80% 80%, rgb(${c4} / 0.85), transparent 55%)`,
            `linear-gradient(180deg, rgb(${c1} / 0.5), rgb(0 0 0 / 0.9))`,
          ].join(','),
        }}
      />

      {/* Scrim: menggelapkan ke bawah supaya teks di atasnya selalu terbaca.
          Tanpa ini, artwork terang membuat lirik putih hilang. */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, rgb(0 0 0 / 0.25), rgb(0 0 0 / 0.85))',
        }}
      />
    </div>
  );
}
