/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  SHIM LARAS — pengganti `src/utils/Lyrics/Applyer/OnApply.ts` milik
 *  spicy-lyrics (18 baris).
 *  File ini DITULIS untuk LARAS pada 2026-09-02.
 *  Repo asal: https://github.com/spikerko/spicy-lyrics
 *  Commit   : 4576d022b39e98291d71c75b0d4d355bcc332ced (2026-08-29)
 *
 *  Yang digantikan: dua pemancar event ke bus global mereka
 *  (`Global.Event.evoke("lyrics:apply" | "lyrics:not-apply")`), yang di
 *  aplikasi upstream dipakai kartu NPV, tombol fullscreen, dan panel setelan
 *  untuk ikut bereaksi saat lirik terpasang.
 *
 *  Yang HILANG karenanya: event-nya. Tidak ada yang mendengarkan di LARAS —
 *  adapter React sudah tahu kapan ia memanggil Applyer.
 *
 *  Satu efek DOM upstream DIPERTAHANKAN: `EmitApply` melepas kelas
 *  `HiddenTransitioned` dari `.LyricsContent`. Kelas itu yang menahan pane
 *  tetap tersembunyi sampai lirik siap; kalau dibuang, pane bisa tinggal
 *  transparan begitu CSS upstream dipakai.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { PageContainer } from "./PageView";

const EmitNotApplyed = () => {
  // Tanpa bus event: tidak ada apa pun yang perlu dikerjakan.
};

/* eslint-disable-next-line @typescript-eslint/no-unused-vars -- tanda tangan
   dijaga sama dengan upstream supaya pemanggil di kode vendor tidak berubah. */
const EmitApply = (Type: string, Content: unknown) => {
  PageContainer?.querySelector(
    ".LyricsContainer .LyricsContent"
  )?.classList.remove("HiddenTransitioned");
};

export { EmitApply, EmitNotApplyed };
