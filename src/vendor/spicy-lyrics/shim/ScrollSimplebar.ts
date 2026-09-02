/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  SHIM LARAS — pengganti `src/utils/Scrolling/Simplebar/ScrollSimplebar.ts`
 *  milik spicy-lyrics (73 baris). File ini DITULIS untuk LARAS pada 2026-09-02.
 *  Repo asal: https://github.com/spikerko/spicy-lyrics
 *  Commit   : 4576d022b39e98291d71c75b0d4d355bcc332ced (2026-08-29)
 *
 *  Yang digantikan: pemasangan scrollbar kustom `simplebar` di atas
 *  `.LyricsContainer .LyricsContent`, plus interval yang menyembunyikan
 *  scrollbar saat pointer keluar dari pane.
 *
 *  Kenapa tidak di-vendor: `simplebar` adalah dependency npm penuh yang cuma
 *  dipakai untuk gaya scrollbar; LARAS memakai scroller biasa. Yang benar-benar
 *  dibutuhkan kode vendor dari modul ini hanya SATU nilai: elemen yang
 *  di-scroll, lewat `ScrollSimplebar?.getScrollElement()` — dipakai sebagai
 *  gerbang sebelum memanggil `initLyricsVirtualizer`.
 *
 *  Yang HILANG karenanya: scrollbar bergaya simplebar, auto-hide-nya,
 *  `isDragging`, dan elemen `.simplebar-content` (upstream mencarinya untuk
 *  menerapkan `data.classes`/`data.styles`; tanpa itu Applyer hanya mencatat
 *  peringatan dan jalan terus).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getLyricsScrollElement } from "./PageView";

/**
 * Permukaan simplebar seminimal yang dipakai kode vendor.
 * `getScrollElement()` sengaja mengembalikan `HTMLElement` (bukan
 * `HTMLElement | null`) supaya `as HTMLElement | undefined` di Applyer tetap
 * berupa cast yang sah — stub ini hanya dibuat kalau elemennya memang ada.
 */
export interface ScrollbarLike {
  getScrollElement(): HTMLElement;
  recalculate(): void;
  unMount(): void;
  isDragging: boolean;
}

/** `let`, karena kode vendor membacanya sebagai live binding. */
export let ScrollSimplebar: ScrollbarLike | null = null;

export function MountScrollSimplebar(): void {
  const scrollElement = getLyricsScrollElement();
  if (!scrollElement) {
    // Sama seperti upstream: peringatan, bukan throw.
    console.warn("Cannot mount ScrollSimplebar: scroll element not found");
    return;
  }

  ScrollSimplebar = {
    getScrollElement: () => scrollElement,
    // Tanpa simplebar tidak ada geometri buatan yang perlu dihitung ulang.
    recalculate: () => {},
    unMount: () => {},
    isDragging: false,
  };
}

export function ClearScrollSimplebar(): void {
  ScrollSimplebar?.unMount();
  ScrollSimplebar = null;
}

export function RecalculateScrollSimplebar(): void {
  ScrollSimplebar?.recalculate();
}
