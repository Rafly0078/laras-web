/**
 * Instrumentasi WAKTU yang dijalankan DI DALAM halaman.
 *
 * Semua fungsi di sini diserialisasi lewat String(fn). Jangan pakai apa pun
 * dari Node.
 */

/**
 * Bungkus requestAnimationFrame dan pencatat penulisan DOM.
 *
 * Kenapa bisa membungkus loop yang SUDAH jalan: rAF loop lirik mendaftarkan
 * ulang dirinya di akhir setiap tick (`raf = requestAnimationFrame(tick)`).
 * Begitu window.requestAnimationFrame diganti, pendaftaran BERIKUTNYA lewat
 * bungkusan ini — jadi durasi callback aplikasi terukur langsung, bukan ditebak
 * dari jarak antar frame.
 *
 * Penulisan DOM dihitung di tiga jalur yang dipakai lyrics-view.tsx:
 *   style.setProperty(...)  → custom property (--gradient-position dll)
 *   style.transform = ...   → setter properti di CSSStyleDeclaration.prototype
 *   style.opacity  = ...    → idem
 */
function installTimingProbe() {
  if (window.__mProbe) return { state: 'sudah-terpasang' };

  const rawRaf = window.requestAnimationFrame.bind(window);
  const ids = new WeakMap();
  let nextId = 0;

  const P = {
    frames: [],
    on: false,
    writes: null,
    patched: [],
    visibility: document.visibilityState,
  };
  window.__mProbe = P;

  const proto = CSSStyleDeclaration.prototype;
  const origSetProperty = proto.setProperty;
  proto.setProperty = function (name, value, priority) {
    if (P.writes) P.writes[name] = (P.writes[name] || 0) + 1;
    return origSetProperty.call(this, name, value, priority);
  };
  P.patched.push('setProperty');

  for (const prop of ['transform', 'opacity']) {
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    if (!d || !d.set) continue;
    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: d.enumerable,
      get: d.get,
      set(v) {
        if (P.writes) {
          const k = 'style.' + prop;
          P.writes[k] = (P.writes[k] || 0) + 1;
        }
        return d.set.call(this, v);
      },
    });
    P.patched.push('style.' + prop);
  }

  window.requestAnimationFrame = function (cb) {
    return rawRaf(function (ts) {
      let id = ids.get(cb);
      if (id === undefined) {
        id = nextId;
        nextId += 1;
        ids.set(cb, id);
      }
      const outer = P.writes;
      P.writes = P.on ? {} : null;
      const t0 = performance.now();
      try {
        return cb(ts);
      } finally {
        const dur = performance.now() - t0;
        if (P.on) P.frames.push({ id: id, ts: ts, dur: dur, w: P.writes });
        P.writes = outer;
      }
    });
  };

  return { state: 'terpasang', patched: P.patched, visibility: P.visibility };
}

/** Mulai merekam. */
function startRecording() {
  const P = window.__mProbe;
  P.frames = [];
  P.on = true;
  return { t: performance.now(), visibility: document.visibilityState };
}

/** Berhenti merekam dan kembalikan seluruh frame. */
function stopRecording() {
  const P = window.__mProbe;
  P.on = false;
  const frames = P.frames;
  P.frames = [];
  return { frames: frames, visibility: document.visibilityState };
}

/** Baca --gradient-position + scale semua span, diindeks urutan DOM. */
function readState() {
  const spans = document.querySelectorAll('[aria-label^="Lompat ke"] span');
  const g = new Array(spans.length).fill(null);
  const s = new Array(spans.length).fill(null);
  for (let i = 0; i < spans.length; i += 1) {
    const el = spans[i];
    const gv = el.style.getPropertyValue('--gradient-position');
    if (gv) g[i] = parseFloat(gv);
    const m = /scale\(([-\d.]+)\)/.exec(el.style.transform || '');
    if (m) s[i] = Number(m[1]);
  }
  return { g: g, s: s };
}

/**
 * Sampler puncak: rekam scale MIN/MAKS per span selama beberapa detik.
 *
 * Dijalankan di fase TERSENDIRI, bukan bersamaan dengan pengukuran frame
 * budget: membaca 935 inline style tiap frame ikut membebani main thread dan
 * akan mengotori angka p95.
 */
function startPeakSampler() {
  const spans = [...document.querySelectorAll('[aria-label^="Lompat ke"] span')];
  const P = { max: new Array(spans.length).fill(null), min: new Array(spans.length).fill(null), n: 0, stop: false };
  window.__mPeak = P;
  const tick = function () {
    P.n += 1;
    for (let i = 0; i < spans.length; i += 1) {
      const m = /scale\(([-\d.]+)\)/.exec(spans[i].style.transform || '');
      if (!m) continue;
      const v = Number(m[1]);
      if (P.max[i] === null || v > P.max[i]) P.max[i] = v;
      if (P.min[i] === null || v < P.min[i]) P.min[i] = v;
    }
    if (!P.stop) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return spans.length;
}

function stopPeakSampler() {
  const P = window.__mPeak;
  P.stop = true;
  return { n: P.n, max: P.max, min: P.min };
}

/**
 * Ukur PENENANGAN setelah seek: berapa frame sampai tidak ada scale yang
 * berubah lagi lebih dari eps.
 *
 * Dipanggil SETELAH setPosition. Loop berhenti begitu ada `quiet` frame
 * berurutan tanpa perubahan, atau setelah batas frame.
 */
function measureSettle(eps, quiet, maxFrames) {
  return new Promise(function (resolve) {
    const spans = [...document.querySelectorAll('[aria-label^="Lompat ke"] span')];
    const read = function () {
      const out = new Array(spans.length);
      for (let i = 0; i < spans.length; i += 1) {
        const m = /scale\(([-\d.]+)\)/.exec(spans[i].style.transform || '');
        out[i] = m ? Number(m[1]) : null;
      }
      return out;
    };
    let prev = read();
    let frames = 0;
    let calm = 0;
    let t0 = null;
    const series = [];
    const tick = function (ts) {
      if (t0 === null) t0 = ts;
      const cur = read();
      let moving = 0;
      let biggest = 0;
      for (let i = 0; i < cur.length; i += 1) {
        if (cur[i] === null || prev[i] === null) continue;
        const d = Math.abs(cur[i] - prev[i]);
        if (d > eps) moving += 1;
        if (d > biggest) biggest = d;
      }
      series.push([Math.round((ts - t0) * 10) / 10, moving, Math.round(biggest * 1e5) / 1e5]);
      prev = cur;
      frames += 1;
      calm = moving === 0 ? calm + 1 : 0;
      if (calm >= quiet || frames >= maxFrames) {
        resolve({ frames: frames, ms: ts - t0, settled: calm >= quiet, series: series });
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Hitung penulisan `el.style.transform` dan `el.style.opacity`.
 *
 * Chrome TIDAK lagi memasang properti CSS sebagai accessor di
 * CSSStyleDeclaration.prototype (Object.getOwnPropertyDescriptor(proto,
 * 'transform') mengembalikan undefined di Chrome 152), jadi setter-nya tidak
 * bisa dibungkus dari prototype. Yang bisa: bayangi properti `style` pada
 * ELEMEN dengan Proxy, sehingga setiap penugasan properti terhitung.
 *
 * Hanya elemen lirik yang dibayangi, supaya sisa halaman tetap apa adanya.
 */
function patchStyleWrites() {
  const P = window.__mProbe;
  if (!P) return { error: 'probe belum terpasang' };
  if (P.styleProxied) return { state: 'sudah', n: P.styleProxied };

  const els = [
    ...document.querySelectorAll('[aria-label^="Lompat ke"]'),
    ...document.querySelectorAll('[aria-label^="Lompat ke"] span'),
  ];
  for (const el of els) {
    const real = el.style;
    const proxy = new Proxy(real, {
      get(t, k) {
        const v = t[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set(t, k, v) {
        if (P.writes && typeof k === 'string') {
          const key = 'style.' + k;
          P.writes[key] = (P.writes[key] || 0) + 1;
        }
        t[k] = v;
        return true;
      },
    });
    Object.defineProperty(el, 'style', { configurable: true, get: () => proxy });
  }
  P.styleProxied = els.length;
  return { state: 'terpasang', n: els.length };
}

/**
 * Bukti langsung untuk klaim "kata yang sudah dinyanyikan tidak pulang ke 0,95":
 * kelompokkan span menurut --gradient-position (=-20 belum, =100 sudah) lalu
 * laporkan sebaran scale masing-masing pada keadaan yang SUDAH tenang.
 */
function scaleByState() {
  const spans = [...document.querySelectorAll('[aria-label^="Lompat ke"] span')];
  const bucket = { notSung: [], sung: [], active: [], noStyle: 0 };
  for (const el of spans) {
    const gv = el.style.getPropertyValue('--gradient-position');
    const m = /scale\(([-\d.]+)\)/.exec(el.style.transform || '');
    if (!gv || !m) {
      bucket.noStyle += 1;
      continue;
    }
    const g = parseFloat(gv);
    const s = Number(m[1]);
    if (g <= -19.5) bucket.notSung.push(s);
    else if (g >= 99.5) bucket.sung.push(s);
    else bucket.active.push(s);
  }
  const sum = (a) =>
    a.length === 0
      ? null
      : {
          n: a.length,
          min: Math.min(...a),
          max: Math.max(...a),
          uniq: [...new Set(a.map((x) => Math.round(x * 1e4) / 1e4))].sort((x, y) => x - y).slice(0, 6),
        };
  return {
    notSung: sum(bucket.notSung),
    sung: sum(bucket.sung),
    active: sum(bucket.active),
    noStyle: bucket.noStyle,
    total: spans.length,
  };
}

/**
 * Sampler amplitudo: puncak translateY (em) dan --text-shadow-opacity (%).
 *
 * Kedua nilai ini punya angka desain yang TEGAS di design-tokens.ts:
 *   yOffset  puncak -1/60 em = -0,01667  (SPLINE.yOffset)
 *   glow     puncak 1 → opacity = 1 × GLOW.opacityFactor = 35%
 * Kalau yang terukur lebih besar, yang melewati bukan spring-nya tapi
 * interpolasi spline-nya sendiri.
 */
function startAmplitudeSampler() {
  const spans = [...document.querySelectorAll('[aria-label^="Lompat ke"] span')];
  const P = { yMin: 0, yMax: 0, glowMax: 0, blurMax: 0, n: 0, stop: false, yHist: [], glowHist: [] };
  window.__mAmp = P;
  const tick = function () {
    P.n += 1;
    for (let i = 0; i < spans.length; i += 1) {
      const el = spans[i];
      const m = /translateY\(([-\d.e]+)em\)/.exec(el.style.transform || '');
      if (m) {
        const v = Number(m[1]);
        if (v < P.yMin) P.yMin = v;
        if (v > P.yMax) P.yMax = v;
        if (v < -0.0001) P.yHist.push(v);
      }
      const o = parseFloat(el.style.getPropertyValue('--text-shadow-opacity'));
      if (Number.isFinite(o)) {
        if (o > P.glowMax) P.glowMax = o;
        if (o > 0.5) P.glowHist.push(o);
      }
      const b = parseFloat(el.style.getPropertyValue('--text-shadow-blur'));
      if (Number.isFinite(b) && b > P.blurMax) P.blurMax = b;
    }
    if (!P.stop) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return spans.length;
}

function stopAmplitudeSampler() {
  const P = window.__mAmp;
  P.stop = true;
  const q = (arr, p) => {
    if (arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  };
  return {
    n: P.n,
    yMin: P.yMin,
    yMax: P.yMax,
    glowMax: P.glowMax,
    blurMax: P.blurMax,
    ySamples: P.yHist.length,
    yP01: q(P.yHist, 0.01),
    yP50: q(P.yHist, 0.5),
    glowSamples: P.glowHist.length,
    glowP99: q(P.glowHist, 0.99),
    glowP50: q(P.glowHist, 0.5),
  };
}

module.exports = {
  installTimingProbe,
  startRecording,
  stopRecording,
  readState,
  startPeakSampler,
  stopPeakSampler,
  measureSettle,
  patchStyleWrites,
  scaleByState,
  startAmplitudeSampler,
  stopAmplitudeSampler,
};

