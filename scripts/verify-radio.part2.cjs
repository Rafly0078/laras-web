/** Assertion numerik untuk radio (antrean auto-isi) + halaman yang mengikuti lagu. */

module.exports = async function run({ evalJs, check, sleep, send, apiCalls, TARGET }) {
  /** Tunggu halaman lagu benar-benar siap (tombol putar + follower terpasang). */
  async function bootTrack(id) {
    await send('Page.navigate', { url: `${TARGET}/lagu/${id}` });
    for (let i = 0; i < 60; i += 1) {
      await sleep(400);
      const ready = await evalJs(
        `Boolean(document.querySelector('h1') && [...document.querySelectorAll('button')].some((b) => /^(Putar|Jeda)/.test(b.getAttribute('aria-label') || '')))`,
      );
      if (ready) break;
    }
  }

  /** Keadaan pemutar + antrean, dibaca dari DOM (bukan dari internal React). */
  const readState = () =>
    evalJs(`(() => {
      const path = location.pathname;
      const h1 = document.querySelector('h1');
      /* Jumlah lagu yang menunggu = angka di dalam tombol "Antrean" mini player
         (mini-player.tsx merender <span>{upcoming.length}</span> di sana, dan
         span itu TIDAK ADA saat antrean kosong). Membacanya dari DOM, bukan dari
         internal React, supaya harness tidak bergantung pada bentuk state. */
      const queueBtn = document.querySelector('button[aria-label="Antrean"]');
      const queueText = queueBtn ? queueBtn.textContent.trim() : '';
      return JSON.stringify({
        path,
        trackId: path.startsWith('/lagu/') ? path.slice(6) : null,
        title: h1 ? h1.textContent.trim().slice(0, 40) : null,
        queueCount: queueText.length > 0 ? Number(queueText) : 0,
        historyLength: history.length,
        hasLyricsPane: Boolean(document.querySelector('[data-laras-lyrics]')),
      });
    })()`);

  /** Klik tombol Putar di halaman lagu, tunggu iframe terbentuk. */
  async function pressPlay() {
    await evalJs(`(() => {
      const b = [...document.querySelectorAll('button')].find((x) =>
        /^Putar/.test(x.getAttribute('aria-label') || ''));
      if (b) b.click();
      return Boolean(b);
    })()`);
    for (let i = 0; i < 40; i += 1) {
      await sleep(400);
      const ok = await evalJs(`document.querySelectorAll('iframe').length > 0`);
      if (ok) break;
    }
  }

  /** Tombol "lanjut" di mini player — jalur yang sama dengan lagu habis. */
  const pressNext = () =>
    evalJs(`(() => {
      const b = document.querySelector('button[aria-label="Lagu berikutnya"]');
      if (b) { b.click(); return b.getAttribute('aria-label'); }
      return null;
    })()`);

  /* ── 1. Prasyarat: antrean satu lagu ───────────────────────────────── */

  console.log('\n[1] Prasyarat — antrean dari halaman lagu');

  /* Id dari Beranda SUNGGUHAN (aturan #3 AGENTS.md: jangan menebak id). */
  await send('Page.navigate', { url: `${TARGET}/` });
  let firstHref = null;
  for (let i = 0; i < 40; i += 1) {
    await sleep(400);
    firstHref = await evalJs(
      `(() => { const a = document.querySelector('a[href^="/lagu/"]'); return a ? a.getAttribute('href') : null; })()`,
    );
    if (firstHref) break;
  }

  if (firstHref === null) {
    check('menemukan tautan lagu di Beranda', false, 'rak tidak memuat lagu');
    return;
  }

  const firstId = firstHref.replace('/lagu/', '');
  check('id lagu diambil dari Beranda sungguhan', true, firstId);

  /* Riwayat dibersihkan supaya benih radio adalah lagu yang diputar, bukan sisa
     riwayat dari harness lain. */
  await evalJs(`localStorage.removeItem('laras.collection.v1')`);

  await bootTrack(firstId);
  const before = JSON.parse(await readState());
  check('halaman lagu terbuka', before.trackId === firstId, before.path);
  check('pane lirik ditandai data-laras-lyrics', before.hasLyricsPane === true);

  /* ── 2. Radio mengisi antrean ──────────────────────────────────────── */

  console.log('\n[2] Radio mengisi antrean');

  apiCalls.length = 0;
  await pressPlay();

  /* Radio menembak /api/rekomendasi karena antrean cuma 1 lagu (upcoming = 0). */
  let sawApi = false;
  for (let i = 0; i < 50; i += 1) {
    await sleep(400);
    if (apiCalls.length > 0) {
      sawApi = true;
      break;
    }
  }

  check(
    'radio meminta rekomendasi saat antrean hampir habis',
    sawApi,
    `${apiCalls.length} permintaan`,
  );
  check(
    'permintaan radio memakai POST',
    apiCalls.length > 0 && apiCalls.every((m) => m === 'POST'),
    apiCalls.join(',') || 'tidak ada',
  );

  /* Tunggu antrean benar-benar bertambah. Dibaca dari tombol antrean di mini
     player yang menyebut hitungannya. */
  let queueGrew = null;
  for (let i = 0; i < 50; i += 1) {
    await sleep(400);
    const snap = JSON.parse(await readState());
    if (snap.queueCount > 0) {
      queueGrew = snap;
      break;
    }
  }

  check(
    'antrean bertambah dari 1 lagu (radio bekerja)',
    queueGrew !== null && queueGrew.queueCount >= 1,
    queueGrew ? `${queueGrew.queueCount} lagu menunggu` : 'antrean tidak pernah bertambah',
  );

  if (queueGrew === null) {
    await evalJs(`localStorage.removeItem('laras.collection.v1')`);
    return;
  }

  /* ── 3. Halaman ikut lagu yang diputar ─────────────────────────────── */

  console.log('\n[3] Halaman ikut lagu berikutnya');

  const historyBefore = JSON.parse(await readState()).historyLength;
  const label = await pressNext();
  check('tombol lanjut ditemukan di mini player', label !== null, label ?? 'tidak ada');

  let moved = null;
  for (let i = 0; i < 60; i += 1) {
    await sleep(400);
    const snap = JSON.parse(await readState());
    if (snap.trackId !== null && snap.trackId !== firstId) {
      moved = snap;
      break;
    }
  }

  check(
    'URL berpindah ke lagu yang sedang diputar',
    moved !== null,
    moved ? `${firstId} → ${moved.trackId}` : 'URL tidak pernah berubah',
  );

  if (moved !== null) {
    check(
      'judul halaman ikut berganti (bukan cuma lirik)',
      moved.title !== null && moved.title !== before.title,
      `${before.title} → ${moved.title}`,
    );
    check(
      'replace, bukan push (riwayat browser tidak menumpuk)',
      moved.historyLength === historyBefore,
      `${historyBefore} → ${moved.historyLength} entri`,
    );

    /* Pane lirik lagu BARU datang di bawah <Suspense> — relay `/lyrics` butuh
       9,8-11,7 detik untuk lagu yang belum pernah diminta (HANDOFF §8), jadi
       harus di-poll. Membacanya langsung setelah URL berubah akan selalu
       melaporkan "tidak ada" dan itu mengukur skeleton, bukan cacat. */
    let paneReady = false;
    for (let i = 0; i < 60; i += 1) {
      const snap = JSON.parse(await readState());
      if (snap.hasLyricsPane) {
        paneReady = true;
        break;
      }
      await sleep(500);
    }
    check('pane lirik lagu baru terpasang', paneReady);
  }

  /* ── 4. Penundaan saat pengguna menggulir lirik ────────────────────── */

  console.log('\n[4] Penundaan saat menggulir lirik');

  if (moved === null) {
    await evalJs(`localStorage.removeItem('laras.collection.v1')`);
    return;
  }

  const beforeScroll = JSON.parse(await readState()).trackId;

  /* Sentuh area lirik SEBELUM memicu perpindahan, lalu pantau: URL harus TETAP
     selama jeda tenang (2,5s), lalu berpindah sendiri sesudahnya.
     
     Hasil dispatch DIPERIKSA: pane lirik datang di bawah <Suspense> (relay
     ~10 detik), dan kalau ia belum ada, event-nya tidak pernah tercatat —
     assertion penundaan lalu gagal karena alat ukurnya, bukan karena kodenya.
     Kegagalan pertama harness ini persis begitu. */
  const dispatched = await evalJs(`(() => {
    const pane = document.querySelector('[data-laras-lyrics]');
    if (!pane) return 'tidak ada pane';
    pane.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 120 }));
    return 'ok';
  })()`);

  check('event gulir bisa dikirim ke pane lirik', dispatched === 'ok', dispatched);

  await pressNext();

  /* Segera setelah lanjut: masih di lagu yang sama karena penundaan. Diukur
     cepat (400ms) supaya jelas ini sebelum jeda 2,5s lewat. */
  await sleep(400);
  const during = JSON.parse(await readState());
  check(
    'perpindahan DITUNDA selagi pengguna baru menggulir lirik',
    during.trackId === beforeScroll,
    `masih di ${during.trackId}`,
  );

  /* Setelah jeda tenang lewat, halaman harus menyusul sendiri — penundaan bukan
     penolakan. */
  let after = null;
  for (let i = 0; i < 40; i += 1) {
    await sleep(400);
    const snap = JSON.parse(await readState());
    if (snap.trackId !== beforeScroll) {
      after = snap;
      break;
    }
  }

  check(
    'setelah jeda tenang, halaman menyusul sendiri',
    after !== null,
    after ? `${beforeScroll} → ${after.trackId}` : 'tidak pernah menyusul',
  );

  /* Bersihkan: riwayat sintetis akan mengubah hero Beranda dan rak "Untukmu"
     untuk harness lain yang memakai profil Chrome yang sama. */
  await evalJs(`localStorage.removeItem('laras.collection.v1')`);
};
