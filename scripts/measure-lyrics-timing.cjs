/**
 * B. WAKTU — mengubah "animasi acak-acakan" jadi angka.
 *
 * Jalankan:
 *   BU_CDP_URL=http://127.0.0.1:9222 TARGET=http://127.0.0.1:3210 \
 *     SLUG=peradaban node scripts/measure-lyrics-timing.cjs
 *
 * Yang diukur: anggaran frame, jumlah penulisan DOM per frame, monotonisitas
 * sapuan, puncak scale, dan penenangan setelah seek. Semua lewat jam sintetis
 * window.__laras di /dev/lirik/<slug> — autoplay YouTube diblokir tanpa
 * interaksi, jadi ini satu-satunya cara sapuan bisa BERGERAK di harness.
 */

const { TARGET, openTab, sleep, stats, fmt } = require('./measure-cdp.cjs');
const anim = require('./measure-anim.cjs');

const SLUG = process.env.SLUG || 'peradaban';
const call = (fn, ...args) =>
  `JSON.stringify((${String(fn)}).apply(null, ${JSON.stringify(args)}))`;

/** Statistik + baris ringkas dalam ms. */
function ms(label, values, budget) {
  const s = stats(values);
  if (!s) {
    console.log(`    ${label}: —`);
    return null;
  }
  const over = values.filter((v) => v > budget).length;
  console.log(
    `    ${label}: p50 ${fmt(s.p50)} · p95 ${fmt(s.p95)} · maks ${fmt(s.max)} ms` +
      ` · rata ${fmt(s.mean)} · > ${budget}ms: ${over}/${s.n} (${fmt((100 * over) / s.n, 1)}%)`,
  );
  return { ...s, over };
}

async function frameBudget(tab, atSeconds, seconds) {
  console.log(`\n[B1] Anggaran frame — sapuan bergerak dari ${atSeconds}s selama ${seconds}s`);
  await tab.evalJs(`window.__laras.setPosition(${atSeconds}); window.__laras.setPlaying(true); 1`);
  await sleep(600);
  const start = await tab.evalJson(call(anim.startRecording));
  await sleep(seconds * 1000);
  const stop = await tab.evalJson(call(anim.stopRecording));
  await tab.evalJs('window.__laras.setPlaying(false); 1');

  if (stop.visibility !== 'visible' || start.visibility !== 'visible') {
    console.log(`    PERINGATAN visibilityState=${stop.visibility} — rAF dimatikan browser, angka tidak sah`);
  }

  const frames = stop.frames;
  const byId = new Map();
  for (const f of frames) {
    if (!byId.has(f.id)) byId.set(f.id, []);
    byId.get(f.id).push(f);
  }

  // Loop lirik = callback yang menulis --gradient-position.
  let lyricsId = null;
  for (const [id, list] of byId) {
    if (list.some((f) => f.w && f.w['--gradient-position'] > 0)) lyricsId = id;
  }

  console.log(`    total callback rAF terekam ${frames.length}, dari ${byId.size} pendaftar berbeda`);
  for (const [id, list] of byId) {
    const tag = id === lyricsId ? 'loop LIRIK' : 'lain (jam sintetis / mini-player)';
    const durs = list.map((f) => f.dur);
    const s = stats(durs);
    console.log(
      `      id ${id} (${tag}): ${list.length} frame · durasi p50 ${fmt(s.p50, 3)} p95 ${fmt(s.p95, 3)} maks ${fmt(s.max, 3)} ms`,
    );
  }

  const lyr = byId.get(lyricsId) || [];
  const fps = lyr.length / seconds;
  console.log(`    fps efektif loop lirik: ${fmt(fps, 1)} (${lyr.length} frame / ${seconds}s)`);

  const intervals = [];
  for (let i = 1; i < lyr.length; i += 1) intervals.push(lyr[i].ts - lyr[i - 1].ts);
  ms('jarak antar frame  ', intervals, 16.7);
  ms('durasi callback loop lirik', lyr.map((f) => f.dur), 16.7);

  // Total kerja main thread per frame = semua callback dengan ts yang sama.
  const perTs = new Map();
  for (const f of frames) perTs.set(f.ts, (perTs.get(f.ts) || 0) + f.dur);
  ms('total semua rAF / frame  ', [...perTs.values()], 16.7);

  return { frames, byId, lyricsId, lyr, intervals, fps };
}

function writeReport(lyr) {
  console.log('\n[B2] Penulisan DOM per frame (dihitung dari setter yang dibungkus)');
  const keys = new Set();
  for (const f of lyr) if (f.w) for (const k of Object.keys(f.w)) keys.add(k);
  const rows = [];
  for (const k of [...keys].sort()) {
    const v = lyr.map((f) => (f.w && f.w[k]) || 0);
    const s = stats(v);
    rows.push({ k, s });
    console.log(
      `    ${k.padEnd(24)} p50 ${String(s.p50).padStart(4)} · p95 ${String(s.p95).padStart(4)} · maks ${String(s.max).padStart(4)} · total ${v.reduce((a, b) => a + b, 0)}`,
    );
  }
  const totals = lyr.map((f) => (f.w ? Object.values(f.w).reduce((a, b) => a + b, 0) : 0));
  const st = stats(totals);
  console.log(
    `    ${'SEMUA penulisan'.padEnd(24)} p50 ${st.p50} · p95 ${st.p95} · maks ${st.max} per frame`,
  );
  return { rows, totals: st };
}

/**
 * B3. Monotonisitas sapuan.
 *
 * Posisi dimajukan langkah kecil sambil jam sintetis DIJEDA, jadi setiap
 * pengukuran deterministik: --gradient-position seharusnya naik monoton dari
 * -20% ke 100% untuk setiap span.
 *
 * Dua ukuran langkah dipakai dan bedanya penting:
 *   0,05s   yang diminta pemilik repo
 *   1/60s   satu frame nyata di 60fps — lompatan di sini benar-benar terlihat
 */
async function monotonic(tab, from, to, step, label) {
  await tab.evalJs('window.__laras.setPlaying(false); 1');
  const samples = [];
  for (let t = from; t <= to + 1e-9; t += step) {
    /* Tunggu FRAME, bukan jam dinding. Dengan sleep tetap, satu frame yang
       terlambat (jarak antar frame terukur sampai 105ms) membuat DOM masih
       memegang nilai langkah sebelumnya — dan pembacaan yang tertinggal itu
       muncul sebagai "mundur" yang sebenarnya artefak alat ukur. */
    await tab.evalJs(
      `new Promise((r) => { window.__laras.setPosition(${t.toFixed(4)});` +
        ` let n = 0; const f = () => (++n < 4 ? requestAnimationFrame(f) : r(1));` +
        ` requestAnimationFrame(f); })`,
    );
    const st = await tab.evalJson(call(anim.readState));
    samples.push({ t, g: st.g });
  }

  const n = samples[0].g.length;
  let tracked = 0;
  const back = [];
  const jumps = [];
  const perStepDelta = [];
  for (let i = 0; i < n; i += 1) {
    const series = samples.map((s) => s.g[i]).filter((v) => v !== null && Number.isFinite(v));
    if (series.length < samples.length) continue;
    const moved = Math.max(...series) - Math.min(...series);
    if (moved < 0.5) continue; // span ini tidak ikut bergerak di rentang ini
    tracked += 1;
    for (let k = 1; k < series.length; k += 1) {
      const d = series[k] - series[k - 1];
      perStepDelta.push(d);
      if (d < -0.5) back.push({ span: i, t: samples[k].t, d });
      if (d > 30) jumps.push({ span: i, t: samples[k].t, d });
    }
  }
  const sd = stats(perStepDelta.filter((d) => d > 0.5));
  console.log(
    `    [${label}] langkah ${fmt(step, 4)}s × ${samples.length} sampel · ${tracked} span bergerak` +
      ` · kenaikan per langkah p50 ${fmt(sd && sd.p50, 1)} p95 ${fmt(sd && sd.p95, 1)} maks ${fmt(sd && sd.max, 1)} poin-%`,
  );
  console.log(
    `      MUNDUR (turun > 0,5 poin): ${back.length}` +
      ` · MELOMPAT > 30 poin dalam satu langkah: ${jumps.length}` +
      ` (span berbeda: ${new Set(jumps.map((j) => j.span)).size})`,
  );
  if (back.length > 0) {
    const worst = [...back].sort((a, b) => a.d - b.d).slice(0, 6);
    console.log(
      '      penurunan terbesar (span#@detik=poin): ' +
        worst.map((j) => `${j.span}@${fmt(j.t, 2)}=${fmt(j.d, 1)}`).join(', '),
    );
  }
  if (jumps.length > 0) {
    const top = [...jumps].sort((a, b) => b.d - a.d).slice(0, 6);
    console.log(
      '      lompatan terbesar (span#@detik=poin): ' +
        top.map((j) => `${j.span}@${fmt(j.t, 2)}=${fmt(j.d, 1)}`).join(', '),
    );
  }
  return { tracked, back: back.length, jumps: jumps.length, delta: sd, samples: samples.length };
}

/** B4. Puncak scale nyata per span. */
async function peaks(tab, from, seconds) {
  console.log(`\n[B4] Puncak scale — putar dari ${from}s selama ${seconds}s`);
  await tab.evalJs(`window.__laras.setPosition(${from}); 1`);
  await sleep(1200);
  const count = await tab.evalJs(`(${String(anim.startPeakSampler)})()`);
  await tab.evalJs('window.__laras.setPlaying(true); 1');
  await sleep(seconds * 1000);
  await tab.evalJs('window.__laras.setPlaying(false); 1');
  const r = await tab.evalJson(call(anim.stopPeakSampler));
  console.log(`    ${r.n} frame tersampel · ${count} span dipantau`);

  const pk = r.max.filter((v) => v !== null);
  const lo = r.min.filter((v) => v !== null);
  const s = stats(pk);
  const sl = stats(lo);
  console.log(
    `    puncak scale: min ${fmt(s.min, 4)} · p50 ${fmt(s.p50, 4)} · p95 ${fmt(s.p95, 4)} · maks ${fmt(s.max, 4)} (${s.n} span)`,
  );
  console.log(`    palung scale: min ${fmt(sl.min, 4)} · p50 ${fmt(sl.p50, 4)} · maks ${fmt(sl.max, 4)}`);

  const near = (v, target) => Math.abs(v - target) < 0.004;
  const counts = {
    idle095: pk.filter((v) => near(v, 0.95)).length,
    biasa10505: pk.filter((v) => near(v, 1.0505)).length,
    emphasis1175: pk.filter((v) => near(v, 1.175)).length,
    diAtas10505: pk.filter((v) => v > 1.0505 + 0.004 && v < 1.17).length,
    diAtas1175: pk.filter((v) => v > 1.175 + 0.004).length,
    lain: 0,
  };
  counts.lain = pk.length - counts.idle095 - counts.biasa10505 - counts.emphasis1175 - counts.diAtas10505 - counts.diAtas1175;
  console.log(
    `    puncak = 0,95 (tidak pernah aktif): ${counts.idle095} · = 1,0505: ${counts.biasa10505}` +
      ` · = 1,175: ${counts.emphasis1175} · di antara: ${counts.diAtas10505} · > 1,175: ${counts.diAtas1175}` +
      ` · lain: ${counts.lain}`,
  );
  const overshoot = Math.max(0, s.max - 1.175);
  console.log(
    `    overshoot di atas token tertinggi (1,175): ${fmt(overshoot, 5)}` +
      ` · token kata biasa 1,0505, emphasis 1,175`,
  );

  /* Kata yang SUDAH dinyanyikan: apakah ia kembali ke 0,95? */
  const stuck = [];
  for (let i = 0; i < r.max.length; i += 1) {
    if (r.max[i] === null) continue;
    if (r.max[i] > 1.02 && r.min[i] > 1.0) stuck.push(i);
  }
  console.log(
    `    span yang PERNAH membesar dan TIDAK PERNAH turun di bawah 1,0 lagi: ${stuck.length}` +
      ` (kalau > 0, kata tidak pulang ke skala diam 0,95)`,
  );
  return { peak: s, trough: sl, counts, stuck: stuck.length, frames: r.n };
}

/** B5. Penenangan setelah seek (lompat), maju dan mundur. */
async function settle(tab, cases) {
  console.log('\n[B5] Setelah seek: berapa frame sampai nilai berhenti berubah');
  const out = [];
  for (const c of cases) {
    await tab.evalJs(`window.__laras.setPlaying(false); window.__laras.setPosition(${c.from}); 1`);
    await sleep(2000); // biarkan benar-benar tenang dulu
    const baseline = await tab.evalJson(
      `(${String(anim.measureSettle)})(0.0002, 6, 20).then(JSON.stringify)`,
    );
    await tab.evalJs(`window.__laras.setPosition(${c.to}); 1`);
    const r = await tab.evalJson(
      `(${String(anim.measureSettle)})(0.0002, 6, 400).then(JSON.stringify)`,
    );
    const peakMoving = Math.max(...r.series.map((x) => x[1]));
    console.log(
      `    ${String(c.from).padStart(5)}s → ${String(c.to).padStart(5)}s (${c.note}):` +
        ` tenang setelah ${r.frames} frame / ${fmt(r.ms, 0)} ms` +
        ` (settled=${r.settled}) · maks span bergerak serentak ${peakMoving}` +
        ` · dasar tenang ${baseline.frames} frame`,
    );
    out.push({ ...c, frames: r.frames, msTaken: r.ms, settled: r.settled, peakMoving });
  }
  return out;
}

/**
 * B6. Amplitudo vs angka desain.
 *
 * yOffset dan glow punya puncak yang tertulis tegas di design-tokens.ts.
 * Kalau nilai NYATA melewatinya jauh, penyebabnya bukan spring (spring paling
 * banyak overshoot beberapa persen) tapi interpolasi spline-nya.
 */
async function amplitude(tab, from, seconds) {
  console.log(`\n[B6] Amplitudo yOffset & glow vs angka desain — putar dari ${from}s selama ${seconds}s`);
  await tab.evalJs(`window.__laras.setPosition(${from}); 1`);
  await sleep(1000);
  await tab.evalJs(`(${String(anim.startAmplitudeSampler)})()`);
  await tab.evalJs('window.__laras.setPlaying(true); 1');
  await sleep(seconds * 1000);
  await tab.evalJs('window.__laras.setPlaying(false); 1');
  const r = await tab.evalJson(call(anim.stopAmplitudeSampler));

  const wantY = -(1 / 60);
  console.log(`    ${r.n} frame tersampel`);
  console.log(
    `    translateY: min ${fmt(r.yMin, 5)} em · maks ${fmt(r.yMax, 5)} em` +
      ` · target puncak ${fmt(wantY, 5)} em (= -1/60)` +
      ` → rasio ${fmt(r.yMin / wantY, 2)}×`,
  );
  console.log(
    `      sampel negatif ${r.ySamples} · p50 ${fmt(r.yP50, 5)} · p01 ${fmt(r.yP01, 5)} em`,
  );
  console.log(
    `    --text-shadow-opacity: maks ${fmt(r.glowMax, 2)}% · target puncak 35% (glow 1 × GLOW.opacityFactor 35)` +
      ` → rasio ${fmt(r.glowMax / 35, 2)}×`,
  );
  console.log(`      sampel > 0,5% ${r.glowSamples} · p50 ${fmt(r.glowP50, 2)}% · p99 ${fmt(r.glowP99, 2)}%`);
  console.log(
    `    --text-shadow-blur: maks ${fmt(r.blurMax, 3)}px · target puncak ${fmt(4 + 2 * 1, 1)}px (blurBase 4 + blurScale 2 × glow 1)`,
  );
  return r;
}

async function main() {
  const tab = await openTab({ width: 1440, height: 900 });
  try {
    const lines = await tab.open(`${TARGET}/dev/lirik/${SLUG}`);
    await sleep(1000);
    const info = await tab.evalJson(call(anim.installTimingProbe));
    const proxied = await tab.evalJson(call(anim.patchStyleWrites));
    const spanCount = await tab.evalJs(
      `document.querySelectorAll('[aria-label^="Lompat ke"] span').length`,
    );
    console.log(`${'='.repeat(72)}\n${SLUG} — ${lines} baris, ${spanCount} span kata\n${'='.repeat(72)}`);
    console.log(
      `  probe: ${info.state} · setter prototype: ${(info.patched || []).join(', ')}` +
        ` · style diproksi pada ${proxied.n} elemen · visibility ${info.visibility}`,
    );

    await tab.send('Performance.enable');
    const before = await tab.send('Performance.getMetrics');

    const at = Number(process.env.AT || 25);
    const fb = await frameBudget(tab, at, 3);
    writeReport(fb.lyr);

    const after = await tab.send('Performance.getMetrics');
    const pick = (arr, name) => {
      const m = arr.metrics.find((x) => x.name === name);
      return m ? m.value : null;
    };
    const names = [
      'RecalcStyleCount',
      'RecalcStyleDuration',
      'LayoutCount',
      'LayoutDuration',
      'ScriptDuration',
      'TaskDuration',
      'Nodes',
      'LayoutObjects',
    ];
    console.log('\n[B2b] Metrik renderer selama 3 detik itu (Performance.getMetrics)');
    for (const n of names) {
      const d = pick(after, n) - pick(before, n);
      const perFrame = fb.lyr.length > 0 ? d / fb.lyr.length : 0;
      console.log(
        `    ${n.padEnd(22)} Δ ${fmt(d, 3).padStart(10)}` +
          `  per frame ${fmt(perFrame, 3)}` +
          (n === 'Nodes' || n === 'LayoutObjects' ? `  (total ${pick(after, n)})` : ''),
      );
    }

    console.log('\n[B3] Monotonisitas sapuan (langkah kecil, jam dijeda)');
    const m1 = await monotonic(tab, at, at + 5, 0.05, 'langkah 0,05s');
    const m2 = await monotonic(tab, at + 1, at + 2, 1 / 60, 'langkah 1/60s = 1 frame');

    await peaks(tab, at - 1, 6);
    await amplitude(tab, at - 1, 6);

    console.log('\n[B4b] Scale menurut keadaan sapuan, pada keadaan TENANG');
    await tab.evalJs(`window.__laras.setPlaying(false); window.__laras.setPosition(${at + 6}); 1`);
    await sleep(2500);
    const sbs = await tab.evalJson(call(anim.scaleByState));
    const show = (k, s) =>
      s === null
        ? `      ${k}: —`
        : `      ${k.padEnd(8)} n=${String(s.n).padStart(4)} scale ${fmt(s.min, 4)}..${fmt(s.max, 4)} · nilai ${s.uniq.map((x) => fmt(x, 4)).join(', ')}`;
    console.log(show('notSung', sbs.notSung));
    console.log(show('active', sbs.active));
    console.log(show('sung', sbs.sung));
    console.log(`      tanpa inline style (di luar jendela, scale efektif 1,0): ${sbs.noStyle}/${sbs.total}`);

    await settle(tab, [
      { from: 0, to: 60, note: 'lompat maju, wilayah baru' },
      { from: 0, to: 150, note: 'lompat maju, wilayah baru' },
      { from: 200, to: 90, note: 'lompat mundur, wilayah baru' },
    ]);

    console.log(
      `\n  (monotonisitas: 0,05s → mundur ${m1.back}, lompat>30 ${m1.jumps}` +
        ` · 1 frame → mundur ${m2.back}, lompat>30 ${m2.jumps})`,
    );
  } finally {
    await tab.close();
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
});

