/**
 * Sidebar LARAS — navigasi tetap di kiri, ala Apple Music desktop.
 *
 * Server component: isinya murni statis (label + href), tidak ada state.
 * Halaman yang tahu rute aktifnya mengirim `active`, jadi sidebar tidak perlu
 * usePathname dan tidak menarik seluruh navigasi ke bundel klien.
 *
 * Lebar 260px dipatok di sini (bukan di app-shell) supaya satu-satunya sumber
 * kebenaran lebar navigasi ada di komponennya sendiri.
 */

import Link from 'next/link';

import { HomeIcon, PlaylistIcon, SearchIcon } from '@/components/ui/icons';

export interface SidebarPlaylist {
  slug: string;
  title: string;
}

export interface SidebarProps {
  /** Href rute yang sedang dibuka: '/', '/cari', atau '/playlist/<slug>'. */
  active: string;
  playlists: SidebarPlaylist[];
}

interface NavItemProps {
  href: string;
  label: string;
  active: boolean;
  icon: React.ReactNode;
}

/**
 * Satu baris navigasi.
 *
 * min-h 44px = target sentuh minimum rekomendasi Apple HIG; walau ini UI
 * desktop, ukurannya juga membuat area klik mouse tidak mudah terlewat.
 */
function NavItem({ href, label, active, icon }: NavItemProps) {
  return (
    <li>
      <Link
        href={href}
        // aria-current dipakai screen reader untuk mengumumkan halaman aktif;
        // warna aksen saja tidak cukup sebagai penanda.
        aria-current={active ? 'page' : undefined}
        className={`mx-3 flex min-h-[44px] items-center gap-3 rounded-[var(--radius-card)] px-3 py-2 text-sm font-medium transition-colors ${
          active
            ? 'bg-white/5 text-laras-accent'
            : 'text-laras-secondary hover:bg-white/5 hover:text-laras-text'
        }`}
      >
        {icon}
        <span className="truncate">{label}</span>
      </Link>
    </li>
  );
}

export function Sidebar({ active, playlists }: SidebarProps) {
  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col overflow-y-auto border-r border-laras-outline/40 bg-laras-surface">
      {/* Wordmark, bukan <h1>: judul halaman sesungguhnya dipasang top bar. */}
      <div className="px-6 py-5 font-display text-2xl font-bold tracking-tight">
        LARAS
      </div>

      <nav aria-label="Navigasi utama" className="pb-6">
        <ul>
          <NavItem
            href="/"
            label="Beranda"
            active={active === '/'}
            icon={<HomeIcon />}
          />
          <NavItem
            href="/cari"
            label="Cari"
            active={active === '/cari'}
            icon={<SearchIcon />}
          />
          <NavItem
            href="/koleksi"
            label="Koleksi"
            active={active === '/koleksi'}
            icon={
              /* Hati garis luar: ikon yang sama dengan tombol favorit, supaya
                 hubungan antara "menandai" dan "tempat yang ditandai" terlihat
                 tanpa perlu dijelaskan. */
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                <path d="M12 20.3l-1.1-1C6.1 15 3 12.2 3 8.8 3 6.1 5.1 4 7.8 4c1.5 0 3 .7 4.2 2.1C13.2 4.7 14.7 4 16.2 4 18.9 4 21 6.1 21 8.8c0 3.4-3.1 6.2-7.9 10.5z" />
              </svg>
            }
          />
        </ul>

        <h2 className="px-6 pt-6 pb-2 text-xs uppercase tracking-wider text-laras-tertiary">
          Playlist
        </h2>

        <ul>
          {playlists.map((playlist) => {
            const href = `/playlist/${playlist.slug}`;
            return (
              <NavItem
                key={playlist.slug}
                href={href}
                label={playlist.title}
                active={active === href}
                icon={<PlaylistIcon />}
              />
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
