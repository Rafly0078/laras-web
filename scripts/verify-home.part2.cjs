/** Assertion numerik untuk Beranda + kerangka UI. */

module.exports = async function run({ evalJs, check }) {
  /* ── 1. Sidebar ───────────────────────────────────────────────────── */

  console.log('\n[1] Sidebar');

  const sidebar = JSON.parse(
    await evalJs(`(() => {
      const nav = document.querySelector('nav[aria-label]');
      const aside = document.querySelector('aside') || (nav ? nav.closest('div') : null);
      const links = [...document.querySelectorAll('nav a')];
      const current = links.filter((a) => a.getAttribute('aria-current') === 'page');
      const rect = aside ? aside.getBoundingClientRect() : null;
      const heights = links.map((a) => Math.round(a.getBoundingClientRect().height));
      return JSON.stringify({
        navLabel: nav ? nav.getAttribute('aria-label') : null,
        width: rect ? Math.round(rect.width) : null,
        links: links.length,
        hrefs: links.slice(0, 8).map((a) => new URL(a.href).pathname),
        currentCount: current.length,
        currentHref: current[0] ? new URL(current[0].href).pathname : null,
        minLinkHeight: heights.length ? Math.min(...heights) : null,
        wordmark: document.body.innerText.includes('LARAS'),
      });
    })()`),
  );

  check('nav punya aria-label', sidebar.navLabel !== null, sidebar.navLabel);
  check('sidebar lebar 260px', sidebar.width === 260, `${sidebar.width}px`);
  check('wordmark LARAS ada', sidebar.wordmark === true);
  check(
    'nav memuat Beranda + Cari + playlist',
    sidebar.links >= 6,
    `${sidebar.links} tautan: ${JSON.stringify(sidebar.hrefs)}`,
  );
  check(
    'TEPAT satu item aria-current="page"',
    sidebar.currentCount === 1,
    `${sidebar.currentCount} item, aktif: ${sidebar.currentHref}`,
  );
  check('item aktif adalah Beranda', sidebar.currentHref === '/', sidebar.currentHref);
  check(
    'target tap nav >= 44px',
    sidebar.minLinkHeight !== null && sidebar.minLinkHeight >= 44,
    `terkecil ${sidebar.minLinkHeight}px`,
  );

  /* ── 2. Top bar ───────────────────────────────────────────────────── */

  console.log('\n[2] Top bar');

  const topBar = JSON.parse(
    await evalJs(`(() => {
      const input = document.querySelector('input[type="search"], input[placeholder]');
      const buttons = [...document.querySelectorAll('button[aria-label]')];
      const labels = buttons.map((b) => b.getAttribute('aria-label'));
      const bar = input ? input.closest('header, div') : null;
      const cs = bar ? getComputedStyle(bar) : null;
      const rect = input ? input.getBoundingClientRect() : null;
      return JSON.stringify({
        hasInput: input !== null,
        placeholder: input ? input.placeholder : null,
        inputHeight: rect ? Math.round(rect.height) : null,
        labels: labels.slice(0, 6),
        backdrop: cs ? (cs.backdropFilter || cs.webkitBackdropFilter || 'none') : null,
      });
    })()`),
  );

  check('kotak pencarian ada', topBar.hasInput === true, topBar.placeholder);
  check(
    'tombol navigasi punya aria-label',
    topBar.labels.some((l) => /kembali/i.test(l ?? '')),
    JSON.stringify(topBar.labels),
  );

  /* ── 3. Rak Beranda ──────────────────────────────────────────────── */

  console.log('\n[3] Rak Beranda');

  const shelves = JSON.parse(
    await evalJs(`(() => {
      const sections = [...document.querySelectorAll('section')];
      const withShelf = sections.filter((s) => s.querySelector('h2') && s.querySelector('.no-scrollbar, [class*="no-scrollbar"]'));
      const titles = withShelf.map((s) => s.querySelector('h2').textContent.trim());
      const counts = withShelf.map((s) => {
        const strip = s.querySelector('[class*="overflow-x-auto"]');
        return strip ? strip.children.length : 0;
      });
      return JSON.stringify({ shelves: withShelf.length, titles, counts });
    })()`),
  );

  check('empat rak dirender', shelves.shelves === 4, `${shelves.shelves} rak`);
  check(
    'judul rak dari kurator Apple',
    shelves.titles.includes('Top 100: Indonesia'),
    JSON.stringify(shelves.titles),
  );
  check(
    'setiap rak berisi 30 kartu',
    shelves.counts.every((n) => n === 30),
    JSON.stringify(shelves.counts),
  );

  /* ── 4. Artwork nyata dari Apple ─────────────────────────────────── */

  console.log('\n[4] Artwork');

  const art = JSON.parse(
    await evalJs(`(() => {
      const imgs = [...document.querySelectorAll('img')];
      const loaded = imgs.filter((i) => i.complete && i.naturalWidth > 0);
      const mzstatic = imgs.filter((i) => (i.currentSrc || i.src).includes('mzstatic'));
      const optimized = imgs.filter((i) => (i.currentSrc || i.src).includes('/_next/image'));
      const sample = imgs[0];
      const cs = sample ? getComputedStyle(sample.parentElement) : null;
      return JSON.stringify({
        total: imgs.length,
        loaded: loaded.length,
        mzstatic: mzstatic.length,
        optimized: optimized.length,
        naturalWidth: sample ? sample.naturalWidth : null,
        wrapperRadius: cs ? cs.borderRadius : null,
        alt: sample ? sample.alt.slice(0, 40) : null,
      });
    })()`),
  );

  check('artwork dirender', art.total > 0, `${art.total} gambar`);
  check(
    'artwork BERHASIL dimuat dari CDN Apple',
    art.loaded > 0,
    `${art.loaded}/${art.total} termuat, naturalWidth ${art.naturalWidth}`,
  );
  check(
    'lewat pipeline next/image (remotePatterns bekerja)',
    art.optimized > 0 || art.mzstatic > 0,
    `optimized ${art.optimized}, langsung ${art.mzstatic}`,
  );
  check('artwork punya alt deskriptif', (art.alt ?? '').length > 3, art.alt);

  /* ── 5. Radius dari variabel, bukan Tailwind ─────────────────────── */

  console.log('\n[5] Sistem radius & warna');

  const tokens = JSON.parse(
    await evalJs(`(() => {
      const root = getComputedStyle(document.documentElement);
      const vals = {};
      for (const key of ['--radius-artwork-sm','--radius-artwork','--radius-artwork-lg','--radius-card','--radius-sheet']) {
        vals[key] = root.getPropertyValue(key).trim();
      }
      const bodyBg = getComputedStyle(document.body).backgroundColor;
      // Radius yang benar-benar terpakai pada wrapper artwork.
      // Sengaja img di DALAM rak, bukan img pertama di halaman: img pertama
      // sekarang adalah artwork hero (radius lg, 14px — sengaja berbeda).
      const strip = document.querySelector('[class*="overflow-x-auto"]');
      const rackImg = strip ? strip.querySelector('img') : null;
      const wrapper = rackImg ? rackImg.parentElement : null;
      return JSON.stringify({
        vals,
        bodyBg,
        wrapperRadius: wrapper ? getComputedStyle(wrapper).borderTopLeftRadius : null,
      });
    })()`),
  );

  check(
    'token radius terdefinisi',
    tokens.vals['--radius-card'] === '12px' && tokens.vals['--radius-artwork'] === '10px',
    JSON.stringify(tokens.vals),
  );
  check(
    'artwork memakai radius dari variabel (10px), bukan rounded-xl (12px)',
    tokens.wrapperRadius === '10px',
    tokens.wrapperRadius,
  );
  check(
    'latar hitam murni',
    /rgb\(0, 0, 0\)/.test(tokens.bodyBg),
    tokens.bodyBg,
  );

  /* ── 6. Scrollbar rak disembunyikan ─────────────────────────────── */

  console.log('\n[6] Rak digulir tanpa scrollbar');

  const strip = JSON.parse(
    await evalJs(`(() => {
      const el = document.querySelector('[class*="overflow-x-auto"]');
      if (!el) return JSON.stringify({ found: false });
      const cs = getComputedStyle(el);
      return JSON.stringify({
        found: true,
        scrollbarWidth: cs.scrollbarWidth,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        // offsetHeight - clientHeight > 0 berarti ada scrollbar yang makan ruang.
        gutter: el.offsetHeight - el.clientHeight,
        overflowX: cs.overflowX,
      });
    })()`),
  );

  check('rak punya area gulir horizontal', strip.found === true);
  check(
    'konten rak MELEBIHI lebar (memang perlu digulir)',
    strip.scrollWidth > strip.clientWidth,
    `${strip.scrollWidth} > ${strip.clientWidth}`,
  );
  check(
    'scrollbar tidak memakan ruang layout',
    strip.gutter === 0,
    `gutter ${strip.gutter}px, scrollbar-width: ${strip.scrollbarWidth}`,
  );

  /* ── 7. Gulir sungguhan bekerja ──────────────────────────────────── */

  const scrolled = JSON.parse(
    await evalJs(`(() => {
      const el = document.querySelector('[class*="overflow-x-auto"]');
      const before = el.scrollLeft;
      el.scrollLeft = 400;
      return JSON.stringify({ before, after: el.scrollLeft });
    })()`),
  );
  check(
    'rak benar-benar bisa digulir',
    scrolled.after > scrolled.before,
    `${scrolled.before} -> ${scrolled.after}`,
  );

  /* ── 8. Tautan ke demo lirik ─────────────────────────────────────── */

  console.log('\n[7] Tautan ke demo lirik');

  /*
   * DIPERBAIKI: selektor lama `a[href^="/demo/"]` (perhatikan garis miring)
   * mencari kartu per lagu ke `/demo/<slug>` — bentuk Beranda pada FASE FIXTURE.
   * Sejak Beranda memakai playlist editorial live, kartunya menuju `/lagu/<id>`
   * dan satu-satunya tautan demo adalah pintu masuk `/demo`. Dua assertion di
   * bagian ini karena itu GAGAL permanen, bukan kadang-kadang — bukan bug di
   * halaman.
   */
  const demo = JSON.parse(
    await evalJs(`(() => {
      const links = [...document.querySelectorAll('a[href="/demo"], a[href^="/demo/"]')];
      return JSON.stringify({
        count: links.length,
        texts: links.slice(0, 4).map((a) => (a.textContent || '').trim()),
        hrefs: [...new Set(links.map((a) => new URL(a.href).pathname))].slice(0, 6),
      });
    })()`),
  );

  check(
    'ada pintu masuk ke demo mesin lirik',
    demo.count > 0,
    `${demo.count} tautan: ${JSON.stringify(demo.hrefs)}`,
  );
  check(
    'tautan demo terbaca sendiri tanpa konteks',
    (demo.texts[0] ?? '').toLowerCase().includes('lirik'),
    demo.texts[0],
  );

  /* ── 9. Tidak ada error konsol / hydration mismatch ─────────────── */

  console.log('\n[8] Kesehatan halaman');

  const health = JSON.parse(
    await evalJs(`(() => {
      const body = document.body.innerText;
      return JSON.stringify({
        hasError: /Application error|Unhandled Runtime Error|hydration/i.test(body),
        headings: document.querySelectorAll('h1').length,
        h1Text: document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : null,
        lang: document.documentElement.lang,
      });
    })()`),
  );

  check('tanpa pesan error di halaman', health.hasError === false);
  check('tepat satu h1', health.headings === 1, `${health.headings} h1: ${health.h1Text}`);
  check('lang="id"', health.lang === 'id', health.lang);

  /* ── 10. "Lihat semua" adalah tautan sungguhan ──────────────────── */

  console.log('\n[9] "Lihat semua"');

  const seeAll = JSON.parse(
    await evalJs(`(() => {
      const links = [...document.querySelectorAll('a')].filter((a) =>
        (a.textContent || '').trim() === 'Lihat semua');
      return JSON.stringify({
        count: links.length,
        hrefs: links.map((a) => new URL(a.href).pathname),
      });
    })()`),
  );

  check(
    'setiap rak punya "Lihat semua" sebagai LINK (bukan span mati)',
    seeAll.count === 4,
    JSON.stringify(seeAll.hrefs),
  );
  check(
    'tautan menuju /playlist/<slug>',
    seeAll.hrefs.every((h) => h.startsWith('/playlist/')),
    JSON.stringify(seeAll.hrefs),
  );

  /* ── 11. Hero + ambient ─────────────────────────────────────────── */

  console.log('\n[10] Hero & ambient');

  const heroAmbient = JSON.parse(
    await evalJs(`(() => {
      const hero = document.querySelector('section[aria-label]');
      const heroImg = hero ? hero.querySelector('img') : null;
      const heroBtn = hero ? hero.querySelector('button[aria-label^="Putar"], button[aria-label^="Jeda"]') : null;
      const ambient = document.querySelector('.laras-home-ambient');
      const cs = ambient ? getComputedStyle(ambient) : null;
      return JSON.stringify({
        heroFound: hero !== null,
        heroLabel: hero ? hero.getAttribute('aria-label') : null,
        heroImgSize: heroImg ? Math.round(heroImg.getBoundingClientRect().width) : null,
        heroButton: heroBtn ? (heroBtn.getAttribute('aria-label') || '').slice(0, 30) : null,
        ambientFound: ambient !== null,
        ambientBg: cs ? (cs.backgroundImage || 'none').slice(0, 40) : null,
        ambientFilter: cs ? cs.filter : null,
      });
    })()`),
  );

  check('hero dirender di atas rak', heroAmbient.heroFound === true, heroAmbient.heroLabel);
  check('hero punya artwork 220px', heroAmbient.heroImgSize === 220, `${heroAmbient.heroImgSize}px`);
  check('hero punya tombol putar', heroAmbient.heroButton !== null, heroAmbient.heroButton);
  check('lapis ambient ada di shell', heroAmbient.ambientFound === true);
  check(
    'lapis ambient punya gradient + filter saturasi',
    /radial-gradient/.test(heroAmbient.ambientBg ?? '') && /saturate/.test(heroAmbient.ambientFilter ?? ''),
    `${heroAmbient.ambientBg} | ${heroAmbient.ambientFilter}`,
  );
};
