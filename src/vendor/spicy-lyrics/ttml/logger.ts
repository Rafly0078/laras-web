/*
 * File LARAS (bukan salinan upstream) — 2026-09-02.
 *
 * Pengganti `src/utils/Logger.ts` milik spicy-lyrics. Logger asli mereka
 * bergantung pada Maid, nanostores, dan konfigurasi Spicetify; tidak satu pun
 * ada di Node atau di server Next. Antarmukanya dipertahankan persis
 * (info/warn/error/debug/destroy + prefix) supaya `parser.ts` tetap verbatim.
 *
 * Diam secara default: parser dipanggil per lagu di server dan `debug()`
 * upstream sangat cerewet. Nyalakan dengan LARAS_LYRICS_DEBUG=1 saat menelusuri
 * masalah parsing.
 */

const enabled =
  typeof process !== 'undefined' && process.env?.LARAS_LYRICS_DEBUG === '1';

class Logger {
  public prefix: string;
  public isEnabled = enabled;

  constructor(prefix?: string) {
    this.prefix = `[LARAS]${prefix ? ` (${prefix})` : ''}`;
  }

  info(...args: unknown[]) {
    if (!this.isEnabled) return;
    console.info(this.prefix, ...args);
  }

  /** Peringatan tetap muncul: ia menandai TTML yang ditolak, bukan bising rutin. */
  warn(...args: unknown[]) {
    console.warn(this.prefix, ...args);
  }

  error(...args: unknown[]) {
    console.error(this.prefix, ...args);
  }

  debug(...args: unknown[]) {
    if (!this.isEnabled) return;
    console.debug(this.prefix, ...args);
  }

  destroy() {
    this.isEnabled = false;
  }
}

export default Logger;
