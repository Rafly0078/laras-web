import { describe, expect, it } from 'vitest';

import {
  currentIndex,
  currentTrack,
  emptyQueue,
  nextRepeatMode,
  queueReducer,
  upcoming,
  type Permute,
  type QueueAction,
  type QueueState,
} from '@/lib/player/queue';
import type { Track } from '@/lib/types';

/**
 * Permutasi DETERMINISTIK: membalik urutan. Dengan ini "shuffle" bisa diuji
 * seperti fungsi biasa — kalau permutasinya acak, satu-satunya yang bisa
 * di-assert adalah "isinya sama", dan bug urutan lolos.
 */
const reverse: Permute = (indices) => [...indices].reverse();

function track(id: string): Track {
  return {
    id,
    title: `Lagu ${id}`,
    artist: 'Artis',
    album: null,
    durationSeconds: 180,
    isrc: null,
    hasLyrics: false,
    artwork: null,
    trackNumber: null,
    discNumber: null,
    explicit: false,
    audio: null,
  };
}

const list = ['a', 'b', 'c', 'd', 'e'].map(track);

function run(state: QueueState, ...actions: QueueAction[]): QueueState {
  return actions.reduce((acc, action) => queueReducer(acc, action, reverse), state);
}

function ids(state: QueueState): string[] {
  return state.order.map((i) => state.tracks[i].id);
}

describe('queueReducer — memutar', () => {
  it('play dengan antrean menempatkan kursor di lagu yang diklik', () => {
    const state = run(emptyQueue, { type: 'play', track: list[2], tracks: list });
    expect(currentTrack(state)?.id).toBe('c');
    expect(currentIndex(state)).toBe(2);
    expect(ids(state)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('play tanpa antrean membuat antrean berisi satu lagu', () => {
    const state = run(emptyQueue, { type: 'play', track: list[1] });
    expect(state.tracks).toHaveLength(1);
    expect(currentTrack(state)?.id).toBe('b');
  });

  it('antrean kosong: current null, index -1, tanpa lempar', () => {
    expect(currentTrack(emptyQueue)).toBeNull();
    expect(currentIndex(emptyQueue)).toBe(-1);
    expect(upcoming(emptyQueue)).toEqual([]);
  });
});

describe('queueReducer — next & previous dengan repeat', () => {
  const playing = run(emptyQueue, { type: 'play', track: list[0], tracks: list });

  it('next maju satu lagu', () => {
    expect(currentTrack(run(playing, { type: 'next' }))?.id).toBe('b');
  });

  it('repeat off: berhenti di lagu terakhir, tidak kembali ke awal', () => {
    const atEnd = run(playing, { type: 'jump', queueIndex: 4 });
    expect(currentTrack(run(atEnd, { type: 'next' }))?.id).toBe('e');
  });

  it("repeat 'all': lagu terakhir lanjut ke lagu pertama", () => {
    const atEnd = run(playing, { type: 'setRepeat', mode: 'all' }, { type: 'jump', queueIndex: 4 });
    expect(currentTrack(run(atEnd, { type: 'next' }))?.id).toBe('a');
  });

  it("repeat 'one' TIDAK memindahkan antrean — itu tugas pemutar, bukan reducer", () => {
    const state = run(playing, { type: 'setRepeat', mode: 'one' });
    expect(currentTrack(run(state, { type: 'next' }))?.id).toBe('b');
  });

  it('previous mundur satu lagu', () => {
    const third = run(playing, { type: 'jump', queueIndex: 2 });
    expect(currentTrack(run(third, { type: 'previous' }))?.id).toBe('b');
  });

  it('previous di lagu pertama: bertahan kalau repeat off, ke akhir kalau repeat all', () => {
    expect(currentTrack(run(playing, { type: 'previous' }))?.id).toBe('a');
    const all = run(playing, { type: 'setRepeat', mode: 'all' });
    expect(currentTrack(run(all, { type: 'previous' }))?.id).toBe('e');
  });

  it('next/previous tanpa lagu yang diputar tidak melakukan apa pun', () => {
    expect(run(emptyQueue, { type: 'next' })).toEqual(emptyQueue);
    expect(run(emptyQueue, { type: 'previous' })).toEqual(emptyQueue);
  });

  it('siklus tombol repeat: mati -> semua -> satu -> mati', () => {
    expect(nextRepeatMode('off')).toBe('all');
    expect(nextRepeatMode('all')).toBe('one');
    expect(nextRepeatMode('one')).toBe('off');
  });
});

describe('queueReducer — shuffle', () => {
  const playing = run(emptyQueue, { type: 'play', track: list[2], tracks: list });

  it('menyalakan shuffle TIDAK mengganti lagu yang sedang berbunyi', () => {
    const shuffled = run(playing, { type: 'setShuffle', on: true });
    expect(currentTrack(shuffled)?.id).toBe('c');
    expect(shuffled.cursor).toBe(0);
  });

  it('shuffle mengubah urutan main, BUKAN urutan antrean asli', () => {
    const shuffled = run(playing, { type: 'setShuffle', on: true });
    // Lagu sekarang di depan, sisanya dibalik oleh permutasi test.
    expect(ids(shuffled)).toEqual(['c', 'e', 'd', 'b', 'a']);
    expect(shuffled.tracks.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('mematikan shuffle MENGEMBALIKAN urutan asli, bukan meninggalkan hasil acak', () => {
    const back = run(playing, { type: 'setShuffle', on: true }, { type: 'setShuffle', on: false });
    expect(ids(back)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(currentTrack(back)?.id).toBe('c');
    expect(back.cursor).toBe(2);
  });

  it('play saat shuffle menyala mengacak antrean baru tapi memulai dari lagu yang diklik', () => {
    const on = run(emptyQueue, { type: 'setShuffle', on: true });
    const state = run(on, { type: 'play', track: list[1], tracks: list });
    expect(currentTrack(state)?.id).toBe('b');
    expect(state.cursor).toBe(0);
    expect([...state.order].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('menyetel shuffle ke nilai yang sama tidak mengacak ulang', () => {
    const shuffled = run(playing, { type: 'setShuffle', on: true });
    expect(run(shuffled, { type: 'setShuffle', on: true })).toBe(shuffled);
  });
});

describe('queueReducer — mengubah antrean', () => {
  const playing = run(emptyQueue, { type: 'play', track: list[1], tracks: list.slice(0, 3) });
  const extra = track('z');

  it('append menaruh di akhir', () => {
    const state = run(playing, { type: 'append', track: extra });
    expect(ids(state)).toEqual(['a', 'b', 'c', 'z']);
    expect(currentTrack(state)?.id).toBe('b');
  });

  it('playNext menaruh TEPAT setelah lagu sekarang', () => {
    const state = run(playing, { type: 'playNext', track: extra });
    expect(ids(state)).toEqual(['a', 'b', 'z', 'c']);
    expect(currentTrack(state)?.id).toBe('b');
    expect(upcoming(state).map((e) => e.track.id)).toEqual(['z', 'c']);
  });

  it('menambahkan lagu yang SUDAH ada memindahkannya, bukan menduplikasi', () => {
    const state = run(playing, { type: 'playNext', track: list[0] });
    expect(state.tracks).toHaveLength(3);
    expect(ids(state)).toEqual(['b', 'a', 'c']);
    expect(currentTrack(state)?.id).toBe('b');
  });

  it('menghapus lagu DI DEPAN yang sedang diputar menjaga lagu itu tetap diputar', () => {
    const state = run(playing, { type: 'remove', queueIndex: 0 });
    expect(state.tracks.map((t) => t.id)).toEqual(['b', 'c']);
    expect(currentTrack(state)?.id).toBe('b');
  });

  it('menghapus lagu DI BELAKANG tidak mengganggu yang sedang diputar', () => {
    const state = run(playing, { type: 'remove', queueIndex: 2 });
    expect(currentTrack(state)?.id).toBe('b');
    expect(upcoming(state)).toEqual([]);
  });

  it('menghapus lagu yang SEDANG diputar menaikkan lagu berikutnya ke posisinya', () => {
    const state = run(playing, { type: 'remove', queueIndex: 1 });
    expect(state.tracks.map((t) => t.id)).toEqual(['a', 'c']);
    expect(currentTrack(state)?.id).toBe('c');
  });

  it('menghapus lagu terakhir yang tersisa mengosongkan antrean tanpa lempar', () => {
    const single = run(emptyQueue, { type: 'play', track: list[0] });
    const state = run(single, { type: 'remove', queueIndex: 0 });
    expect(state.tracks).toEqual([]);
    expect(state.cursor).toBe(-1);
    expect(currentTrack(state)).toBeNull();
  });

  it('remove dengan indeks di luar jangkauan tidak mengubah apa pun', () => {
    expect(run(playing, { type: 'remove', queueIndex: 99 })).toBe(playing);
    expect(run(playing, { type: 'remove', queueIndex: -1 })).toBe(playing);
  });

  it('remove tetap benar saat shuffle menyala', () => {
    const shuffled = run(playing, { type: 'setShuffle', on: true });
    // urutan main: ['b', 'c', 'a'] (lagu sekarang di depan, sisanya dibalik)
    expect(ids(shuffled)).toEqual(['b', 'c', 'a']);
    const state = run(shuffled, { type: 'remove', queueIndex: 0 });
    expect(state.tracks.map((t) => t.id)).toEqual(['b', 'c']);
    expect(ids(state)).toEqual(['b', 'c']);
    expect(currentTrack(state)?.id).toBe('b');
  });

  it('jump memakai indeks ANTREAN, bukan posisi urutan main', () => {
    const shuffled = run(playing, { type: 'setShuffle', on: true });
    const state = run(shuffled, { type: 'jump', queueIndex: 2 });
    expect(currentTrack(state)?.id).toBe('c');
  });

  it('jump ke indeks yang tidak ada di urutan main diabaikan', () => {
    expect(run(playing, { type: 'jump', queueIndex: 42 })).toBe(playing);
  });

  it('clear mengosongkan antrean tapi MEMPERTAHANKAN setelan shuffle & repeat', () => {
    const state = run(playing, { type: 'setShuffle', on: true }, { type: 'setRepeat', mode: 'all' }, { type: 'clear' });
    expect(state.tracks).toEqual([]);
    expect(state.cursor).toBe(-1);
    expect(state.shuffle).toBe(true);
    expect(state.repeat).toBe('all');
  });

  it('upcoming hanya berisi lagu SETELAH yang sekarang, dalam urutan main', () => {
    expect(upcoming(playing).map((e) => e.track.id)).toEqual(['c']);
    const first = run(playing, { type: 'jump', queueIndex: 0 });
    expect(upcoming(first).map((e) => e.track.id)).toEqual(['b', 'c']);
  });

  it('setiap entri upcoming membawa indeks antrean untuk dipakai remove/jump', () => {
    const first = run(playing, { type: 'jump', queueIndex: 0 });
    expect(upcoming(first).map((e) => e.queueIndex)).toEqual([1, 2]);
  });
});
