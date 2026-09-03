import type { Metadata, Viewport } from 'next';
import { Inter, Inter_Tight } from 'next/font/google';
import './globals.css';

import { MiniPlayer } from '@/components/player/mini-player';
import { PlayHistoryRecorder } from '@/components/player/play-history-recorder';
import { VideoDock } from '@/components/player/video-dock';
import { SITE_URL } from '@/lib/metadata';
import { CollectionProvider } from '@/lib/player/collection-context';
import { PlayerProvider } from '@/lib/player/player-context';
import { SIDEBAR_ATTRIBUTE, SIDEBAR_BOOT_SCRIPT, SIDEBAR_DEFAULT_OPEN, sidebarAttributeValue } from '@/lib/shell/sidebar';
import { SidebarProvider } from '@/lib/shell/sidebar-context';

/* Inter + Inter Tight = pengganti SF Pro (keputusan sama seperti LARAS Android). */
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const interTight = Inter_Tight({
  variable: '--font-inter-tight',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  /* Halaman detail menulis `og:url` dan canonical sebagai path relatif; tanpa
     basis ini Next tidak bisa menyelesaikannya jadi URL absolut. */
  metadataBase: SITE_URL,
  title: 'LARAS',
  description:
    'Pemutar musik dengan lirik tersinkron per kata. Katalog Apple Music, audio YouTube Music.',
  applicationName: 'LARAS',
};

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="id"
      className={`${inter.variable} ${interTight.variable} h-full antialiased`}
      /*
        Keadaan sidebar sebagai ATRIBUT, bukan cabang render.

        Nilainya hidup di localStorage — tidak ada di server — jadi HTML dikirim
        dengan default terbuka, lalu skrip di <head> di bawah memperbaikinya
        SEBELUM cat pertama kalau pengguna memilih tertutup. Tanpa itu, membuka
        halaman lirik dengan pilihan "tertutup" akan berkedip 260px setelah
        hydrate. `suppressHydrationWarning` wajib karena skrip itu mengubah
        atribut ini sebelum React membandingkan DOM dengan hasil render server;
        lihat node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md.
      */
      data-sidebar={sidebarAttributeValue(SIDEBAR_DEFAULT_OPEN)}
      suppressHydrationWarning
    >
      <head>
        {/* Satu ekspresi sinkron, dirakit dari konstanta yang sama dengan yang
            dibaca React (lib/shell/sidebar.ts) supaya kunci penyimpanan dan nama
            atribut tidak bisa berbeda antar keduanya. */}
        <script
          data-laras-boot={SIDEBAR_ATTRIBUTE}
          dangerouslySetInnerHTML={{ __html: SIDEBAR_BOOT_SCRIPT }}
        />
      </head>
      <body className="h-full overflow-hidden bg-laras-black text-laras-text">
        {/*
          PlayerProvider membungkus SELURUH aplikasi, termasuk children.

          Iframe YouTube hidup di dalam VideoDock yang dirender di sini, di luar
          `children` — dan di-parkir di luar layar (LARAS audio-only).
          Konsekuensinya: navigasi antar halaman mengganti children tetapi
          TIDAK menyentuh iframe, sehingga lagu terus berjalan. Kalau
          pemutar diletakkan di dalam halaman, setiap navigasi memuat ulang
          iframe dan audio berhenti.
        */}
        {/*
          CollectionProvider di LUAR PlayerProvider: riwayat & favorit hidup di
          localStorage dan tidak bergantung pada pemutar, sedangkan perekam
          riwayat butuh keduanya. Urutan ini membuat ketergantungannya satu arah.
        */}
        <CollectionProvider>
          <PlayerProvider>
            {/*
              SidebarProvider di dalam: tombolnya (TopBar) ada di halaman, dan
              tombol itu perlu keadaan yang sama dengan kerangka (AppShell) —
              keduanya anak dari `children`. Provider ini juga yang memasang
              pintasan Ctrl/⌘+B, jadi pintasannya tetap bekerja di halaman yang
              tidak memasang TopBar (error, 404).
            */}
            <SidebarProvider>{children}</SidebarProvider>
            <VideoDock />
            <MiniPlayer />
            <PlayHistoryRecorder />
          </PlayerProvider>
        </CollectionProvider>
      </body>
    </html>
  );
}
