const http = require('node:http');
const WebSocket = require('ws');

const CDP = process.env.BU_CDP_URL || 'http://127.0.0.1:9222';
const TARGET = process.env.TARGET || 'http://127.0.0.1:3210';
const PATH_ = process.env.PATH_ || '/dev/lirik/die-with-a-smile';

function httpJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve(JSON.parse(b)));
    }).on('error', reject);
  });
}

(async () => {
  const targets = await httpJson(`${CDP}/json/list`);
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((r) => ws.once('open', r));

  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result);
      pending.delete(m.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      id += 1;
      pending.set(id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evalJs = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails ? `ERR: ${r.exceptionDetails.text}` : r.result.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  // Bersihkan override metrics dari harness lain — bisa memengaruhi visibilitas.
  await send('Emulation.clearDeviceMetricsOverride');
  await send('Page.navigate', { url: TARGET + PATH_ });
  await new Promise((r) => setTimeout(r, 4000));

  console.log('path:', PATH_);
  console.log('visibilityState:', await evalJs('document.visibilityState'));
  console.log('hidden:', await evalJs('document.hidden'));

  // Apakah rAF benar-benar berjalan di halaman ini?
  const rafCount = await evalJs(`new Promise((resolve) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => { n += 1; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else resolve(n); };
    requestAnimationFrame(tick);
  })`);
  console.log('rAF tick dalam 1 detik:', rafCount);

  console.log('inline word:', JSON.stringify(await evalJs(`(() => {
    const w = document.querySelector('[aria-label^="Lompat ke"] span');
    return w ? w.style.cssText : 'tidak ada';
  })()`)));

  console.log('jumlah baris:', await evalJs(`document.querySelectorAll('[aria-label^="Lompat ke"]').length`));
  console.log('window.__laras ada:', await evalJs(`typeof window.__laras`));

  ws.close();
})();
