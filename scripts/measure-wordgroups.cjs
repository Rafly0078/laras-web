/**
 * Ukur ULANG tiga cacat yang baru diperbaiki. Hanya angka, tanpa teks lirik.
 *
 *   D1  jarak antar kata vs jarak di dalam kata
 *   D2  sebaran skala DIAM (kata yang sudah dinyanyikan harus pulang ke 0.95)
 *   D4  kata yang patah ke dua baris
 *
 * Struktur DOM sudah berubah: sekarang `.wordGroup` (satu KATA) berisi beberapa
 * `.word` (suku kata). Jadi pertanyaannya jadi mudah dijawab tanpa menebak
 * kelas: jarak DI DALAM satu grup harus 0, jarak ANTAR grup harus 0.32ch, dan
 * dua span dalam satu grup tidak boleh punya `top` berbeda.
 *
 * Jalankan:
 *   BU_CDP_URL=http://127.0.0.1:9222 TARGET=http://127.0.0.1:3210 \
 *     SLUG=peradaban WIDTH=824 node scripts/measure-wordgroups.cjs
 */

const http = require('node:http');
const WebSocket = require('ws');

const CDP_URL = process.env.BU_CDP_URL || 'http://127.0.0.1:9222';
const TARGET = process.env.TARGET || 'http://127.0.0.1:3210';
const SLUGS = (process.env.SLUGS || 'peradaban,bertaut,die-with-a-smile').split(',');
const WIDTH = Number(process.env.WIDTH || 824);
const HEIGHT = Number(process.env.HEIGHT || 900);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error(`bukan JSON dari ${url}`));
          }
        });
      })
      .on('error', reject);
  });
}

/** Kode yang dievaluasi DI DALAM halaman. Nol teks lirik yang dikembalikan. */
const PROBE = `
(() => {
  const groups = [...document.querySelectorAll('[class*="wordGroup"]')];
  if (groups.length === 0) return JSON.stringify({ error: 'wordGroup tidak ditemukan' });

  const probe = document.createElement('span');
  probe.textContent = '0';
  probe.style.cssText = 'position:absolute;visibility:hidden';
  groups[0].appendChild(probe);
  const chPx = probe.getBoundingClientRect().width;
  probe.remove();

  /* Kotak TINTA lewat Range: kotak border span ikut margin & scale, sedangkan
     yang menentukan jarak yang DILIHAT mata adalah kotak teksnya. */
  const inkBox = (el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect();
  };

  const withinWord = [];
  const betweenWords = [];
  let brokenWords = 0;
  let syllables = 0;

  for (let g = 0; g < groups.length; g += 1) {
    const spans = [...groups[g].children].filter((el) => el.tagName === 'SPAN');
    syllables += spans.length;

    // Sambungan DI DALAM satu kata: jarak harus 0, dan top harus sama.
    for (let i = 0; i + 1 < spans.length; i += 1) {
      const a = inkBox(spans[i]);
      const b = inkBox(spans[i + 1]);
      withinWord.push(b.left - a.right);
      if (Math.abs(b.top - a.top) > 1) brokenWords += 1;
    }

    // Jarak ke kata berikutnya, hanya kalau masih di baris visual yang sama.
    const next = groups[g + 1];
    if (!next || next.parentElement !== groups[g].parentElement) continue;
    const last = spans[spans.length - 1];
    const firstNext = [...next.children].find((el) => el.tagName === 'SPAN');
    if (!last || !firstNext) continue;
    const a = inkBox(last);
    const b = inkBox(firstNext);
    if (Math.abs(b.top - a.top) <= 1) betweenWords.push(b.left - a.right);
  }

  // Skala DIAM: kelompokkan menurut --gradient-position supaya keadaan terbaca.
  const spans = [...document.querySelectorAll('[class*="wordGroup"] > span')];
  const scales = { notSung: new Set(), sung: new Set(), tanpaInline: 0 };
  for (const el of spans) {
    const t = el.style.transform;
    if (!t) { scales.tanpaInline += 1; continue; }
    const m = /scale\(([-0-9.]+)\)/.exec(t);
    if (!m) continue;
    const value = Number(m[1]).toFixed(4);
    const pos = getComputedStyle(el).getPropertyValue('--gradient-position').trim();
    if (pos === '100%') scales.sung.add(value);
    else if (pos === '-20%') scales.notSung.add(value);
  }

  const stats = (list) => {
    if (list.length === 0) return null;
    const s = [...list].sort((x, y) => x - y);
    return {
      n: s.length,
      p50: s[Math.floor(s.length * 0.5)],
      maks: s[s.length - 1],
      min: s[0],
    };
  };

  return JSON.stringify({
    chPx,
    words: groups.length,
    syllables,
    brokenWords,
    withinWord: stats(withinWord),
    betweenWords: stats(betweenWords),
    scaleNotSung: [...scales.notSung].sort(),
    scaleSung: [...scales.sung].sort(),
    tanpaInline: scales.tanpaInline,
  });
})()
`;

async function main() {
  const list = await httpJson(`${CDP_URL}/json/list`);
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('tidak ada tab page di Chrome');

  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(new Error(JSON.stringify(m.error)));
      else p.resolve(m.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const ch = (px, chPx) => `${px.toFixed(2)}px (${(px / chPx).toFixed(3)}ch)`;

  for (const slug of SLUGS) {
    await send('Page.navigate', { url: `${TARGET}/dev/lirik/${slug}` });

    /* Jam sintetis DISETEL ke tengah lagu lalu dijeda. Tanpa ini animator hanya
       pernah melihat posisi 0, jadi mayoritas span tidak punya inline transform
       sama sekali dan sebaran "skala diam" tidak bisa diukur. */
    for (let i = 0; i < 40; i += 1) {
      await sleep(300);
      const ready = await send('Runtime.evaluate', {
        expression: `(() => {
          if (!window.__laras) return 'belum';
          window.__laras.setPlaying(true);
          window.__laras.setPosition(${Number(process.env.AT || 120)});
          return 'ok';
        })()`,
        returnByValue: true,
      });
      if (ready.result.value === 'ok') break;
    }
    // Biarkan spring mengendap dulu; yang diukur adalah keadaan DIAM.
    await sleep(2500);
    await send('Runtime.evaluate', {
      expression: '(() => { window.__laras && window.__laras.setPlaying(false); return 1; })()',
      returnByValue: true,
    });
    await sleep(600);

    let out = null;
    for (let i = 0; i < 60; i += 1) {
      await sleep(400);
      const r = await send('Runtime.evaluate', {
        expression: PROBE,
        returnByValue: true,
        awaitPromise: true,
      });
      const value = r.result.value;
      if (typeof value === 'string') {
        const parsed = JSON.parse(value);
        if (!parsed.error) {
          out = parsed;
          break;
        }
      }
    }

    console.log(`\n── ${slug} @ ${WIDTH}px ─────────────────────────`);
    if (out === null) {
      console.log('  GAGAL: pane lirik tidak pernah siap');
      continue;
    }
    console.log(`  1ch = ${out.chPx.toFixed(3)}px  ->  0.32ch = ${(out.chPx * 0.32).toFixed(2)}px`);
    console.log(`  ${out.words} kata, ${out.syllables} suku kata`);
    console.log(`  KATA PATAH ke dua baris : ${out.brokenWords}`);
    if (out.withinWord) {
      console.log(
        `  jarak DI DALAM kata     : n=${out.withinWord.n} p50 ${ch(out.withinWord.p50, out.chPx)} maks ${ch(out.withinWord.maks, out.chPx)}`,
      );
    }
    if (out.betweenWords) {
      console.log(
        `  jarak ANTAR kata        : n=${out.betweenWords.n} p50 ${ch(out.betweenWords.p50, out.chPx)} min ${ch(out.betweenWords.min, out.chPx)}`,
      );
    }
    console.log(`  skala diam notSung      : ${out.scaleNotSung.join(' , ') || '—'}`);
    console.log(`  skala diam sung         : ${out.scaleSung.join(' , ') || '—'}`);
    console.log(`  span tanpa inline style : ${out.tanpaInline}`);
  }

  await send('Emulation.clearDeviceMetricsOverride');
  ws.close();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exitCode = 1;
});
