/**
 * Keadaan sidebar — logika MURNI (tanpa DOM, tanpa React).
 *
 * Dipisah dari komponen supaya tiga hal yang mudah salah bisa diuji tanpa
 * browser: bagaimana nilai tersimpan dibaca, bagaimana ia dipetakan ke atribut
 * DOM, dan kombinasi tombol mana yang dianggap pintasan.
 *
 * KENAPA ATRIBUT, BUKAN CABANG RENDER: nilainya hidup di localStorage, yang
 * tidak ada di server. Kalau sidebar dirender-atau-tidak berdasarkan state
 * React, kunjungan pertama dengan pilihan "tertutup" akan MENAMPILKAN sidebar
 * lebih dulu lalu mengempiskannya setelah hydrate — kedipan 260px yang persis
 * paling mengganggu di halaman lirik. Jadi sidebar SELALU ada di markup, dan
 * yang berubah hanya satu atribut di <html> yang sudah diset oleh skrip inline
 * sebelum cat pertama. Lihat `SIDEBAR_BOOT_SCRIPT`.
 */

export const SIDEBAR_STORAGE_KEY = 'laras.sidebar.v1';

/** Atribut pada <html> yang dibaca CSS. */
export const SIDEBAR_ATTRIBUTE = 'data-sidebar';

/** Terbuka adalah default: pengguna baru harus melihat navigasinya. */
export const SIDEBAR_DEFAULT_OPEN = true;

export type SidebarAttributeValue = 'open' | 'closed';

/**
 * Hanya dua string yang diakui, dan apa pun selain itu (null, sisa versi lama,
 * JSON kacau) jatuh ke default. Penyimpanan milik pengguna, bukan milik kita —
 * ia bisa berisi apa saja, dan itu tidak boleh membuat kerangka aplikasi hilang.
 */
export function parseSidebarOpen(raw: string | null): boolean {
  if (raw === 'closed') return false;
  if (raw === 'open') return true;
  return SIDEBAR_DEFAULT_OPEN;
}

export function sidebarAttributeValue(open: boolean): SidebarAttributeValue {
  return open ? 'open' : 'closed';
}

/** Bentuk minimum event papan tunggal yang dibutuhkan `isSidebarShortcut`. */
export interface SidebarShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Ctrl+B (Windows/Linux) atau ⌘+B (macOS) — pintasan yang sama dengan VS Code.
 *
 * Alt dan Shift ditolak dengan sengaja: `Ctrl+Shift+B` dan `Ctrl+Alt+B` adalah
 * pintasan lain di banyak aplikasi, dan menelan keduanya berarti mencuri
 * kombinasi yang bukan milik kita.
 */
export function isSidebarShortcut(event: SidebarShortcutEvent): boolean {
  if (event.altKey || event.shiftKey) return false;
  if (!event.ctrlKey && !event.metaKey) return false;
  return event.key.toLowerCase() === 'b';
}

/**
 * Skrip yang berjalan SEBELUM cat pertama, disisipkan di <head>.
 *
 * Tugasnya satu baris: pindahkan pilihan tersimpan ke atribut <html> supaya CSS
 * sudah tahu lebar kerangka pada frame pertama. try/catch karena localStorage
 * bisa dilarang sepenuhnya (mode privat ketat, kebijakan perusahaan) — dan
 * kegagalan membaca preferensi tidak boleh menghentikan pemuatan halaman.
 *
 * Dirakit dari konstanta di atas, jadi kunci penyimpanan dan nama atribut tidak
 * bisa berbeda antara skrip ini dan kode React yang membacanya.
 */
export const SIDEBAR_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem(${JSON.stringify(
  SIDEBAR_STORAGE_KEY,
)});if(v==="closed"||v==="open")document.documentElement.setAttribute(${JSON.stringify(
  SIDEBAR_ATTRIBUTE,
)},v)}catch(e){}})()`;
