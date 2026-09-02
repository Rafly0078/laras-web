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

/** Ubah 'r,g,b' jadi [h, s, l] dengan h 0..360, s/l 0..1. */
function rgbToHsl(rgb: string): [number, number, number] {
  const [r, g, b] = rgb.split(',').map((v) => Number(v) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return `${v},${v},${v}`;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [channel(hh + 1 / 3), channel(hh), channel(hh - 1 / 3)]
    .map((v) => Math.round(v * 255))
    .join(',');
}

/**
 * Empat warna mesh dari SATU warna dominan.
 *
 * KENAPA ADA: `textColors` Apple TIDAK BOLEH dipakai sebagai warna latar.
 * Terukur pada "Teh Hijau" — sampulnya kuning-hijau terang, `bgColor` a6a953,
 * tapi keempat textColor-nya 010100 / 060702 / 21230d / 282a11, semuanya nyaris
 * hitam. Wajar: itu warna TEKS yang dirancang Apple untuk ditaruh DI ATAS
 * sampul terang. Memakainya sebagai stop gradient menghasilkan latar hitam,
 * dan menaikkan saturate/brightness pada hitam tetap hitam.
 *
 * Jadi mesh diturunkan dari satu warna dominan: hue diputar ±22°, lightness
 * dijaga di rentang yang masih berwarna (0.30..0.52) dan saturasi ditahan
 * minimal 0.45 supaya sampul yang pucat tidak menghasilkan abu.
 */
function deriveMesh(rgb: string): string[] {
  const [h, s, l] = rgbToHsl(rgb);
  const sat = Math.max(0.45, Math.min(0.95, s));
  const light = Math.max(0.3, Math.min(0.52, l));
  return [
    hslToRgb(h, sat, light),
    hslToRgb(h + 22, sat, light * 0.82),
    hslToRgb(h - 22, sat * 0.9, light * 1.12),
    hslToRgb(h + 44, sat * 0.8, light * 0.7),
  ];
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

  /*
   * Ekstraksi piksel dijalankan SELALU kalau ada artwork.
   *
   * Dulu ia dilewati begitu metadata Apple punya >= 3 entri — dan itu hampir
   * selalu benar (bgColor + 4 textColor = 5), jadi jalur piksel praktis mati.
   * Padahal justru metadata-nya yang tidak berguna untuk latar: textColor Apple
   * adalah warna TEKS, nyaris hitam pada sampul terang. Piksel sampul adalah
   * satu-satunya sumber yang benar-benar berwarna.
   */
  useEffect(() => {
    if (!artworkUrl) return;

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

  /*
   * Urutan sumber: piksel sampul, lalu turunan dari bgColor, lalu netral.
   *
   * Turunan dipakai sebagai jembatan sebelum gambar selesai diunduh, supaya
   * latar tidak berkedip hitam dulu. `metaColors` mentah TIDAK dipakai lagi —
   * lihat `deriveMesh` untuk alasannya.
   */
  const colors = useMemo(() => {
    if (pixelColors && pixelColors.length > 0) return pixelColors;
    const dominant = metaColors[0];
    return dominant ? deriveMesh(dominant) : [];
  }, [pixelColors, metaColors]);

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
          Tanpa ini, artwork terang membuat lirik putih hilang.

          Dilemahkan dari 0.25..0.85 jadi 0.10..0.55. Angka lama-lah yang paling
          menahan warna ambient — filter saturate/brightness sudah tinggi tapi
          hasilnya tetap hampir hitam karena lapisan ini menutupnya. Rujukan
          Apple Music memakai warna artwork sebagai permukaan penuh.

          Tidak diturunkan sampai nol: lirik putih di atas sampul yang terang
          (mis. kuning) akan hilang tanpa scrim sama sekali. 0.55 di bawah masih
          menjaga kontras teks di area terpadat lirik. */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, rgb(0 0 0 / 0.10), rgb(0 0 0 / 0.55))',
        }}
      />
    </div>
  );
}
