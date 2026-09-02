/**
 * Penggabungan permintaan yang identik dan sedang berjalan (request coalescing).
 *
 * MASALAH YANG DISELESAIKAN, dengan angka: `/lyrics` butuh 9,5–11,5 detik untuk
 * lagu yang belum pernah diminta. Kalau sepuluh pengunjung membuka lagu baru
 * yang SAMA dalam jendela sepuluh detik itu, cache Next belum berisi apa pun —
 * jadi sepuluh permintaan berjalan ke relay sekaligus. Relay pihak ketiga tidak
 * berhutang apa pun pada kita; itu cara tercepat untuk diblokir.
 *
 * Yang dilakukan di sini: permintaan pertama menyimpan promise-nya, sembilan
 * berikutnya menunggu promise yang sama. Satu panggilan keluar, sepuluh
 * pengunjung dilayani.
 *
 * BATASNYA HARUS DIPAHAMI: peta ini hidup di MEMORI SATU PROSES. Di Vercel
 * setiap instance punya memorinya sendiri, jadi ini menggabungkan per instance,
 * bukan per dunia. Untuk global butuh Redis, dan itu berarti layanan berbayar
 * plus satu titik gagal baru. Untuk lalu lintas app ini, per instance sudah
 * memotong bagian terburuknya.
 *
 * Entri dihapus saat promise-nya selesai — sukses MAUPUN gagal. Kalau hanya
 * yang sukses dihapus, satu kegagalan akan disajikan berulang selamanya.
 * Promise yang menggantung tidak jadi kebocoran karena `fetchJson` selalu
 * memasang AbortSignal.timeout, jadi setiap permintaan pasti selesai.
 */

export interface Coalescer {
  /** Jalankan `run`, atau ikut menunggu kalau kunci yang sama sedang jalan. */
  run<T>(key: string, run: () => Promise<T>): Promise<T>;
  /** Berapa permintaan yang sedang berjalan. Untuk test dan diagnostik. */
  readonly pending: number;
}

export function createCoalescer(): Coalescer {
  const inFlight = new Map<string, Promise<unknown>>();

  return {
    run<T>(key: string, task: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(key);
      if (existing !== undefined) return existing as Promise<T>;

      /* `task()` dipanggil di luar try: kalau ia melempar SECARA SINKRON,
         promise-nya tidak akan pernah ada dan menyimpannya akan menyesatkan. */
      const started = task();
      const tracked = started.finally(() => {
        // Hanya hapus kalau entri ini masih milik kita. Tanpa penjagaan ini,
        // permintaan lama yang selesai belakangan bisa menghapus entri
        // permintaan baru dengan kunci yang sama.
        if (inFlight.get(key) === tracked) inFlight.delete(key);
      });

      inFlight.set(key, tracked);
      return tracked;
    },

    get pending() {
      return inFlight.size;
    },
  };
}

/**
 * Instance bersama untuk seluruh proses.
 *
 * Modul dievaluasi sekali per proses Node, jadi ini memang satu peta untuk
 * semua permintaan yang dilayani instance tersebut. Test membuat coalescer
 * sendiri lewat `createCoalescer()` supaya tidak saling mengotori.
 */
export const relayCoalescer = createCoalescer();
