import { describe, expect, it } from 'vitest';

import { FOLLOW_GRACE_MS, decideFollow } from '@/lib/player/follow';

/** Konteks default: halaman lagu A, tidak ada interaksi. */
function ctx(over: Partial<Parameters<typeof decideFollow>[0]> = {}) {
  return {
    pageTrackId: 'A',
    currentTrackId: 'B',
    lastInteractionAt: null,
    now: 10_000,
    ...over,
  };
}

describe('decideFollow', () => {
  it('pindah saat pemutar sudah di lagu lain', () => {
    const d = decideFollow(ctx());
    expect(d).toEqual({ action: 'pindah', toTrackId: 'B' });
  });

  it('tetap kalau halaman sudah menampilkan lagu yang diputar', () => {
    const d = decideFollow(ctx({ currentTrackId: 'A' }));
    expect(d.action).toBe('tetap');
    if (d.action === 'tetap') expect(d.reason).toBe('sudah-lagu-ini');
  });

  it('tetap kalau belum ada lagu yang diputar', () => {
    /* Membuka /lagu/<id> tanpa menekan Putar TIDAK boleh memindahkan halaman.
       Ini yang membuat tautan lagu tetap bisa dibagikan. */
    const d = decideFollow(ctx({ currentTrackId: null }));
    expect(d.action).toBe('tetap');
    if (d.action === 'tetap') expect(d.reason).toBe('belum-ada-lagu');
  });

  it('menunda saat pengguna baru menyentuh lirik', () => {
    const d = decideFollow(ctx({ now: 10_000, lastInteractionAt: 9_000 }));
    expect(d.action).toBe('tunda');
    if (d.action === 'tunda') {
      expect(d.toTrackId).toBe('B');
      /* Sisa jeda: 2500 - 1000 = 1500. */
      expect(d.retryInMs).toBe(FOLLOW_GRACE_MS - 1000);
    }
  });

  it('pindah setelah jeda tenang lewat', () => {
    const d = decideFollow(ctx({ now: 10_000, lastInteractionAt: 10_000 - FOLLOW_GRACE_MS }));
    expect(d).toEqual({ action: 'pindah', toTrackId: 'B' });
  });

  it('interaksi jauh di masa lalu tidak menahan apa pun', () => {
    const d = decideFollow(ctx({ now: 999_999, lastInteractionAt: 1_000 }));
    expect(d.action).toBe('pindah');
  });

  it('sentuhan tepat di ambang sudah dianggap lewat', () => {
    /* Batas dibuat inklusif supaya penundaan tidak bisa berulang selamanya
       karena selisih satu milidetik. */
    const d = decideFollow({
      pageTrackId: 'A',
      currentTrackId: 'B',
      now: 5_000,
      lastInteractionAt: 5_000 - FOLLOW_GRACE_MS,
    });
    expect(d.action).toBe('pindah');
  });

  it('retryInMs selalu >= 1 (tidak menjadwalkan timer 0ms)', () => {
    /* Jam yang bergerak mundur akan menghasilkan quietFor negatif; retry-nya
       tetap harus angka positif, bukan 0 yang berputar ketat. */
    const d = decideFollow(ctx({ now: 1_000, lastInteractionAt: 9_000 }));
    expect(d.action).toBe('tunda');
    if (d.action === 'tunda') expect(d.retryInMs).toBeGreaterThanOrEqual(1);
  });

  it('jeda bisa disetel (0 = ikut segera walau sedang menggulir)', () => {
    const d = decideFollow(ctx({ now: 10_000, lastInteractionAt: 9_999, graceMs: 0 }));
    expect(d.action).toBe('pindah');
  });

  it('penundaan bukan penolakan: keputusan berikutnya memindahkan', () => {
    /* Ini yang membuktikan halaman tidak akan macet selamanya di lagu lama. */
    const first = decideFollow(ctx({ now: 10_000, lastInteractionAt: 9_500 }));
    expect(first.action).toBe('tunda');

    const retryAt = first.action === 'tunda' ? 10_000 + first.retryInMs : 0;
    const second = decideFollow(ctx({ now: retryAt, lastInteractionAt: 9_500 }));
    expect(second.action).toBe('pindah');
  });
});
