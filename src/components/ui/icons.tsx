/**
 * Ikon LARAS — SVG inline, bukan paket ikon.
 *
 * Kenapa inline: lucide-react v1.x sudah membuang beberapa ikon dan pernah
 * memecahkan build; ikon yang kita butuh cuma delapan. Semua diberi
 * aria-hidden karena selalu didampingi label teks atau aria-label di tombol.
 */

interface IconProps {
  className?: string;
}

const BASE = 'h-5 w-5 shrink-0';

export function HomeIcon({ className = BASE }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 3.2 3 10.3V21h6.4v-6.1h5.2V21H21V10.3z" />
    </svg>
  );
}

export function SearchIcon({ className = BASE }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4.5 4.5" />
    </svg>
  );
}

export function PlaylistIcon({ className = BASE }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 6h16M4 11h16M4 16h9" />
      <circle cx="17.5" cy="17" r="2.5" />
    </svg>
  );
}

/**
 * Panel dengan kolom kiri — ikon untuk tombol buka/tutup sidebar.
 *
 * Bentuknya sengaja SATU untuk kedua keadaan: yang menyampaikan keadaan adalah
 * `aria-expanded` di tombolnya dan sidebar itu sendiri yang terlihat/tidak.
 * Ikon yang ikut berubah (mis. panah bolak-balik) memaksa pengguna membaca
 * arah panah untuk menebak apa yang akan terjadi — di Apple Music, VS Code, dan
 * Finder ikonnya juga tetap.
 */
export function SidebarIcon({ className = BASE }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
    </svg>
  );
}

export function PlayIcon({ className = BASE }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 5l12 7-12 7z" />
    </svg>
  );
}

export function PauseIcon({ className = BASE }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M7 5h4v14H7zm6 0h4v14h-4z" />
    </svg>
  );
}

export function ChevronLeftIcon({ className = BASE }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m14 6-6 6 6 6" />
    </svg>
  );
}

export function ChevronRightIcon({ className = BASE }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m10 6 6 6-6 6" />
    </svg>
  );
}

/** Placeholder artwork: nada musik samar di atas kotak kosong. */
export function NoteIcon({ className = 'h-1/3 w-1/3 opacity-25' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M9 18.5a2.5 2.5 0 1 1-2.5-2.5c.4 0 .8.1 1.1.2V6.8l9.4-2.3v2.1L9.6 8.6v7.7c-.4-.2-.4.1-.6 2.2z" />
      <path d="M19 14.5a2.5 2.5 0 1 1-2.5-2.5c.4 0 .8.1 1.1.2V6.8l1.4-.3z" />
    </svg>
  );
}
