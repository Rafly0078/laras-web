/** Assertion numerik untuk rak rekomendasi "Untukmu". */

/** Bentuk `Track` minimum yang lolos `toStoredTrack` di collection.ts. */
function storedTrack(id, title, artist) {
  return {
    id,
    title,
    artist,
    album: null,
    durationSeconds: 200,
    isrc: null,
    hasLyrics: false,
    artwork: null,
    trackNumber: null,
    discNumber: null,
    explicit: false,
    audio: null,
  };
}

module.exports = async function run({
  evalJs,
  check,
  sleep,
  send,
  apiCalls,
  TARGET,
  hold,
  releaseHeld,
  heldCount,
}) {
  /** Tunggu Beranda benar-benar terhidrasi (bukan cuma readyState complete). */
  async function bootHome() {
    await send('Page.navigate', { url: `${TARGET}/` });
    for (let i = 0; i < 60; i += 1) {
      await sleep(400);
      const ready = await evalJs(
        `Boolean(document.querySelector('a[href^="/lagu/"]') && document.querySelector('button[aria-controls="laras-sidebar"]'))`,
      );
      if (ready) break;
    }
  }

  /** Satu bacaan keadaan rak "Untukmu". */
  const readShelf = () =>
    evalJs(`(() => {
      const heads = [...document.querySelectorAll('h2')];
      const title = heads.find((h) => h.textContent.trim() === 'Untukmu') ?? null;
      const section = title ? title.closest('section') : null;
      const strip = section ? section.querySelector('[class*="overflow-x-auto"]') : null;
      const cards = strip ? [...strip.children] : [];
      const links = section ? [...section.querySelectorAll('a[href^="/lagu/"]')] : [];
      const skeletons = section ? section.querySelectorAll('.laras-skeleton').length : 0;
      const first = cards[0] ? cards[0].getBoundingClientRect() : null;
      return JSON.stringify({
        found: section !== null,
        subtitle: section
          ? (section.querySelector('p')?.textContent ?? '').trim().slice(0, 60)
          : null,
        cards: cards.length,
        links: links.length,
        hrefs: links.slice(0, 40).map((a) => new URL(a.href).pathname.replace('/lagu/', '')),
        skeletons,
        firstCardW: first ? Math.round(first.width) : null,
        firstCardH: first ? Math.round(first.height) : null,
        /* Rak lain sebagai pembanding: kalau "Untukmu" hilang tapi rak
           editorial juga hilang, yang rusak halamannya, bukan fiturnya. */
        totalShelves: heads.filter((h) => h.closest('section')).length,
      });
    })()`);

  /* ── 1. Riwayat kosong: rak TIDAK ADA ──────────────────────────────── */

  console.log('\n[1] Riwayat kosong');

  await bootHome();
  await evalJs(`localStorage.removeItem('laras.collection.v1')`);
  await bootHome();
  await sleep(1200);

  apiCalls.length = 0;
  const empty = JSON.parse(await readShelf());

  check('rak "Untukmu" tidak dirender tanpa riwayat', empty.found === false);
  check(
    'rak editorial tetap ada (jadi halamannya sehat)',
    empty.totalShelves >= 4,
    `${empty.totalShelves} rak`,
  );
  check(
    'tidak ada permintaan /api/rekomendasi tanpa riwayat',
    apiCalls.length === 0,
    `${apiCalls.length} permintaan`,
  );

  /* ── 2. Riwayat terisi: skeleton lalu isi ──────────────────────────── */

  console.log('\n[2] Riwayat terisi');

  /* Dua lagu Tulus dari katalog SUNGGUHAN (id diambil dari Beranda live pada
     sesi pengembangan; aturan #3 AGENTS.md melarang menebak id — keduanya
     diverifikasi ada lewat /song/<id>). */
  const seedIds = ['6784585105'];
  const collection = {
    version: 1,
    history: [storedTrack('6784585105', 'Teh Hijau', 'Tulus')],
    favorites: [],
  };

  await evalJs(
    `localStorage.setItem('laras.collection.v1', ${JSON.stringify(JSON.stringify(collection))})`,
  );

  apiCalls.length = 0;
  /* Permintaan DITAHAN di tingkat CDP supaya skeleton punya jendela yang pasti.
     Tanpa ini assertion-nya bergantung pada hangat/tidaknya Data Cache — 2,7s
     saat cold vs 30ms saat hangat (keduanya terukur), dan yang kedua membuat
     skeleton lewat di antara dua polling. */
  hold();
  await bootHome();

  /* Tunggu permintaannya benar-benar tertahan, baru ukur skeleton. */
  let sawSkeleton = null;
  for (let i = 0; i < 40; i += 1) {
    await sleep(150);
    if (heldCount() === 0) continue;
    const snap = JSON.parse(await readShelf());
    if (snap.found && snap.skeletons > 0) {
      sawSkeleton = snap;
      break;
    }
  }

  check(
    'skeleton tampil selagi menunggu relay',
    sawSkeleton !== null,
    sawSkeleton ? `${sawSkeleton.skeletons} blok, ${sawSkeleton.cards} kartu` : 'tidak tertangkap',
  );

  if (sawSkeleton !== null) {
    check(
      'kartu skeleton selebar kartu rak (176px)',
      sawSkeleton.firstCardW === 176,
      `${sawSkeleton.firstCardW}px`,
    );
    check(
      'tinggi kartu skeleton ≈ kartu jadinya (halaman tidak melompat)',
      sawSkeleton.firstCardH >= 210 && sawSkeleton.firstCardH <= 250,
      `${sawSkeleton.firstCardH}px`,
    );
  }

  await releaseHeld();

  /* Tunggu isi sungguhan. */
  let filled = null;
  for (let i = 0; i < 60; i += 1) {
    await sleep(400);
    const snap = JSON.parse(await readShelf());
    if (snap.found && snap.links > 0) {
      filled = snap;
      break;
    }
    if (!snap.found && i > 20) break;
  }

  if (filled === null) {
    check('rak "Untukmu" terisi lagu', false, 'tidak pernah terisi dalam 24 detik');
    await evalJs(`localStorage.removeItem('laras.collection.v1')`);
    return;
  }

  check('rak "Untukmu" terisi lagu', filled.links > 0, `${filled.links} kartu`);
  check(
    'jumlah kartu = ukuran rak (30)',
    filled.links === 30,
    `${filled.links} kartu`,
  );
  check(
    'subtitle menjelaskan asal rekomendasi',
    /artis yang mirip/i.test(filled.subtitle ?? ''),
    filled.subtitle,
  );
  check('skeleton hilang setelah data masuk', filled.skeletons === 0, `${filled.skeletons} blok`);

  /* ── 3. Isi rak bukan lagu dari riwayat ────────────────────────────── */

  console.log('\n[3] Bukan mendaur ulang riwayat');

  check(
    'lagu di riwayat TIDAK muncul di rekomendasi',
    filled.hrefs.every((id) => !seedIds.includes(id)),
    `riwayat: ${seedIds.join(',')} | rak memuatnya: ${filled.hrefs.filter((id) => seedIds.includes(id)).length}`,
  );
  check(
    'tidak ada id ganda di dalam rak',
    new Set(filled.hrefs).size === filled.hrefs.length,
    `${new Set(filled.hrefs).size} unik dari ${filled.hrefs.length}`,
  );

  /* ── 4. Jumlah permintaan ──────────────────────────────────────────── */

  console.log('\n[4] Jumlah permintaan');

  check(
    'tepat SATU permintaan /api/rekomendasi per kunjungan',
    apiCalls.length === 1,
    `${apiCalls.length} permintaan`,
  );
  check(
    'permintaan memakai POST (id riwayat tidak di URL)',
    apiCalls.every((c) => c.method === 'POST'),
    apiCalls.map((c) => c.method).join(',') || 'tidak ada',
  );
  check(
    'URL permintaan tidak memuat id lagu',
    apiCalls.every((c) => !/\d{6,}/.test(c.url)),
    apiCalls[0]?.url ?? 'tidak ada',
  );

  /* ── 5. Urutan stabil pada kunjungan berikutnya ────────────────────── */

  console.log('\n[5] Urutan stabil (bukan Math.random)');

  apiCalls.length = 0;
  await bootHome();

  let again = null;
  for (let i = 0; i < 60; i += 1) {
    await sleep(400);
    const snap = JSON.parse(await readShelf());
    if (snap.found && snap.links > 0) {
      again = snap;
      break;
    }
  }

  check(
    'kunjungan kedua memberi urutan yang SAMA',
    again !== null && JSON.stringify(again.hrefs) === JSON.stringify(filled.hrefs),
    again ? `${again.hrefs.slice(0, 3).join(',')} vs ${filled.hrefs.slice(0, 3).join(',')}` : 'tidak terisi',
  );

  /* Bersihkan: harness lain memakai profil Chrome yang sama, dan riwayat
     sintetis akan mengubah hero Beranda ("Lanjut diputar") di verify-home. */
  await evalJs(`localStorage.removeItem('laras.collection.v1')`);
};
