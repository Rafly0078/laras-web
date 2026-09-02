/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  SHIM LARAS — pengganti `src/components/Pages/PageView.ts` milik
 *  spicy-lyrics (800 baris).
 *  Repo asal: https://github.com/spikerko/spicy-lyrics
 *  Commit   : 4576d022b39e98291d71c75b0d4d355bcc332ced (2026-08-29)
 *  Nama kelas DOM di bawah disalin dari file itu; hak cipta (c) Spikerko,
 *  AGPL-3.0. File ini DITULIS untuk LARAS pada 2026-09-02.
 *
 *  Yang digantikan: seluruh "halaman" Spicetify — ia menyuntik markup lirik ke
 *  dalam DOM Spotify, mengurus rute Spicetify, tombol fullscreen/compact,
 *  loader, kontrol tampilan, dan MENYIMPAN elemen hasilnya di `PageContainer`.
 *  Mesin lirik hanya butuh satu hal dari 800 baris itu: `PageContainer`, dan
 *  selalu untuk mencari `.LyricsContainer .LyricsContent` di dalamnya.
 *
 *  Di sini elemennya DITERIMA dari pemanggil (adapter React), bukan dicari di
 *  DOM Spotify: `setLyricsPageContainer(el)`.
 *
 *  Yang HILANG karenanya: navigasi/rute, loader titik, ViewControls,
 *  fullscreen & compact mode, kelas `SimpleLyricsMode`/`MinimalLyricsMode`
 *  yang upstream pasang di container saat setelan berubah, dan seluruh
 *  daur hidup halaman (Open/Close/Destroy).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { $lyricsContainerExists } from "./stores";

/**
 * Elemen induk pane lirik. `let` (bukan const) karena SEMUA pemakai di kode
 * vendor mengimpornya sebagai live binding: `PageContainer?.querySelector(...)`
 * dievaluasi ulang setiap panggilan, jadi menukar nilainya di sini langsung
 * terlihat di sana.
 */
export let PageContainer: HTMLElement | null = null;

/** Elemen yang di-scroll. Dipakai shim ScrollSimplebar. */
let ScrollElement: HTMLElement | null = null;

/*
 * Kerangka yang WAJIB ada di dalam container: kode vendor mencari
 * `.LyricsContainer .LyricsContent` untuk menempelkan hasilnya, dan CSS
 * upstream (di ../css) menggantung hampir semua selektornya di dua kelas itu.
 * Kalau adapter belum menyediakannya, kerangka dibuat di sini sekali —
 * lebih murah daripada memaksa setiap pemanggil menghafal nama kelas.
 */
function ensureSkeleton(container: HTMLElement): HTMLElement {
  let content = container.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent"
  );
  if (content) return content;

  let lyricsContainer =
    container.querySelector<HTMLElement>(".LyricsContainer");
  if (!lyricsContainer) {
    lyricsContainer = document.createElement("div");
    lyricsContainer.classList.add("LyricsContainer");
    container.appendChild(lyricsContainer);
  }

  content = document.createElement("div");
  // "ScrollbarScrollable" ikut dipasang persis seperti markup upstream.
  content.classList.add("LyricsContent", "ScrollbarScrollable");
  lyricsContainer.appendChild(content);
  return content;
}

/**
 * Serahkan elemen pane lirik ke mesin. Panggil dengan `null` saat komponen
 * dilepas — itu sekaligus menutup pintu `ApplySyllableLyrics`/`ApplyLineLyrics`
 * lewat `$lyricsContainerExists`.
 *
 * @param container elemen induk; kerangka `.LyricsContainer .LyricsContent`
 *                  dibuat di dalamnya kalau belum ada.
 * @param scrollElement elemen yang benar-benar di-scroll. Default: elemen
 *                  `.LyricsContent` tadi.
 */
export function setLyricsPageContainer(
  container: HTMLElement | null,
  scrollElement?: HTMLElement | null
): void {
  PageContainer = container;

  if (!container) {
    ScrollElement = null;
    $lyricsContainerExists.set(false);
    return;
  }

  const content = ensureSkeleton(container);
  ScrollElement = scrollElement ?? content;
  $lyricsContainerExists.set(true);
}

/** Dipakai shim ScrollSimplebar; bukan bagian dari permukaan upstream. */
export function getLyricsScrollElement(): HTMLElement | null {
  return ScrollElement;
}
