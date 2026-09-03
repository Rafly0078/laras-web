'use client';

/**
 * Sapaan waktu di header Beranda.
 *
 * Pola store eksternal kecil — sama seperti `collection-context`: snapshot
 * server adalah `null` (render server TIDAK merender apa pun di sini) dan
 * snapshot klien diisi sekali saat modul pertama kali dibaca di browser.
 *
 * Kenapa bukan `new Date()` langsung di render server: waktu server (UTC di
 * Vercel) pasti berbeda dari jam pengguna, dan dua teks yang bertabrakan
 * berarti hydration mismatch. Kenapa bukan `useState` + efek: larangan
 * `react-hooks/set-state-in-effect` di repo ini (HANDOFF §4 #16);
 * `useSyncExternalStore` adalah jalur yang memang disediakan untuk store di
 * luar React.
 *
 * Sapaan dihitung SEKALI saat modul dimuat, bukan disegarkan per jam:
 * penyegaran hanya akan memunculkan render baru di tengah sesi — lebih rumit
 * daripada yang dibelanjakan untuk satu baris sapaan.
 */

import { useSyncExternalStore } from 'react';

import { greetingText } from '@/lib/home/greeting';

let snapshot: string | null = null;

function subscribe(onChange: () => void): () => void {
  // Nilai tidak pernah berubah setelah dihitung, jadi tidak ada yang perlu
  // diurutkan — tapi bentuk API-nya tetap lengkap (dan bisa dikembangkan,
  // mis. penyegaran per jam, tanpa mengganti pemakainya).
  void onChange;
  return () => {};
}

function getSnapshot(): string | null {
  if (snapshot === null && typeof window !== 'undefined') {
    snapshot = greetingText(new Date());
  }
  return snapshot;
}

/** Server tidak punya jam pengguna — jawaban yang benar adalah "tidak ada". */
function getServerSnapshot(): string | null {
  return null;
}

export function HomeGreeting() {
  const line = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (line === null) return null;
  return <p className="mb-1 text-sm font-medium text-laras-secondary">{line}</p>;
}
