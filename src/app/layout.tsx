import type { Metadata, Viewport } from 'next';
import { Inter, Inter_Tight } from 'next/font/google';
import './globals.css';

import { MiniPlayer } from '@/components/player/mini-player';
import { VideoDock } from '@/components/player/video-dock';
import { PlayerProvider } from '@/lib/player/player-context';

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
    >
      <body className="h-full overflow-hidden bg-laras-black text-laras-text">
        {/*
          PlayerProvider membungkus SELURUH aplikasi, termasuk children.

          Iframe YouTube hidup di dalam VideoDock yang dirender di sini, di luar
          `children`. Konsekuensinya: navigasi antar halaman mengganti children
          tetapi TIDAK menyentuh iframe, sehingga lagu terus berjalan. Kalau
          pemutar diletakkan di dalam halaman, setiap navigasi memuat ulang
          iframe dan audio berhenti.
        */}
        <PlayerProvider>
          {children}
          <VideoDock />
          <MiniPlayer />
        </PlayerProvider>
      </body>
    </html>
  );
}
