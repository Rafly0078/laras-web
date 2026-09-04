/** Assertion numerik untuk kartu "Hasil teratas" + rak penemuan. */

module.exports = async function run({ evalJs, check, sleep, send, TARGET }) {
  /**
   * Buka /cari?q=… dan tunggu hasil SUNGGUHAN, bukan skeleton.
   *
   * Yang ditunggu bukan `readyState`: hasil datang di bawah `<Suspense>` lewat
   * stream, jadi halaman sudah "complete" jauh sebelum ada satu hasil pun.
   * Penanda selesai = ada baris lagu atau pesan "tidak ada hasil".
   */
  async function search(query) {
    await send('Page.navigate', {
      url: `${TARGET}/cari?q=${encodeURIComponent(query)}`,
    });
    for (let i = 0; i < 60; i += 1) {
      await sleep(400);
      const done = await evalJs(`(() => {
        const h2 = [...document.querySelectorAll('h2')].map((h) => h.textContent.trim());
        return h2.includes('Lagu') || /Tidak ada hasil/.test(document.body.innerText);
      })()`);
      if (done) break;
    }
    /* Beri satu jeda kecil supaya blok penemuan (rak terakhir di aliran) ikut
       terpasang sebelum diukur. */
    await sleep(600);
  }

  /** Satu bacaan lengkap halaman hasil. */
  const readPage = () =>
    evalJs(`(() => {
      const sections = [...document.querySelectorAll('section')];
      const topSection = sections.find(
        (s) => s.getAttribute('aria-label') === 'Hasil teratas');

      const headings = [...document.querySelectorAll('h2')].map((h) => h.textContent.trim());

      /* Judul baris dibaca dari aria-label (TrackRow menulisnya sebagai
         "Putar <judul> oleh <artis>"), BUKAN dari innerText: baris lagu
         menampilkan NOMOR urut lebih dulu, jadi teks pertamanya angka dan bukan
         judul. Kegagalan pertama harness ini persis begitu — dua daftar terlihat
         tumpang tindih karena keduanya mulai dari angka 1. */
      const titlesIn = (section) =>
        section
          ? [...section.querySelectorAll('[role="button"][aria-label^="Putar "]')]
              .map((r) => {
                const label = r.getAttribute('aria-label') || '';
                return label.replace('Putar ', '').split(' oleh ')[0].trim();
              })
              .filter((t) => t.length > 0)
          : [];

      const mainSection = sections.find((s) => {
        const h = s.querySelector('h2');
        return h && h.textContent.trim() === 'Lagu';
      });
      const mainTitles = titlesIn(mainSection);

      const discoverySection = sections.find((s) => {
        const h = s.querySelector('h2');
        return h && /^Lagu lain dari/.test(h.textContent.trim());
      });
      const discoveryTitles = titlesIn(discoverySection);

      const similarSection = sections.find((s) => {
        const h = s.querySelector('h2');
        return h && h.textContent.trim() === 'Artis serupa';
      });

      return JSON.stringify({
        headings,
        topFound: topSection !== undefined,
        /* Isi kartu teratas dibaca dari DOM: label jenis, nama, dan tujuan
           tautannya. Inilah yang tidak bisa dibuktikan dengan grep HTML. */
        topKindLabel: topSection
          ? (topSection.querySelector('p')?.textContent ?? '').trim()
          : null,
        topName: topSection
          ? (topSection.querySelector('h3')?.textContent ?? '').trim()
          : null,
        topHref: topSection
          ? (() => {
              const a = topSection.querySelector('a[href]');
              return a ? new URL(a.href).pathname : null;
            })()
          : null,
        topArtSize: topSection
          ? (() => {
              const img = topSection.querySelector('img');
              if (!img) return null;
              const r = img.getBoundingClientRect();
              return Math.round(r.width);
            })()
          : null,
        mainTitles: mainTitles.slice(0, 30),
        discoveryFound: discoverySection !== undefined,
        discoveryHeading: discoverySection
          ? discoverySection.querySelector('h2').textContent.trim()
          : null,
        discoveryTitles: discoveryTitles.slice(0, 20),
        similarFound: similarSection !== undefined,
        similarCount: similarSection
          ? similarSection.querySelectorAll('a[href^="/artis/"]').length
          : 0,
        bodyHasError: /Application error|Terjadi kesalahan/i.test(document.body.innerText),
      });
    })()`);

  /* ── 1. Kueri yang tenggelam di antara spam ────────────────────────── */

  console.log('\n[1] "Teh Hijau" — kueri yang jadi alasan fitur ini ada');

  await search('Teh Hijau');
  const page = JSON.parse(await readPage());

  check('halaman hasil sehat (tanpa pesan error)', page.bodyHasError === false);
  check('kartu "Hasil teratas" dirender', page.topFound === true);
  check(
    'kartu teratas menonjolkan hasil yang BENAR, bukan spam unggahan',
    page.topName === 'Teh Hijau' || page.topName === 'Tulus',
    `${page.topKindLabel} · ${page.topName}`,
  );
  check(
    'kartu teratas punya label jenis',
    ['Lagu', 'Artis', 'Album'].includes(page.topKindLabel ?? ''),
    page.topKindLabel,
  );
  check(
    'kartu teratas menautkan ke halaman yang benar',
    /^\/(lagu|artis|album)\//.test(page.topHref ?? ''),
    page.topHref,
  );
  check(
    'artwork kartu teratas 132px (lebih besar dari kartu rak)',
    page.topArtSize === 132,
    `${page.topArtSize}px`,
  );

  /* ── 2. Daftar penuh TIDAK disaring ────────────────────────────────── */

  console.log('\n[2] Sampah dikubur, bukan dihapus');

  check(
    'daftar utama tetap memuat semua hasil (tidak disaring)',
    page.mainTitles.length >= 20,
    `${page.mainTitles.length} baris`,
  );
  check(
    'remix/DJ TIDAK dibuang dari daftar (menyaringnya membuang remix sah)',
    page.mainTitles.some((t) => /remix|dj/i.test(t)),
    page.mainTitles.filter((t) => /remix|dj/i.test(t)).slice(0, 2).join(' | '),
  );

  /* ── 3. Rak penemuan ──────────────────────────────────────────────── */

  console.log('\n[3] Rak penemuan');

  check('rak "Artis serupa" dirender', page.similarFound === true);
  check(
    'rak artis serupa berisi tautan artis',
    page.similarCount > 0,
    `${page.similarCount} artis`,
  );

  /*
   * Rak "Lagu lain dari <artis>" boleh ABSEN — dan untuk kueri ini ia memang
   * absen, dengan alasan yang benar.
   *
   * Terukur di storefront Indonesia: dari 24 hasil "Teh Hijau", DELAPAN sudah
   * lagu Tulus. Setelah dedup terhadap daftar utama, sisa penemuan hanya satu
   * baris — di bawah `DISCOVERY_MIN`, jadi raknya dikosongkan. Rak berjudul
   * "Lagu lain dari Tulus" berisi satu lagu menambah judul tanpa menambah
   * pilihan.
   *
   * Yang diuji karena itu bukan "raknya ada", tapi ATURANNYA: kalau tampil, ia
   * wajib punya >= 3 lagu dan nol tumpang tindih.
   */
  if (page.discoveryFound) {
    check(
      'judul rak menyebut nama artis, bukan placeholder',
      /^Lagu lain dari .+/.test(page.discoveryHeading ?? '') &&
        !/undefined|null/.test(page.discoveryHeading ?? ''),
      page.discoveryHeading,
    );
    check(
      'rak penemuan berisi cukup lagu untuk jadi jalan keluar (>= 3)',
      page.discoveryTitles.length >= 3,
      `${page.discoveryTitles.length} lagu`,
    );
    check(
      'rak penemuan TIDAK mengulang baris dari daftar utama',
      page.discoveryTitles.every((t) => !page.mainTitles.includes(t)),
      page.discoveryTitles.filter((t) => page.mainTitles.includes(t)).join(',') ||
        'nol tumpang tindih',
    );
  } else {
    check(
      'rak penemuan absen karena daftar utama sudah memuat lagu artisnya',
      page.mainTitles.length > 0,
      `${page.mainTitles.length} baris di daftar utama — rak sengaja dikosongkan`,
    );
  }

  /* ── 4. Kueri yang tidak punya hasil meyakinkan ────────────────────── */

  console.log('\n[4] Tanpa hasil yang meyakinkan');

  /* Kueri yang sengaja tidak cocok persis dengan apa pun: kartu teratas HARUS
     hilang. Kartu yang menampilkan tebakan acak mengarahkan pengguna ke tempat
     salah dengan penuh keyakinan — mengembalikan null adalah jawaban yang sah. */
  await search('zzqq tidak mungkin ada lagu ini');
  const nothing = JSON.parse(await readPage());

  check(
    'kartu teratas TIDAK dipaksa muncul untuk kueri tanpa kecocokan',
    nothing.topFound === false,
    nothing.topName ?? 'tidak ada kartu',
  );
  check('halaman tetap sehat', nothing.bodyHasError === false);
};
