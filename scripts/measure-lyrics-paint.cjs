/**
 * Arah sapuan + biaya compositing.
 *
 * Dua hal yang tidak bisa dibuktikan dari angka DOM saja:
 *  1. ARAH gradient. `--gradient-degrees: 180deg` berarti sapuan VERTIKAL
 *     (atas→bawah) di dalam kotak setiap span, bukan horizontal melintasi
 *     huruf. getComputedStyle MENGHAPUS `180deg` karena itu nilai default
 *     linear-gradient (jebakan #10), jadi bukti dari CSS terkomputasi saja
 *     ambigu — satu potongan piksel menyelesaikannya.
 *  2. Jumlah lapisan compositing. `.word { will-change: transform }` ada pada
 *     SETIAP span; kalau Chrome mempromosikannya semua, itu ratusan lapisan.
 *
 *   BU_CDP_URL=... TARGET=... SLUG=peradaban AT=274 node scripts/measure-lyrics-paint.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

const { TARGET, openTab, sleep, fmt } = require('./measure-cdp.cjs');

const SLUG = process.env.SLUG || 'peradaban';
const AT = Number(process.env.AT || 274);
const OUT = process.env.OUT || path.join(require('node:os').tmpdir(), 'laras-sweep.png');

/** Cari span yang PERSIS sedang tersapu dan kembalikan rect + CSS-nya. */
function findSweeping() {
  const spans = [...document.querySelectorAll('[aria-label^="Lompat ke"] span')];
  let pick = null;
  for (let i = 0; i < spans.length; i += 1) {
    const v = parseFloat(spans[i].style.getPropertyValue('--gradient-position'));
    if (Number.isFinite(v) && v > 10 && v < 70) {
      const r = spans[i].getBoundingClientRect();
      if (r.width > 30) {
        pick = { i, v, r: { x: r.x, y: r.y, w: r.width, h: r.height } };
        break;
      }
    }
  }
  if (!pick) return { error: 'tidak ada span di tengah sapuan' };
  const el = spans[pick.i];
  const cs = getComputedStyle(el);
  return {
    index: pick.i,
    gradientPosition: pick.v,
    rect: pick.r,
    chars: (el.textContent || '').length,
    backgroundImage: cs.backgroundImage,
    backgroundSize: cs.backgroundSize,
    backgroundClip: cs.backgroundClip || cs.webkitBackgroundClip,
    textShadow: cs.textShadow,
    willChange: cs.willChange,
    transformOrigin: cs.transformOrigin,
    // Nilai mentah dari stylesheet, sebelum getComputedStyle merapikannya.
    degreesVar: cs.getPropertyValue('--gradient-degrees').trim(),
    offsetVar: cs.getPropertyValue('--gradient-offset').trim(),
    alpha: cs.getPropertyValue('--gradient-alpha').trim(),
    alphaEnd: cs.getPropertyValue('--gradient-alpha-end').trim(),
  };
}

async function main() {
  const tab = await openTab({ width: 1440, height: 900 });
  try {
    await tab.open(`${TARGET}/dev/lirik/${SLUG}`);
    await sleep(900);
    await tab.evalJs(`window.__laras.setPosition(${AT}); 1`);
    await sleep(500);

    let info = await tab.evalJson(`JSON.stringify((${String(findSweeping)})())`);
    for (let k = 0; info.error && k < 40; k += 1) {
      await tab.evalJs(`window.__laras.setPosition(${AT + k * 0.13}); 1`);
      await sleep(120);
      info = await tab.evalJson(`JSON.stringify((${String(findSweeping)})())`);
    }
    if (info.error) throw new Error(info.error);

    console.log(`${'='.repeat(72)}\n${SLUG} @${AT}s — arah sapuan & biaya paint\n${'='.repeat(72)}`);
    console.log(`  span #${info.index}, ${info.chars} karakter, --gradient-position ${fmt(info.gradientPosition, 1)}%`);
    console.log(`  --gradient-degrees dari stylesheet : "${info.degreesVar}"  (180deg = to bottom = VERTIKAL)`);
    console.log(`  background-image terkomputasi      : ${info.backgroundImage}`);
    console.log(`  background-clip / size             : ${info.backgroundClip} / ${info.backgroundSize}`);
    console.log(`  text-shadow                        : ${info.textShadow}`);
    console.log(`  will-change / transform-origin     : ${info.willChange} / ${info.transformOrigin}`);
    console.log(
      `  CATATAN: getComputedStyle memang MENGHAPUS 180deg (nilai default), jadi tidak adanya\n` +
        `  sudut di string di atas justru MENGONFIRMASI arah to-bottom, bukan membantahnya.`,
    );

    /* Potongan piksel: kalau sapuan vertikal, batas terang/redup melintang
       HORIZONTAL di tengah kotak kata. Kalau horizontal, batasnya tegak. */
    const r = info.rect;
    const shot = await tab.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: r.x - 2, y: r.y - 2, width: r.w + 4, height: r.h + 4, scale: 6 },
      captureBeyondViewport: false,
    });
    fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
    console.log(`\n  potongan satu kata mid-sapuan disimpan: ${OUT} (${fmt(r.w, 0)}x${fmt(r.h, 0)}px @6x)`);

    /* Lapisan compositing. */
    const layers = await new Promise((resolve) => {
      let done = false;
      tab.on('LayerTree.layerTreeDidChange', (p) => {
        if (done) return;
        done = true;
        resolve(p.layers || []);
      });
      tab.send('LayerTree.enable');
      setTimeout(() => {
        if (!done) {
          done = true;
          resolve(null);
        }
      }, 4000);
    });
    if (layers === null) {
      console.log('\n  LayerTree tidak mengirim snapshot dalam 4s');
    } else {
      const big = layers.filter((l) => l.width * l.height > 100);
      const area = layers.reduce((a, l) => a + l.width * l.height, 0);
      console.log(
        `\n  lapisan compositing: ${layers.length} total (${big.length} lebih besar dari 100px²)` +
          ` · total area ${fmt(area / 1e6, 2)} Mpx ≈ ${fmt((area * 4) / 1e6, 0)} MB pada 4 byte/px`,
      );
      /* Ukuran khas satu span kata: lebar 30..400px, tinggi ~66px (line-height
         1,1818 × 56px). Kalau ratusan lapisan berada di rentang itu, berarti
         `will-change: transform` pada .word benar-benar mempromosikan tiap kata. */
      const wordish = layers.filter((l) => l.height > 40 && l.height < 120 && l.width < 500);
      console.log(
        `  lapisan seukuran satu kata (tinggi 40..120px, lebar < 500px): ${wordish.length}`,
      );
      const buckets = [100, 1000, 10000, 100000, 1000000, Infinity];
      let prev = 0;
      for (const b of buckets) {
        const n = layers.filter((l) => l.width * l.height >= prev && l.width * l.height < b).length;
        console.log(`      area ${String(prev).padStart(8)} .. ${String(b).padStart(8)} px² : ${n} lapisan`);
        prev = b;
      }
      const top = [...layers].sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 5);
      for (const l of top) {
        console.log(`      terbesar ${String(l.width).padStart(5)}x${String(l.height).padStart(5)} px  id ${l.layerId}`);
      }
    }
    await tab.send('LayerTree.disable');
  } finally {
    await tab.close();
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
});
