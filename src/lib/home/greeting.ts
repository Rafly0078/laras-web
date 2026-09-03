/**
 * Sapaan waktu Beranda — logika MURNI.
 *
 * `new Date()` sengaja tidak dipanggil di sini: komponen klien-lah yang
 * memasukkannya, dan fungsi ini tetap bisa diuji deterministik di Node.
 */

export type GreetingPart = 'pagi' | 'siang' | 'sore' | 'malam';

export const GREETINGS: Record<GreetingPart, string> = {
  pagi: 'Selamat pagi',
  siang: 'Selamat siang',
  sore: 'Selamat sore',
  malam: 'Selamat malam',
};

/**
 * Batas jam mengikuti kebiasaan sapaan Indonesia:
 *
 *   04:00–10:59  pagi      (fajar sudah menyala)
 *   11:00–14:59  siang
 *   15:00–17:59  sore
 *   18:00–03:59  malam
 *
 * Nilai di luar 0–23 dibungkus mod 24; jam yang tidak finite (caller salah
 * memberi data) jatuh ke 'pagi' — default yang paling jarang keliru.
 */
export function greetingPart(hour: number): GreetingPart {
  if (!Number.isFinite(hour)) return 'pagi';
  const h = ((hour % 24) + 24) % 24;
  if (h >= 4 && h < 11) return 'pagi';
  if (h >= 11 && h < 15) return 'siang';
  if (h >= 15 && h < 18) return 'sore';
  return 'malam';
}

export function greetingText(date: Date): string {
  return GREETINGS[greetingPart(date.getHours())];
}
