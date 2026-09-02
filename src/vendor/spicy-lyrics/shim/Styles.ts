/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  SHIM LARAS — pengganti `src/utils/CSS/Styles.ts` milik spicy-lyrics
 *  (23 baris). File ini DITULIS untuk LARAS pada 2026-09-02.
 *  Repo asal: https://github.com/spikerko/spicy-lyrics
 *  Commit   : 4576d022b39e98291d71c75b0d4d355bcc332ced (2026-08-29)
 *
 *  Yang digantikan: dua pembantu DOM yang dipakai `Syllable.ts`/`Line.ts` untuk
 *  menerapkan `data.classes`/`data.styles` dari payload lirik ke pembungkus.
 *
 *  Yang HILANG karenanya: tidak ada. Perilakunya setara — hanya ditulis ulang
 *  di sini supaya modul upstream (yang hidup di pohon `utils/CSS` bersama
 *  penyuntik tema Spicetify) tidak perlu ikut di-vendor.
 *
 *  Catatan: LARAS memasok lirik dari TTML Apple, dan adapternya tidak mengirim
 *  `classes`/`styles`, jadi jalur ini praktis tidak terpakai.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface StyleProperties {
  [key: string]: string;
}

export function applyStyles(
  element: HTMLElement,
  styles: StyleProperties
): void {
  if (!element) {
    console.warn("Element not found");
    return;
  }
  for (const [key, value] of Object.entries(styles)) {
    element.style.setProperty(key, value);
  }
}

export function removeAllStyles(element: HTMLElement): void {
  if (!element) {
    console.warn("Element not found");
    return;
  }
  element.removeAttribute("style");
}
