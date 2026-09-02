/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  SHIM LARAS — pengganti `src/utils/Lyrics/Applyer/CreateLyricsContainer.ts`
 *  milik spicy-lyrics (86 baris).
 *  File ini DITULIS untuk LARAS pada 2026-09-02.
 *  Repo asal: https://github.com/spikerko/spicy-lyrics
 *  Commit   : 4576d022b39e98291d71c75b0d4d355bcc332ced (2026-08-29)
 *
 *  Yang digantikan: pabrik pembungkus `.SpicyLyricsScrollContainer` + daftar
 *  instansnya. Versi upstream juga memasang `ResizeObserver` yang, setiap kali
 *  ukuran berubah, menyusun ulang simplebar (`ScrollSimplebar.recalculate()`)
 *  dan mengantre scroll paksa ke baris aktif (`QueueForceScroll`) — keduanya
 *  digabung ke satu rAF per frame.
 *
 *  Nama kelas DOM dan bentuk objek kembaliannya dipertahankan supaya kode
 *  vendor (`Syllable.ts`/`Line.ts`) tidak perlu disentuh.
 *
 *  Yang HILANG karenanya:
 *  - `ResizeObserver` beserta `Resize()`-nya: tanpa simplebar tidak ada
 *    geometri buatan yang perlu dihitung ulang, dan LARAS belum mem-port
 *    `ScrollToActiveLine`. Konsekuensinya: memutar-balik ukuran pane tidak
 *    otomatis menggeser tampilan ke baris yang sedang dinyanyikan.
 *  - `GetCurrentLyricsContainerInstance()` — tidak dipakai file yang di-vendor.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { destroyLyricsVirtualizer } from "./LyricsVirtualizer";

type LyricsContainerReturnObject = {
  Container: HTMLElement;
  /** Selalu `null` di shim — lihat "yang hilang" di header. */
  ResizeListener: ResizeObserver | null;
  Append: (AppendTo: HTMLElement) => void;
  Remove: () => void;
  Resize: () => void;
};

const LyricsContainerInstances = new Map<number, LyricsContainerReturnObject>();

let lastMapIndex = -1;

export const CreateLyricsContainer = (): LyricsContainerReturnObject => {
  const Container = document.createElement("div");
  Container.classList.add("SpicyLyricsScrollContainer");

  lastMapIndex += 1;
  const currentIndex = lastMapIndex;

  const Remove = () => {
    Container.remove();
    LyricsContainerInstances.delete(currentIndex);
  };

  const ReturnObject: LyricsContainerReturnObject = {
    Container,
    ResizeListener: null,
    Append: (AppendTo: HTMLElement) => {
      AppendTo.appendChild(Container);
    },
    Remove,
    Resize: () => {},
  };

  LyricsContainerInstances.set(currentIndex, ReturnObject);

  return ReturnObject;
};

export const DestroyAllLyricsContainers = () => {
  destroyLyricsVirtualizer();
  LyricsContainerInstances.forEach((Instance) => {
    Instance.Remove();
  });
  LyricsContainerInstances.clear();
  lastMapIndex = -1;
};
