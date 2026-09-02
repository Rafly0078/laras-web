import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  bestMatch,
  DURATION_TOLERANCE_SECONDS,
  editionsOf,
  normalise,
  parseYouTubeDuration,
  scoreCandidate,
  similarity,
  type AudioCandidate,
} from '@/lib/data/bridge';

describe('parseYouTubeDuration', () => {
  it('menerima format titik dua (hl=en)', () => {
    expect(parseYouTubeDuration('4:02')).toBe(242);
    expect(parseYouTubeDuration('1:02:03')).toBe(3723);
  });

  it('menerima format TITIK (hl=id) — jebakan yang pernah bikin gagal 0/7', () => {
    expect(parseYouTubeDuration('4.02')).toBe(242);
    expect(parseYouTubeDuration('5.16')).toBe(316);
  });

  it('menolak masukan tak masuk akal', () => {
    expect(parseYouTubeDuration('')).toBeNull();
    expect(parseYouTubeDuration('abc')).toBeNull();
    expect(parseYouTubeDuration('12')).toBeNull();
    expect(parseYouTubeDuration('0:02')).toBeNull(); // terlalu pendek
    expect(parseYouTubeDuration('9:00:00')).toBeNull(); // 9 jam, jelas salah parse
  });
});

describe('normalise', () => {
  it('membuang sampah judul YouTube', () => {
    expect(normalise('Hati-Hati di Jalan (Official Lyric Video)')).toBe(
      'hati hati di jalan',
    );
    expect(normalise('Bertaut | Official Music Video')).toBe('bertaut');
  });

  it('MENGHAPUS apostrof, tidak menggantinya dengan spasi', () => {
    // Kalau diganti spasi, "don't" jadi 2 token dan skor jatuh tanpa alasan.
    expect(normalise("Don't Stop")).toBe('dont stop');
    expect(normalise('Don\u2019t Stop')).toBe('dont stop');
  });

  it('menyeragamkan tanda baca dan spasi ganda', () => {
    expect(normalise('  A  --  B  ')).toBe('a b');
  });
});

describe('editionsOf', () => {
  it('menemukan penanda edisi', () => {
    expect(editionsOf('Blinding Lights (Live)').has('live')).toBe(true);
    expect(editionsOf('Song - Sped Up Version').has('sped up')).toBe(true);
  });

  it('lagu biasa tidak punya penanda', () => {
    expect(editionsOf('Hati-Hati di Jalan').size).toBe(0);
  });
});

describe('similarity', () => {
  it('judul identik = 1', () => {
    expect(similarity('Bertaut', 'Bertaut')).toBe(1);
  });

  it('judul YouTube panjang tidak dihukum karena token tambahan', () => {
    const score = similarity(
      'Tulus - Hati-Hati di Jalan (Official Lyric Video)',
      'Hati-Hati di Jalan',
    );
    expect(score).toBe(1);
  });

  it('judul beda = rendah', () => {
    expect(similarity('Bertaut', 'Peradaban')).toBeLessThan(0.3);
  });

  it('teks kosong = 0, bukan NaN', () => {
    expect(similarity('', 'abc')).toBe(0);
    expect(similarity('abc', '')).toBe(0);
  });
});

describe('scoreCandidate — penolakan keras', () => {
  const target = { title: 'Hati-Hati di Jalan', artist: 'Tulus', durationSeconds: 242 };

  it('menerima durasi dalam toleransi', () => {
    const result = scoreCandidate(
      { videoId: 'aaaaaaaaaaa', title: 'Hati-Hati di Jalan', artist: 'Tulus', durationSeconds: 242 },
      target,
    );
    expect(result).not.toBeNull();
    expect(result?.durationDelta).toBe(0);
  });

  it('menolak durasi di luar toleransi walau judul persis', () => {
    const result = scoreCandidate(
      {
        videoId: 'bbbbbbbbbbb',
        title: 'Hati-Hati di Jalan',
        artist: 'Tulus',
        durationSeconds: 242 + DURATION_TOLERANCE_SECONDS + 1,
      },
      target,
    );
    expect(result).toBeNull();
  });

  it('menolak durasi null', () => {
    expect(
      scoreCandidate(
        { videoId: 'ccccccccccc', title: 'Hati-Hati di Jalan', artist: 'Tulus', durationSeconds: null },
        target,
      ),
    ).toBeNull();
  });

  it('menolak edisi berbeda: versi Live bukan versi studio', () => {
    const result = scoreCandidate(
      { videoId: 'ddddddddddd', title: 'Hati-Hati di Jalan (Live)', artist: 'Tulus', durationSeconds: 242 },
      target,
    );
    expect(result).toBeNull();
  });

  it('menerima kalau KEDUANYA versi Live', () => {
    const result = scoreCandidate(
      { videoId: 'eeeeeeeeeee', title: 'Blinding Lights (Live)', artist: 'The Weeknd', durationSeconds: 253 },
      { title: 'Blinding Lights (Live)', artist: 'The Weeknd', durationSeconds: 253 },
    );
    expect(result).not.toBeNull();
  });

  it('menolak lagu lain yang durasinya kebetulan sama', () => {
    const result = scoreCandidate(
      { videoId: 'fffffffffff', title: 'Peradaban', artist: 'Feast', durationSeconds: 242 },
      target,
    );
    expect(result).toBeNull();
  });

  it('memakai judul sebagai bahan artis kalau field artis kosong', () => {
    const result = scoreCandidate(
      { videoId: 'ggggggggggg', title: 'Tulus - Hati-Hati di Jalan', artist: null, durationSeconds: 241 },
      target,
    );
    expect(result).not.toBeNull();
  });
});

describe('bestMatch', () => {
  const target = { title: 'Bertaut', artist: 'Nadin Amizah', durationSeconds: 316 };

  it('memilih durasi terdekat saat skor sama', () => {
    const candidates: AudioCandidate[] = [
      { videoId: 'jauhjauhjau', title: 'Bertaut', artist: 'Nadin Amizah', durationSeconds: 319 },
      { videoId: 'dekatdekatd', title: 'Bertaut', artist: 'Nadin Amizah', durationSeconds: 316 },
    ];
    expect(bestMatch(candidates, target)?.candidate.videoId).toBe('dekatdekatd');
  });

  it('null kalau tidak ada yang layak', () => {
    expect(
      bestMatch(
        [{ videoId: 'salahsalahs', title: 'Lagu Lain', artist: 'Orang Lain', durationSeconds: 316 }],
        target,
      ),
    ).toBeNull();
  });

  it('daftar kosong = null', () => {
    expect(bestMatch([], target)).toBeNull();
  });
});

describe('jembatan NYATA dari fixture (hasil fetch sungguhan)', () => {
  interface Manifest {
    slug: string;
    title: string;
    artist: string;
    durationMs: number;
    youtube: { videoId: string; durationSeconds: number | null } | null;
  }

  const manifest = JSON.parse(
    readFileSync(path.join(process.cwd(), 'fixtures', 'tracks.json'), 'utf8'),
  ) as Manifest[];

  it('keempat lagu fixture punya pasangan YouTube', () => {
    for (const entry of manifest) {
      expect(entry.youtube, `${entry.slug} tidak punya pasangan`).not.toBeNull();
    }
  });

  it('selisih durasi tiap pasangan dalam toleransi 3 detik', () => {
    for (const entry of manifest) {
      const yt = entry.youtube;
      if (!yt?.durationSeconds) continue;
      const delta = Math.abs(yt.durationSeconds - entry.durationMs / 1000);
      expect(delta, `${entry.slug} selisih ${delta}s`).toBeLessThanOrEqual(
        DURATION_TOLERANCE_SECONDS,
      );
    }
  });

  it('videoId berformat 11 karakter', () => {
    for (const entry of manifest) {
      expect(entry.youtube?.videoId).toMatch(/^[\w-]{11}$/);
    }
  });

  it('matcher memilih ulang pasangan yang sama dari kandidatnya sendiri', () => {
    // Uji tertutup: kandidat yang benar dicampur dengan pengecoh, matcher
    // harus tetap memilih yang benar.
    for (const entry of manifest) {
      const yt = entry.youtube;
      if (!yt?.durationSeconds) continue;

      const target = {
        title: entry.title,
        artist: entry.artist,
        durationSeconds: entry.durationMs / 1000,
      };

      const candidates: AudioCandidate[] = [
        { videoId: 'decoy000000', title: `${entry.title} (Live)`, artist: entry.artist, durationSeconds: yt.durationSeconds },
        { videoId: 'decoy111111', title: 'Lagu Sama Sekali Lain', artist: 'Artis Lain', durationSeconds: yt.durationSeconds },
        { videoId: yt.videoId, title: entry.title, artist: entry.artist, durationSeconds: yt.durationSeconds },
        { videoId: 'decoy222222', title: entry.title, artist: entry.artist, durationSeconds: yt.durationSeconds + 30 },
      ];

      expect(bestMatch(candidates, target)?.candidate.videoId, entry.slug).toBe(
        yt.videoId,
      );
    }
  });
});
