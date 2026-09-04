import { describe, expect, it } from 'vitest';

import {
  TOP_RESULT_FLOOR,
  dedupeDiscovery,
  discoveryArtistId,
  nameScore,
  normalise,
  pickTopResult,
} from '@/lib/data/search-rank';
import type { Album, Artist, SearchResults, Track } from '@/lib/types';

function track(id: string, title: string, artist = 'Tulus'): Track {
  return {
    id,
    title,
    artist,
    album: null,
    durationSeconds: 200,
    isrc: null,
    hasLyrics: false,
    artwork: null,
    trackNumber: null,
    discNumber: null,
    explicit: false,
    audio: null,
  };
}

function artist(id: string, name: string): Artist {
  return { id, name, artwork: null, genres: [], topTracks: [], albums: [] };
}

function album(id: string, title: string, artistName = 'Tulus'): Album {
  return {
    id,
    title,
    artist: artistName,
    artwork: null,
    releaseDate: null,
    trackCount: 1,
    notes: null,
    copyright: null,
    genres: [],
    tracks: [],
  };
}

function results(over: Partial<SearchResults> = {}): SearchResults {
  return { query: '', top: [], tracks: [], albums: [], artists: [], ...over };
}

describe('normalise', () => {
  it('menghapus apostrof tanpa memecah kata', () => {
    /* "don't" harus tetap satu token. Kalau apostrof diganti spasi, ia jadi
       "don t" dan tidak pernah cocok penuh — pelajaran yang sama sudah dibayar
       di matcher lirik Apple. */
    expect(normalise("Don't Stop")).toBe('dont stop');
    expect(normalise('Don’t Stop')).toBe('dont stop');
  });

  it('menyatukan tanda baca dan spasi berlebih', () => {
    expect(normalise('  Teh   Hijau!! ')).toBe('teh hijau');
    expect(normalise('T E H  HIJAU')).toBe('t e h hijau');
  });

  it('tahan terhadap string kosong', () => {
    expect(normalise('')).toBe('');
    expect(normalise('!!!')).toBe('');
  });
});

describe('nameScore', () => {
  it('cocok persis = 1', () => {
    expect(nameScore('Teh Hijau', 'teh hijau')).toBe(1);
  });

  it('diawali kueri lebih tinggi daripada memuat kueri', () => {
    const prefix = nameScore('Teh Hijau Dulu', 'teh hijau');
    const contains = nameScore('Party Sentak Teh Hijau', 'teh hijau');
    expect(prefix).toBeGreaterThan(contains);
  });

  it('tidak nyambung = 0', () => {
    expect(nameScore('Bertaut', 'teh hijau')).toBe(0);
  });

  it('kueri lebih panjang dari nama tetap dapat skor lemah', () => {
    /* Pengguna mengetik "teh hijau tulus": nama lagunya "Teh Hijau" masih
       relevan, tapi tidak boleh menang atas kecocokan persis. */
    const partial = nameScore('Teh Hijau', 'teh hijau tulus');
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1);
  });

  it('string kosong tidak pernah dapat skor', () => {
    expect(nameScore('', 'apa saja')).toBe(0);
    expect(nameScore('Teh Hijau', '')).toBe(0);
  });
});

describe('pickTopResult', () => {
  it('artis yang namanya cocok persis menang atas lagu berjudul sama', () => {
    /* Kueri "Tulus": ada artis bernama Tulus DAN lagu berjudul Tulus. Yang
       dimaksud pengguna hampir selalu artisnya. */
    const r = results({
      query: 'Tulus',
      artists: [artist('a1', 'Tulus')],
      tracks: [track('t1', 'Tulus', 'Orang Lain')],
    });
    const top = pickTopResult(r);
    expect(top?.kind).toBe('artist');
  });

  it('memilih lagu yang cocok persis di atas lagu yang cuma memuat kueri', () => {
    /* Inilah kasus nyata "Teh Hijau": hasil 1 asli, hasil 3 spam. */
    const r = results({
      query: 'Teh Hijau',
      tracks: [
        track('t1', 'Teh Hijau', 'Tulus'),
        track('t2', 'Teh Hijau (Remix)', 'Kang Rezza'),
        track('t3', 'Party Sentak Teh Hijau', 'Party Sentak'),
      ],
    });
    const top = pickTopResult(r);
    expect(top?.kind).toBe('track');
    if (top?.kind === 'track') expect(top.track.id).toBe('t1');
  });

  it('mengembalikan null kalau tidak ada yang meyakinkan', () => {
    /* Kartu "Hasil teratas" yang menampilkan tebakan acak lebih buruk daripada
       tidak ada kartu — ia mengarahkan pengguna ke tempat salah dengan yakin. */
    const r = results({
      query: 'zzz tidak ada',
      tracks: [track('t1', 'Bertaut'), track('t2', 'Peradaban')],
    });
    expect(pickTopResult(r)).toBeNull();
  });

  it('hasil kosong → null, tanpa exception', () => {
    expect(pickTopResult(results({ query: 'apa saja' }))).toBeNull();
  });

  it('skor pemenang selalu >= ambang', () => {
    const r = results({ query: 'Teh Hijau', tracks: [track('t1', 'Teh Hijau')] });
    const top = pickTopResult(r);
    expect(top).not.toBeNull();
    expect(top!.score).toBeGreaterThanOrEqual(TOP_RESULT_FLOOR);
  });

  it('album bisa menang kalau hanya album yang cocok', () => {
    const r = results({
      query: 'Manusia',
      albums: [album('al1', 'Manusia')],
      tracks: [track('t1', 'Lagu Lain')],
    });
    expect(pickTopResult(r)?.kind).toBe('album');
  });

  it('hanya 3 teratas per grup yang dipertimbangkan', () => {
    /* Hasil ke-10 yang cocok persis TIDAK boleh mengalahkan hasil pertama:
       relay sudah mengurutkan relevansi, dan menggali sampai bawah berarti
       mengabaikan urutan itu. */
    const many = Array.from({ length: 10 }, (_, i) =>
      track(`t${i}`, i === 9 ? 'Teh Hijau' : `Lain ${i}`),
    );
    const r = results({ query: 'Teh Hijau', tracks: many });
    expect(pickTopResult(r)).toBeNull();
  });
});

describe('discoveryArtistId', () => {
  it('hasil teratas berupa artis → idnya langsung', () => {
    const top = pickTopResult(results({ query: 'Tulus', artists: [artist('a1', 'Tulus')] }));
    expect(discoveryArtistId(top, [artist('a1', 'Tulus')])).toBe('a1');
  });

  it('hasil teratas berupa lagu → id artis dicocokkan dari daftar artis', () => {
    /* Item hasil /search TIDAK punya relationships (terukur), jadi id artis
       harus dicari dari grup artists di respons yang sama. */
    const r = results({
      query: 'Teh Hijau',
      tracks: [track('t1', 'Teh Hijau', 'Tulus')],
      artists: [artist('a1', 'Tulus')],
    });
    const top = pickTopResult(r);
    expect(discoveryArtistId(top, r.artists)).toBe('a1');
  });

  it('nama artis tidak ada di daftar → null (bukan menebak)', () => {
    const r = results({
      query: 'Teh Hijau',
      tracks: [track('t1', 'Teh Hijau', 'Artis Asing')],
      artists: [artist('a1', 'Tulus')],
    });
    expect(discoveryArtistId(pickTopResult(r), r.artists)).toBeNull();
  });

  it('tanpa hasil teratas → null', () => {
    expect(discoveryArtistId(null, [artist('a1', 'Tulus')])).toBeNull();
  });

  it('mencocokkan walau tanda baca berbeda', () => {
    const r = results({
      query: 'Essentials',
      tracks: [track('t1', 'Essentials', "MALIQ & D'Essentials")],
      artists: [artist('a1', 'MALIQ & D’Essentials')],
    });
    expect(discoveryArtistId(pickTopResult(r), r.artists)).toBe('a1');
  });
});

describe('dedupeDiscovery', () => {
  /* Ambang DISCOVERY_MIN membuat hasil di bawah 3 lagu jadi kosong, jadi uji
     dedup memakai daftar yang cukup panjang; ambangnya diuji terpisah di bawah. */
  it('membuang lagu yang sudah ada di daftar utama', () => {
    const out = dedupeDiscovery(
      [track('a', 'A'), track('b', 'B'), track('c', 'C'), track('d', 'D')],
      null,
      [track('b', 'B')],
    );
    expect(out.map((t) => t.id)).toEqual(['a', 'c', 'd']);
  });

  it('membuang lagu yang sudah tampil di kartu hasil teratas', () => {
    const top = pickTopResult(results({ query: 'A', tracks: [track('a', 'A')] }));
    const out = dedupeDiscovery(
      [track('a', 'A'), track('c', 'C'), track('d', 'D'), track('e', 'E')],
      top,
      [],
    );
    expect(out.map((t) => t.id)).toEqual(['c', 'd', 'e']);
  });

  it('membuang duplikat di dalam daftar penemuan sendiri', () => {
    const out = dedupeDiscovery(
      [track('a', 'A'), track('a', 'A'), track('b', 'B'), track('c', 'C')],
      null,
      [],
    );
    expect(out.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('dipotong ke limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => track(`t${i}`, `L${i}`));
    expect(dedupeDiscovery(many, null, [], 5)).toHaveLength(5);
  });

  it('daftar kosong → kosong', () => {
    expect(dedupeDiscovery([], null, [])).toEqual([]);
  });

  it('sisa di bawah ambang → rak dikosongkan, bukan ditampilkan satu baris', () => {
    /* Temuan nyata: untuk "Teh Hijau" di storefront Indonesia, daftar utama
       sudah memuat 8 lagu Tulus, sehingga setelah dedup rak penemuan tinggal
       SATU baris. Rak berjudul "Lagu lain dari Tulus" berisi satu lagu bukan
       jalan keluar — ia menambah judul tanpa menambah pilihan. */
    const out = dedupeDiscovery([track('a', 'A'), track('b', 'B')], null, []);
    expect(out).toEqual([]);
  });

  it('tepat di ambang tetap ditampilkan', () => {
    const out = dedupeDiscovery(
      [track('a', 'A'), track('b', 'B'), track('c', 'C')],
      null,
      [],
    );
    expect(out).toHaveLength(3);
  });

  it('ambang bisa diturunkan pemanggil', () => {
    const out = dedupeDiscovery([track('a', 'A')], null, [], 10, 1);
    expect(out).toHaveLength(1);
  });
});
