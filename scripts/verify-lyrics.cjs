/**
 * Harness verifikasi mesin lirik LARAS lewat CDP.
 *
 * Yang dibuktikan di sini BUKAN "halaman terlihat bagus" — screenshot tidak
 * membuktikan animasi benar. Yang dibuktikan: angka. Nilai --gradient-position
 * per kata pada beberapa titik waktu, skala dari spring, opacity per baris, dan
 * blur berdasarkan jarak, semuanya dibaca langsung dari DOM yang hidup.
 *
 * Butuh Chrome dengan remote debugging aktif:
 *   BU_CDP_URL=http://127.0.0.1:9222  TARGET=http://127.0.0.1:3210
 *
 * Halaman yang diuji: /dev/lirik/<slug> (jam sintetis, tanpa YouTube) untuk
 * bagian sapuan, dan /demo/<slug> (Now Playing sungguhan) untuk struktur,
 * kepatuhan ToS, dan mode video.
 */

const http = require('node:http');
const WebSocket = require('ws');

const CDP_URL = process.env.BU_CDP_URL || 'http://127.0.0.1:9222';
const TARGET = process.env.TARGET || 'http://127.0.0.1:3210';
const SLUG = process.env.SLUG || 'die-with-a-smile';

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  OK    ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`  GAGAL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

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
            reject(new Error(`bukan JSON dari ${url}: ${body.slice(0, 120)}`));
          }
        });
      })
      .on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const version = await httpJson(`${CDP_URL}/json/version`);
  console.log(`Chrome: ${version.Browser}`);

  const targets = await httpJson(`${CDP_URL}/json/list`);
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('tidak ada tab page di Chrome');

  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  let msgId = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });

  function send(method, params = {}) {
    msgId += 1;
    const id = msgId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evalJs(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        `eval gagal: ${res.exceptionDetails.text} ${
          res.exceptionDetails.exception?.description ?? ''
        }`,
      );
    }
    return res.result.value;
  }

  await send('Page.enable');
  await send('Runtime.enable');

  /**
   * Bawa tab ke depan SEBELUM mengukur apa pun.
   *
   * Kalau jendela Chrome berada di latar (terminimalkan atau tertutup jendela
   * lain), document.visibilityState menjadi 'hidden' dan browser MENGHENTIKAN
   * requestAnimationFrame sepenuhnya. Akibatnya rAF loop lirik tidak pernah
   * berjalan dan semua assertion animasi gagal — padahal kodenya benar.
   * Kegagalan ini tidak memberi petunjuk apa pun kalau tidak dicek langsung.
   */
  await send('Page.bringToFront');

  /**
   * Buka URL dan tunggu sampai baris lirik ADA di DOM.
   *
   * readyState 'complete' TIDAK cukup: nilai itu true untuk about:blank sebelum
   * navigasi selesai. Gejalanya "elemen tidak ditemukan" padahal app sehat.
   */
  async function open(url, label) {
    console.log(`\nMembuka ${url}`);
    await send('Page.navigate', { url });

    // Setiap navigasi berpotensi mengembalikan tab ke latar; pastikan lagi.
    await send('Page.bringToFront');

    /* Kalau tab tetap hidden, rAF mati dan seluruh pengukuran animasi palsu.
       Laporkan sebagai kegagalan harness, bukan kegagalan kode. */
    const visibility = await evalJs('document.visibilityState');
    if (visibility !== 'visible') {
      check(
        `${label}: tab terlihat (rAF butuh ini)`,
        false,
        `visibilityState=${visibility} — jendela Chrome di latar, animasi dihentikan browser`,
      );
      return false;
    }

    for (let i = 0; i < 40; i += 1) {
      await sleep(500);
      const state = JSON.parse(
        await evalJs(`JSON.stringify({
          href: location.href,
          lines: document.querySelectorAll('[aria-label^="Lompat ke"]').length,
        })`),
      );
      if (state.href.includes(SLUG) && state.lines > 0) {
        console.log(`  siap setelah ${((i + 1) * 0.5).toFixed(1)}s — ${state.lines} baris`);
        return true;
      }
    }
    check(`${label} hydrate`, false, 'baris lirik tidak pernah muncul');
    return false;
  }

  /* ── Bagian struktur + ToS + mode video: halaman Now Playing ─────── */
  if (await open(`${TARGET}/demo/${SLUG}`, 'demo')) {
    await require('./verify-lyrics.part2.cjs')({ evalJs, check, sleep, send });
  }

  /* ── Bagian sapuan bergerak: halaman dev dengan jam sintetis ─────── */
  if (await open(`${TARGET}/dev/lirik/${SLUG}`, 'dev')) {
    await require('./verify-lyrics.part3.cjs')({ evalJs, check, sleep, send });
  }

  console.log(`\nHASIL: ${passed} lolos, ${failed} gagal`);
  ws.close();
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('HARNESS ERROR:', err.message);
  process.exitCode = 1;
});
