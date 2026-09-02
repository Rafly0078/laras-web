/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  SHIM LARAS — pengganti bagian `ClearLyricsPageContainer` dari
 *  `src/utils/Lyrics/fetchLyrics.ts` milik spicy-lyrics.
 *  File ini DITULIS untuk LARAS pada 2026-09-02.
 *  Repo asal: https://github.com/spikerko/spicy-lyrics
 *  Commit   : 4576d022b39e98291d71c75b0d4d355bcc332ced (2026-08-29)
 *
 *  Yang digantikan: `fetchLyrics.ts` upstream mengambil lirik dari API mereka,
 *  mengurus cache, romanisasi, status "tidak ada lirik", dan mengganti isi
 *  pane. Kode vendor di LARAS hanya memakai SATU fungsinya: mengosongkan pane
 *  sebelum lirik baru dipasang.
 *
 *  Yang HILANG karenanya: seluruh lapisan pengambilan lirik mereka. LARAS punya
 *  jalurnya sendiri (relay Apple + LRCLIB, lihat HANDOFF.md §8 dan §9) dan
 *  memberi datanya langsung ke Applyer.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { PageContainer } from "./PageView";

export function ClearLyricsPageContainer(): void {
  const lyricsContent = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent"
  );
  if (lyricsContent) {
    lyricsContent.innerHTML = "";
  }
}
