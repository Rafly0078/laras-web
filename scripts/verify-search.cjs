/**
 * Harness pencarian: kartu "Hasil teratas" + rak penemuan.
 *
 * KENAPA HARUS LEWAT DOM, BUKAN GREP HTML: konten hasil pencarian hidup di
 * bawah `<Suspense>`, jadi ia dikirim sebagai payload RSC (`"$","$L3d"`), bukan
 * markup jadi. Grep terhadap `curl` menemukan JUDULNYA (teks itu ada di
 * payload) tetapi regex `<h3>` mengembalikan kosong — mudah sekali disalahartikan
 * sebagai "kartunya tidak dirender". Yang membuktikan hanya DOM setelah hidrasi.
 *
 * Yang dibuktikan ANGKA: kartu teratas menonjolkan hasil yang BENAR (bukan spam
 * unggahan), kartu itu HILANG saat tidak ada yang meyakinkan, dan rak penemuan
 * tidak mengulang baris yang sudah ada di daftar utama.
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
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
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
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });

  await require('./verify-search.part2.cjs')({ evalJs, check, sleep, send, TARGET });

  console.log(`\nHASIL: ${passed} lolos, ${failed} gagal`);
  ws.close();
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('HARNESS ERROR:', err.message);
  process.exitCode = 1;
});
