/** Assertion numerik untuk sidebar yang bisa ditutup. */

module.exports = async function run({ evalJs, check, sleep, send, pressCtrlB, TARGET }) {
  /**
   * Poll sampai transisi selesai.
   *
   * Yang dipantau `margin-left`, BUKAN lebar: lebar sidebar sengaja tetap 260px
   * (itu inti keputusan desainnya — lihat globals.css), jadi menunggu lebar
   * berubah adalah menunggu sesuatu yang tidak pernah terjadi dan setiap
   * pengukuran mengenai frame pertama animasi.
   */
  async function settle() {
    let last = null;
    for (let i = 0; i < 30; i += 1) {
      await sleep(90);
      const ml = await evalJs(`getComputedStyle(document.querySelector('aside')).marginLeft`);
      if (ml === last) return;
      last = ml;
    }
  }

  /**
   * Tunggu atribut benar-benar berubah SEBELUM settle.
   *
   * settle() sendirian balapan dengan pipeline input browser: key event lewat
   * jalan lebih panjang daripada klik, jadi dua pembacaan margin-left pertama
   * bisa sama-sama masih nilai lama dan settle pulang lebih dulu — pengukuran
   * kemudian mengenai keadaan SEBELUM pintasan (terjadi sekali, +0px palsu).
   */
  async function waitAttr(expected) {
    for (let i = 0; i < 30; i += 1) {
      await sleep(60);
      const attr = await evalJs(`document.documentElement.getAttribute('data-sidebar')`);
      if (attr === expected) return true;
    }
    return false;
  }

  /** Satu bacaan lengkap keadaan kerangka. */
  const readShell = () =>
    evalJs(`(() => {
      const aside = document.querySelector('aside');
      const html = document.documentElement;
      const scroller = document.querySelector('main, aside ~ div > div');
      const content = aside ? aside.nextElementSibling : null;
      const btn = document.querySelector('button[aria-controls="laras-sidebar"]');
      const cs = aside ? getComputedStyle(aside) : null;
      const r = aside ? aside.getBoundingClientRect() : null;
      return JSON.stringify({
        attr: html.getAttribute('data-sidebar'),
        asideId: aside ? aside.id : null,
        asideWidth: r ? Math.round(r.width) : null,
        asideLeft: r ? Math.round(r.left) : null,
        visibility: cs ? cs.visibility : null,
        marginLeft: cs ? cs.marginLeft : null,
        transition: cs ? cs.transitionProperty : null,
        contentWidth: content ? Math.round(content.getBoundingClientRect().width) : null,
        viewport: window.innerWidth,
        btnFound: btn !== null,
        btnExpanded: btn ? btn.getAttribute('aria-expanded') : null,
        btnLabel: btn ? btn.getAttribute('aria-label') : null,
        btnRect: btn ? Math.round(btn.getBoundingClientRect().width) + 'x' + Math.round(btn.getBoundingClientRect().height) : null,
        stored: localStorage.getItem('laras.sidebar.v1'),
        sourceOfferVisible: (() => {
          const a = [...document.querySelectorAll('a')].find((x) =>
            (x.textContent || '').includes('Kode sumber LARAS'));
          if (!a) return 'tidak ada';
          return getComputedStyle(a).visibility;
        })(),
      });
    })()`);

  /* ── 1. Keadaan awal: terbuka ──────────────────────────────────────── */

  console.log('\n[1] Keadaan awal (belum pernah ditutup)');

  await send('Page.navigate', { url: `${TARGET}/` });
  for (let i = 0; i < 40; i += 1) {
    await sleep(400);
    const ready = await evalJs(
      `Boolean(document.querySelector('button[aria-controls="laras-sidebar"]'))`,
    );
    if (ready) break;
  }
  await settle();

  const initial = JSON.parse(await readShell());

  check('atribut <html> data-sidebar="open"', initial.attr === 'open', initial.attr);
  check('sidebar punya id laras-sidebar', initial.asideId === 'laras-sidebar', initial.asideId);
  check('sidebar lebar 260px', initial.asideWidth === 260, `${initial.asideWidth}px`);
  check('sidebar terlihat', initial.visibility === 'visible', initial.visibility);
  check('tombol toggle ada di top bar', initial.btnFound === true);
  check('tombol aria-expanded="true"', initial.btnExpanded === 'true', initial.btnExpanded);
  check(
    'label tombol menyebut pintasan Ctrl+B',
    /Ctrl\+B/.test(initial.btnLabel ?? ''),
    initial.btnLabel,
  );
  check(
    'target tap tombol >= 32px',
    (() => {
      const [w, h] = (initial.btnRect ?? '0x0').split('x').map(Number);
      return w >= 32 && h >= 32;
    })(),
    initial.btnRect,
  );
  check(
    'transisi dipasang di margin-left (bukan width)',
    /margin-left/.test(initial.transition ?? '') && !/\bwidth\b/.test(initial.transition ?? ''),
    initial.transition,
  );
  check(
    'belum ada yang tersimpan (default, bukan hasil tulisan)',
    initial.stored === null,
    String(initial.stored),
  );

  /* ── 2. Klik tombol → sidebar hilang, konten memuai 260px ──────────── */

  console.log('\n[2] Menutup lewat tombol');

  await evalJs(`document.querySelector('button[aria-controls="laras-sidebar"]').click()`);
  await settle();

  const closed = JSON.parse(await readShell());

  check('atribut jadi "closed"', closed.attr === 'closed', closed.attr);
  check(
    'sidebar digeser keluar layar (margin -260px)',
    closed.marginLeft === '-260px',
    closed.marginLeft,
  );
  check('sidebar visibility hidden', closed.visibility === 'hidden', closed.visibility);
  check(
    'kolom konten memuai tepat 260px',
    closed.contentWidth - initial.contentWidth === 260,
    `${initial.contentWidth}px → ${closed.contentWidth}px (+${closed.contentWidth - initial.contentWidth})`,
  );
  check(
    'kolom konten kini selebar viewport',
    closed.contentWidth === closed.viewport,
    `${closed.contentWidth}px / ${closed.viewport}px`,
  );
  check('tombol aria-expanded="false"', closed.btnExpanded === 'false', closed.btnExpanded);
  check(
    'label tombol berubah jadi "Tampilkan"',
    /^Tampilkan/.test(closed.btnLabel ?? ''),
    closed.btnLabel,
  );
  check('pilihan disimpan sebagai "closed"', closed.stored === 'closed', String(closed.stored));
  check(
    'tautan source AGPL ikut tersembunyi (bukan tertinggal melayang)',
    closed.sourceOfferVisible === 'hidden',
    closed.sourceOfferVisible,
  );

  /* ── 3. Tautan sidebar keluar dari urutan Tab ──────────────────────── */

  console.log('\n[3] Perangkap keyboard');

  const focusable = JSON.parse(
    await evalJs(`(() => {
      const aside = document.querySelector('aside');
      const links = [...aside.querySelectorAll('a')];
      /* Elemen di dalam subtree visibility:hidden tidak bisa di-fokus. Dibuktikan
         dengan mencoba mem-fokus, bukan dengan membaca CSS lagi. */
      let focused = 0;
      for (const a of links) {
        a.focus();
        if (document.activeElement === a) focused += 1;
      }
      return JSON.stringify({ total: links.length, focused, active: document.activeElement.tagName });
    })()`),
  );

  check(
    'tautan di sidebar tertutup TIDAK bisa di-fokus',
    focusable.total > 0 && focusable.focused === 0,
    `${focusable.focused}/${focusable.total} bisa di-fokus`,
  );

  /* ── 4. Bertahan setelah muat ulang, tanpa kedipan ─────────────────── */

  console.log('\n[4] Bertahan setelah muat ulang');

  await send('Page.navigate', { url: `${TARGET}/` });
  for (let i = 0; i < 40; i += 1) {
    await sleep(300);
    const ready = await evalJs(`Boolean(document.querySelector('aside'))`);
    if (ready) break;
  }

  /* Dibaca SEBELUM settle: kalau skrip inline bekerja, atributnya sudah benar
     sejak frame pertama — tidak ada jendela waktu tempat sidebar terlihat. */
  const early = JSON.parse(
    await evalJs(`JSON.stringify({
      attr: document.documentElement.getAttribute('data-sidebar'),
      marginLeft: getComputedStyle(document.querySelector('aside')).marginLeft,
      bootScript: Boolean(document.querySelector('script[data-laras-boot]')),
    })`),
  );

  check(
    'atribut sudah "closed" pada bacaan pertama (tanpa kedipan)',
    early.attr === 'closed',
    early.attr,
  );
  check('sidebar sudah di luar layar sejak awal', early.marginLeft === '-260px', early.marginLeft);
  check('skrip boot ada di <head>', early.bootScript === true);

  await settle();
  const reloaded = JSON.parse(await readShell());
  check(
    'tombol ikut tahu keadaannya setelah hydrate',
    reloaded.btnExpanded === 'false',
    reloaded.btnExpanded,
  );

  /* ── 5. Pintasan Ctrl+B ────────────────────────────────────────────── */

  console.log('\n[5] Pintasan Ctrl+B');

  await pressCtrlB();
  await waitAttr('open');
  await settle();
  const afterShortcut = JSON.parse(await readShell());

  check('Ctrl+B membuka kembali', afterShortcut.attr === 'open', afterShortcut.attr);
  check('sidebar kembali 260px', afterShortcut.asideWidth === 260, `${afterShortcut.asideWidth}px`);
  check(
    'penyimpanan ikut diperbarui',
    afterShortcut.stored === 'open',
    String(afterShortcut.stored),
  );

  await pressCtrlB();
  await waitAttr('closed');
  await settle();
  const afterShortcut2 = JSON.parse(await readShell());
  check('Ctrl+B kedua menutup lagi', afterShortcut2.attr === 'closed', afterShortcut2.attr);

  /* Huruf B tanpa modifier tidak boleh menyentuh apa pun — kalau tidak,
     mengetik di kotak pencarian akan menutup sidebar. Sama seperti pressCtrlB,
     pakai rawKeyDown supaya event-nya SUNGGUHAN sampai ke halaman; dengan
     keyDown yang tidak pernah nyampai, assertion ini lolos tanpa menguji apa
     pun. */
  await send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: 'b',
    code: 'KeyB',
    windowsVirtualKeyCode: 66,
    nativeVirtualKeyCode: 66,
    text: 'b',
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'b',
    code: 'KeyB',
    windowsVirtualKeyCode: 66,
    nativeVirtualKeyCode: 66,
  });
  await sleep(200);
  const afterPlainB = JSON.parse(await readShell());
  check(
    'huruf b tanpa Ctrl tidak mengubah apa pun',
    afterPlainB.attr === 'closed',
    afterPlainB.attr,
  );

  /* ── 6. Ruang lirik yang sesungguhnya bertambah ────────────────────── */

  console.log('\n[6] Halaman lirik — ruang yang didapat');

  /* Id lagu diambil dari Beranda SUNGGUHAN, tidak ditebak (aturan #3
     AGENTS.md). Kartu rak adalah <a href="/lagu/<id>"> — baris lagu di
     HALAMAN playlist adalah div[role=button] tanpa href, jadi playlist bukan
     sumber yang bisa dibaca di sini. */
  await send('Page.navigate', { url: `${TARGET}/` });
  let trackHref = null;
  for (let i = 0; i < 40; i += 1) {
    await sleep(400);
    trackHref = await evalJs(
      `(() => { const a = document.querySelector('a[href^="/lagu/"]'); return a ? a.getAttribute('href') : null; })()`,
    );
    if (trackHref) break;
  }

  if (trackHref === null) {
    check('menemukan tautan lagu di Beranda', false, 'rak tidak memuat lagu');
    return;
  }
  check('id lagu diambil dari Beranda sungguhan', true, trackHref);

  await send('Page.navigate', { url: `${TARGET}${trackHref}` });
  for (let i = 0; i < 60; i += 1) {
    await sleep(400);
    const ready = await evalJs(
      `Boolean(document.querySelector('button[aria-controls="laras-sidebar"]') && document.querySelector('h1'))`,
    );
    if (ready) break;
  }
  await settle();

  /* Keadaan masih "closed" dari langkah sebelumnya — jadi ini juga membuktikan
     pilihan berlaku LINTAS HALAMAN, bukan hanya di halaman tempat diklik. */
  const lyricsClosed = JSON.parse(
    await evalJs(`(() => {
      const aside = document.querySelector('aside');
      const col = aside ? aside.nextElementSibling : null;
      /* Kolom lirik = kolom kanan di baris flex halaman lagu. */
      const pane = document.querySelector('.min-w-0.flex-1 > div');
      return JSON.stringify({
        attr: document.documentElement.getAttribute('data-sidebar'),
        content: col ? Math.round(col.getBoundingClientRect().width) : null,
        pane: pane ? Math.round(pane.getBoundingClientRect().width) : null,
      });
    })()`),
  );

  check(
    'pilihan "tertutup" berlaku di halaman lagu (lintas navigasi)',
    lyricsClosed.attr === 'closed',
    lyricsClosed.attr,
  );

  await pressCtrlB();
  await waitAttr('open');
  await settle();

  const lyricsOpen = JSON.parse(
    await evalJs(`(() => {
      const aside = document.querySelector('aside');
      const col = aside ? aside.nextElementSibling : null;
      const pane = document.querySelector('.min-w-0.flex-1 > div');
      return JSON.stringify({
        attr: document.documentElement.getAttribute('data-sidebar'),
        content: col ? Math.round(col.getBoundingClientRect().width) : null,
        pane: pane ? Math.round(pane.getBoundingClientRect().width) : null,
      });
    })()`),
  );

  check(
    'pane lirik BENAR-BENAR melebar saat sidebar ditutup',
    lyricsClosed.pane !== null && lyricsOpen.pane !== null && lyricsClosed.pane - lyricsOpen.pane === 260,
    `terbuka ${lyricsOpen.pane}px → tertutup ${lyricsClosed.pane}px (+${lyricsClosed.pane - lyricsOpen.pane})`,
  );

  /* Kembalikan ke terbuka supaya sesi browser tidak meninggalkan keadaan aneh
     untuk harness lain yang memakai profil Chrome yang sama. */
  const stillClosed = await evalJs(
    `document.documentElement.getAttribute('data-sidebar') === 'closed'`,
  );
  if (stillClosed) await pressCtrlB();
  await evalJs(`localStorage.removeItem('laras.sidebar.v1')`);
};
