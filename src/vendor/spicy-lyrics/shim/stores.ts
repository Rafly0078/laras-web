/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  SHIM LARAS — pengganti `src/utils/stores.ts` milik spicy-lyrics.
 *  Repo asal: https://github.com/spikerko/spicy-lyrics
 *  Commit   : 4576d022b39e98291d71c75b0d4d355bcc332ced (2026-08-29)
 *  Nilai default di bawah disalin dari file itu; hak cipta (c) Spikerko,
 *  AGPL-3.0. File ini DITULIS untuk LARAS pada 2026-09-02, bukan disalin.
 *
 *  Yang digantikan: 110 baris store nanostores yang menyimpan SELURUH setelan
 *  Spicetify ke `Spicetify.LocalStorage` (`persistAtom`, migrasi kunci, versi
 *  proyek). Mesin lirik hanya menyentuh lima atom di antaranya.
 *
 *  Yang HILANG karenanya:
 *  - Persistensi. Tidak ada yang ditulis/dibaca dari localStorage; setiap
 *    reload memulai dari nilai tetap di bawah.
 *  - Panel setelan. Di aplikasi mereka pengguna bisa menyalakan
 *    simpleLyricsMode / minimalLyricsMode saat runtime; di sini keduanya
 *    dibekukan (read-only) karena LARAS tidak punya UI setelannya dan
 *    keputusan desainnya adalah mode penuh.
 *  - `$simpleLyricsMode.subscribe()` tetap ada dan tetap dipanggil sekali saat
 *    berlangganan (persis semantik nanostores), tapi tidak akan pernah
 *    berbunyi lagi — jadi spline yang dihitung ulang di LyricsAnimator selalu
 *    memakai kurva mode penuh.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Store yang hanya bisa dibaca — permukaan minimum yang dipakai mesin lirik. */
export interface ReadableAtom<T> {
  get(): T;
  /** Sama seperti nanostores: listener dipanggil SEKALI saat berlangganan. */
  subscribe(listener: (value: T) => void): () => void;
}

/** Store yang boleh diubah adapter React LARAS. */
export interface WritableAtom<T> extends ReadableAtom<T> {
  set(value: T): void;
}

/*
 * Tiruan `atom()` nanostores dalam 15 baris. Sengaja tidak memasang nanostores:
 * lima nilai tetap tidak perlu paket runtime, dan mesin lirik hanya memakai
 * get/set/subscribe.
 */
function atom<T>(initial: T): WritableAtom<T> {
  let value = initial;
  const listeners = new Set<(value: T) => void>();

  return {
    get: () => value,
    set(next: T) {
      // nanostores juga menahan notifikasi kalau nilainya identik.
      if (next === value) return;
      value = next;
      for (const listener of listeners) listener(value);
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(value);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Nilai tetap: dibekukan sebagai read-only supaya tidak ada yang mengubahnya. */
function frozenAtom<T>(value: T): ReadableAtom<T> {
  const inner = atom(value);
  return { get: inner.get, subscribe: inner.subscribe };
}

/**
 * "Simple Lyrics Mode" upstream = render hemat (tanpa gradient sapuan, huruf
 * dianimasikan lebih sederhana). LARAS memilih mode penuh, jadi `false`.
 */
export const $simpleLyricsMode: ReadableAtom<boolean> = frozenAtom(false);

/**
 * Hanya dibaca kalau simpleLyricsMode menyala. Nilai default upstream
 * "calculate" dipertahankan supaya cabang kodenya tidak berubah arti.
 */
export const $simpleLyricsModeRenderingType: ReadableAtom<string> =
  frozenAtom("calculate");

/**
 * "Minimal Lyrics Mode" upstream memperpanjang jeda yang dianggap interlude
 * (5 detik, bukan 3) dan merentangkan akhir baris ke awal baris berikutnya.
 * LARAS memakai perilaku default, jadi `false`.
 */
export const $minimalLyricsMode: ReadableAtom<boolean> = frozenAtom(false);

/**
 * Jenis lirik yang sedang terpasang: "None" | "Syllable" | "Line" | "Static".
 * WAJIB diset adapter sebelum `TimeSetter`/`Animate` dipanggil — kalau masih
 * "None" keduanya langsung keluar dan tidak ada yang bergerak.
 */
export const $currentLyricsType: WritableAtom<string> = atom<string>("None");

/**
 * Penjaga di pintu masuk `ApplySyllableLyrics`/`ApplyLineLyrics`: keduanya
 * `return` kalau ini `false`. Diset otomatis oleh
 * `setLyricsPageContainer()` di shim/PageView.ts.
 */
export const $lyricsContainerExists: WritableAtom<boolean> = atom(false);
