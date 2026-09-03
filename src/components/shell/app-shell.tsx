import { Sidebar } from './sidebar';
import type { SidebarPlaylist } from './sidebar';

/**
 * App shell — sidebar tetap di kiri, konten menggulir di kanan.
 *
 * TopBar sengaja TIDAK dipasang di sini: setiap halaman punya judul (dan
 * kadang handler pencarian) sendiri, jadi halamanlah yang menaruhnya sebagai
 * anak pertama supaya `sticky top-0` menempel pada kontainer scroll ini.
 *
 * min-h-0 + min-w-0 wajib pada kolom flex: tanpa itu konten panjang (daftar
 * lagu, teks judul) memaksa kolom melebar dan sidebar ikut terdorong.
 */

export interface AppShellProps {
  /** Href rute aktif, diteruskan ke Sidebar. */
  active: string;
  playlists: SidebarPlaylist[];
  children: React.ReactNode;
}

export function AppShell({ active, playlists, children }: AppShellProps) {
  return (
    <div className="flex h-full">
      <Sidebar active={active} playlists={playlists} />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/*
          Wash warna ambient di belakang konten. `HomeAmbient` menulis
          `--laras-ambient-live` dari warna lagu yang sedang diputar; tanpa
          lagu, fallback hitam-ke-hitam membuatnya tak terlihat. Lapis ini
          hidup di shell (di luar kontainer scroll) supaya tidak ikut
          tergulir, dan selalu berada di bawah konten (z-10 pada scroll div).
        */}
        <div className="laras-home-ambient" aria-hidden="true" />
        {/* pb-[88px] menyisakan ruang agar baris terakhir tidak tertutup mini
            player yang nanti melayang di bawah. */}
        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto pb-[88px]">{children}</div>
      </div>
    </div>
  );
}
