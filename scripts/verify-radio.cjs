/**
 * Harness radio + halaman yang mengikuti lagu.
 *
 * Dua fitur ini diuji bersama karena yang kedua BERGANTUNG pada yang pertama:
 * tanpa antrean yang terisi sendiri, lagu tidak pernah maju, dan
 * `router.replace` tidak pernah terpicu. Menguji "halaman ikut berpindah"
 * tanpa radio berarti menguji sesuatu yang mustahil terjadi.
 *
 * Yang dibuktikan ANGKA: panjang antrean sebelum/sesudah radio bekerja, URL
 * yang benar-benar berubah, jumlah entri riwayat browser (membuktikan `replace`
 * bukan `push`), dan penundaan yang benar-benar menahan lalu benar-benar
 * melepas.
 *
 * Autoplay YouTube diblokir tanpa gestur pengguna, jadi lagu tidak bisa
 * dibiarkan habis sendiri. Perpindahan antrean dipicu lewat tombol "lanjut" di
 * mini player — jalur yang sama dengan yang dilalui `advanceRef` saat lagu
 * benar-benar selesai (keduanya `dispatch({type:'next'})`).
 */

const http = require('node:http');
const WebSocket = require('ws');

const CDP_URL = process.env.BU_CDP_URL || 'http://127.0.0.1:9222';
const TARGET = process.env.TARGET || 'http://127.0.0.1:3210';

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
            reject(new Error(`bukan JSON dari ${url}`));
          }
        });
      })
      .on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = await httpJson(`${CDP_URL}/json/list`);
  const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('chrome-'));
  if (!page) throw new Error('tidak ada tab page');

  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  let msgId = 0;
  const pending = new Map();
  const apiCalls = [];

  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (
      m.method === 'Network.requestWillBeSent' &&
      m.params?.request?.url?.includes('/api/rekomendasi')
    ) {
      apiCalls.push(m.params.request.method);
    }
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(JSON.stringify(m.error)));
      else resolve(m.result);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = (msgId += 1);
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  async function evalJs(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? 'eval gagal');
    }
    return res.result.value;
  }

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });

  await require('./verify-radio.part2.cjs')({ evalJs, check, sleep, send, apiCalls, TARGET });

  console.log(`\nHASIL: ${passed} lolos, ${failed} gagal`);
  ws.close();
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('HARNESS ERROR:', err.message);
  process.exitCode = 1;
});
