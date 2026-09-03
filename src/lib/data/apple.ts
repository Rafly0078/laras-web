/**
 * Adapter katalog Apple Music -> tipe internal LARAS.
 *
 * Semua fungsi menerima `unknown` dan memvalidasi sendiri. Alasannya bukan
 * kerapian: data ini datang dari relay pihak ketiga yang bisa berubah bentuk
 * kapan saja, dan satu field hilang TIDAK BOLEH membuat halaman crash. Yang
 * gagal divalidasi jadi null, dan pemanggil memutuskan apa yang ditampilkan.
 *
 * Bentuk mentah yang ditangani (terverifikasi dari fixture nyata):
 *  - /search        -> { results: { songs|albums|artists|top: { data: [...] } } }
 *  - /album         -> { data: [ { attributes, relationships.tracks.data } ] }
 *  - /artist        -> { data: [ { attributes } ] }  (relasi kosong — lihat
 *                      toArtistFromParts; lagu & album datang dari
 *                      /artist/songs dan /artist/albums)
 *  - /playlist      -> { data: [ { attributes, relationships.tracks.data } ] }
 *  - /playlist/tracks (lama) -> { parsed_tracks: [snake_case], raw_data }
 */

import type {
  Album,
  Artist,
  Artwork,
  Track,
} from '@/lib/types';

/* ── Type guard kecil ──────────────────────────────────────────────────── */

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // Relay kadang mengirim angka sebagai string ("10" untuk trackCount).
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asBool(value: unknown): boolean {
  return value === true;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  return asArray(value).filter((v): v is string => typeof v === 'string');
}

/** Ambil `attributes` dari sebuah item katalog Apple. */
function attributesOf(raw: unknown): Rec | null {
  if (!isRec(raw)) return null;
  return isRec(raw.attributes) ? raw.attributes : null;
}

/* ── Artwork ───────────────────────────────────────────────────────────── */

export function toArtwork(raw: unknown): Artwork | null {
  if (!isRec(raw)) return null;
  const template = asString(raw.url);
  if (!template) return null;

  // textColor1..4 diurut supaya ambient gradient punya urutan yang stabil
  // antar render — kalau tidak, warnanya bisa bertukar tanpa alasan.
  const textColors: string[] = [];
  for (const key of ['textColor1', 'textColor2', 'textColor3', 'textColor4']) {
    const color = asString(raw[key]);
    if (color) textColors.push(color);
  }

  return {
    template,
    width: asNumber(raw.width),
    height: asNumber(raw.height),
    bgColor: asString(raw.bgColor),
    textColors,
  };
}

/**
 * Isi template artwork Apple dengan ukuran yang diminta.
 *
 * Template Apple memuat literal `{w}` dan `{h}`. Kalau URL sudah jadi (relay
 * kadang mengirim bentuk itu di `parsed_tracks.artwork_url`), kembalikan apa
 * adanya — mengganti apa pun di situ akan merusaknya.
 */
export function artworkUrl(art: Artwork | null, size: number): string | null {
  if (!art) return null;
  const rounded = String(Math.round(size));
  return art.template.replace('{w}', rounded).replace('{h}', rounded);
}

/* ── Track ─────────────────────────────────────────────────────────────── */

export function toTrack(raw: unknown): Track | null {
  const attrs = attributesOf(raw);
  if (!isRec(raw) || !attrs) return null;

  const id = asString(raw.id);
  const title = asString(attrs.name);
  if (!id || !title) return null;

  const durationMs = asNumber(attrs.durationInMillis);

  return {
    id,
    title,
    artist: asString(attrs.artistName) ?? '',
    album: asString(attrs.albumName),
    // Tipe internal memakai DETIK, bukan milidetik.
    durationSeconds: durationMs === null ? 0 : durationMs / 1000,
    isrc: asString(attrs.isrc),
    hasLyrics: asBool(attrs.hasLyrics),
    artwork: toArtwork(attrs.artwork),
    trackNumber: asNumber(attrs.trackNumber),
    discNumber: asNumber(attrs.discNumber),
    // contentRating 'explicit' adalah satu-satunya penanda yang Apple kirim.
    explicit: asString(attrs.contentRating) === 'explicit',
    // Jembatan ke YouTube adalah langkah terpisah; adapter katalog tidak tahu
    // apa pun soal sumber audio.
    audio: null,
  };
}

/**
 * Track dari bentuk `parsed_tracks` (snake_case) milik relay.
 *
 * Bentuk ini lebih miskin daripada `raw_data.data` — tanpa isrc, tanpa
 * hasLyrics, dan `artwork_url` sudah berupa URL jadi. Diekspor supaya
 * apple-collections.ts bisa memakainya sebagai cadangan ketika `raw_data`
 * tidak ada.
 */
export function toTrackFromParsed(raw: unknown): Track | null {
  if (!isRec(raw)) return null;
  const id = asString(raw.id);
  const title = asString(raw.title);
  if (!id || !title) return null;

  const durationMs = asNumber(raw.duration_ms);
  const artUrl = asString(raw.artwork_url);

  return {
    id,
    title,
    artist: asString(raw.artist) ?? '',
    album: asString(raw.album),
    durationSeconds: durationMs === null ? 0 : durationMs / 1000,
    isrc: null,
    hasLyrics: false,
    artwork: artUrl
      ? { template: artUrl, width: null, height: null, bgColor: null, textColors: [] }
      : null,
    trackNumber: asNumber(raw.track_number),
    discNumber: null,
    explicit: asBool(raw.is_explicit),
    audio: null,
  };
}

/* ── Album ─────────────────────────────────────────────────────────────── */

/** Ambil array track dari `relationships.tracks.data`. */
function relationshipData(raw: unknown, name: string): unknown[] {
  if (!isRec(raw) || !isRec(raw.relationships)) return [];
  const node = raw.relationships[name];
  if (!isRec(node)) return [];
  return asArray(node.data);
}

export function toAlbum(raw: unknown): Album | null {
  const attrs = attributesOf(raw);
  if (!isRec(raw) || !attrs) return null;

  const id = asString(raw.id);
  const title = asString(attrs.name);
  if (!id || !title) return null;

  const tracks = relationshipData(raw, 'tracks')
    .map(toTrack)
    .filter((t): t is Track => t !== null);

  const editorial = isRec(attrs.editorialNotes) ? attrs.editorialNotes : null;

  return {
    id,
    title,
    artist: asString(attrs.artistName) ?? '',
    artwork: toArtwork(attrs.artwork),
    releaseDate: asString(attrs.releaseDate),
    // trackCount dari metadata lebih dipercaya daripada panjang array: relay
    // bisa memotong daftar track sementara jumlah sebenarnya tetap benar.
    trackCount: asNumber(attrs.trackCount) ?? tracks.length,
    notes: editorial
      ? (asString(editorial.standard) ?? asString(editorial.short))
      : null,
    copyright: asString(attrs.copyright),
    genres: asStringArray(attrs.genreNames),
    tracks,
  };
}

/**
 * Album dari respons `/album` yang membungkus di `data[0]`.
 *
 * Relay mengembalikan tiga bentuk sekaligus (`data`, `raw_data`,
 * `parsed_tracks`); `data[0]` adalah bentuk Apple penuh dan yang paling kaya.
 */
export function toAlbumResponse(raw: unknown): Album | null {
  if (!isRec(raw)) return null;
  const direct = asArray(raw.data)[0];
  if (direct !== undefined) {
    const album = toAlbum(direct);
    if (album) return album;
  }
  // Bentuk cadangan: raw_data.data[0]
  if (isRec(raw.raw_data)) {
    const nested = asArray(raw.raw_data.data)[0];
    if (nested !== undefined) return toAlbum(nested);
  }
  return null;
}

/* ── Artist ────────────────────────────────────────────────────────────── */

export function toArtist(raw: unknown): Artist | null {
  const attrs = attributesOf(raw);
  if (!isRec(raw) || !attrs) return null;

  const id = asString(raw.id);
  const name = asString(attrs.name);
  if (!id || !name) return null;

  return {
    id,
    name,
    artwork: toArtwork(attrs.artwork),
    genres: asStringArray(attrs.genreNames),
    topTracks: relationshipData(raw, 'songs')
      .map(toTrack)
      .filter((t): t is Track => t !== null),
    albums: relationshipData(raw, 'albums')
      .map(toAlbum)
      .filter((a): a is Album => a !== null),
  };
}

/** Buka pembungkus `{ data: [...] }` milik endpoint katalog. */
export function catalogDataOf(raw: unknown): unknown[] {
  return isRec(raw) ? asArray(raw.data) : [];
}

/**
 * Artis dari TIGA respons relay yang digabung pemanggil (`loadArtist`).
 *
 * KENAPA TIDAK `toArtist` saja: sejak relay berganti bentuk, `/artist` tidak
 * lagi mengirim relasi yang terisi — `songs` hilang sama sekali dan `albums`
 * hanya berisi stub `{id, type, href}` tanpa judul maupun artwork. Hasilnya
 * di produksi: halaman artis menampilkan "Katalog tidak mengirim lagu atau
 * album" untuk artis yang jelas-jelas punya keduanya. Judul dan sampul yang
 * sungguhan ada di `/artist/songs` dan `/artist/albums`.
 *
 * Bagian yang gagal (null) dibiarkan kosong, bukan membatalkan artisnya:
 * halaman tetap bisa dirender dengan nama + foto + apa pun yang berhasil.
 */
export function toArtistFromParts(
  base: unknown,
  songs: unknown,
  albums: unknown,
): Artist | null {
  const artist = toArtistResponse(base);
  if (artist === null) return null;

  const topTracks = catalogDataOf(songs)
    .map(toTrack)
    .filter((t): t is Track => t !== null);
  const albumList = catalogDataOf(albums)
    .map(toAlbum)
    .filter((a): a is Album => a !== null);

  return {
    ...artist,
    // Relasi inline tetap dipakai kalau ternyata terisi (fixture lama, atau
    // relay kembali ke bentuk itu): jangan buang data yang sudah ada.
    topTracks: topTracks.length > 0 ? topTracks : artist.topTracks,
    albums: albumList.length > 0 ? albumList : artist.albums,
  };
}

/** Artist dari respons `/artist` yang membungkus di `data[0]`. */
export function toArtistResponse(raw: unknown): Artist | null {
  if (!isRec(raw)) return null;
  const direct = asArray(raw.data)[0];
  return direct === undefined ? null : toArtist(direct);
}
