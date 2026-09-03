'use client';

/**
 * Konteks sidebar — satu keadaan buka/tutup untuk seluruh aplikasi.
 *
 * KENAPA STORE DI LUAR REACT (`useSyncExternalStore`), BUKAN useState:
 *
 * Tombolnya hidup di TopBar, kerangkanya di AppShell, dan keduanya bukan
 * pasangan induk-anak — keduanya anak dari halaman. Menaikkan `useState` ke
 * tempat yang bisa dilihat keduanya berarti menaruhnya di root layout, dan itu
 * membuat SETIAP halaman ikut dirender ulang setiap kali sidebar dibuka. Store
 * kecil di luar React membuat yang dirender ulang hanya yang benar-benar
 * membaca nilainya. Polanya sama persis dengan `collection-context.tsx`.
 *
 * KENAPA ATRIBUT DI <html> IKUT DITULIS: lebar kerangka diurus CSS lewat
 * `[data-sidebar='closed']`, bukan cabang render. Dengan begitu skrip inline di
 * <head> bisa menetapkan lebar yang benar sebelum cat pertama, dan tidak ada
 * kedipan 260px saat memuat halaman lirik dengan pilihan "tertutup".
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import {
  SIDEBAR_ATTRIBUTE,
  SIDEBAR_DEFAULT_OPEN,
  SIDEBAR_STORAGE_KEY,
  isSidebarShortcut,
  parseSidebarOpen,
  sidebarAttributeValue,
} from '@/lib/shell/sidebar';

/* ── Store di luar React ───────────────────────────────────────────────── */

const listeners = new Set<() => void>();

/**
 * Sumber kebenaran di klien.
 *
 * Dibaca dari atribut <html> lebih dulu, BUKAN dari localStorage: skrip inline
 * sudah menaruh nilainya di sana sebelum bundel ini jalan, jadi atribut itulah
 * yang sedang benar-benar terlihat di layar. Membaca localStorage lagi hanya
 * mengulang pekerjaan yang sama.
 */
let snapshot: boolean | null = null;

function readAttribute(): boolean {
  const value = document.documentElement.getAttribute(SIDEBAR_ATTRIBUTE);
  if (value === 'open' || value === 'closed') return parseSidebarOpen(value);

  /* Atribut belum ada berarti skrip inline gagal (CSP memblokir inline script,
     atau localStorage dilarang). Penyimpanan tetap dicoba supaya pilihan
     pengguna tidak hilang sepenuhnya di kasus itu. */
  try {
    return parseSidebarOpen(window.localStorage.getItem(SIDEBAR_STORAGE_KEY));
  } catch {
    return SIDEBAR_DEFAULT_OPEN;
  }
}

function getSnapshot(): boolean {
  if (snapshot === null) snapshot = readAttribute();
  return snapshot;
}

/** Server tidak punya localStorage; default terbuka adalah jawaban yang benar. */
function getServerSnapshot(): boolean {
  return SIDEBAR_DEFAULT_OPEN;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);

  /* Perubahan dari TAB LAIN. Snapshot yang di-cache wajib dibuang lebih dulu,
     kalau tidak React membandingkan nilai lama dengan nilai lama dan tidak
     merender apa pun. */
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== SIDEBAR_STORAGE_KEY) return;
    snapshot = parseSidebarOpen(event.newValue ?? null);
    applyAttribute(snapshot);
    onChange();
  };

  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function applyAttribute(open: boolean): void {
  document.documentElement.setAttribute(SIDEBAR_ATTRIBUTE, sidebarAttributeValue(open));
}

function setOpen(open: boolean): void {
  if (getSnapshot() === open) return;

  snapshot = open;
  applyAttribute(open);

  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarAttributeValue(open));
  } catch {
    /* Kuota penuh atau penyimpanan diblokir: pilihan tetap berlaku untuk sesi
       ini, hanya tidak bertahan. Tombol yang tidak bereaksi jauh lebih buruk. */
  }

  for (const listener of listeners) listener();
}

/* ── React ─────────────────────────────────────────────────────────────── */

export interface SidebarContextValue {
  open: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const open = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => setOpen(!getSnapshot()), []);

  /*
   * Pintasan Ctrl/⌘+B dipasang SEKALI di provider, bukan di tombolnya.
   *
   * Tombol bisa tidak ada — halaman error dan not-found tidak memasang TopBar —
   * sedangkan pintasan harus tetap bekerja di mana saja. Listener di dokumen
   * juga berarti pintasan tidak butuh fokus di elemen tertentu.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSidebarShortcut(event)) return;

      /* Firefox memakai Ctrl+B untuk bookmark sidebar; halaman yang menangani
         kombinasi ini wajib mencegah aksi bawaan browser. */
      event.preventDefault();
      setOpen(!getSnapshot());
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /*
   * Menegakkan ulang atribut setelah hydrate.
   *
   * React 19 Strict Mode (hanya di dev) me-remount sekali dan saat itu ia
   * menyetel ulang atribut <html> ke yang dikelolanya dari JSX — atribut dari
   * skrip inline ikut terhapus. Ini no-op di produksi. Lihat
   * `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`
   * bagian "Re-applying attributes in development".
   */
  useEffect(() => {
    applyAttribute(open);
  }, [open]);

  const value = useMemo<SidebarContextValue>(
    () => ({ open, toggle, setOpen }),
    [open, toggle],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (ctx === null) {
    throw new Error('useSidebar harus dipakai di dalam <SidebarProvider>');
  }
  return ctx;
}
