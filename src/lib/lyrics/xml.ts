/**
 * Tokenizer XML minimal untuk TTML Apple Music.
 *
 * Kenapa tidak DOMParser: kode ini harus jalan di Node (untuk test dan nanti
 * untuk cache di server) DAN di browser. Kenapa tidak paket npm: TTML Apple
 * bentuknya sempit dan sudah diketahui — tokenizer 80 baris lebih mudah
 * dipastikan benar daripada mengurus opsi library, dan nol dependensi di
 * jalur yang nanti ikut ke bundle klien.
 *
 * Sengaja TIDAK mendukung: DTD, CDATA, processing instruction, namespace
 * resolution. TTML Apple tidak memakainya. Kalau suatu hari muncul, parser
 * akan mengabaikannya alih-alih salah membaca.
 */

export type XmlToken =
  | { kind: 'open'; name: string; attrs: Record<string, string>; selfClosing: boolean }
  | { kind: 'close'; name: string }
  | { kind: 'text'; value: string };

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

/** Kembalikan entitas XML ke karakter aslinya. */
export function decodeXmlText(raw: string): string {
  return raw.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

/** Baca atribut dari isi tag (bagian setelah nama tag). */
function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    attrs[m[1]] = decodeXmlText(m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/**
 * Pecah dokumen XML menjadi urutan token.
 *
 * Token `text` dipertahankan APA ADANYA (termasuk spasi tunggal antar span),
 * karena justru spasi itulah penanda batas kata di TTML Apple: dua span
 * tanpa spasi di antaranya adalah dua suku kata dari satu kata.
 */
export function tokenizeXml(xml: string): XmlToken[] {
  const tokens: XmlToken[] = [];
  let i = 0;
  const n = xml.length;

  while (i < n) {
    const lt = xml.indexOf('<', i);

    if (lt === -1) {
      const tail = xml.slice(i);
      if (tail.length > 0) tokens.push({ kind: 'text', value: decodeXmlText(tail) });
      break;
    }

    if (lt > i) {
      tokens.push({ kind: 'text', value: decodeXmlText(xml.slice(i, lt)) });
    }

    // Komentar, deklarasi, dan processing instruction: dilewati utuh.
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (xml.startsWith('<?', lt) || xml.startsWith('<!', lt)) {
      const end = xml.indexOf('>', lt + 2);
      i = end === -1 ? n : end + 1;
      continue;
    }

    const gt = xml.indexOf('>', lt + 1);
    if (gt === -1) break; // tag tidak tertutup: berhenti, jangan mengarang

    const inner = xml.slice(lt + 1, gt).trim();

    if (inner.startsWith('/')) {
      tokens.push({ kind: 'close', name: inner.slice(1).trim() });
    } else {
      const selfClosing = inner.endsWith('/');
      const body = selfClosing ? inner.slice(0, -1) : inner;
      const spaceAt = body.search(/\s/);
      const name = spaceAt === -1 ? body : body.slice(0, spaceAt);
      const attrs = spaceAt === -1 ? {} : parseAttrs(body.slice(spaceAt));
      tokens.push({ kind: 'open', name, attrs, selfClosing });
    }

    i = gt + 1;
  }

  return tokens;
}
