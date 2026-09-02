/**
 * Harness pengukuran: halaman lagu mengirim KERANGKA dulu, lirik menyusul.
 *
 * Yang dibuktikan di sini tidak bisa dibuktikan unit test: `<h1>` sudah ada di
 * layar beberapa detik SEBELUM relay lirik menjawab. Tiga pengukuran yang saling
 * menutup celah:
 *
 *  [2] Sisi browser (CDP) — kapan `<h1>` masuk DOM, kapan skeleton muncul,
 *      kapan baris lirik masuk. Selisih lirik−h1 = waktu yang tidak lagi
 *      ditunggu pengguna.
 *  [3] Sisi server (HTTP mentah) — di chunk keberapa `<h1>` dan lirik tiba.
 *      Ini menutup kemungkinan "kerangka terasa cepat karena cache browser".
 *  [4] Jalur hangat — permintaan kedua untuk id yang sama. Membuktikan cache
 *      masih bekerja, dan sekaligus menunjukkan kenapa satu id hanya sah
 *      diukur SEKALI.
 *
 * PENTING — lagunya harus BELUM PERNAH diminta. Relay men-cache `/lyrics` di
 * sisinya (cold 9,8–11,7 detik, warm 310–620ms) dan Next men-cache-nya lagi 30
 * hari, jadi mengukur id yang sama dua kali memberi hasil "sudah cepat" yang
 * PALSU. Karena itu skrip ini memilih id-nya sendiri dari Beranda dan menolak
 * hasil yang ternyata hangat: kalau lirik tiba di bawah COLD_MIN_MS, id itu
 * dibuang dan kandidat berikutnya dicoba.
 *
 * Jalankan seperti harness lain (lihat HANDOFF §7):
 *   BU_CDP_URL=http://127.0.0.1:9222 TARGET=http://127.0.0.1:3210 \
 *     node scripts/verify-stream.cjs
 */

const http = require('node:http');
const WebSocket = require('ws');

const CDP_URL = process.env.BU_CDP_URL || 'http://127.0.0.1:9222';
const TARGET = process.env.TARGET || 'http://127.0.0.1:3210';

/** Di bawah ini lirik jelas datang dari cache — hasilnya tidak membuktikan apa pun. */
const COLD_MIN_MS = 3000;

/** Kerangka halaman (judul + tombol putar) wajib tampil di bawah ini. */
const SHELL_MAX_MS = 3000;

/** Minimal jarak lirik−kerangka yang dianggap perbaikan sungguhan. */
const MIN_GAIN_MS = 5000;

/**
 * Berapa id yang dicoba sebelum menyerah mencari lagu yang masih cold.
 *
 * Dibuat besar dengan sengaja: setiap kali harness ini jalan, id yang diukur
 * jadi hangat SELAMANYA (relay + Data Cache), jadi jalan kedua harus melewati
 * semua id yang sudah terpakai sebelum menemukan yang baru. Melewati satu id
 * hangat hanya sekitar 50ms, jadi mencoba banyak itu murah — yang mahal justru
 * menyerah terlalu cepat dan melaporkan GAGAL padahal masih ada 90 id lain.
 */
const MAX_CANDIDATES = 40;

/** Batas tunggu satu halaman lagu; cold terburuk 11,7s + /song ~1s. */
const PAGE_TIMEOUT_MS = 45_000;

/**
 * Id yang SUDAH pasti hangat: dipakai harness lain, jadi relay & Data Cache
 * sudah menyimpannya. Memakainya di sini hanya menghasilkan angka palsu.
 */
const ALREADY_WARM = new Set(['1050615679']);

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ms = (value) => (value === null ? '—' : `${Math.round(value)}ms`);

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

/**
 * Probe yang dipasang SEBELUM dokumen dibuat, jadi jam `performance.now()`-nya
 * dimulai di awal navigasi.
 *
 * MutationObserver, BUKAN requestAnimationFrame: rAF berhenti total kalau tab
 * tidak terlihat (jebakan #9 di HANDOFF) dan pengukuran ini harus tetap benar
 * meski jendela Chrome tertimpa jendela lain. `document` (bukan
 * documentElement) yang diamati, karena pada saat skrip ini jalan dokumen masih
 * kosong — documentElement belum ada.
 */
const PROBE = `
(() => {
  const marks = {
    url: location.pathname,
    h1: null,
    h1Text: null,
    skeleton: null,
    lyrics: null,
    noLyrics: null,
    lines: 0,
  };
  window.__larasStream = marks;

  const look = () => {
    if (marks.h1 === null) {
      const h1 = document.querySelector('h1');
      if (h1 && h1.textContent.trim().length > 0) {
        marks.h1 = performance.now();
        marks.h1Text = h1.textContent.trim();
      }
    }
    const loading = [...document.querySelectorAll('[role="status"]')].some((el) =>
      /memuat lirik/i.test(el.textContent || ''),
    );
    if (marks.skeleton === null && loading) marks.skeleton = performance.now();
    if (marks.lyrics === null) {
      const lines = document.querySelectorAll('[aria-label^="Lompat ke"]');
      if (lines.length > 0) {
        marks.lyrics = performance.now();
        marks.lines = lines.length;
      }
    }
    // Skeleton sudah dilepas tapi tidak ada satu baris pun: lagu ini memang
    // tidak punya lirik di relay. Ditandai supaya harness tidak menunggu
    // sampai batas waktu untuk sesuatu yang tidak akan datang.
    if (marks.noLyrics === null && marks.skeleton !== null && marks.lyrics === null && !loading) {
      marks.noLyrics = performance.now();
    }
  };

  new MutationObserver(look).observe(document, { childList: true, subtree: true });
  look();
})();
`;

/** UA browser sungguhan — yang dipakai untuk semua pengukuran di sini. */
const UA_BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

/**
 * Ukur kedatangan chunk HTML langsung dari server, tanpa browser.
 *
 * `Accept-Encoding: identity` wajib: lapisan kompresi menahan chunk sampai
 * punya cukup data, dan itu mengaburkan justru yang sedang diukur.
 *
 * TERUKUR, bukan asumsi: UA bot HTML-limited (mis. `Twitterbot/1.0`) TIDAK
 * mematikan stream di rute ini. Next hanya menunggu `generateMetadata` untuk
 * bot, dan halaman lagu tidak punya `generateMetadata` — jadi jangan pakai UA
 * bot sebagai kontrol "perilaku tanpa stream". Sudah dicoba: TTFB-nya sama
 * cepat, 550–1006ms, dengan badan yang tetap dipecah 14 chunk.
 */
function measureChunks(path, userAgent = UA_BROWSER) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, TARGET);
    const started = Date.now();

    const request = http.get(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: {
          'Accept-Encoding': 'identity',
          Accept: 'text/html',
          'User-Agent': userAgent,
        },
      },
      (res) => {
        const result = { status: res.statusCode, ttfb: null, h1: null, lyrics: null, chunks: 0, total: null };
        let seen = '';

        res.on('data', (chunk) => {
          const at = Date.now() - started;
          result.chunks += 1;
          if (result.ttfb === null) result.ttfb = at;
          seen += chunk.toString('utf8');
          if (result.h1 === null && seen.includes('<h1')) result.h1 = at;
          if (result.lyrics === null && seen.includes('aria-label="Lompat ke')) result.lyrics = at;
        });
        res.on('end', () => {
          result.total = Date.now() - started;
          resolve(result);
        });
        res.on('error', reject);
      },
    );

    request.on('error', reject);
    request.setTimeout(PAGE_TIMEOUT_MS, () => request.destroy(new Error('timeout')));
  });
}

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
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
  await send('Page.bringToFront');

  /** Navigasi lalu tunggu probe halaman itu selesai (atau menyerah). */
  async function measurePage(id) {
    const path = `/lagu/${id}`;
    await send('Page.navigate', { url: TARGET + path });

    const deadline = Date.now() + PAGE_TIMEOUT_MS;
    let emptyPolls = 0;
    while (Date.now() < deadline) {
      await sleep(200);
      const raw = await evalJs('JSON.stringify(window.__larasStream ?? null)');
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      // Dokumen lama bisa masih terbaca sesaat setelah Page.navigate; cocokkan
      // path-nya dulu supaya angka satu lagu tidak dilaporkan sebagai lagu lain.
      if (parsed.url !== path) continue;
      if (parsed.lyrics !== null) return parsed;
      /* Butuh dua polling: sesaat setelah batas Suspense selesai, skeleton bisa
         sudah dilepas sementara baris liriknya belum terpasang. Satu polling
         akan membaca keadaan transisi itu sebagai "tidak punya lirik". */
      if (parsed.noLyrics !== null) {
        emptyPolls += 1;
        if (emptyPolls >= 2) return parsed;
      }
    }
    return null;
  }

  /* ── 1. Kandidat id dari Beranda ──────────────────────────────────── */

  console.log('\n[1] Kandidat lagu dari Beranda');

  await send('Page.navigate', { url: `${TARGET}/` });
  let homeReady = false;
  for (let i = 0; i < 40 && !homeReady; i += 1) {
    await sleep(300);
    homeReady = await evalJs('document.querySelectorAll(\'a[href^="/lagu/"]\').length > 0');
  }
  check('Beranda memberi tautan lagu', homeReady);
  if (!homeReady) {
    ws.close();
    process.exitCode = 1;
    return;
  }

  const candidates = JSON.parse(
    await evalJs(`(() => {
      const seen = new Map();
      for (const a of document.querySelectorAll('a[href^="/lagu/"]')) {
        const id = a.getAttribute('href').slice('/lagu/'.length);
        if (!seen.has(id)) seen.set(id, a.getAttribute('aria-label') || '');
      }
      return JSON.stringify([...seen].map(([id, label]) => ({ id, label })));
    })()`),
  );

  /* Dibalik: rak terakhir Beranda paling kecil kemungkinannya sudah pernah
     diminta sesi sebelumnya, dan kandidat cold-lah yang dicari. */
  const pool = candidates.filter((c) => !ALREADY_WARM.has(c.id)).reverse();
  check('cukup kandidat untuk dicoba', pool.length >= 2, `${pool.length} id unik`);

  /* ── 2. Sisi browser: kapan <h1> tampil ───────────────────────────── */

  console.log('\n[2] Browser: waktu sampai <h1> tampil (lagu belum pernah diminta)');

  let cold = null;
  const burned = [];
  for (const candidate of pool.slice(0, MAX_CANDIDATES)) {
    const marks = await measurePage(candidate.id);
    if (marks === null) {
      console.log(`  ...  ${candidate.id} tidak selesai dalam ${PAGE_TIMEOUT_MS}ms, lanjut`);
      burned.push(candidate.id);
      continue;
    }
    burned.push(candidate.id);

    if (marks.lyrics === null) {
      console.log(`  ...  ${candidate.id} "${marks.h1Text}" — relay tak punya lirik, coba id lain`);
      continue;
    }

    console.log(
      `  ...  ${candidate.id} "${marks.h1Text}" — h1 ${ms(marks.h1)}, lirik ${ms(marks.lyrics)}`,
    );
    if (marks.lyrics >= COLD_MIN_MS) {
      cold = { candidate, marks };
      break;
    }
    console.log('       lirik datang dari cache (hangat) — angkanya tidak sah, coba id lain');
  }

  check(
    `dapat lagu yang masih cold (lirik > ${COLD_MIN_MS}ms)`,
    cold !== null,
    cold === null ? `${burned.length} id dicoba, semuanya hangat` : `id ${cold.candidate.id}`,
  );

  if (cold !== null) {
    const { marks } = cold;
    const gain = marks.lyrics - marks.h1;

    console.log(`\n  lagu      ${cold.candidate.id} — ${marks.h1Text}`);
    console.log(`  <h1>      ${ms(marks.h1)}`);
    console.log(`  skeleton  ${ms(marks.skeleton)}`);
    console.log(`  lirik     ${ms(marks.lyrics)} (${marks.lines} baris)`);
    console.log(`  selisih   ${ms(gain)}  <- yang tidak lagi ditunggu pengguna\n`);

    check(
      `<h1> tampil di bawah ${SHELL_MAX_MS}ms`,
      marks.h1 !== null && marks.h1 < SHELL_MAX_MS,
      ms(marks.h1),
    );
    check(
      'judul di <h1> sama dengan kartu di Beranda',
      (marks.h1Text || '').length > 0 && cold.candidate.label.includes(marks.h1Text),
      `"${marks.h1Text}" di dalam aria-label "${cold.candidate.label}"`,
    );
    check(
      'skeleton mengisi pane lirik selama menunggu',
      marks.skeleton !== null,
      ms(marks.skeleton),
    );
    check(
      'skeleton tampil bersama kerangka, bukan belakangan',
      marks.skeleton !== null && Math.abs(marks.skeleton - marks.h1) < 500,
      `h1 ${ms(marks.h1)} vs skeleton ${ms(marks.skeleton)}`,
    );
    check(
      `kerangka mendahului lirik lebih dari ${MIN_GAIN_MS}ms`,
      gain > MIN_GAIN_MS,
      ms(gain),
    );
    check('lirik akhirnya tetap masuk', marks.lines > 10, `${marks.lines} baris`);
  }

  /* ── 3. Sisi server: urutan chunk HTML ────────────────────────────── */

  console.log('\n[3] Server: urutan chunk HTML (id cold yang lain)');

  let chunked = null;
  let attempts = 0;
  for (const candidate of pool) {
    if (burned.includes(candidate.id)) continue;
    if (attempts >= MAX_CANDIDATES) break;
    attempts += 1;

    const result = await measureChunks(`/lagu/${candidate.id}`);
    burned.push(candidate.id);
    console.log(
      `  ...  ${candidate.id} — TTFB ${ms(result.ttfb)}, <h1> ${ms(result.h1)}, ` +
        `lirik ${ms(result.lyrics)}, ${result.chunks} chunk, tutup ${ms(result.total)}`,
    );
    if (result.lyrics !== null && result.lyrics >= COLD_MIN_MS) {
      chunked = result;
      break;
    }
    console.log('       hangat atau tanpa lirik — coba id lain');
  }

  check('dapat id cold kedua untuk uji chunk', chunked !== null);
  if (chunked !== null) {
    check('status 200 (stream sudah dimulai sebelum lirik siap)', chunked.status === 200, String(chunked.status));
    check(
      `<h1> ada di chunk awal (< ${SHELL_MAX_MS}ms)`,
      chunked.h1 !== null && chunked.h1 < SHELL_MAX_MS,
      ms(chunked.h1),
    );
    check(
      'lirik tiba di chunk yang jauh lebih belakang',
      chunked.lyrics - chunked.h1 > MIN_GAIN_MS,
      `selisih ${ms(chunked.lyrics - chunked.h1)}`,
    );
    check(
      'respons memang dipecah, bukan satu badan utuh',
      chunked.chunks > 1,
      `${chunked.chunks} chunk`,
    );
  }

  /* ── 4. Jalur hangat: permintaan kedua untuk lagu yang sama ───────── */

  console.log('\n[4] Jalur hangat: id yang sama, permintaan kedua');

  if (cold !== null) {
    const warm = await measureChunks(`/lagu/${cold.candidate.id}`);
    console.log(
      `  ...  ${cold.candidate.id} — TTFB ${ms(warm.ttfb)}, <h1> ${ms(warm.h1)}, ` +
        `lirik ${ms(warm.lyrics)}, tutup ${ms(warm.total)}`,
    );
    check('lirik masih ikut terkirim', warm.lyrics !== null, ms(warm.lyrics));
    check(
      `permintaan kedua dilayani dari cache (< ${COLD_MIN_MS}ms)`,
      warm.lyrics !== null && warm.lyrics < COLD_MIN_MS,
      `${ms(warm.lyrics)} vs ${ms(cold.marks.lyrics)} saat cold`,
    );
  }

  console.log(`\nHASIL: ${passed} lolos, ${failed} gagal`);
  ws.close();
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('HARNESS ERROR:', err.message);
  process.exitCode = 1;
});
