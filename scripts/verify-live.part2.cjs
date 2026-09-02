/** Assertion untuk aplikasi live: data relay, pemutar global, navigasi. */

module.exports = async function run({ evalJs, check, sleep, goto, clickNavigate }) {
  /* ── 1. Beranda dari data LIVE ────────────────────────────────────── */

  console.log('\n[1] Beranda (data live dari relay)');

  const homeReady = await goto('/', 'section h2');
  check('Beranda dimuat', homeReady);

  const home = JSON.parse(
    await evalJs(`(() => {
      const shelves = [...document.querySelectorAll('section')].filter(
        (s) => s.querySelector('h2') && s.querySelector('[class*="overflow-x-auto"]'),
      );
      const links = [...document.querySelectorAll('a[href^="/lagu/"]')];
      const ids = [...new Set(links.map((a) => a.getAttribute('href')))];
      return JSON.stringify({
        shelves: shelves.length,
        titles: shelves.map((s) => s.querySelector('h2').textContent.trim()),
        trackLinks: links.length,
        uniqueTracks: ids.length,
        firstHref: ids[0] ?? null,
      });
    })()`),
  );

  check('empat rak dari relay', home.shelves === 4, `${home.shelves} rak`);
  check(
    'judul rak sesuai playlist editorial',
    home.titles.includes('Top 100: Indonesia'),
    JSON.stringify(home.titles),
  );
  check(
    'kartu tertaut ke halaman lagu dengan id Apple',
    home.uniqueTracks > 50,
    `${home.uniqueTracks} lagu unik, contoh ${home.firstHref}`,
  );
  check(
    'id lagu berbentuk angka katalog Apple',
    /^\/lagu\/\d+$/.test(home.firstHref ?? ''),
    home.firstHref,
  );

  /* ── 2. Sidebar aktif + playlist hidup ───────────────────────────── */

  console.log('\n[2] Playlist (tautan sidebar tidak lagi mati)');

  const playlistReady = await goto('/playlist/top-100-indonesia', '[aria-label^="Putar"]');
  check('halaman playlist dimuat', playlistReady);

  const playlist = JSON.parse(
    await evalJs(`(() => {
      const rows = [...document.querySelectorAll('[aria-label^="Putar"]')];
      const current = [...document.querySelectorAll('[aria-current="page"]')];
      const durations = rows
        .map((r) => (r.textContent.match(/\\d+:\\d{2}/) || [])[0])
        .filter(Boolean);
      return JSON.stringify({
        rows: rows.length,
        activeNav: current.length,
        activeHref: current[0] ? new URL(current[0].href).pathname : null,
        withDuration: durations.length,
        firstLabel: rows[0] ? rows[0].getAttribute('aria-label') : null,
      });
    })()`),
  );

  check('playlist berisi banyak lagu', playlist.rows > 20, `${playlist.rows} baris`);
  check(
    'sidebar menandai playlist ini aktif',
    playlist.activeHref === '/playlist/top-100-indonesia',
    playlist.activeHref,
  );
  check(
    'setiap baris menampilkan durasi',
    playlist.withDuration === playlist.rows,
    `${playlist.withDuration}/${playlist.rows}`,
  );
  check(
    'aria-label baris deskriptif',
    (playlist.firstLabel ?? '').includes('oleh'),
    playlist.firstLabel,
  );

  /* ── 3. Pencarian live ───────────────────────────────────────────── */

  console.log('\n[3] Pencarian live');

  const searchReady = await goto('/cari?q=tulus', '[aria-label^="Putar"]');
  check('hasil pencarian dimuat', searchReady);

  const search = JSON.parse(
    await evalJs(`(() => {
      const rows = [...document.querySelectorAll('[aria-label^="Putar"]')];
      const albums = [...document.querySelectorAll('a[href^="/album/"]')];
      const artists = [...document.querySelectorAll('a[href^="/artis/"]')];
      const input = document.querySelector('input[type="search"]');
      const text = document.body.innerText;
      return JSON.stringify({
        rows: rows.length,
        albums: albums.length,
        artists: artists.length,
        inputValue: input ? input.value : null,
        mentionsTulus: /tulus/i.test(text),
      });
    })()`),
  );

  check('lagu ditemukan', search.rows > 0, `${search.rows} lagu`);
  check('album ditemukan', search.albums > 0, `${search.albums} album`);
  check('artis ditemukan', search.artists > 0, `${search.artists} artis`);
  check('kotak masukan terisi dari URL', search.inputValue === 'tulus', search.inputValue);
  check('hasil relevan dengan kueri', search.mentionsTulus === true);

  /* ── 4. Pencarian mengubah URL (bisa dibagikan) ──────────────────── */

  const typed = await evalJs(`(() => {
    const input = document.querySelector('input[type="search"]');
    if (!input) return 'tidak ada input';
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value',
    ).set;
    setter.call(input, 'nadin amizah');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);
  check('kotak masukan bisa diisi', typed === 'ok');

  // Debounce 400ms + navigasi + fetch relay.
  let urlChanged = false;
  for (let i = 0; i < 30; i += 1) {
    await sleep(500);
    const url = await evalJs('location.search');
    if (url.includes('nadin')) {
      urlChanged = true;
      break;
    }
  }
  check('mengetik mengubah URL (hasil bisa dibagikan)', urlChanged);

  /* ── 5. Halaman lagu: lirik LIVE dari relay ──────────────────────── */

  console.log('\n[4] Halaman lagu dengan lirik live');

  // Lirik cold bisa 10 detik, jadi jendela tunggunya lebar.
  const trackReady = await goto('/lagu/1050615679', '[aria-label^="Lompat ke"]');
  check('halaman lagu dimuat dengan lirik', trackReady);

  const trackPage = JSON.parse(
    await evalJs(`(() => {
      const lines = [...document.querySelectorAll('[aria-label^="Lompat ke"]')];
      const words = [...document.querySelectorAll('[aria-label^="Lompat ke"] span')];
      const playBtn = [...document.querySelectorAll('button[aria-label^="Putar"]')];
      const h1 = document.querySelector('h1');
      const text = document.body.innerText;
      return JSON.stringify({
        lines: lines.length,
        words: words.length,
        hasPlayButton: playBtn.length > 0,
        title: h1 ? h1.textContent.trim() : null,
        perKata: /lirik per kata/i.test(text),
        hint: /Putar lagu ini untuk menyinkronkan/i.test(text),
      });
    })()`),
  );

  check('lirik dari relay dirender', trackPage.lines > 10, `${trackPage.lines} baris`);
  check(
    'lirik word-level (banyak span kata)',
    trackPage.words > 100,
    `${trackPage.words} span`,
  );
  check('ditandai sebagai lirik per kata', trackPage.perKata === true);
  check('ada tombol putar', trackPage.hasPlayButton === true);
  check('judul lagu tampil', (trackPage.title ?? '').length > 0, trackPage.title);
  check(
    'ada petunjuk bahwa lirik menunggu diputar',
    trackPage.hint === true,
  );

  /* ── 6. Pemutar global: iframe SELAMAT dari navigasi ─────────────── */

  console.log('\n[5] Pemutar global bertahan lewat navigasi');

  /*
   * Iframe SENGAJA belum ada sebelum lagu pertama diputar: skrip IFrame API
   * YouTube baru diunduh saat dibutuhkan, sehingga kunjungan yang tidak memutar
   * apa pun tidak membayar biayanya. Jadi harness harus MEMUTAR dulu, bukan
   * mengharapkan iframe ada sejak awal.
   */
  const beforePlay = await evalJs(
    `[...document.querySelectorAll('iframe')].filter((f) => (f.src || '').includes('youtube')).length`,
  );
  check(
    'iframe belum dibuat sebelum ada yang diputar (hemat)',
    beforePlay === 0,
    `${beforePlay} iframe`,
  );

  // Putar dari playlist: baris pertama.
  await goto('/playlist/top-100-indonesia', '[aria-label^="Putar"]');
  await evalJs(`(() => {
    const row = document.querySelector('[aria-label^="Putar"]');
    if (row) row.click();
    return 'clicked';
  })()`);

  // Penjembatanan audio (server action -> YouTube Music) butuh ~1-3 detik,
  // lalu iframe dibuat dan skrip API diunduh.
  let framesAfterPlay = 0;
  for (let i = 0; i < 40; i += 1) {
    await sleep(500);
    framesAfterPlay = await evalJs(
      `[...document.querySelectorAll('iframe')].filter((f) => (f.src || '').includes('youtube')).length`,
    );
    if (framesAfterPlay > 0) break;
  }
  check(
    'klik baris memicu penjembatanan audio dan membuat iframe',
    framesAfterPlay > 0,
    `${framesAfterPlay} iframe`,
  );

  const miniPlayer = JSON.parse(
    await evalJs(`(() => {
      const bar = document.querySelector('[aria-label="Posisi lagu"]');
      const next = document.querySelector('button[aria-label="Lagu berikutnya"]');
      const link = document.querySelector('a[href^="/lagu/"]');
      return JSON.stringify({
        hasProgress: bar !== null,
        hasNext: next !== null,
        // Mini player menautkan judul ke halaman lagunya.
        hasTitleLink: link !== null,
      });
    })()`),
  );
  check('mini player muncul dengan bar progres', miniPlayer.hasProgress === true);
  check('mini player punya tombol lanjut', miniPlayer.hasNext === true);

  // Tandai iframe supaya bisa dikenali lagi setelah navigasi.
  await evalJs(`(() => {
    const f = [...document.querySelectorAll('iframe')].find((x) => (x.src || '').includes('youtube'));
    if (f) f.dataset.larasProbe = 'kept';
    return 'tagged';
  })()`);

  // Navigasi SPA lewat klik tautan sidebar.
  const navigated = await clickNavigate('a[href="/cari"]', '/cari', 'halaman cari');
  check('navigasi SPA ke /cari berhasil', navigated);

  const dockAfter = JSON.parse(
    await evalJs(`(() => {
      const frames = [...document.querySelectorAll('iframe')].filter((f) => (f.src || '').includes('youtube'));
      const kept = frames.filter((f) => f.dataset.larasProbe === 'kept');
      return JSON.stringify({
        frames: frames.length,
        kept: kept.length,
        path: location.pathname,
        stillHasMiniPlayer: document.querySelector('[aria-label="Posisi lagu"]') !== null,
      });
    })()`),
  );

  check(
    'iframe yang SAMA masih hidup setelah navigasi (audio tidak terputus)',
    dockAfter.kept > 0,
    `${dockAfter.kept} iframe bertanda dari ${dockAfter.frames}, kini di ${dockAfter.path}`,
  );
  check(
    'mini player ikut bertahan',
    dockAfter.stillHasMiniPlayer === true,
  );

  /* ── 7. Kepatuhan ToS: iframe tidak disembunyikan ────────────────── */

  console.log('\n[6] Kepatuhan ToS YouTube');

  const tos = JSON.parse(
    await evalJs(`(() => {
      const f = [...document.querySelectorAll('iframe')].find((x) => (x.src || '').includes('youtube'));
      if (!f) return JSON.stringify({ found: false });
      const cs = getComputedStyle(f);
      const wrapper = f.parentElement;
      const wcs = wrapper ? getComputedStyle(wrapper) : null;
      const r = f.getBoundingClientRect();
      return JSON.stringify({
        found: true,
        display: cs.display,
        visibility: cs.visibility,
        w: Math.round(r.width),
        h: Math.round(r.height),
        wrapperDisplay: wcs ? wcs.display : null,
      });
    })()`),
  );

  check('iframe ada', tos.found === true);
  if (tos.found) {
    check('iframe TIDAK display:none', tos.display !== 'none', tos.display);
    check('iframe TIDAK visibility:hidden', tos.visibility !== 'hidden', tos.visibility);
    check('wrapper TIDAK display:none', tos.wrapperDisplay !== 'none', tos.wrapperDisplay);
    check(
      'ukuran iframe >= 200x200 (syarat viewport)',
      tos.w >= 200 && tos.h >= 200,
      `${tos.w}x${tos.h}`,
    );
  }

  /* ── 8. Album & artis dari katalog live ──────────────────────────── */

  console.log('\n[7] Album & artis live');

  const albumReady = await goto('/album/1048350907', 'h1');
  const album = JSON.parse(
    await evalJs(`(() => {
      const rows = [...document.querySelectorAll('[aria-label^="Putar"]')];
      const h1 = document.querySelector('h1');
      const text = document.body.innerText;
      return JSON.stringify({
        title: h1 ? h1.textContent.trim() : null,
        rows: rows.length,
        gagal: /tidak bisa dimuat/i.test(text),
      });
    })()`),
  );
  check('halaman album dimuat', albumReady && album.gagal === false, album.title);
  check('album berisi daftar lagu', album.rows > 0, `${album.rows} lagu`);

  const artistReady = await goto('/artis/1001681665', 'h1');
  const artist = JSON.parse(
    await evalJs(`(() => {
      const h1 = document.querySelector('h1');
      const albums = [...document.querySelectorAll('a[href^="/album/"]')];
      const rows = [...document.querySelectorAll('[aria-label^="Putar"]')];
      const text = document.body.innerText;
      return JSON.stringify({
        name: h1 ? h1.textContent.trim() : null,
        albums: albums.length,
        rows: rows.length,
        gagal: /tidak bisa dimuat/i.test(text),
      });
    })()`),
  );
  check('halaman artis dimuat', artistReady && artist.gagal === false, artist.name);
  check('artis benar (Tulus)', artist.name === 'Tulus', artist.name);
  check('diskografi tampil', artist.albums > 0, `${artist.albums} album`);
  check('lagu teratas tampil', artist.rows > 0, `${artist.rows} lagu`);
};
