/**
 * A. GEOMETRI — mengubah "penempatan huruf acak-acakan" jadi angka.
 *
 * Jalankan:
 *   BU_CDP_URL=http://127.0.0.1:9222 TARGET=http://127.0.0.1:3210 \
 *     node scripts/measure-lyrics-geometry.cjs
 *   (opsional) SLUGS=peradaban,bertaut,die-with-a-smile
 *
 * Tiga keadaan diukur untuk setiap lagu, dan perbandingannya yang bercerita:
 *   L  layout murni  — transform dimatikan lewat !important
 *   I  idle          — posisi 0, semua kata scale 0.95
 *   M  campur        — satu baris setengah dinyanyikan (sung 1.0505 + notSung 0.95)
 */

const { TARGET, openTab, sleep, stats, fmt } = require('./measure-cdp.cjs');
const dom = require('./measure-dom.cjs');

const SLUGS = (process.env.SLUGS || 'peradaban,bertaut,die-with-a-smile').split(',');
const call = (fn, ...args) =>
  `JSON.stringify((${String(fn)}).apply(null, ${JSON.stringify(args)}))`;

/** Pasang-pasangkan span bersebelahan dalam satu grup dan satu baris visual. */
function pairs(groups) {
  const out = [];
  for (const g of groups) {
    for (let i = 0; i < g.spans.length - 1; i += 1) {
      const a = g.spans[i];
      const b = g.spans[i + 1];
      out.push({
        g,
        a,
        b,
        i,
        sameRow: Math.abs(a.offT - b.offT) < 1,
        // Batas kata: span BERIKUTNYA yang tidak menempel = kata baru mulai.
        boundary: !b.part,
        layoutGap: b.offL - (a.offL + a.offW),
        inkGap: b.iL - a.iR,
        boxGap: b.bL - a.bR,
      });
    }
  }
  return out;
}

function report(label, groups, chPx) {
  const p = pairs(groups);
  const row = p.filter((x) => x.sameRow);

  const boundary = row.filter((x) => x.boundary);
  const sticky = row.filter((x) => !x.boundary);

  const bInk = stats(boundary.map((x) => x.inkGap));
  const sInk = stats(sticky.map((x) => x.inkGap));
  const want = 0.32 * chPx;

  console.log(`\n  [${label}] pasangan sebaris ${row.length} (batas kata ${boundary.length}, menempel ${sticky.length})`);
  const line = (name, s) =>
    s === null
      ? `    ${name}: —`
      : `    ${name}: min ${fmt(s.min)} / p50 ${fmt(s.p50)} / p95 ${fmt(s.p95)} / maks ${fmt(s.max)} px` +
        `  =  ${fmt(s.min / chPx, 3)} / ${fmt(s.p50 / chPx, 3)} / ${fmt(s.p95 / chPx, 3)} / ${fmt(s.max / chPx, 3)} ch`;
  console.log(line('jarak antar KATA   (ink)', bInk));
  console.log(line('jarak DALAM kata   (ink)', sInk));

  /* Inti temuan: mana yang KEHILANGAN jarak dan mana yang mendapat jarak
     padahal seharusnya menempel. Ambang 6px = setengah dari 0,32ch. */
  const half = want / 2;
  const missing = boundary.filter((x) => x.inkGap < half);
  const spurious = sticky.filter((x) => x.inkGap > half);
  const overlap = row.filter((x) => x.inkGap < -0.5);
  console.log(
    `    JARAK HILANG di batas kata (< ${fmt(half)}px): ${missing.length}/${boundary.length}` +
      ` (${fmt((100 * missing.length) / Math.max(1, boundary.length), 1)}%)`,
  );
  console.log(
    `    JARAK PALSU di dalam kata (> ${fmt(half)}px): ${spurious.length}/${sticky.length}` +
      ` (${fmt((100 * spurious.length) / Math.max(1, sticky.length), 1)}%)`,
  );
  console.log(`    pasangan yang TUMPANG-TINDIH (< -0,5px): ${overlap.length}`);

  return {
    boundary: bInk,
    sticky: sInk,
    missing: missing.length,
    boundaryTotal: boundary.length,
    spurious: spurious.length,
    stickyTotal: sticky.length,
    overlap: overlap.length,
    pairsRow: row.length,
    byKey: new Map(row.map((x) => [`${x.g.line}:${x.g.group}:${x.i}`, x.inkGap])),
  };
}

/** Kata yang PATAH ke dua baris visual: span menempel tapi offsetTop beda. */
function brokenWords(groups) {
  const hits = [];
  for (const g of groups) {
    for (let i = 0; i < g.spans.length - 1; i += 1) {
      const a = g.spans[i];
      const b = g.spans[i + 1];
      if (b.part && Math.abs(a.offT - b.offT) >= 1) {
        hits.push({ line: g.line, group: g.group, bg: g.bg, idx: i, dy: b.offT - a.offT });
      }
    }
  }
  return hits;
}

/** Baseline: sebaran bottom dalam satu baris visual (layout dan ink). */
function baselines(groups) {
  const layoutSpread = [];
  const inkSpread = [];
  const rows = [];
  for (const g of groups) {
    const byRow = new Map();
    for (const s of g.spans) {
      const k = Math.round(s.offT);
      if (!byRow.has(k)) byRow.set(k, []);
      byRow.get(k).push(s);
    }
    for (const [, items] of byRow) {
      if (items.length < 2) continue;
      rows.push(items.length);
      const lb = items.map((s) => s.offT + s.offH);
      const ib = items.map((s) => s.iB);
      layoutSpread.push(Math.max(...lb) - Math.min(...lb));
      inkSpread.push(Math.max(...ib) - Math.min(...ib));
    }
  }
  return { layout: stats(layoutSpread), ink: stats(inkSpread), rows: rows.length };
}

/** Span yang melewati tepi pane (pane overflow-x: hidden -> terpotong). */
function overflows(groups, pane) {
  const right = pane.paneWidth - pane.panePadRight;
  const hits = [];
  for (const g of groups) {
    for (const s of g.spans) {
      const over = Math.max(s.iR, s.bR) - g.parentR;
      if (over > 0.5) hits.push({ line: g.line, bg: g.bg, over });
    }
  }
  return { hits, right };
}

async function measureSlug(tab, slug) {
  console.log(`\n${'='.repeat(72)}\n${slug}\n${'='.repeat(72)}`);
  const lineCount = await tab.open(`${TARGET}/dev/lirik/${slug}`);
  await sleep(800);

  const cls = await tab.evalJson(call(dom.probeClasses));
  const pane = await tab.evalJson(call(dom.measureCh));
  console.log(
    `  baris DOM ${lineCount} · span kata ${cls.spans} · grup ${cls.groups}` +
      ` · partOfWord ${cls.counts.part} · lastInLine ${cls.counts.last}`,
  );
  console.log(
    `  kelas hash: word=${cls.wordCls} part=${cls.partCls} last=${cls.lastCls}` +
      ` · ::after aktif ${cls.pseudo.withAfter} · setuju ${cls.pseudo.agree} / beda ${cls.pseudo.disagree}`,
  );
  console.log(
    `  viewport ${pane.viewport.join('x')} dpr ${pane.dpr} · pane ${fmt(pane.paneWidth, 1)}x${fmt(pane.paneHeight, 1)}` +
      ` · font ${fmt(pane.fontSize, 2)}px ${pane.fontWeight} · 1ch = ${fmt(pane.chPx, 3)}px` +
      ` · 0,32ch = ${fmt(0.32 * pane.chPx, 2)}px · visibility ${pane.visibility}`,
  );

  const args = [cls.wordCls, cls.partCls, cls.lastCls];
  const set = (on) => tab.evalJson(call(dom.setTransformOverride, cls.wordCls, on));
  const grab = () =>
    tab.evalJson(`JSON.stringify((${String(dom.collectGeometry)}).apply(null, ${JSON.stringify(args)}))`);

  /* ── L: layout murni (transform dimatikan) ───────────────────────── */
  await tab.evalJs('window.__laras && window.__laras.setPosition(0), 1');
  await set(true);
  await sleep(400);
  const L = await grab();
  const rL = report('L layout murni', L, pane.chPx);

  const broken = brokenWords(L);
  const words = L.reduce((n, g) => n + g.spans.filter((s) => !s.part).length, 0);
  console.log(
    `\n    KATA PATAH ke dua baris: ${broken.length} kejadian` +
      ` (dari ${words} kata / ${cls.spans} span)`,
  );
  if (broken.length > 0) {
    console.log(
      '      contoh (baris:grup:indeks-span): ' +
        broken.slice(0, 12).map((b) => `${b.line}:${b.group}:${b.idx}`).join(', '),
    );
  }

  const bl = baselines(L);
  console.log(
    `    baseline sebaris — sebaran layout p50 ${fmt(bl.layout && bl.layout.p50, 3)} maks ${fmt(bl.layout && bl.layout.max, 3)}px` +
      ` · ink p50 ${fmt(bl.ink && bl.ink.p50, 3)} maks ${fmt(bl.ink && bl.ink.max, 3)}px (${bl.rows} baris visual)`,
  );

  const ov = overflows(L, pane);
  console.log(`    span melewati tepi pane: ${ov.hits.length}` +
    (ov.hits.length ? ` maks ${fmt(Math.max(...ov.hits.map((h) => h.over)), 2)}px` : ''));

  const dbl = L.reduce((n, g) => n + g.spans.filter((s) => s.sp && s.aOn).length, 0);
  const anySpace = L.reduce((n, g) => n + g.spans.filter((s) => s.sp).length, 0);
  console.log(
    `    JARAK DOBEL — span yang teksnya mengandung spasi: ${anySpace}` +
      `, di antaranya juga mendapat ::after margin: ${dbl}`,
  );

  /* ── I: idle (semua kata scale 0.95) ─────────────────────────────── */
  await set(false);
  await sleep(1200);
  const I = await grab();
  const rI = report('I idle scale 0,95', I, pane.chPx);
  const scalesI = I.flatMap((g) => g.spans.map((s) => s.scale)).filter((x) => x !== null);
  console.log(`    scale terpakai: ${[...new Set(scalesI.map((x) => x.toFixed(4)))].slice(0, 6).join(', ')}`);

  /* ── M: campur — satu baris setengah dinyanyikan ─────────────────── */
  const pos = await findMixedPosition(tab);
  let rM = null;
  let mixInfo = null;
  if (pos !== null) {
    await tab.evalJs(`window.__laras.setPosition(${pos}); 1`);
    await sleep(1400);
    const M = await grab();
    rM = report(`M campur @${pos}s`, M, pane.chPx);
    mixInfo = mixedScaleReport(M, pane.chPx, rL.byKey);
  } else {
    console.log('\n  [M] tidak menemukan posisi dengan baris setengah dinyanyikan');
  }

  /* ── Sapuan lebar: uji hipotesis flex-wrap memutus kata ──────────── */
  await set(true);
  console.log('\n    [W] kata patah vs lebar viewport (transform mati):');
  const sweep = await sweepWidths(tab, cls, [1440, 1180, 960, 820, 700, 560, 430]);
  await set(false);

  return { slug, cls, pane, rL, rI, rM, broken: broken.length, words, bl, ov, dbl, anySpace, mixInfo, pos, sweep };
}

/**
 * Cari posisi lagu di mana baris aktif punya kata SUDAH tersapu DAN belum.
 *
 * Timing tidak ada di DOM, jadi dicari lewat sapuan kasar: --gradient-position
 * -20 = belum, 100 = sudah. Kandidat terbaik = campuran paling seimbang di
 * dalam satu grup.
 */
async function findMixedPosition(tab) {
  const probe = function () {
    const lines = [...document.querySelectorAll('[aria-label^="Lompat ke"]')];
    let best = null;
    for (const l of lines) {
      if (parseFloat(l.style.opacity) < 0.98) continue;
      const spans = [...l.querySelectorAll('span')].filter((s) => s.parentElement === l);
      if (spans.length < 4) continue;
      const g = spans.map((s) => parseFloat(s.style.getPropertyValue('--gradient-position')));
      const sung = g.filter((v) => v >= 99).length;
      const not = g.filter((v) => v <= -19).length;
      best = { n: spans.length, sung, not, score: Math.min(sung, not) };
    }
    return best;
  };
  let best = { pos: null, score: -1 };
  for (let t = 15; t <= 210; t += 2.5) {
    await tab.evalJs(`window.__laras.setPosition(${t}); 1`);
    await sleep(90);
    const r = await tab.evalJson(`JSON.stringify((${String(probe)})())`);
    if (r && r.score > best.score) best = { pos: t, score: r.score, info: r };
    if (best.score >= 3) break;
  }
  if (best.score < 1) return null;
  console.log(
    `\n  [M] posisi ${best.pos}s — baris aktif ${best.info.n} span: ${best.info.sung} sudah, ${best.info.not} belum`,
  );
  return best.pos;
}

/**
 * Inti keluhan "penempatan huruf acak-acakan":
 * satu KATA yang suku katanya berbeda keadaan mendapat scale berbeda, dan karena
 * transform-origin: center bottom, tepi kiri/kanan tiap suku kata bergeser ke
 * arah yang berlawanan. Di sini pergeserannya dihitung dalam px.
 */
function mixedScaleReport(groups, chPx, refKeys) {
  const raw = groups.flatMap((g) => g.spans.map((s) => s.scale));
  const untouched = raw.filter((x) => x === null).length;
  const scales = raw.filter((x) => x !== null);
  const hist = new Map();
  for (const s of scales) {
    const k = (Math.round(s * 1e3) / 1e3).toFixed(3);
    hist.set(k, (hist.get(k) || 0) + 1);
  }
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  console.log(
    `    scale: ${scales.length} span ditulis, ${untouched} span TANPA transform (di luar jendela → scale 1,0)`,
  );
  console.log(
    `    histogram scale: ${top.map(([k, v]) => `${k}×${v}`).join('  ')}`,
  );

  /* Efek scale pada jarak = jarak ink SEKARANG dikurangi jarak ink saat
     transform dimatikan. Ini satu-satunya cara memisahkan scale dari margin. */
  const drift = [];
  const intraDrift = [];
  const mixedPairs = [];
  for (const g of groups) {
    for (let i = 0; i < g.spans.length - 1; i += 1) {
      const a = g.spans[i];
      const b = g.spans[i + 1];
      if (Math.abs(a.offT - b.offT) >= 1) continue;
      const key = `${g.line}:${g.group}:${i}`;
      const ref = refKeys.get(key);
      if (ref === undefined) continue;
      const d = b.iL - a.iR - ref;
      drift.push(Math.abs(d));
      if (b.part) intraDrift.push(Math.abs(d));
      const sa = a.scale === null ? 1 : a.scale;
      const sb = b.scale === null ? 1 : b.scale;
      if (Math.abs(sa - sb) > 0.01) mixedPairs.push({ key, sa, sb, d, part: b.part });
    }
  }
  const sD = stats(drift);
  const sI = stats(intraDrift);
  console.log(
    `    pergeseran jarak AKIBAT SCALE (ink M − ink L): p50 ${fmt(sD && sD.p50)} p95 ${fmt(sD && sD.p95)} maks ${fmt(sD && sD.max)}px` +
      ` (= ${fmt((sD ? sD.max : 0) / chPx, 3)}ch)`,
  );
  console.log(
    `    khusus sambungan DI DALAM kata: p50 ${fmt(sI && sI.p50)} maks ${fmt(sI && sI.max)}px`,
  );
  console.log(
    `    pasangan bersebelahan dengan SCALE BERBEDA: ${mixedPairs.length}` +
      ` (di dalam kata: ${mixedPairs.filter((x) => x.part).length})`,
  );
  return { untouched, hist: top, drift: sD, intraDrift: sI, mixedPairs: mixedPairs.length };
}

/**
 * Sapu beberapa lebar viewport dan hitung KATA PATAH di masing-masing.
 *
 * Kenapa ini perlu: pane /dev/lirik selebar seluruh viewport, jadi pada 1440px
 * tidak ada baris yang membungkus sama sekali dan hipotesis flex-wrap tidak
 * teruji. Pane lirik sungguhan di /lagu/[id] jauh lebih sempit.
 */
async function sweepWidths(tab, cls, widths) {
  const rows = [];
  for (const w of widths) {
    await tab.send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(600);
    const g = await tab.evalJson(
      `JSON.stringify((${String(dom.collectGeometry)}).apply(null, ${JSON.stringify([cls.wordCls, cls.partCls, cls.lastCls])}))`,
    );
    const broken = brokenWords(g);
    const visualRows = g.reduce(
      (n, grp) => n + new Set(grp.spans.map((s) => Math.round(s.offT))).size,
      0,
    );
    const wrapped = g.filter(
      (grp) => new Set(grp.spans.map((s) => Math.round(s.offT))).size > 1,
    ).length;
    rows.push({ w, broken: broken.length, visualRows, wrapped, groups: g.length });
    console.log(
      `      viewport ${String(w).padStart(4)}px → grup membungkus ${String(wrapped).padStart(3)}/${g.length}` +
        `, total baris visual ${String(visualRows).padStart(3)}, KATA PATAH ${broken.length}`,
    );
  }
  await tab.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(500);
  return rows;
}

/**
 * Ukur pane lirik SUNGGUHAN (/demo/<slug> = permukaan Now Playing).
 *
 * /dev/lirik memakai pane selebar viewport, jadi pada 1440px tidak ada baris
 * yang membungkus. Lebar yang dilihat pengguna jauh lebih kecil — dan
 * pembungkusan itulah yang memutus kata.
 */
async function measureRealPane(tab, slug) {
  await tab.open(`${TARGET}/demo/${slug}`);
  await sleep(1200);
  const cls = await tab.evalJson(call(dom.probeClasses));
  const pane = await tab.evalJson(call(dom.measureCh));
  await tab.evalJson(call(dom.setTransformOverride, cls.wordCls, true));
  await sleep(400);
  const g = await tab.evalJson(
    `JSON.stringify((${String(dom.collectGeometry)}).apply(null, ${JSON.stringify([cls.wordCls, cls.partCls, cls.lastCls])}))`,
  );
  const broken = brokenWords(g);
  const wrapped = g.filter((grp) => new Set(grp.spans.map((s) => Math.round(s.offT))).size > 1).length;
  const visualRows = g.reduce((n, grp) => n + new Set(grp.spans.map((s) => Math.round(s.offT))).size, 0);
  const r = report('DEMO pane sungguhan', g, pane.chPx);
  const ov = overflows(g, pane);
  console.log(
    `    pane ${fmt(pane.paneWidth, 1)}x${fmt(pane.paneHeight, 1)}px · font ${fmt(pane.fontSize, 2)}px` +
      ` · 1ch ${fmt(pane.chPx, 2)}px · 0,32ch ${fmt(0.32 * pane.chPx, 2)}px`,
  );
  console.log(
    `    grup membungkus ${wrapped}/${g.length} · baris visual ${visualRows}` +
      ` · KATA PATAH ke dua baris: ${broken.length}` +
      ` · span melewati tepi: ${ov.hits.length}`,
  );
  if (broken.length > 0) {
    console.log(
      '      contoh (baris:grup:indeks-span): ' +
        broken.slice(0, 14).map((b) => `${b.line}:${b.group}:${b.idx}`).join(', '),
    );
  }
  await tab.evalJson(call(dom.setTransformOverride, cls.wordCls, false));
  return { slug, pane, broken: broken.length, wrapped, groups: g.length, visualRows, r, overflow: ov.hits.length };
}

async function main() {
  const tab = await openTab({ width: 1440, height: 900 });
  const all = [];
  const real = [];
  try {
    for (const slug of SLUGS) {
      all.push(await measureSlug(tab, slug));
    }
    console.log(`\n${'='.repeat(72)}\nPANE SUNGGUHAN (/demo, 1440x900)\n${'='.repeat(72)}`);
    for (const slug of SLUGS) {
      console.log(`\n  ${slug}`);
      real.push(await measureRealPane(tab, slug));
    }
  } finally {
    await tab.close();
  }

  console.log(`\n${'='.repeat(72)}\nRINGKASAN GEOMETRI (1440x900, pane /dev/lirik)\n${'='.repeat(72)}`);
  console.log(
    'slug                 span  kata  suku  patah  hilang/batas   palsu/dalam   scale≠  tanpaTransform',
  );
  for (const r of all) {
    console.log(
      `${r.slug.padEnd(21)}${String(r.cls.spans).padStart(5)}${String(r.words).padStart(6)}` +
        `${String(r.cls.counts.part).padStart(6)}${String(r.broken).padStart(7)}` +
        `${`${r.rL.missing}/${r.rL.boundaryTotal}`.padStart(15)}` +
        `${`${r.rL.spurious}/${r.rL.stickyTotal}`.padStart(14)}` +
        `${String(r.mixInfo ? r.mixInfo.mixedPairs : '—').padStart(9)}` +
        `${String(r.mixInfo ? r.mixInfo.untouched : '—').padStart(16)}`,
    );
  }
  console.log(
    '\nhilang/batas = pasangan di BATAS KATA tanpa jarak (seharusnya 0,32ch)' +
      '\npalsu/dalam  = pasangan DI DALAM satu kata yang justru mendapat jarak 0,32ch',
  );

  console.log('\nslug                 paneW  font  membungkus  barisVisual  KATA PATAH  hilang/batas');
  for (const r of real) {
    console.log(
      `${r.slug.padEnd(21)}${fmt(r.pane.paneWidth, 0).padStart(6)}${fmt(r.pane.fontSize, 1).padStart(6)}` +
        `${`${r.wrapped}/${r.groups}`.padStart(12)}${String(r.visualRows).padStart(13)}` +
        `${String(r.broken).padStart(12)}${`${r.r.missing}/${r.r.boundaryTotal}`.padStart(14)}`,
    );
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
});

