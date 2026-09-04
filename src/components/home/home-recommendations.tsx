'use client';

/**
 * Rak "Untukmu" — rekomendasi dari riwayat, diambil SETELAH mount.
 *
 * KENAPA KLIEN, BUKAN SERVER: riwayat hidup di localStorage, yang tidak ada di
 * server. Beranda sendiri ISR 6 jam dan HTML-nya dibagi ke seluruh pengunjung,
 * jadi rak yang personal mustahil dirender di sana — ia akan menampilkan
 * rekomendasi orang lain kepada semua orang. Komponen ini meminta datanya
 * sendiri lewat `POST /api/rekomendasi` (POST, bukan GET: id riwayat tidak
 * boleh masuk log URL — lihat komentar route handler-nya).
 *
 * Konsekuensi yang diterima: rak ini muncul BELAKANGAN. Rantai relay-nya
 * terukur ~3,9 detik, jadi skeleton-nya wajib punya tinggi yang sama dengan rak
 * jadinya — kalau tidak, seluruh Beranda melompat saat data masuk.
 *
 * Pengguna tanpa riwayat tidak melihat apa pun (bukan rak kosong berjudul):
 * "Untukmu" yang isinya nol adalah janji yang tidak ditepati.
 *
 * KENAPA FASE DITURUNKAN, BUKAN DISIMPAN: React 19 melarang `setState` di badan
 * efek (`react-hooks/set-state-in-effect`) dan larangannya benar — itu render
 * kedua yang tidak perlu. Yang disimpan hanya HASIL beserta kunci riwayat yang
 * menghasilkannya; "sedang memuat" cukup berarti "hasil yang tersimpan bukan
 * milik riwayat sekarang". Bonusnya: riwayat yang berubah otomatis kembali ke
 * skeleton tanpa satu pun pemanggilan setState tambahan.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Artwork } from '@/components/ui/artwork';
import { ShelfRow } from '@/components/ui/shelf-row';
import { SkeletonBlock } from '@/components/ui/skeleton';
import { artworkUrl } from '@/lib/data/apple';
import { useCollection } from '@/lib/player/collection-context';
import type { Track } from '@/lib/types';

/** Sama dengan `HomeShelf` — rak yang berdampingan harus punya langkah snap sama. */
const CARD_SIZE = 176;

/** Jumlah kartu palsu saat memuat. Sengaja selebar viewport, bukan 30. */
const SKELETON_CARDS = 8;

/**
 * Lagu riwayat terbaru yang ikut menentukan rekomendasi.
 *
 * Sama dengan `RECOMMENDATION_LOOKUP` di `lib/data/catalog.ts`. Dipotong di
 * klien juga supaya body permintaan tidak membawa 100 id yang server memang
 * abaikan — dan supaya kunci dependensi efek tidak berubah karena lagu ke-90.
 */
const LOOKUP_SIZE = 12;

/** Hasil yang tersimpan, beserta kunci riwayat yang menghasilkannya. */
interface Result {
  key: string;
  tracks: Track[];
}

/**
 * Kartu palsu seukuran kartu sungguhan.
 *
 * Tingginya harus cocok: artwork 176px + 2 baris teks. Angka di sini menyalin
 * `HomeShelf`; kalau kartu asli berubah, ubah di sini juga — kalau tidak,
 * Beranda melompat saat rekomendasi masuk.
 */
function SkeletonCards() {
  return (
    <>
      {Array.from({ length: SKELETON_CARDS }, (_, i) => (
        <div key={i} className="shrink-0 snap-start" style={{ width: CARD_SIZE }}>
          {/* h-44 = 11rem = 176px = CARD_SIZE. Ditulis sebagai kelas literal
              karena Tailwind tidak bisa membangkitkan kelas dari nilai runtime;
              kalau CARD_SIZE diubah, angka ini ikut diubah. */}
          <SkeletonBlock
            className="h-44 w-full rounded-[var(--radius-artwork)]"
            delayMs={i * 90}
          />
          <div className="mt-2 space-y-2">
            <SkeletonBlock className="h-3.5 rounded-full" delayMs={i * 90 + 40} />
            <SkeletonBlock className="h-3 w-20 rounded-full" delayMs={i * 90 + 80} />
          </div>
        </div>
      ))}
    </>
  );
}

/** Baca `{ lagu: Track[] }` dari respons tanpa memercayai bentuknya. */
function tracksOf(data: unknown): Track[] {
  if (typeof data !== 'object' || data === null) return [];
  const lagu = (data as { lagu?: unknown }).lagu;
  return Array.isArray(lagu) ? (lagu as Track[]) : [];
}

export function HomeRecommendations() {
  const { history } = useCollection();
  const [result, setResult] = useState<Result | null>(null);

  /* Kunci permintaan: id riwayat yang ikut menentukan hasil. Dipakai sebagai
     dependensi supaya memutar lagu BARU memicu penyegaran, sementara berpindah
     halaman lalu kembali (riwayat sama) tidak. */
  const historyKey = history
    .slice(0, LOOKUP_SIZE)
    .map((t) => t.id)
    .join(',');

  useEffect(() => {
    if (historyKey.length === 0) return;
    /* Hasil untuk riwayat ini sudah ada — jangan meminta dua kali. Ini yang
       membuat Strict Mode (yang menjalankan efek dua kali di dev) tidak
       menggandakan rantai relay empat detik. */
    if (result?.key === historyKey) return;

    /* AbortController, bukan flag boolean: kalau riwayat berubah saat permintaan
       masih jalan, permintaan lama harus benar-benar dibatalkan — bukan sekadar
       hasilnya diabaikan. Rantai relay-nya empat detik; membiarkannya jalan
       berarti membebani relay untuk hasil yang sudah tidak dipakai. */
    const controller = new AbortController();

    fetch('/api/rekomendasi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ riwayat: historyKey.split(',') }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        /* Kunci disimpan bersama hasil, jadi balasan yang datang terlambat
           untuk riwayat lama tidak pernah dianggap milik riwayat sekarang. */
        setResult({ key: historyKey, tracks: tracksOf(data) });
      })
      .catch(() => {
        /* Termasuk AbortError. Kegagalan dicatat sebagai hasil KOSONG untuk
           kunci ini supaya tidak dicoba ulang tanpa henti; rak yang tidak
           muncul adalah kegagalan yang benar di sini — tidak ada pesan error
           untuk fitur yang pengguna tidak pernah minta secara eksplisit. */
        if (!controller.signal.aborted) setResult({ key: historyKey, tracks: [] });
      });

    return () => controller.abort();
  }, [historyKey, result?.key]);

  /* Belum ada riwayat: tidak ada yang bisa direkomendasikan. */
  if (historyKey.length === 0) return null;

  const ready = result?.key === historyKey;

  /* Sudah dijawab, tapi kosong (relay gagal, atau semua kandidat sudah
     didengar): rak disembunyikan sepenuhnya, bukan ditampilkan hampa. */
  if (ready && result.tracks.length === 0) return null;

  return (
    <ShelfRow
      title="Untukmu"
      subtitle="Dari artis yang mirip dengan yang kamu dengar"
    >
      {ready ? (
        result.tracks.map((track) => (
          <div
            key={track.id}
            className="shrink-0 snap-start"
            style={{ width: CARD_SIZE }}
          >
            <Link
              href={`/lagu/${track.id}`}
              className="block rounded-[var(--radius-card)] transition hover:opacity-80"
              aria-label={`Buka ${track.title} oleh ${track.artist}`}
            >
              <Artwork
                src={artworkUrl(track.artwork, 300)}
                alt={`Sampul ${track.album ?? track.title}`}
                size={CARD_SIZE}
                rounded="md"
                /* Rak ini muncul setelah data lain sudah terlihat, jadi TIDAK
                   ada kartunya yang ikut jalur LCP — beda dari HomeShelf. */
                priority={false}
              />
              <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug">
                {track.title}
              </p>
              <p className="line-clamp-1 text-xs text-laras-secondary">{track.artist}</p>
            </Link>
          </div>
        ))
      ) : (
        <SkeletonCards />
      )}
    </ShelfRow>
  );
}
