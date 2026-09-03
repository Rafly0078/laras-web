/**
 * Kartu bagikan untuk empat halaman detail: lagu, album, artis, playlist.
 *
 * Dikumpulkan di satu file karena keempatnya memakai pola judul, aturan
 * artwork, dan bentuk kartu yang sama — ditulis empat kali berarti empat
 * tempat yang bisa menyimpang diam-diam.
 *
 * SEMUA fungsi di sini MURNI: menerima data yang SUDAH diambil dan
 * mengembalikan objek `Metadata`. Tanpa fetch dan tanpa `server-only`, jadi
 * pola judul serta perilaku fallback-nya bisa diuji terhadap fixture nyata
 * tanpa menyentuh relay.
 *
 * YANG TIDAK BOLEH MASUK KE SINI: apa pun yang menunggu `/lyrics`. Untuk bot
 * HTML-limited, Next MENAHAN halaman sampai `generateMetadata` selesai
 * (HANDOFF §4 #14), sementara `/lyrics` butuh 9,5–11,5 detik untuk lagu yang
 * belum pernah diminta. Menunggunya di sini membatalkan streaming lirik
 * (§2(d)) untuk SETIAP crawler — dan judul serta deskripsi memang tidak
 * membutuhkan liriknya.
 */

import type { Metadata } from 'next';

import { artworkUrl } from '@/lib/data/apple';
import type { Album, Artist, Artwork, Playlist, Track } from '@/lib/types';

/** Ekor setiap judul, dan isi `og:site_name`. */
const SITE_NAME = 'LARAS';

/** Sama dengan `<html lang="id">` di root layout. */
const OG_LOCALE = 'id_ID';

/**
 * Sisi artwork untuk kartu bagikan, dalam piksel.
 *
 * KENAPA SATU GAMBAR PERSEGI 1200 DAN BUKAN OG IMAGE DINAMIS 1200×630:
 * satu-satunya gambar yang app ini punya adalah sampul Apple, dan sampul Apple
 * selalu persegi. `opengraph-image.tsx` + `ImageResponse` berarti empat rute
 * baru dan satu jalur render runtime (satori + resvg, plus pemuatan font) yang
 * bisa gagal sendiri — sementara hasilnya sampul yang SAMA, ditempel di tengah
 * kanvas 1200×630 dengan dua bidang kosong di kiri-kanan. Tidak ada informasi
 * baru yang dibeli dengan biaya itu.
 *
 * Yang paling sederhana DAN benar: kirim sampulnya apa adanya, lalu sebutkan
 * dimensinya dengan jujur. Yang merusak pratinjau bukan rasio non-2:1,
 * melainkan dimensi yang dibohongi — platform memakai width/height untuk
 * memesan tempat sebelum gambarnya turun.
 *
 * 1200 karena ambang "gambar besar" Facebook/X ada di 600px, dan halaman lagu
 * sudah memanggil `artworkUrl(artwork, 1200)` untuk artwork utamanya: ukuran
 * itu terbukti dilayani CDN mzstatic, bukan sekadar diharapkan bekerja.
 */
const OG_ARTWORK_SIZE = 1200;

/**
 * Basis URL absolut untuk `og:url` dan `<link rel="canonical">`.
 *
 * Dipakai sebagai `metadataBase` di root layout supaya keempat halaman cukup
 * menulis path relatif. Fallback-nya wajib ada DAN wajib tidak melempar:
 * `metadataBase` dievaluasi saat modul layout dimuat, jadi `new URL(undefined)`
 * di sana mematikan SELURUH app sebelum satu halaman pun dirender — dan repo
 * ini belum punya `.env`. Nilai yang tidak bisa di-parse diperlakukan sama
 * seperti tidak diset.
 *
 * Produksi WAJIB menyetel `NEXT_PUBLIC_SITE_URL`; kalau tidak, `og:url` dan
 * canonical menunjuk localhost.
 */
export const SITE_URL: URL = resolveSiteUrl();

function resolveSiteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw !== undefined && raw !== '') {
    try {
      return new URL(raw);
    } catch {
      // Konfigurasi yang salah bukan alasan halaman gagal dirender.
    }
  }
  return new URL('http://localhost:3000');
}

/* ── Perakit kecil ─────────────────────────────────────────────────────── */

/** Gabung bagian yang mungkin kosong; yang kosong DIBUANG, bukan jadi spasi. */
function joinParts(parts: (string | null)[], separator = ' '): string {
  return parts.filter((p): p is string => p !== null && p !== '').join(separator);
}

/**
 * `<title>` dan `og:title`: "<subjek> — <konteks> · LARAS".
 *
 * Konteks kosong (artis yang tidak dikirim katalog, kurator null) MENGHAPUS
 * klausa em-dash-nya alih-alih mengisinya "tidak diketahui": judul yang lebih
 * pendek lebih baik daripada judul yang berisi permintaan maaf.
 *
 * Hasilnya sudah memuat "· LARAS", jadi halaman memasangnya lewat
 * `title.absolute` — supaya judul ini tidak digandakan kalau root layout kelak
 * memasang `title.template`.
 */
function pageTitle(subject: string, context: string | null): string {
  return joinParts([joinParts([subject, context], ' — '), SITE_NAME], ' · ');
}

/**
 * `og:image` dari artwork Apple, atau `undefined` kalau katalog tidak mengirim
 * artwork — kartu tanpa gambar lebih baik daripada kartu dengan gambar rusak.
 */
function shareImages(artwork: Artwork | null, alt: string) {
  const url = artworkUrl(artwork, OG_ARTWORK_SIZE);
  if (artwork === null || url === null) return undefined;

  /* Dimensi HANYA disebut kalau kita sendiri yang mengisinya. Jalur
     `parsed_tracks` relay mengirim URL berukuran tetap yang sudah jadi
     (`.../600x600bb.jpg` di fixtures/apple/playlist-*.json) dan `artworkUrl`
     mengembalikannya apa adanya; mengaku 1200×1200 di situ membuat platform
     memesan kotak yang salah lalu menyusutkan gambarnya. */
  const filledIn = artwork.template.includes('{w}');

  return [
    filledIn
      ? { url, alt, width: OG_ARTWORK_SIZE, height: OG_ARTWORK_SIZE }
      : { url, alt },
  ];
}

/** Bentuk yang dipakai `openGraph.images` maupun `twitter.images`. */
type ShareImages = ReturnType<typeof shareImages>;

/**
 * Kartu X/Twitter.
 *
 * `summary`, BUKAN `summary_large_image`: satu-satunya gambar yang kita punya
 * berbentuk persegi, dan `summary_large_image` memotongnya jadi 2:1 — membuang
 * kepala dan kaki sampul. `summary` menampilkannya 1:1, utuh.
 */
function twitterCard(
  title: string,
  description: string,
  images: ShareImages,
): Metadata['twitter'] {
  return { card: 'summary', title, description, images };
}

/**
 * Metadata untuk URL yang datanya tidak bisa dimuat.
 *
 * `index: false` bukan hiasan: relay pihak ketiga kadang gagal, dan tanpa ini
 * mesin pencari bisa mengindeks "tidak bisa dimuat" sebagai isi kanonik URL
 * tersebut. Tanpa openGraph juga — tidak ada apa pun yang layak dibagikan.
 */
function missingMetadata(kind: string, description: string): Metadata {
  return {
    title: { absolute: `${kind} tidak tersedia · ${SITE_NAME}` },
    description,
    robots: { index: false },
  };
}

/* ── Lagu ──────────────────────────────────────────────────────────────── */

export function trackMetadata(id: string, track: Track | null): Metadata {
  if (track === null) {
    return missingMetadata(
      'Lagu',
      `Lagu ini tidak bisa dimuat dari katalog. Cari lagu lain di ${SITE_NAME}.`,
    );
  }

  const path = `/lagu/${id}`;
  const title = pageTitle(track.title, track.artist);
  const subject = joinParts([track.title, track.artist], ' dari ');
  const description = joinParts([
    `Putar ${subject} di ${SITE_NAME} dengan lirik tersinkron per kata.`,
    track.album === null ? null : `Dari album ${track.album}.`,
  ]);
  const images = shareImages(track.artwork, `Sampul ${track.album ?? track.title}`);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'music.song',
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: OG_LOCALE,
      images,
      /* `music:duration` didefinisikan dalam DETIK bulat; tipe internal
         menyimpan detik pecahan, dan 0 berarti katalog tidak mengirim durasi
         sama sekali — lebih baik tidak menyebutkannya daripada mengaku 0. */
      duration:
        track.durationSeconds > 0 ? Math.round(track.durationSeconds) : undefined,
    },
    twitter: twitterCard(title, description, images),
  };
}

/* ── Album ─────────────────────────────────────────────────────────────── */

export function albumMetadata(id: string, album: Album | null): Metadata {
  if (album === null) {
    return missingMetadata(
      'Album',
      `Album ini tidak bisa dimuat dari katalog. Cari album lain di ${SITE_NAME}.`,
    );
  }

  const path = `/album/${id}`;
  const title = pageTitle(album.title, joinParts(['Album', album.artist]));

  /* Tahun rilis = empat digit pertama `releaseDate` ("2022-03-03"). Divalidasi
     karena field ini datang dari relay pihak ketiga dan bentuknya tidak
     dijamin; tahun yang salah di deskripsi lebih buruk daripada tanpa tahun. */
  const year = /^\d{4}/.exec(album.releaseDate ?? '')?.[0] ?? null;
  const subject = joinParts([album.title, album.artist], ' dari ');
  const description =
    `${album.trackCount} lagu di album ${subject}` +
    `${year === null ? '' : ` (${year})`}. ` +
    `Putar dengan lirik tersinkron per kata di ${SITE_NAME}.`;
  const images = shareImages(album.artwork, `Sampul ${album.title}`);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'music.album',
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: OG_LOCALE,
      images,
      releaseDate: album.releaseDate ?? undefined,
    },
    twitter: twitterCard(title, description, images),
  };
}

/* ── Artis ─────────────────────────────────────────────────────────────── */

export function artistMetadata(id: string, artist: Artist | null): Metadata {
  if (artist === null) {
    return missingMetadata(
      'Artis',
      `Artis ini tidak bisa dimuat dari katalog. Cari artis lain di ${SITE_NAME}.`,
    );
  }

  const path = `/artis/${id}`;
  const title = pageTitle(artist.name, 'Artis');

  /* Dua genre saja: Apple mengirim sampai lima ("Indo Pop", "Music", "Pop" di
     fixtures/apple/album-manusia.json), sementara hasil pencarian memotong
     deskripsi di sekitar 160 karakter — genre ketiga ke atas hanya mendorong
     kalimat pentingnya keluar dari potongan itu. */
  const genres = artist.genres.slice(0, 2).join(', ');
  const description =
    `Lagu teratas dan diskografi ${artist.name}` +
    `${genres === '' ? '' : ` — ${genres}`}. ` +
    `Putar dengan lirik tersinkron per kata di ${SITE_NAME}.`;
  const images = shareImages(artist.artwork, `Foto ${artist.name}`);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      /* Spesifikasi OG tidak punya tipe "music.artist" (daftar lengkapnya ada
         di `OpenGraphType` milik Next); `profile` adalah tipe untuk halaman
         seseorang, dan itu yang paling dekat dengan halaman artis. */
      type: 'profile',
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: OG_LOCALE,
      images,
    },
    twitter: twitterCard(title, description, images),
  };
}

/* ── Playlist ──────────────────────────────────────────────────────────── */

/**
 * `meta` datang dari konstanta `HOME_PLAYLISTS` (judul + kurator), `playlist`
 * dari relay. Keduanya dipisah karena bedanya penting: judul playlist SELALU
 * ada meski relay gagal, jadi playlist yang gagal dimuat tetap punya kartu
 * bagikan yang benar — hanya tanpa jumlah lagu dan tanpa sampul.
 */
export function playlistMetadata(
  slug: string,
  meta: { title: string; curator: string | null } | null,
  playlist: Playlist | null,
): Metadata {
  if (meta === null) {
    return missingMetadata(
      'Playlist',
      `Playlist ini tidak ada di ${SITE_NAME}. Lihat playlist lain di Beranda.`,
    );
  }

  const path = `/playlist/${slug}`;
  const title = pageTitle(meta.title, joinParts(['Playlist', meta.curator]));
  const curatedBy = meta.curator === null ? '' : ` pilihan ${meta.curator}`;

  /* Jumlah lagu hanya disebut kalau daftarnya benar-benar ada: playlist yang
     gagal dimuat tidak boleh dideskripsikan sebagai "0 lagu". */
  const description =
    playlist === null
      ? `Playlist ${meta.title}${curatedBy} di ${SITE_NAME}. ` +
        'Putar dengan lirik tersinkron per kata.'
      : `${playlist.tracks.length} lagu di playlist ${meta.title}${curatedBy}. ` +
        `Putar dengan lirik tersinkron per kata di ${SITE_NAME}.`;

  /* Sampul diambil dari artwork playlist itu sendiri (dikirim `/playlist`
     sejak relay berganti bentuk), dengan lagu pertama sebagai cadangan —
     SAMA seperti yang dirender halaman. Kartu bagikan yang berbeda dari
     halamannya adalah janji yang tidak ditepati. */
  const cover = playlist?.artwork ?? playlist?.tracks[0]?.artwork ?? null;
  const images = shareImages(cover, `Sampul ${meta.title}`);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'music.playlist',
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: OG_LOCALE,
      images,
    },
    twitter: twitterCard(title, description, images),
  };
}
