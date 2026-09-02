/**
 * Struktur TTML: berapa span per kata, dan berapa lama satu suku kata.
 *
 * Ini pengukuran OFFLINE terhadap fixture yang di-commit — tanpa browser.
 * Gunanya menjelaskan kenapa keluhan geometri muncul di bahasa Indonesia tapi
 * tidak di bahasa Inggris: TTML Apple memecah kata Indonesia menjadi beberapa
 * span, sedangkan lirik Inggris hampir selalu satu span per kata.
 *
 * TIDAK ADA teks lirik yang dicetak di sini — hanya jumlah dan waktu.
 * Pemisahan kata dideteksi sama seperti src/lib/lyrics/ttml.ts: ada tidaknya
 * spasi di antara </span> dan <span berikutnya.
 *
 *   node scripts/measure-ttml-structure.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

const { stats, fmt } = require('./measure-cdp.cjs');
const DIR = path.join(__dirname, '..', 'fixtures', 'ttml');

/** Sama seperti parseTtmlTime: "9.420" atau "4:20.642". */
function toSeconds(raw) {
  const m = /^(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(String(raw).trim());
  if (!m) return NaN;
  const [, a, b, c] = m;
  const s = Number.parseFloat(c);
  if (a !== undefined && b !== undefined) return +a * 3600 + +b * 60 + s;
  if (a !== undefined) return +a * 60 + s;
  return s;
}

/** Kumpulkan span bertimbang per <p>, plus penanda menempel. */
function parse(xml) {
  const paras = [];
  const pRe = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  let pm;
  while ((pm = pRe.exec(xml)) !== null) {
    const body = pm[2];
    const spans = [];
    const sRe = /<span\b([^>]*?)>([\s\S]*?)<\/span>|<\/span>\s*|(\s+)/g;
    // Jalur sederhana: ambil semua span bertimbang berurutan dan lihat apakah
    // ada spasi di antara akhir span sebelumnya dan awal span berikutnya.
    const timed = /<span\b[^>]*\bbegin="([^"]+)"[^>]*\bend="([^"]+)"[^>]*>([\s\S]*?)<\/span>/g;
    let tm;
    let lastEnd = -1;
    while ((tm = timed.exec(body)) !== null) {
      const between = lastEnd === -1 ? ' ' : body.slice(lastEnd, tm.index);
      const start = toSeconds(tm[1]);
      const end = toSeconds(tm[2]);
      const text = tm[3].replace(/<[^>]*>/g, '');
      if (Number.isFinite(start) && Number.isFinite(end) && text.trim().length > 0) {
        spans.push({
          start,
          end,
          chars: text.trim().length,
          attached: lastEnd !== -1 && !/\s/.test(between),
        });
      }
      lastEnd = timed.lastIndex;
    }
    void sRe;
    if (spans.length > 0) paras.push(spans);
  }
  return paras;
}

function analyse(file) {
  const xml = fs.readFileSync(path.join(DIR, file), 'utf8');
  const paras = parse(xml);
  const spans = paras.flat();
  const durations = spans.map((s) => s.end - s.start);
  const attached = spans.filter((s) => s.attached).length;

  // Kata = urutan span yang dimulai oleh span tidak-menempel.
  const wordSizes = [];
  for (const p of paras) {
    let n = 0;
    for (const s of p) {
      if (s.attached) n += 1;
      else {
        if (n > 0) wordSizes.push(n);
        n = 1;
      }
    }
    if (n > 0) wordSizes.push(n);
  }

  const d = stats(durations);
  const emphasis = durations.filter((x) => x >= 1.0).length;
  const multi = wordSizes.filter((x) => x > 1).length;

  /* Berapa poin-% sapuan bergerak dalam SATU frame.
     Rentang -20%..100% = 120 poin, jadi 120 / (durasi × fps). */
  const perFrame60 = durations.map((x) => (x > 0 ? 120 / (x * 60) : Infinity)).filter(Number.isFinite);
  const pf = stats(perFrame60);
  const framesPerSyl = durations.map((x) => x * 60).filter((x) => x > 0);
  const fps = stats(framesPerSyl);

  console.log(`\n${file}`);
  console.log(
    `  baris bertimbang ${paras.length} · span ${spans.length} · kata ${wordSizes.length}` +
      ` · span menempel ${attached} (${fmt((100 * attached) / spans.length, 1)}%)`,
  );
  console.log(
    `  kata multi-span ${multi}/${wordSizes.length} (${fmt((100 * multi) / wordSizes.length, 1)}%)` +
      ` · span per kata p50 ${fmt(stats(wordSizes).p50, 2)} maks ${stats(wordSizes).max}`,
  );
  console.log(
    `  durasi span: min ${fmt(d.min, 3)} · p50 ${fmt(d.p50, 3)} · p95 ${fmt(d.p95, 3)} · maks ${fmt(d.max, 3)} s` +
      ` · emphasis (>= 1,0s) ${emphasis} (${fmt((100 * emphasis) / spans.length, 1)}%)`,
  );
  console.log(
    `  frame 60fps per span: p50 ${fmt(fps.p50, 1)} · p05..p95 ${fmt(fps.min, 1)}..${fmt(fps.p95, 1)}` +
      ` → sapuan maju p50 ${fmt(pf.p50, 1)} poin-% / frame (maks ${fmt(pf.max, 0)})`,
  );
  console.log(
    `  span < 6 frame (< 0,1s): ${durations.filter((x) => x < 0.1).length}` +
      ` · < 12 frame (< 0,2s): ${durations.filter((x) => x < 0.2).length}`,
  );

  // Kepadatan: jendela 5 detik dengan span terbanyak.
  let best = { t: 0, n: 0 };
  for (let t = 0; t < 300; t += 1) {
    const n = spans.filter((s) => s.start >= t && s.start < t + 5).length;
    if (n > best.n) best = { t, n };
  }
  console.log(`  jendela 5s terpadat: mulai ${best.t}s dengan ${best.n} span`);
  return { file, spans: spans.length, words: wordSizes.length, attached, multi, d, emphasis, dense: best };
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.ttml'));
const all = files.map(analyse);

console.log('\nRINGKASAN');
console.log('file                      span  kata  menempel%  multiKata%  durasi_p50  emphasis  padat5s');
for (const r of all) {
  console.log(
    `${r.file.padEnd(26)}${String(r.spans).padStart(4)}${String(r.words).padStart(6)}` +
      `${fmt((100 * r.attached) / r.spans, 1).padStart(11)}` +
      `${fmt((100 * r.multi) / r.words, 1).padStart(12)}` +
      `${fmt(r.d.p50, 3).padStart(12)}${String(r.emphasis).padStart(10)}` +
      `${`${r.dense.n}@${r.dense.t}s`.padStart(9)}`,
  );
}
