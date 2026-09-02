/**
 * Pengelompokan suku kata jadi KATA — fungsi MURNI, supaya bisa diuji.
 *
 * Dipisah dari `lyrics-view.tsx` bukan demi kerapian: inilah logika yang salah
 * dan menghasilkan lirik seperti `Ha ri-hariber ulang` — jarak jatuh di tengah
 * kata dan hilang di antara kata. Cacat sebesar itu tidak boleh hidup di dalam
 * komponen React yang tidak bisa disentuh unit test.
 *
 * `Syllable.isPartOfWord` berarti "tidak ada spasi SEBELUM saya". Jadi nilai
 * true MELANJUTKAN kata yang sedang dibangun, dan false MEMULAI kata baru.
 *
 * Kenapa arahnya pernah tertukar: jarak 0.32ch dulu dipasang lewat `::after`
 * pada tiap suku kata, yaitu batas KANAN, sementara `isPartOfWord` bicara soal
 * batas KIRI. Kode lama memasang jarak sesudah setiap span yang
 * `isPartOfWord === false` — yaitu suku kata PERTAMA setiap kata. Untuk split
 * `Ha|ri-|ha|ri| ber|u|lang` hasilnya `Ha ri-hariber ulang`.
 *
 * Terukur sebelum diperbaiki: 72–76% batas kata Indonesia kehilangan jaraknya
 * dan 65–66% sambungan di dalam kata justru mendapatkannya. Bahasa Inggris
 * hampir tidak terkena (0% / 79%) karena Apple memecah 76–80% kata Indonesia
 * jadi beberapa span tapi hanya ~4% kata Inggris.
 */

import type { Syllable } from '@/lib/types';

/**
 * Indeks suku kata per kata, dalam urutan asli.
 *
 * Yang dikembalikan INDEKS, bukan objek suku kata: `syllableKey` dan animator
 * memetakan elemen DOM lewat indeks aslinya, jadi ia tidak boleh hilang.
 */
export function toWordGroups(syllables: readonly Syllable[]): number[][] {
  const groups: number[][] = [];
  syllables.forEach((syllable, index) => {
    if (index === 0 || !syllable.isPartOfWord) groups.push([index]);
    else groups[groups.length - 1].push(index);
  });
  return groups;
}

/**
 * Teks tiap kata hasil pengelompokan.
 *
 * Ada untuk satu tujuan: test bisa membandingkan hasil gabungnya dengan
 * `LyricLine.text` yang dibuat parser secara terpisah. Kalau keduanya cocok,
 * jarak antar kata pasti mendarat di tempat yang benar — tanpa perlu ada satu
 * baris lirik pun di dalam kode test.
 */
export function wordTexts(syllables: readonly Syllable[]): string[] {
  return toWordGroups(syllables).map((indices) =>
    indices.map((i) => syllables[i].text).join(''),
  );
}
