/**
 * Harness sidebar yang bisa ditutup.
 *
 * Yang dibuktikan di sini adalah ANGKA, bukan tampilan: lebar kolom konten
 * sebelum dan sesudah menutup, tautan sidebar keluar dari urutan Tab, keadaan
 * bertahan setelah muat ulang, dan pintasan Ctrl+B benar-benar mengubah keadaan.
 *
 * Dijalankan terhadap /lagu/<id> — itu halaman yang jadi alasan fitur ini ada,
 * jadi yang diukur adalah ruang lirik yang sesungguhnya bertambah.
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

  /**
   * Kirim penekanan tombol SUNGGUHAN (bukan event sintetis) lewat CDP.
   *
   * `rawKeyDown`, bukan `keyDown`: dengan type 'keyDown' Chrome mengirim
   * pasangan keyDown+char dan event-nya tidak sampai ke listener halaman pada
   * sesi CDP ini (terukur: hits kosong). 'rawKeyDown' membawa key & modifiers
   * yang sama dan benar-benar mengetuk window.
   */
  async function pressCtrlB() {
    const base = {
      key: 'b',
      code: 'KeyB',
      windowsVirtualKeyCode: 66,
      nativeVirtualKeyCode: 66,
      modifiers: 2 /* Ctrl */,
    };
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  await send('Runtime.enable');
  await send('Page.enable');

  /*
   * WAJIB: tanpa ini transisi CSS tidak pernah maju.
   *
   * Tab yang tidak di depan tidak memproduksi frame, dan `getComputedStyle`
   * mengembalikan nilai TERANIMASI — jadi margin-left terbaca 0px selamanya dan
   * harness melapor "sidebar tidak bergerak" untuk kode yang sehat. Fokus juga
   * prasyarat `Input.dispatchKeyEvent` sampai ke halaman (uji Ctrl+B di bawah).
   */
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });

  /* Bersihkan pilihan tersimpan supaya harness selalu mulai dari keadaan yang
     sama — kalau tidak, run kedua mewarisi "tertutup" dari run pertama. */
  await send('Page.navigate', { url: `${TARGET}/` });
  for (let i = 0; i < 30; i += 1) {
    await sleep(400);
    const ok = await evalJs(`document.querySelector('aside') !== null`);
    if (ok) break;
  }
  await evalJs(`localStorage.removeItem('laras.sidebar.v1')`);

  await require('./verify-sidebar.part2.cjs')({ evalJs, check, sleep, send, pressCtrlB, TARGET });

  console.log(`\nHASIL: ${passed} lolos, ${failed} gagal`);
  ws.close();
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('HARNESS ERROR:', err.message);
  process.exitCode = 1;
});
