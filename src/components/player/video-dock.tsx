'use client';

/**
 * Dok video: SATU tempat di mana iframe YouTube hidup, selamanya.
 *
 * Iframe tidak pernah dipindah di DOM dan tidak pernah dilepas — kalau
 * dipindah, browser memuat ulang dan audio berhenti. Ia juga TIDAK PERNAH
 * terlihat: pemilik repo memutuskannya 2026-09-03 untuk menjadikan LARAS
 * audio-only. Kontainer iframe diparkir di luar layar kanan (bukan
 * display:none, bukan 0×0) supaya elemen pemutar tetap "ada" di viewport
 * fisik dan iframe tidak pernah unmount — kalau diblokir YouTube, yang
 * mati bukan cuma videonya, seluruh jembatan audio ikut mati, karena
 * `/player` InnerTube membalas UNPLAYABLE tanpa PO token.
 *
 * Kalau YouTube suatu hari menolak memutar di kontainer yang terparkir,
 * itu adalah sinyal bahwa jalur embed-audio ini sudah buntu — carilah
 * sumber audio yang baru, jangan sekadar menggeser parkirnya.
 */

import { usePlayer } from '@/lib/player/player-context';

export function VideoDock() {
  const { current, containerRef } = usePlayer();

  const hasTrack = current !== null;

  return (
    <div
      aria-hidden={!hasTrack}
      className={[
        'fixed right-0 top-0 z-40 h-[200px] w-[200px] overflow-hidden bg-black',
        'transition-all duration-300 ease-out',
        // Parkir di luar layar: 200×200 utuh, tapi tidak bersaing dengan
        // apa pun di layar. Di luar layar lagi (bukan dilepas) saat belum
        // ada lagu — ref container harus tetap hidup.
        hasTrack ? 'translate-x-[100vw]' : 'translate-x-[100vw] translate-y-[200vh]',
      ].join(' ')}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
