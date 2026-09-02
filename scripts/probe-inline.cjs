const http = require('node:http');
const WebSocket = require('ws');

const CDP = process.env.BU_CDP_URL || 'http://127.0.0.1:9222';

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
  const logs = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.method === 'Runtime.consoleAPICalled') {
      logs.push(
        `${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? '?').join(' ')}`,
      );
    }
    if (m.method === 'Runtime.exceptionThrown') {
      logs.push(`EXCEPTION: ${m.params.exceptionDetails.text} ${m.params.exceptionDetails.exception?.description ?? ''}`);
    }
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result);
      pending.delete(m.id);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      id += 1;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) return `EVAL-ERROR: ${r.exceptionDetails.text}`;
    return r.result.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: `${process.env.TARGET || 'http://127.0.0.1:3210'}/demo/die-with-a-smile` });
  await new Promise((r) => setTimeout(r, 4000));

  console.log('--- console browser ---');
  logs.slice(0, 20).forEach((l) => console.log('  ' + l.slice(0, 220)));
  if (logs.length === 0) console.log('  (kosong)');

  const diag = await evalJs(`(() => {
    const line = document.querySelector('[aria-label^="Lompat ke"]');
    const word = line ? line.querySelector('span') : null;
    return JSON.stringify({
      lines: document.querySelectorAll('[aria-label^="Lompat ke"]').length,
      wordInline: word ? word.style.cssText : null,
      lineInline: line ? line.style.cssText : null,
      // Apakah rAF berjalan sama sekali di halaman ini?
      rafWorks: typeof requestAnimationFrame === 'function',
    });
  })()`);
  console.log('\n--- diagnosa ---');
  console.log(JSON.parse(diag) ? JSON.stringify(JSON.parse(diag), null, 2) : diag);

  // Ukur dua kali dengan jeda: kalau loop hidup, nilainya berubah.
  const t1 = await evalJs(`(() => {
    const w = document.querySelectorAll('[aria-label^="Lompat ke"] span');
    return JSON.stringify([...w].slice(0, 5).map((x) => x.style.cssText));
  })()`);
  await new Promise((r) => setTimeout(r, 1200));
  const t2 = await evalJs(`(() => {
    const w = document.querySelectorAll('[aria-label^="Lompat ke"] span');
    return JSON.stringify([...w].slice(0, 5).map((x) => x.style.cssText));
  })()`);
  console.log('\n--- inline style, dua sampel berjarak 1,2s ---');
  console.log('  t1:', t1);
  console.log('  t2:', t2);

  ws.close();
})();
