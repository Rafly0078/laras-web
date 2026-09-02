/**
 * Parser TTML Apple Music -> tipe Lyrics internal.
 *
 * Struktur TTML Apple (semua terverifikasi dari 4 fixture nyata, bukan asumsi):
 *   <tt itunes:timing="Word">
 *     <head><metadata><ttm:agent type="person|group" xml:id="v1|v2|v1000"/>
 *     <body dur="4:11.668" ttm:agent="v2">
 *       <div begin end itunes:songPart="Chorus">      <- songPart OPSIONAL
 *         <p begin end itunes:key="L2" ttm:agent="v2">
 *           <span begin end>kata</span> <span ...>kata</span>
 *           <span ttm:role="x-bg">                    <- BERSARANG, tanpa waktu
 *             <span begin end>(kata</span>...
 *
 * Dua hal yang mudah salah dan sudah dibuktikan lewat fixture:
 *  1. Format waktu CAMPUR dalam satu dokumen: "9.420" dan "4:20.642".
 *  2. Batas kata ditentukan SPASI antar span, bukan atribut. Tiga span
 *     "Su","a","tu" tanpa spasi = satu kata "Suatu" (nyata di peradaban.ttml).
 */

import { DOTS, EMPHASIS_MIN_DURATION } from '@/lib/lyrics/design-tokens';
import { tokenizeXml, type XmlToken } from '@/lib/lyrics/xml';
import type { Lyrics, LyricLine, Syllable, VocalGroup } from '@/lib/types';

/**
 * Ubah nilai waktu TTML menjadi detik.
 *
 * Bentuk yang didukung (semua sah di TTML, dua yang pertama nyata di fixture):
 *   "9.420"        -> 9.42
 *   "4:20.642"     -> 260.642
 *   "1:04:20.642"  -> 3860.642
 *   "12s" / "120ms" / "1.5h" / "90m"
 * Nilai tak terbaca -> NaN, dan pemanggil WAJIB melewati span itu.
 */
export function parseTtmlTime(raw: string): number {
  const text = raw.trim();
  if (text.length === 0) return Number.NaN;

  // Bentuk bersatuan: 12s, 120ms, 90m, 1.5h
  const unit = /^([0-9]*\.?[0-9]+)(h|m|s|ms|f|t)$/i.exec(text);
  if (unit) {
    const value = Number.parseFloat(unit[1]);
    if (!Number.isFinite(value)) return Number.NaN;
    switch (unit[2].toLowerCase()) {
      case 'h':
        return value * 3600;
      case 'm':
        return value * 60;
      case 's':
        return value;
      case 'ms':
        return value / 1000;
      default:
        // 'f' (frame) dan 't' (tick) butuh frameRate/tickRate dari dokumen;
        // Apple tidak memakainya, jadi jangan menebak.
        return Number.NaN;
    }
  }

  // Bentuk jam-menit-detik, dengan 0..2 pemisah titik dua.
  const clock = /^(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(text);
  if (!clock) return Number.NaN;

  const [, a, b, c] = clock;
  const seconds = Number.parseFloat(c);
  if (!Number.isFinite(seconds)) return Number.NaN;

  // Regex di atas mengisi grup dari kiri, jadi "4:20.642" memberi a="4", b=undefined.
  if (a !== undefined && b !== undefined) {
    return Number.parseInt(a, 10) * 3600 + Number.parseInt(b, 10) * 60 + seconds;
  }
  if (a !== undefined) {
    return Number.parseInt(a, 10) * 60 + seconds;
  }
  return seconds;
}

/* ── Pengumpulan span dalam satu <p> ───────────────────────────────────── */

interface RawSpan {
  text: string;
  start: number;
  end: number;
  /** true kalau span sebelumnya menempel tanpa spasi. */
  attached: boolean;
  /** true kalau span ini di dalam wrapper ttm:role="x-bg". */
  background: boolean;
  /** Indeks kelompok background (wrapper ke-berapa), -1 untuk lead. */
  backgroundGroup: number;
}

/** Susun teks kembali menjadi kalimat, menghormati batas kata. */
function joinSyllables(syllables: readonly Syllable[]): string {
  let out = '';
  syllables.forEach((s, i) => {
    if (i > 0 && !s.isPartOfWord) out += ' ';
    out += s.text;
  });
  return out.trim();
}

function toSyllable(span: RawSpan): Syllable {
  const duration = span.end - span.start;
  return {
    text: span.text,
    start: span.start,
    end: span.end,
    isPartOfWord: span.attached,
    // Kata yang ditahan lama oleh penyanyi mendapat skala puncak lebih besar.
    emphasis: duration >= EMPHASIS_MIN_DURATION,
  };
}

function toVocalGroup(spans: readonly RawSpan[]): VocalGroup | null {
  if (spans.length === 0) return null;
  const syllables = spans.map(toSyllable);
  return {
    syllables,
    start: Math.min(...syllables.map((s) => s.start)),
    end: Math.max(...syllables.map((s) => s.end)),
  };
}

/**
 * Baca semua span bertimbang di dalam satu <p>.
 *
 * Kunci deteksi batas kata: kita catat apakah ADA teks non-kosong (spasi)
 * di antara penutup span sebelumnya dan pembuka span berikutnya. Kalau tidak
 * ada, span itu menempel — bagian dari kata yang sama.
 */
function collectSpans(tokens: readonly XmlToken[], from: number, to: number): RawSpan[] {
  const spans: RawSpan[] = [];

  let depth = 0;
  /** Kedalaman saat wrapper x-bg dibuka; -1 = kita sedang di lead. */
  let bgDepth = -1;
  let bgGroupIndex = -1;
  let bgGroupCounter = -1;

  /** Sedang di dalam span bertimbang: kumpulkan teksnya. */
  let openSpan: { start: number; end: number; text: string; depth: number } | null = null;

  /** Sudah ada spasi sejak span terakhir ditutup? */
  let sawSeparator = true; // span pertama dianggap awal kata

  for (let i = from; i < to; i += 1) {
    const tk = tokens[i];

    if (tk.kind === 'text') {
      if (openSpan) {
        openSpan.text += tk.value;
      } else if (/\s/.test(tk.value)) {
        sawSeparator = true;
      } else if (tk.value.length > 0) {
        // Teks di luar span (jarang, tapi ada di lirik tanpa timing) tetap
        // dianggap pemisah supaya kata berikutnya tidak menempel salah.
        sawSeparator = true;
      }
      continue;
    }

    if (tk.kind === 'open') {
      depth += 1;

      if (tk.name.endsWith('span')) {
        const role = tk.attrs['ttm:role'] ?? tk.attrs.role;
        const hasTiming = tk.attrs.begin !== undefined;

        if (role === 'x-bg' && !hasTiming) {
          // Wrapper vokal latar: buka kelompok baru.
          bgDepth = depth;
          bgGroupCounter += 1;
          bgGroupIndex = bgGroupCounter;
          sawSeparator = true;
          if (tk.selfClosing) {
            depth -= 1;
            bgDepth = -1;
            bgGroupIndex = -1;
          }
          continue;
        }

        if (hasTiming) {
          const start = parseTtmlTime(tk.attrs.begin ?? '');
          const end = parseTtmlTime(tk.attrs.end ?? '');
          if (Number.isFinite(start) && Number.isFinite(end)) {
            openSpan = { start, end, text: '', depth };
          }
          if (tk.selfClosing) {
            // Span kosong tanpa isi: tidak ada teks untuk disapu, lewati.
            openSpan = null;
            depth -= 1;
          }
          continue;
        }
      }

      if (tk.selfClosing) depth -= 1;
      continue;
    }

    // tk.kind === 'close'
    if (openSpan && depth === openSpan.depth) {
      const text = openSpan.text;
      if (text.trim().length > 0) {
        spans.push({
          // Spasi di tepi teks span dibuang: jaraknya diurus CSS (0.32ch),
          // bukan oleh karakter spasi di dalam elemen.
          text: text.trim(),
          start: openSpan.start,
          end: openSpan.end,
          attached: !sawSeparator,
          background: bgDepth !== -1,
          backgroundGroup: bgDepth !== -1 ? bgGroupIndex : -1,
        });
        sawSeparator = false;
      }
      openSpan = null;
    }

    if (bgDepth !== -1 && depth === bgDepth) {
      bgDepth = -1;
      bgGroupIndex = -1;
      sawSeparator = true;
    }

    depth -= 1;
  }

  return spans;
}

/* ── Parser utama ──────────────────────────────────────────────────────── */

interface ParsedParagraph {
  start: number;
  end: number;
  agent: string | null;
  songPart: string | null;
  spans: RawSpan[];
  /** Teks polos untuk baris tanpa timing per kata. */
  plainText: string;
}

function readParagraphs(tokens: readonly XmlToken[]): ParsedParagraph[] {
  const out: ParsedParagraph[] = [];
  let songPart: string | null = null;
  let depth = 0;
  let divDepth = -1;

  for (let i = 0; i < tokens.length; i += 1) {
    const tk = tokens[i];

    if (tk.kind === 'open') {
      depth += 1;

      if (tk.name.endsWith('div')) {
        divDepth = depth;
        songPart = tk.attrs['itunes:songPart'] ?? null;
        if (tk.selfClosing) {
          depth -= 1;
          divDepth = -1;
          songPart = null;
        }
        continue;
      }

      if (tk.name.endsWith('p') && !tk.name.endsWith('sp')) {
        // Cari token penutup </p> yang sepadan.
        let j = i + 1;
        let inner = 1;
        while (j < tokens.length && inner > 0) {
          const t2 = tokens[j];
          if (t2.kind === 'open' && !t2.selfClosing && t2.name.endsWith('p') && !t2.name.endsWith('sp')) {
            inner += 1;
          } else if (t2.kind === 'close' && t2.name.endsWith('p') && !t2.name.endsWith('sp')) {
            inner -= 1;
            if (inner === 0) break;
          }
          j += 1;
        }

        const spans = collectSpans(tokens, i + 1, j);
        const plain = tokens
          .slice(i + 1, j)
          .filter((t): t is Extract<XmlToken, { kind: 'text' }> => t.kind === 'text')
          .map((t) => t.value)
          .join('')
          .replace(/\s+/g, ' ')
          .trim();

        const begin = parseTtmlTime(tk.attrs.begin ?? '');
        const end = parseTtmlTime(tk.attrs.end ?? '');

        out.push({
          start: Number.isFinite(begin)
            ? begin
            : spans.length > 0
              ? Math.min(...spans.map((s) => s.start))
              : Number.NaN,
          end: Number.isFinite(end)
            ? end
            : spans.length > 0
              ? Math.max(...spans.map((s) => s.end))
              : Number.NaN,
          agent: tk.attrs['ttm:agent'] ?? null,
          songPart,
          spans,
          plainText: plain,
        });

        depth -= 1; // <p> sudah kita konsumsi seluruhnya
        i = j;
        continue;
      }

      if (tk.selfClosing) depth -= 1;
      continue;
    }

    if (tk.kind === 'close') {
      if (divDepth !== -1 && depth === divDepth) {
        divDepth = -1;
        songPart = null;
      }
      depth -= 1;
    }
  }

  return out;
}

/** Baris interlude sintetis (tiga titik berdenyut) untuk jeda panjang. */
function makeInterlude(index: number, start: number, end: number): LyricLine {
  return {
    index,
    start,
    end,
    lead: { syllables: [], start, end },
    background: [],
    oppositeAligned: false,
    interlude: true,
    songPart: null,
    text: '',
  };
}

export function parseAppleTtml(xml: string): Lyrics {
  const tokens = tokenizeXml(xml);

  const root = tokens.find((t) => t.kind === 'open' && t.name.endsWith('tt'));
  const timing =
    root && root.kind === 'open' ? (root.attrs['itunes:timing'] ?? null) : null;

  const paragraphs = readParagraphs(tokens).filter((p) => Number.isFinite(p.start));

  if (paragraphs.length === 0) {
    return {
      kind: 'static',
      lines: [],
      source: 'apple',
      attribution: 'Apple Music',
      instrumental: true,
    };
  }

  // Agent pertama yang muncul = penyanyi utama. Yang lain (kecuali grup)
  // diratakan ke kanan sebagai penyanyi kedua.
  const firstPersonAgent =
    paragraphs.find((p) => p.agent !== null && p.agent !== 'v1000')?.agent ?? null;

  const timedLines: LyricLine[] = [];

  for (const p of paragraphs) {
    const leadSpans = p.spans.filter((s) => !s.background);
    const bgSpans = p.spans.filter((s) => s.background);

    const lead =
      toVocalGroup(leadSpans) ??
      // Baris tanpa timing per kata: satu "suku kata" seukuran barisnya, jadi
      // baris tetap menyala tanpa sapuan palsu di dalamnya.
      ({
        syllables:
          p.plainText.length > 0
            ? [
                {
                  text: p.plainText,
                  start: p.start,
                  end: p.end,
                  isPartOfWord: false,
                  emphasis: false,
                },
              ]
            : [],
        start: p.start,
        end: p.end,
      } satisfies VocalGroup);

    const groups = new Map<number, RawSpan[]>();
    for (const s of bgSpans) {
      const list = groups.get(s.backgroundGroup);
      if (list) list.push(s);
      else groups.set(s.backgroundGroup, [s]);
    }
    const background = [...groups.keys()]
      .sort((a, b) => a - b)
      .map((key) => toVocalGroup(groups.get(key) ?? []))
      .filter((g): g is VocalGroup => g !== null);

    timedLines.push({
      index: 0, // diisi setelah interlude disisipkan
      start: p.start,
      end: Number.isFinite(p.end) ? p.end : lead.end,
      lead,
      background,
      oppositeAligned:
        p.agent !== null && p.agent !== 'v1000' && p.agent !== firstPersonAgent,
      interlude: false,
      songPart: p.songPart,
      text: leadSpans.length > 0 ? joinSyllables(lead.syllables) : p.plainText,
    });
  }

  // Sisipkan interlude: intro panjang sebelum baris pertama, dan jeda panjang
  // antar baris. Ambangnya DOTS.minGapSeconds.
  const withInterludes: LyricLine[] = [];
  const first = timedLines[0];
  if (first.start >= DOTS.minGapSeconds) {
    withInterludes.push(makeInterlude(0, 0, first.start));
  }

  timedLines.forEach((line, i) => {
    withInterludes.push(line);
    const next = timedLines[i + 1];
    if (next && next.start - line.end >= DOTS.minGapSeconds) {
      withInterludes.push(makeInterlude(0, line.end, next.start));
    }
  });

  const lines = withInterludes.map((line, i) => ({ ...line, index: i }));

  const hasWordTiming = timedLines.some((l) => l.lead.syllables.length > 1);

  return {
    kind: timing === 'Word' && hasWordTiming ? 'syllable' : 'line',
    lines,
    source: 'apple',
    attribution: 'Apple Music',
    instrumental: false,
  };
}
