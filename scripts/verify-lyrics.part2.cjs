/**
 * Bagian 2 harness: assertion numerik terhadap DOM lirik yang hidup.
 *
 * Dipisah dari file boot karena payload tool besar bisa menggagalkan stream —
 * pola yang sama dipakai di project lain milik pemilik repo.
 */

module.exports = async function run({ evalJs, check, sleep }) {
  /* ── 1. Struktur DOM ──────────────────────────────────────────────── */

  const structure = JSON.parse(
    await evalJs(`(() => {
      const lines = [...document.querySelectorAll('[aria-label^="Lompat ke"]')];
      const interludes = [...document.querySelectorAll('[aria-label="Jeda instrumental, lewati"]')];
      const words = [...document.querySelectorAll('[aria-label^="Lompat ke"] span')];
      const opposite = lines.filter((l) => l.className.includes('opposite'));
      return JSON.stringify({
        lines: lines.length,
        interludes: interludes.length,
        words: words.length,
        opposite: opposite.length,
        firstText: lines[0] ? lines[0].innerText.slice(0, 60) : null,
      });
    })()`),
  );

  console.log('\n[1] Struktur DOM');
  check('baris lirik dirender', structure.lines > 0, `${structure.lines} baris`);
  check('kata dirender sebagai span terpisah', structure.words > 50, `${structure.words} span`);
  check(
    'duet terdeteksi (baris diratakan ke kanan)',
    structure.opposite > 0,
    `${structure.opposite} baris kanan`,
  );
  check(
    'baris pertama berbunyi "Ooh"',
    (structure.firstText || '').toLowerCase().includes('ooh'),
    JSON.stringify(structure.firstText),
  );

  /* ── 2. Teknik sapuan benar-benar terpasang ───────────────────────── */

  const technique = JSON.parse(
    await evalJs(`(() => {
      /* Suku kata bersarang satu lapis lebih dalam sekarang: baris >
         span.wordGroup > span.word. Selektor lama mengambil .wordGroup, yang
         memang tidak punya background-image, jadi hasilnya "none" dan lima
         assertion di bagian ini gagal tanpa ada yang rusak di aplikasi.
         JANGAN pakai backtick di komentar ini: seluruh blok ini hidup di dalam
         template literal, dan satu backtick menutupnya lebih awal. */
      const word = document.querySelector('[aria-label^="Lompat ke"] > span > span');
      if (!word) return JSON.stringify({ found: false });
      const cs = getComputedStyle(word);
      return JSON.stringify({
        found: true,
        fillColor: cs.webkitTextFillColor,
        backgroundClip: cs.backgroundClip || cs.webkitBackgroundClip,
        hasGradient: cs.backgroundImage.includes('gradient'),
        /* Sapuan sekarang HORIZONTAL (90deg) mengikuti arah baca; lihat
           GRADIENT.degrees di design-tokens.ts untuk alasannya.

           Jebakan #10 berlaku TERBALIK di sini: getComputedStyle menghapus
           sudut yang merupakan default (to bottom / 180deg) dan
           mempertahankan yang bukan default. Jadi bukti arah horizontal
           adalah 90deg yang benar-benar tercantum, bukan ketiadaan sudut. */
        gradientHorizontal:
          cs.backgroundImage.includes('gradient') &&
          (cs.backgroundImage.includes('90deg') ||
            cs.backgroundImage.includes('to right')),
        gradientRaw: cs.backgroundImage.slice(0, 100),
        textShadow: cs.textShadow,
        fontWeight: cs.fontWeight,
        lineHeightRatio: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize),
      });
    })()`),
  );

  console.log('\n[2] Teknik sapuan (background-clip: text)');
  check('kata ditemukan', technique.found);
  check(
    'warna isi teks TRANSPARAN',
    /transparent|rgba\(0, 0, 0, 0\)/.test(technique.fillColor || ''),
    technique.fillColor,
  );
  check('background di-clip ke teks', technique.backgroundClip === 'text', technique.backgroundClip);
  check('gradient terpasang', technique.hasGradient === true);
  check(
    'sapuan HORIZONTAL (90deg tercantum, mengikuti arah baca)',
    technique.gradientHorizontal === true,
    technique.gradientRaw,
  );
  check('text-shadow aktif (glow + blur)', (technique.textShadow || 'none') !== 'none');
  check('font-weight 700 rata', technique.fontWeight === '700', technique.fontWeight);
  check(
    'line-height 1.1818 (nilai spicy-lyrics)',
    Math.abs((technique.lineHeightRatio || 0) - 1.1818181818) < 0.01,
    String(technique.lineHeightRatio),
  );

  /* ── 3. Sapuan bergerak seiring waktu ─────────────────────────────── */

  console.log('\n[3] Nilai gaya awal (halaman Now Playing, tanpa audio berjalan)');

  // Pemutar YouTube memblokir autoplay tanpa interaksi, jadi di halaman ini
  // yang bisa dibuktikan adalah keadaan DIAM: semua kata di posisi awal dan
  // spring sudah menulis nilai idle. Sapuan bergeraknya diuji di bagian 3
  // lewat halaman dev berjam sintetis.
  const gradientRaw = await evalJs(`(() => {
    const w = document.querySelector('[aria-label^="Lompat ke"] span');
    return w ? getComputedStyle(w).backgroundImage.slice(0, 160) : 'tidak ada kata';
  })()`);
  console.log(`  gradient terhitung: ${gradientRaw}`);

  const initial = JSON.parse(
    await evalJs(`(() => {
      const words = [...document.querySelectorAll('[aria-label^="Lompat ke"] span')].slice(0, 40);
      const positions = words.map((w) => w.style.getPropertyValue('--gradient-position').trim());
      const filled = positions.filter((p) => p.length > 0);
      const parsed = filled.map((p) => parseFloat(p));
      return JSON.stringify({
        total: words.length,
        written: filled.length,
        min: parsed.length ? Math.min(...parsed) : null,
        max: parsed.length ? Math.max(...parsed) : null,
        sample: positions.slice(0, 6),
      });
    })()`),
  );

  check(
    'rAF loop MENULIS --gradient-position ke kata (mesin hidup)',
    initial.written > 0,
    `${initial.written}/${initial.total} kata ditulis, contoh ${JSON.stringify(initial.sample)}`,
  );

  if (initial.written > 0) {
    check(
      'kata belum dinyanyikan berada di posisi awal (-20%)',
      initial.min !== null && initial.min <= -19,
      `min ${initial.min}%`,
    );
  }

  const transformed = JSON.parse(
    await evalJs(`(() => {
      const words = [...document.querySelectorAll('[aria-label^="Lompat ke"] span')].slice(0, 40);
      const withTransform = words.filter((w) => w.style.transform && w.style.transform !== 'none');
      const scales = withTransform
        .map((w) => (w.style.transform.match(/scale\\(([-\\d.]+)\\)/) || [])[1])
        .filter(Boolean)
        .map(Number);
      return JSON.stringify({
        count: withTransform.length,
        minScale: scales.length ? Math.min(...scales) : null,
        maxScale: scales.length ? Math.max(...scales) : null,
      });
    })()`),
  );

  check(
    'spring menulis transform (scale + translateY)',
    transformed.count > 0,
    `${transformed.count} kata, skala ${transformed.minScale}..${transformed.maxScale}`,
  );

  if (transformed.minScale !== null) {
    check(
      'skala diam mendekati 0.95 (idle scale spicy-lyrics)',
      Math.abs(transformed.minScale - 0.95) < 0.06,
      `min ${transformed.minScale}`,
    );
  }

  /* ── 4. Blur & opacity per baris ──────────────────────────────────── */

  console.log('\n[4] Hierarki jarak (blur + opacity per baris)');

  const lineStyles = JSON.parse(
    await evalJs(`(() => {
      const lines = [...document.querySelectorAll('[aria-label^="Lompat ke"], [aria-label="Jeda instrumental, lewati"]')];
      const rows = lines.slice(0, 24).map((l, i) => ({
        i,
        blur: l.style.getPropertyValue('--blur-amount').trim(),
        opacity: l.style.opacity,
      }));
      const blurs = rows.map((r) => parseFloat(r.blur)).filter((n) => Number.isFinite(n));
      return JSON.stringify({
        rows: rows.slice(0, 8),
        written: blurs.length,
        maxBlur: blurs.length ? Math.max(...blurs) : null,
      });
    })()`),
  );

  check(
    '--blur-amount ditulis per baris',
    lineStyles.written > 0,
    `${lineStyles.written} baris, blur maks ${lineStyles.maxBlur}px`,
  );

  if (lineStyles.maxBlur !== null) {
    check(
      'blur tidak melewati batas 6,83px (cap spicy-lyrics)',
      lineStyles.maxBlur <= 6.84,
      `maks ${lineStyles.maxBlur}px`,
    );
  }

  const activeLine = JSON.parse(
    await evalJs(`(() => {
      const lines = [...document.querySelectorAll('[aria-label^="Lompat ke"], [aria-label="Jeda instrumental, lewati"]')];
      const opacities = lines.map((l) => parseFloat(l.style.opacity)).filter((n) => Number.isFinite(n));
      const maxOpacity = opacities.length ? Math.max(...opacities) : null;
      const atFull = opacities.filter((o) => o > 0.98).length;
      return JSON.stringify({ maxOpacity, atFull, total: opacities.length });
    })()`),
  );

  check(
    'ada baris beropacity penuh (baris aktif)',
    activeLine.maxOpacity !== null && activeLine.maxOpacity > 0.98,
    `maks ${activeLine.maxOpacity}, ${activeLine.atFull} baris penuh`,
  );

  check(
    'hanya SEDIKIT baris beropacity penuh (hierarki bekerja)',
    activeLine.atFull !== null && activeLine.atFull <= 3,
    `${activeLine.atFull} dari ${activeLine.total}`,
  );

  /* ── 5. Interlude & mask pane ─────────────────────────────────────── */

  console.log('\n[5] Interlude & mask pane');

  const pane = JSON.parse(
    await evalJs(`(() => {
      const dots = document.querySelectorAll('[aria-label="Jeda instrumental, lewati"] span');
      const scroller = document.querySelector('[aria-label^="Lompat ke"]')?.parentElement?.parentElement;
      const cs = scroller ? getComputedStyle(scroller) : null;
      return JSON.stringify({
        dots: dots.length,
        maskImage: cs ? (cs.maskImage || cs.webkitMaskImage || 'none') : 'no-scroller',
        containerType: cs ? cs.containerType : null,
      });
    })()`),
  );

  check('titik interlude dirender (3 per jeda)', pane.dots >= 3, `${pane.dots} titik`);

  const paneMask = JSON.parse(
    await evalJs(`(() => {
      const el = [...document.querySelectorAll('div')].find((d) => {
        const cs = getComputedStyle(d);
        return (cs.maskImage || cs.webkitMaskImage || '').includes('gradient');
      });
      if (!el) return JSON.stringify({ found: false });
      const cs = getComputedStyle(el);
      return JSON.stringify({
        found: true,
        mask: (cs.maskImage || cs.webkitMaskImage).slice(0, 120),
        containerType: cs.containerType,
      });
    })()`),
  );

  check('pane lirik punya mask fade atas/bawah', paneMask.found === true, paneMask.mask);
  check(
    'container-type: size aktif (agar cqw/cqh bekerja)',
    paneMask.containerType === 'size',
    paneMask.containerType,
  );

  /* ── 6. Kepatuhan ToS: iframe tidak disembunyikan ─────────────────── */

  console.log('\n[6] Kepatuhan ToS YouTube');

  const iframe = JSON.parse(
    await evalJs(`(() => {
      const frames = [...document.querySelectorAll('iframe')];
      const yt = frames.filter((f) => (f.src || '').includes('youtube'));
      const info = yt.map((f) => {
        const r = f.getBoundingClientRect();
        const cs = getComputedStyle(f);
        return {
          w: Math.round(r.width),
          h: Math.round(r.height),
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
        };
      });
      return JSON.stringify({ count: yt.length, info });
    })()`),
  );

  check('iframe YouTube ada di DOM', iframe.count > 0, `${iframe.count} iframe`);

  if (iframe.count > 0) {
    const f = iframe.info[0];
    check(
      'iframe berukuran nyata >= 200x200px (syarat viewport)',
      f.w >= 200 && f.h >= 200,
      `${f.w}x${f.h}`,
    );
    check('iframe TIDAK display:none', f.display !== 'none', f.display);
    check('iframe TIDAK visibility:hidden', f.visibility !== 'hidden', f.visibility);
    check('iframe TIDAK transparan', parseFloat(f.opacity) > 0.5, f.opacity);
  }

  /* ── 7. Mode video menyembunyikan lirik ───────────────────────────── */

  console.log('\n[7] Mode video menonaktifkan lirik');

  await evalJs(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Video');
    if (btn) btn.click();
    return 'clicked';
  })()`);
  await sleep(700);

  const videoMode = JSON.parse(
    await evalJs(`(() => {
      const lines = document.querySelectorAll('[aria-label^="Lompat ke"]');
      const notice = document.body.innerText.includes('Beralih ke mode Artwork');
      const frames = [...document.querySelectorAll('iframe')].filter((f) => (f.src || '').includes('youtube'));
      const r = frames[0] ? frames[0].getBoundingClientRect() : null;
      return JSON.stringify({
        lines: lines.length,
        notice,
        frameSize: r ? [Math.round(r.width), Math.round(r.height)] : null,
      });
    })()`),
  );

  check('lirik HILANG dari DOM saat mode video', videoMode.lines === 0, `${videoMode.lines} baris`);
  check('ada penjelasan ke pengguna', videoMode.notice === true);
  check(
    'iframe membesar jadi permukaan utama',
    videoMode.frameSize !== null && videoMode.frameSize[0] > 300,
    JSON.stringify(videoMode.frameSize),
  );

  await evalJs(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Artwork');
    if (btn) btn.click();
    return 'back';
  })()`);
  await sleep(500);

  const restored = JSON.parse(
    await evalJs(`JSON.stringify({ lines: document.querySelectorAll('[aria-label^="Lompat ke"]').length })`),
  );
  check('lirik kembali saat mode artwork', restored.lines > 0, `${restored.lines} baris`);
};
