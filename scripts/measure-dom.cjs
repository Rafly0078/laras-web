/**
 * Kode yang DIJALANKAN DI DALAM HALAMAN (bukan di Node).
 *
 * Fungsi-fungsi di sini diserialisasi lewat String(fn) lalu dievaluasi di tab
 * Chrome. Ditulis sebagai fungsi biasa, bukan template string, supaya tidak ada
 * neraka escaping backslash dan supaya editor tetap bisa memeriksa sintaksnya.
 *
 * Tidak boleh menyentuh apa pun dari Node di sini.
 */

/**
 * Cari nama kelas CSS-module yang sudah di-hash.
 *
 * Kelas `.word`, `.partOfWord`, `.lastInLine` semuanya di-hash saat build, jadi
 * nama literalnya tidak ada di DOM. Dua cara dipakai lalu DIBANDINGKAN:
 *
 *  1. Frekuensi token: token yang ada di SEMUA span = `word`. Token yang ada di
 *     span terakhir setiap grup = `lastInLine`. Sisanya = `partOfWord`.
 *  2. Pseudo-element: aturan CSS hanya memasang `::after { content: '' }` pada
 *     `.word:not(.partOfWord):not(.lastInLine)`. Jadi span dengan
 *     getComputedStyle(el,'::after').content === 'none' PASTI partOfWord atau
 *     lastInLine.
 *
 * Kalau keduanya tidak setuju, angka jarak tidak bisa dipercaya — jadi
 * kesepakatannya ikut dilaporkan.
 */
function probeClasses() {
  const lines = [...document.querySelectorAll('[aria-label^="Lompat ke"]')];
  const spans = [];
  for (const line of lines) {
    for (const el of line.querySelectorAll('span')) spans.push(el);
  }
  if (spans.length === 0) return { error: 'tidak ada span kata' };

  const count = new Map();
  for (const el of spans) {
    for (const c of el.classList) count.set(c, (count.get(c) || 0) + 1);
  }

  const wordCls = [...count.keys()].find((c) => count.get(c) === spans.length) || null;

  // Grup = elemen induk yang langsung memegang span kata (baris lead + tiap
  // wrapper vokal latar).
  const parents = [...new Set(spans.map((el) => el.parentElement))];
  const lastOfGroup = parents
    .map((p) => [...p.children].filter((c) => c.tagName === 'SPAN').pop())
    .filter(Boolean);

  let inter = null;
  for (const el of lastOfGroup) {
    const set = new Set([...el.classList].filter((c) => c !== wordCls));
    inter = inter === null ? set : new Set([...inter].filter((c) => set.has(c)));
  }
  const lastCls = inter && inter.size === 1 ? [...inter][0] : null;
  const partCls =
    [...count.keys()].find((c) => c !== wordCls && c !== lastCls) || null;

  // Silang-periksa dengan pseudo-element.
  let agree = 0;
  let disagree = 0;
  let withAfter = 0;
  for (const el of spans) {
    const after = getComputedStyle(el, '::after');
    const hasAfter = after.content !== 'none' && after.content !== 'normal';
    if (hasAfter) withAfter += 1;
    const isPart = partCls ? el.classList.contains(partCls) : false;
    const isLast = lastCls ? el.classList.contains(lastCls) : false;
    const predicted = !isPart && !isLast;
    if (predicted === hasAfter) agree += 1;
    else disagree += 1;
  }

  return {
    spans: spans.length,
    groups: parents.length,
    lines: lines.length,
    wordCls,
    partCls,
    lastCls,
    counts: { word: count.get(wordCls) || 0, part: count.get(partCls) || 0, last: count.get(lastCls) || 0 },
    pseudo: { withAfter, agree, disagree },
  };
}

/**
 * Ukur 1ch pada font yang SAMA dengan kata lirik.
 *
 * Elemen ukur ditempel di dalam .larasLyrics (bukan di body) supaya mewarisi
 * font-size hasil container query — 7cqw tidak bisa dihitung dari luar. Dibuat
 * absolute + jauh di luar layar supaya tidak menggeser satu baris pun.
 */
function measureCh() {
  const pane = document.querySelector('[class*="larasLyrics"]') ||
    document.querySelector('[aria-label^="Lompat ke"]').parentElement.parentElement;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;top:-99999px;left:0;width:100ch;white-space:pre;visibility:hidden';
  pane.appendChild(probe);
  const chPx = probe.offsetWidth / 100;
  probe.remove();

  const word = document.querySelector('[aria-label^="Lompat ke"] span');
  const cs = getComputedStyle(word);
  const paneCs = getComputedStyle(pane);
  const r = pane.getBoundingClientRect();
  return {
    chPx,
    fontSize: parseFloat(cs.fontSize),
    fontFamily: cs.fontFamily,
    fontWeight: cs.fontWeight,
    letterSpacing: cs.letterSpacing,
    paneWidth: r.width,
    paneHeight: r.height,
    paneClientWidth: pane.clientWidth,
    panePadLeft: parseFloat(paneCs.paddingLeft),
    panePadRight: parseFloat(paneCs.paddingRight),
    scrollWidth: pane.scrollWidth,
    viewport: [window.innerWidth, window.innerHeight],
    dpr: window.devicePixelRatio,
    visibility: document.visibilityState,
  };
}

/**
 * Kumpulkan geometri per span kata.
 *
 * TIGA kotak diukur per span, dan bedanya itulah inti laporan:
 *
 *  - `off*`  : offsetLeft/Top/Width/Height — geometri LAYOUT, tidak terpengaruh
 *              transform. Ini "yang diniatkan CSS".
 *  - `box*`  : getBoundingClientRect — kotak border SETELAH transform (scale
 *              dari spring). Ini "yang dikirim ke compositor".
 *  - `ink*`  : Range di atas isi span — kotak TEKS setelah transform, tanpa
 *              margin ::after. Ini "yang dilihat mata".
 *
 * Jarak antar kata yang dirasakan pengguna = ink berikutnya minus ink sekarang.
 * Mengukurnya dari `box` akan salah, karena margin-right ::after 0.32ch bisa
 * masuk ke dalam lebar shrink-to-fit inline-block dan jadi ruang KOSONG DI
 * DALAM kotak, bukan celah antar kotak.
 */
function collectGeometry(wordCls, partCls, lastCls) {
  const lines = [...document.querySelectorAll('[aria-label^="Lompat ke"]')];
  const range = document.createRange();
  const out = [];
  const r2 = (x) => Math.round(x * 100) / 100;

  lines.forEach((lineEl, lineIdx) => {
    const spans = [...lineEl.querySelectorAll('span')];
    if (spans.length === 0) return;
    const groups = new Map();
    for (const el of spans) {
      const p = el.parentElement;
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p).push(el);
    }

    [...groups.entries()].forEach(([parent, items], groupIdx) => {
      const rec = [];
      for (const el of items) {
        const box = el.getBoundingClientRect();
        range.selectNodeContents(el);
        const ink = range.getBoundingClientRect();
        const after = getComputedStyle(el, '::after');
        const tr = el.style.transform || '';
        const sc = /scale\(([-\d.]+)\)/.exec(tr);
        const ty = /translateY\(([-\d.]+)em\)/.exec(tr);
        const text = el.textContent || '';
        rec.push({
          part: partCls ? el.classList.contains(partCls) : false,
          last: lastCls ? el.classList.contains(lastCls) : false,
          len: text.length,
          sp: /\s/.test(text) ? 1 : 0,
          offL: r2(el.offsetLeft),
          offT: r2(el.offsetTop),
          offW: r2(el.offsetWidth),
          offH: r2(el.offsetHeight),
          bL: r2(box.left),
          bR: r2(box.right),
          bT: r2(box.top),
          bB: r2(box.bottom),
          iL: r2(ink.left),
          iR: r2(ink.right),
          iT: r2(ink.top),
          iB: r2(ink.bottom),
          aMr: r2(parseFloat(after.marginRight) || 0),
          aOn: after.content !== 'none' && after.content !== 'normal' ? 1 : 0,
          scale: sc ? Number(sc[1]) : null,
          ty: ty ? Number(ty[1]) : null,
          grad: parseFloat(el.style.getPropertyValue('--gradient-position')),
        });
      }
      out.push({
        line: lineIdx,
        group: groupIdx,
        bg: parent !== lineEl ? 1 : 0,
        parentW: r2(parent.clientWidth),
        parentL: r2(parent.getBoundingClientRect().left),
        parentR: r2(parent.getBoundingClientRect().right),
        opacity: parseFloat(lineEl.style.opacity),
        spans: rec,
      });
    });
  });

  return out;
}

/** Pasang/lepas override yang MEMATIKAN transform, untuk memisahkan layout dari scale. */
function setTransformOverride(wordCls, on) {
  const id = 'laras-measure-override';
  const old = document.getElementById(id);
  if (old) old.remove();
  if (!on) return false;
  const style = document.createElement('style');
  style.id = id;
  // Inline style kalah dari !important di stylesheet, jadi rAF loop boleh terus
  // menulis transform — efeknya nol selama override terpasang.
  style.textContent = '.' + wordCls + '{transform:none !important}';
  document.head.appendChild(style);
  return true;
}

module.exports = { probeClasses, measureCh, collectGeometry, setTransformOverride };
