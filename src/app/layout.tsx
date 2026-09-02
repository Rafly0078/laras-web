import type { Metadata, Viewport } from 'next';
import { Inter, Inter_Tight } from 'next/font/google';
import './globals.css';

import { MiniPlayer } from '@/components/player/mini-player';
import { PlayHistoryRecorder } from '@/components/player/play-history-recorder';
import { VideoDock } from '@/components/player/video-dock';
import { SITE_URL } from '@/lib/metadata';
import { CollectionProvider } from '@/lib/player/collection-context';
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
        {/*
          CollectionProvider di LUAR PlayerProvider: riwayat & favorit hidup di
          localStorage dan tidak bergantung pada pemutar, sedangkan perekam
          riwayat butuh keduanya. Urutan ini membuat ketergantungannya satu arah.
        */}
        <CollectionProvider>
          <PlayerProvider>
            {children}
            <VideoDock />
            <MiniPlayer />
            <PlayHistoryRecorder />
          </PlayerProvider>
        </CollectionProvider>
      </body>
    </html>
  );
}
