/**
 * Harness verifikasi aplikasi LIVE: data dari relay, pemutar global, navigasi.
 *
 * Yang dibuktikan di sini berbeda dari harness lain: bukan mesin animasi
 * (verify-lyrics) dan bukan kerangka UI dari fixture (verify-home), tapi bahwa
 * data sungguhan sampai ke halaman dan bahwa iframe pemutar SELAMAT dari
 * navigasi antar halaman — hal yang tidak bisa dibuktikan tanpa browser.
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
  const page = targets.find((t) => t.type === 'page');
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
      msgId += 1;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.text}`);
    return r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.bringToFront');
  /* Jendela Chrome debug bisa tetap di belakang jendela lain di desktop —
     bringToFront saja tidak cukup dan rAF tidak memproduksi frame. Emulasi
     fokus memaksa halaman menganggap dirinya terlihat (pola yang sama dengan
     scripts/verify-sidebar.cjs). */
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });

  const visibility = await evalJs('document.visibilityState');
  if (visibility !== 'visible') {
    check('tab terlihat (rAF butuh ini)', false, `visibilityState=${visibility}`);
    ws.close();
    process.exitCode = 1;
    return;
  }

  /** Navigasi lewat KLIK (SPA), bukan Page.navigate — itu reload penuh. */
  async function clickNavigate(selector, expectPath, label) {
    await evalJs(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (el) el.click();
      return 'clicked';
    })()`);

    for (let i = 0; i < 40; i += 1) {
      await sleep(400);
      const path = await evalJs('location.pathname + location.search');
      if (path.includes(expectPath)) return true;
    }
    check(`navigasi ke ${label}`, false, `tidak sampai ${expectPath}`);
    return false;
  }

  async function goto(path, waitFor) {
    await send('Page.navigate', { url: TARGET + path });
    await send('Page.bringToFront');
    for (let i = 0; i < 60; i += 1) {
      await sleep(500);
      const ok = await evalJs(`(() => {
        try { return document.querySelectorAll(${JSON.stringify(waitFor)}).length > 0; }
        catch { return false; }
      })()`);
      if (ok) return true;
    }
    return false;
  }

  await require('./verify-live.part2.cjs')({ evalJs, check, sleep, goto, clickNavigate });

  console.log(`\nHASIL: ${passed} lolos, ${failed} gagal`);
  ws.close();
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('HARNESS ERROR:', err.message);
  process.exitCode = 1;
});
