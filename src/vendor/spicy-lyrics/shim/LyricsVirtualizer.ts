/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  SHIM LARAS — pengganti `src/utils/Lyrics/LyricsVirtualizer.ts` milik
 *  spicy-lyrics (1006 baris). File ini DITULIS untuk LARAS pada 2026-09-02.
 *  Repo asal: https://github.com/spikerko/spicy-lyrics
 *  Commit   : 4576d022b39e98291d71c75b0d4d355bcc332ced (2026-08-29)
 *
 *  Yang digantikan: virtualizer `@tanstack/virtual-core` yang hanya memasang
 *  baris yang terlihat, mengukur tingginya, dan membungkus tiap baris dengan
 *  wrapper `position: absolute` + `padding-bottom` sebagai jarak antar-baris
 *  (1cqw normal, 0.2cqw untuk baris latar ke induknya).
 *
 *  Shim ini memasang SEMUA baris sekaligus — no-op yang tetap memanggil
 *  callback "elemen baru terpasang", sesuai permintaan. Callback itu penting:
 *  LyricsAnimator berlangganan lewat `setOnNewElementMounted` untuk mereset
 *  `Blurring_LastLine` supaya blur ditulis ulang ke elemen yang baru nyambung.
 *
 *  Yang HILANG karenanya:
 *  - Windowing. Lagu 935 suku kata memasang seluruh barisnya ke DOM. Untuk
 *    LARAS itu justru sejalan dengan HANDOFF.md §2(c) (struktur dirender
 *    sekali, animasi lewat satu rAF loop), tapi biaya layout awalnya nyata.
 *  - Jarak antar-baris. Upstream menaruhnya di padding wrapper; di sini baris
 *    ditempel langsung ke container, jadi JARAKNYA HARUS DATANG DARI CSS
 *    (margin/gap) di sisi LARAS. Kalau baris tampak mepet, ini penyebabnya.
 *  - `scrollLyricsToIndex`, `getLyricsVirtualizer`, `triggerRemeasureLV`, dan
 *    pengukuran ulang saat container berubah ukuran.
 * ═══════════════════════════════════════════════════════════════════════════
 */

let onNewElementMounted: (() => void) | null = null;
let mountedContainer: HTMLElement | null = null;

/**
 * @param _scrollEl elemen scroll — tidak dipakai tanpa windowing, tapi tetap
 *                  diterima supaya tanda tangannya sama dengan upstream.
 */
export function initLyricsVirtualizer(
  _scrollEl: HTMLElement,
  virtualContainer: HTMLElement,
  lineElements: HTMLElement[]
): void {
  mountedContainer = virtualContainer;

  // Satu fragment: satu kali sentuh layout untuk semua baris.
  const fragment = document.createDocumentFragment();
  for (const lineElement of lineElements) {
    fragment.appendChild(lineElement);
  }
  virtualContainer.appendChild(fragment);

  // Di upstream callback ini berbunyi setiap kali jendela virtual bergeser.
  // Di sini hanya sekali, karena semua elemen terpasang sekali.
  onNewElementMounted?.();
}

export function destroyLyricsVirtualizer(): void {
  if (mountedContainer) {
    mountedContainer.textContent = "";
    mountedContainer = null;
  }
}

export function setOnNewElementMounted(cb: (() => void) | null): void {
  onNewElementMounted = cb;
}
