/**
 * Harness rak rekomendasi "Untukmu".
 *
 * Yang dibuktikan ANGKA, bukan tampilan: rak tidak ada saat riwayat kosong,
 * skeleton punya tinggi yang sama dengan kartu jadinya (kalau tidak, Beranda
 * melompat), rak berisi lagu yang BUKAN dari riwayat, dan permintaannya benar
 * satu kali — bukan dua (Strict Mode) atau berulang tanpa henti.
 *
 * Riwayat disuntikkan langsung ke localStorage dengan bentuk yang sama seperti
 * `collection.ts` menulisnya. Memutar lagu sungguhan lewat UI butuh
 * penjembatanan YouTube ~1 detik per lagu dan autoplay yang diblokir browser,
 * jadi tidak bisa dipakai untuk menyiapkan keadaan.
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
  /* Permintaan ke /api/rekomendasi dihitung lewat CDP Network, bukan lewat
     tebakan: yang ingin dibuktikan adalah JUMLAHNYA, dan itu tidak terlihat
     dari DOM. */
  const apiCalls = [];

  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.method === 'Network.requestWillBeSent' && m.params?.request?.url?.includes('/api/rekomendasi')) {
      apiCalls.push({ url: m.params.request.url, method: m.params.request.method });
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

  /*
   * Penahan permintaan /api/rekomendasi.
   *
   * Kenapa perlu: skeleton hanya terlihat SELAMA permintaan berjalan, dan
   * setelah Data Cache Next hangat permintaan itu selesai dalam ~30ms (terukur;
   * jalur cold 2,7s). Menunggu "skeleton muncul" dengan polling berarti
   * assertion-nya lulus atau gagal tergantung apakah cache sedang hangat —
   * yaitu menguji cache, bukan menguji skeleton. Dengan menahan responsnya di
   * tingkat CDP, jendelanya dikendalikan harness.
   *
   * `holdRequests` diaktifkan hanya di langkah yang membutuhkannya; di langkah
   * lain permintaan diteruskan apa adanya.
   */
  let holdRequests = false;
  const held = [];

  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params;
    if (holdRequests && request.url.includes('/api/rekomendasi')) {
      held.push(requestId);
      return; // sengaja TIDAK dilanjutkan — dilepas oleh releaseHeld()
    }
    ws.send(JSON.stringify({ id: (msgId += 1), method: 'Fetch.continueRequest', params: { requestId } }));
  });

  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/rekomendasi*' }] });

  const releaseHeld = async () => {
    holdRequests = false;
    while (held.length > 0) {
      await send('Fetch.continueRequest', { requestId: held.shift() });
    }
  };

  const ctx = {
    evalJs,
    check,
    sleep,
    send,
    apiCalls,
    TARGET,
    hold: () => {
      holdRequests = true;
    },
    releaseHeld,
    heldCount: () => held.length,
  };
  await require('./verify-rekomendasi.part2.cjs')(ctx);

  console.log(`\nHASIL: ${passed} lolos, ${failed} gagal`);
  ws.close();
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('HARNESS ERROR:', err.message);
  process.exitCode = 1;
});
