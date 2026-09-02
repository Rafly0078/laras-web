/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  SHIM LARAS — pengganti `src/utils/Lyrics/Applyer/Credits/*` milik
 *  spicy-lyrics: `ApplyLyricsCredits.ts`, `ApplyProvider.ts`, dan
 *  `ApplyIsByCommunity.tsx`.
 *  File ini DITULIS untuk LARAS pada 2026-09-02.
 *  Repo asal: https://github.com/spikerko/spicy-lyrics
 *  Commit   : 4576d022b39e98291d71c75b0d4d355bcc332ced (2026-08-29)
 *
 *  Yang digantikan: ketiganya menyuntik elemen kredit ke KAKI container lirik —
 *  daftar penulis lagu dari payload, nama penyedia lirik, dan lencana "lirik
 *  ini dari komunitas" (yang versi upstream me-render komponen React lewat
 *  createRoot ke dalam DOM Spicetify).
 *
 *  Yang HILANG karenanya: elemen kreditnya. Ini disengaja — LARAS punya
 *  atribusinya sendiri di pane lirik (`Lyrics.attribution` di
 *  `src/lib/types.ts`) dan merendernya lewat React, bukan lewat suntikan DOM.
 *  Tidak ada informasi yang hilang bagi pengguna, hanya jalur render berbeda.
 *
 *  Tanda tangan ketiganya dijaga sama (`data`, `LyricsContainer`) supaya
 *  `Syllable.ts`/`Line.ts` tidak perlu disentuh.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- parameter dijaga demi
   kesamaan tanda tangan dengan upstream; badan fungsinya memang no-op. */

/** Upstream: menempelkan daftar penulis lagu (`data.SongWriters`). */
export function ApplyLyricsCredits(
  data: unknown,
  LyricsContainer: HTMLElement
): void {}

/** Upstream: menempelkan nama penyedia lirik (`data.source`). */
export function ApplyLyricsProvider(
  data: unknown,
  LyricsContainer: HTMLElement
): void {}

/** Upstream: lencana lirik komunitas, dirender dengan React ke dalam DOM. */
export function ApplyIsByCommunity(
  data: unknown,
  LyricsContainer: HTMLElement
): void {}

/* eslint-enable @typescript-eslint/no-unused-vars */
