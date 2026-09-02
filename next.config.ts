import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // Artwork Apple Music dilayani dari CDN mzstatic. Domainnya bernomor
    // (is1-ssl, is2-ssl, ... is5-ssl) dan bisa berganti antar respons, jadi
    // pola wildcard — bukan daftar host satu per satu.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.mzstatic.com',
      },
      {
        // Thumbnail YouTube sebagai artwork cadangan bila katalog tak punya.
        protocol: 'https',
        hostname: 'i.ytimg.com',
      },
    ],
  },
};

export default nextConfig;
