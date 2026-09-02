/**
 * Helper CDP bersama untuk skrip `measure-*`.
 *
 * Bedanya dengan verify-*.cjs: skrip pengukuran membuka TAB SENDIRI lewat
 * Target.createTarget lalu menutupnya. Alasannya praktis — beberapa agen bisa
 * memakai satu Chrome debug yang sama, dan menavigasi tab orang lain akan
 * merusak pengukuran mereka.
 *
 * Viewport dipaksa lewat Emulation.setDeviceMetricsOverride, bukan lewat ukuran
 * jendela: ukuran jendela OS memasukkan chrome/toolbar sehingga viewport nyata
 * bukan 1440x900, dan lebar pane menentukan pembungkusan baris.
 */

const http = require('node:http');
const WebSocket = require('ws');

const CDP_URL = process.env.BU_CDP_URL || 'http://127.0.0.1:9222';
const TARGET = process.env.TARGET || 'http://127.0.0.1:3210';

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
            reject(new Error(`bukan JSON dari ${url}: ${body.slice(0, 120)}`));
          }
        });
      })
      .on('error', reject);
  });
}

/** Bungkus satu koneksi WebSocket CDP menjadi send()/evalJs(). */
function wrap(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
    const pending = new Map();
    const listeners = new Map();
    let msgId = 0;

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
        return;
      }
      if (msg.method && listeners.has(msg.method)) {
        for (const fn of listeners.get(msg.method)) fn(msg.params);
      }
    });

    function on(method, fn) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(fn);
    }

    function send(method, params = {}, sessionId) {
      msgId += 1;
      const id = msgId;
      return new Promise((res, rej) => {
        pending.set(id, { res, rej });
        const payload = { id, method, params };
        if (sessionId) payload.sessionId = sessionId;
        ws.send(JSON.stringify(payload));
      });
    }

    ws.once('error', reject);
    ws.once('open', () => resolve({ ws, send, on }));
  });
}

/**
 * Buka tab baru berukuran 1440x900, kembalikan alat ukur.
 *
 * `evalJs` sengaja memakai returnByValue + awaitPromise: nilai besar dikirim
 * sebagai JSON string oleh pemanggil supaya tidak kena batas serialisasi objek
 * CDP pada struktur bersarang.
 */
async function openTab({ width = 1440, height = 900 } = {}) {
  const version = await httpJson(`${CDP_URL}/json/version`);
  const browser = await wrap(version.webSocketDebuggerUrl);

  const { targetId } = await browser.send('Target.createTarget', {
    url: 'about:blank',
  });

  const list = await httpJson(`${CDP_URL}/json/list`);
  const entry = list.find((t) => t.id === targetId);
  if (!entry) throw new Error('tab baru tidak muncul di /json/list');

  const page = await wrap(entry.webSocketDebuggerUrl);
  const send = page.send;

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  /* Jebakan #9: tab yang tidak terlihat membuat browser MEMATIKAN rAF total.
     Semua angka animasi akan nol tanpa pesan error apa pun. */
  await send('Page.bringToFront');

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

  /** evalJs untuk hasil besar: ekspresi WAJIB mengembalikan JSON string. */
  const evalJson = async (expression) => JSON.parse(await evalJs(expression));

  /** Navigasi lalu tunggu baris lirik benar-benar ada di DOM. */
  async function open(url, { selector = '[aria-label^="Lompat ke"]', timeoutMs = 30000 } = {}) {
    await send('Page.navigate', { url });
    await send('Page.bringToFront');
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(400);
      const n = await evalJs(`document.querySelectorAll('${selector}').length`);
      if (n > 0) return n;
    }
    throw new Error(`baris lirik tidak pernah muncul di ${url}`);
  }

  async function close() {
    try {
      await browser.send('Target.closeTarget', { targetId });
    } catch {
      /* tab mungkin sudah tertutup */
    }
    page.ws.close();
    browser.ws.close();
  }

  return { send, evalJs, evalJson, open, close, targetId, on: page.on };
}

/** Statistik ringkas: dipakai di semua laporan supaya formatnya seragam. */
function stats(values) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  const sum = s.reduce((a, b) => a + b, 0);
  return {
    n: s.length,
    min: s[0],
    p50: q(0.5),
    p95: q(0.95),
    max: s[s.length - 1],
    mean: sum / s.length,
  };
}

const fmt = (x, d = 2) => (x === null || x === undefined ? '—' : Number(x).toFixed(d));

module.exports = { CDP_URL, TARGET, openTab, sleep, stats, fmt, httpJson };
