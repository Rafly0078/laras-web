/**
 * Kontrak data LARAS — SATU sumber kebenaran untuk seluruh app.
 *
 * Aturan penting: renderer TIDAK BOLEH tahu lirik/katalog datang dari mana.
 * Adapter (Apple TTML, LRCLIB, dst) menormalkan ke bentuk di file ini.
 * Kalau sebuah sumber mati, yang diganti hanya adapternya.
 *
 * Semua waktu dalam DETIK (bukan ms) karena itu satuan yang dipakai
 * IFrame Player API getCurrentTime() dan animator lirik.
 */

/* ─────────────────────────── Katalog ─────────────────────────── */

/** Template artwork Apple: ".../cover.jpg/{w}x{h}bb.jpg" — isi {w}/{h} sendiri. */
export type ArtworkTemplate = string;

export interface Artwork {
  /** URL mentah dengan placeholder {w}/{h} masih utuh. */
  template: ArtworkTemplate;
  width: number | null;
  height: number | null;
  /** Warna latar dominan dari Apple (hex tanpa '#'), untuk ambient gradient. */
  bgColor: string | null;
  /** Warna teks 1..4 dari Apple (hex tanpa '#'). */
  textColors: string[];
}

export interface Track {
  /** id katalog Apple Music. */
  id: string;
  title: string;
  artist: string;
  album: string | null;
  durationSeconds: number;
  isrc: string | null;
  hasLyrics: boolean;
  artwork: Artwork | null;
  /** Nomor track dalam album, kalau diketahui. */
  trackNumber: number | null;
  discNumber: number | null;
  explicit: boolean;
  /** Sumber audio setelah dijembatani; null = belum diresolusi. */
  audio: AudioSource | null;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  artwork: Artwork | null;
  releaseDate: string | null;
  trackCount: number;
  /** Deskripsi editorial Apple (bisa panjang). */
  notes: string | null;
  copyright: string | null;
  genres: string[];
  tracks: Track[];
}

export interface Artist {
  id: string;
  name: string;
  artwork: Artwork | null;
  genres: string[];
  topTracks: Track[];
  albums: Album[];
}

export interface Playlist {
  id: string;
  title: string;
  curator: string | null;
  description: string | null;
  artwork: Artwork | null;
  tracks: Track[];
}

/** Satu baris rak horizontal di Home (ala "Listen Now" Apple Music). */
export interface Shelf {
  id: string;
  title: string;
  subtitle: string | null;
  /** Bentuk kartu menentukan layout: persegi (album) atau lanskap (editorial). */
  shape: 'square' | 'wide';
  items: ShelfItem[];
}

export type ShelfItem =
  | { kind: 'album'; album: Album }
  | { kind: 'playlist'; playlist: Playlist }
  | { kind: 'track'; track: Track }
  | { kind: 'artist'; artist: Artist };

export interface SearchResults {
  query: string;
  top: ShelfItem[];
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
}

/* ─────────────────────────── Audio ─────────────────────────── */

export interface AudioSource {
  provider: 'youtube';
  /** videoId 11 karakter. */
  id: string;
  /** Durasi menurut penyedia audio, untuk mendeteksi ketidakcocokan. */
  durationSeconds: number | null;
  /** Selisih durasi vs katalog Apple (detik). Makin kecil makin yakin. */
  durationDelta: number | null;
  /** Judul di sisi penyedia — berguna saat debug pencocokan. */
  matchedTitle: string | null;
}

/* ─────────────────────────── Lirik ─────────────────────────── */

/**
 * Satu suku kata / kata yang bisa disapu.
 *
 * `isPartOfWord` menandai potongan yang menempel ke potongan berikutnya
 * tanpa spasi (Apple memecah "some‑thing" jadi dua span). Renderer memakai
 * ini untuk memutuskan apakah menambahkan jarak 0.32ch di belakangnya.
 */
export interface Syllable {
  text: string;
  start: number;
  end: number;
  isPartOfWord: boolean;
  /**
   * Kata yang ditulis Apple sebagai satu span panjang dengan durasi besar
   * mendapat perlakuan "emphasis" (skala puncak 1.175 bukan 1.0505).
   */
  emphasis: boolean;
}

/** Satu kelompok vokal: lead, atau salah satu lapis backing. */
export interface VocalGroup {
  syllables: Syllable[];
  start: number;
  end: number;
}

/**
 * Satu baris lirik.
 *
 * `oppositeAligned` = penyanyi kedua (ttm:agent v2) → diratakan ke kanan.
 * `background` = lapis vokal latar (ttm:agent v1000) → gradient-alpha 0.6/0.3.
 * `interlude` = jeda instrumental panjang → dirender sebagai tiga titik berdenyut.
 */
export interface LyricLine {
  index: number;
  start: number;
  end: number;
  lead: VocalGroup;
  background: VocalGroup[];
  oppositeAligned: boolean;
  interlude: boolean;
  /** Bagian lagu dari Apple: Verse, Chorus, Bridge, dst. */
  songPart: string | null;
  /** Teks utuh baris — untuk salin, pencarian, dan mode statis. */
  text: string;
}

export type LyricsKind =
  /** Ada timing per kata → sapuan penuh. */
  | 'syllable'
  /** Hanya timing per baris → baris menyala, TANPA sapuan palsu. */
  | 'line'
  /** Tanpa timing sama sekali → teks statis. */
  | 'static';

export interface Lyrics {
  kind: LyricsKind;
  lines: LyricLine[];
  /** Dari mana lirik ini datang — ditampilkan sebagai kredit. */
  source: 'apple' | 'lrclib' | 'fixture';
  /** Nama penyedia untuk kredit di kaki pane lirik. */
  attribution: string | null;
  /** true kalau lagu ini instrumental (tak ada lirik sama sekali). */
  instrumental: boolean;
}

/* ─────────────────────────── Pemutar ─────────────────────────── */

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

/** Mode tampilan Now Playing. Keputusan Rafly: mode video menyembunyikan lirik. */
export type NowPlayingView = 'artwork' | 'video';

export type RepeatMode = 'off' | 'all' | 'one';

export interface PlayerSnapshot {
  state: PlaybackState;
  /** Posisi terinterpolasi (detik) — halus, aman untuk animasi per-frame. */
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
}
