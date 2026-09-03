import { describe, expect, it } from 'vitest';

import {
  SIDEBAR_ATTRIBUTE,
  SIDEBAR_BOOT_SCRIPT,
  SIDEBAR_DEFAULT_OPEN,
  SIDEBAR_STORAGE_KEY,
  isSidebarShortcut,
  parseSidebarOpen,
  sidebarAttributeValue,
} from '@/lib/shell/sidebar';

/** Event papan tunggal minimal; tiap uji menimpa yang perlu. */
function keyEvent(over: Partial<Parameters<typeof isSidebarShortcut>[0]> = {}) {
  return {
    key: 'b',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...over,
  };
}

describe('parseSidebarOpen', () => {
  it('membaca dua nilai yang sah', () => {
    expect(parseSidebarOpen('open')).toBe(true);
    expect(parseSidebarOpen('closed')).toBe(false);
  });

  it('penyimpanan kosong jatuh ke default terbuka', () => {
    expect(parseSidebarOpen(null)).toBe(SIDEBAR_DEFAULT_OPEN);
    expect(parseSidebarOpen(null)).toBe(true);
  });

  it('nilai sampah tidak menghilangkan navigasi', () => {
    /* Penyimpanan milik pengguna — ia bisa berisi sisa versi lama atau JSON
       kacau, dan itu tidak boleh berakhir sebagai sidebar yang hilang. */
    expect(parseSidebarOpen('')).toBe(true);
    expect(parseSidebarOpen('true')).toBe(true);
    expect(parseSidebarOpen('false')).toBe(true);
    expect(parseSidebarOpen('{"open":false}')).toBe(true);
    expect(parseSidebarOpen('OPEN')).toBe(true);
    expect(parseSidebarOpen('CLOSED')).toBe(true);
  });
});

describe('sidebarAttributeValue', () => {
  it('memetakan boolean ke dua string yang dibaca CSS', () => {
    expect(sidebarAttributeValue(true)).toBe('open');
    expect(sidebarAttributeValue(false)).toBe('closed');
  });

  it('bolak-balik dengan parseSidebarOpen', () => {
    expect(parseSidebarOpen(sidebarAttributeValue(true))).toBe(true);
    expect(parseSidebarOpen(sidebarAttributeValue(false))).toBe(false);
  });
});

describe('isSidebarShortcut', () => {
  it('menerima Ctrl+B dan Cmd+B', () => {
    expect(isSidebarShortcut(keyEvent({ ctrlKey: true }))).toBe(true);
    expect(isSidebarShortcut(keyEvent({ metaKey: true }))).toBe(true);
  });

  it('huruf besar juga diterima (Caps Lock menyala)', () => {
    expect(isSidebarShortcut(keyEvent({ key: 'B', ctrlKey: true }))).toBe(true);
  });

  it('B tanpa modifier BUKAN pintasan', () => {
    /* Kalau tidak, mengetik huruf b di kotak pencarian akan menutup sidebar. */
    expect(isSidebarShortcut(keyEvent())).toBe(false);
  });

  it('menolak Shift dan Alt', () => {
    expect(isSidebarShortcut(keyEvent({ ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isSidebarShortcut(keyEvent({ ctrlKey: true, altKey: true }))).toBe(false);
    expect(isSidebarShortcut(keyEvent({ metaKey: true, shiftKey: true }))).toBe(false);
  });

  it('tombol lain dengan Ctrl dibiarkan lewat', () => {
    expect(isSidebarShortcut(keyEvent({ key: 'k', ctrlKey: true }))).toBe(false);
    expect(isSidebarShortcut(keyEvent({ key: 'Backspace', ctrlKey: true }))).toBe(false);
  });
});

describe('SIDEBAR_BOOT_SCRIPT', () => {
  it('memakai kunci penyimpanan dan nama atribut yang sama dengan kode React', () => {
    /* Dua sumber kebenaran untuk nama kunci = bug yang hanya muncul pada muat
       ulang pertama. Uji ini yang mengikatnya. */
    expect(SIDEBAR_BOOT_SCRIPT).toContain(JSON.stringify(SIDEBAR_STORAGE_KEY));
    expect(SIDEBAR_BOOT_SCRIPT).toContain(JSON.stringify(SIDEBAR_ATTRIBUTE));
  });

  it('menangkap kegagalan localStorage', () => {
    expect(SIDEBAR_BOOT_SCRIPT).toContain('try');
    expect(SIDEBAR_BOOT_SCRIPT).toContain('catch');
  });

  it('hanya menerima dua nilai yang sah', () => {
    expect(SIDEBAR_BOOT_SCRIPT).toContain('"closed"');
    expect(SIDEBAR_BOOT_SCRIPT).toContain('"open"');
  });

  it('benar-benar menulis atribut saat penyimpanan berisi "closed"', () => {
    /* Skripnya string, jadi satu-satunya cara membuktikan ia bekerja adalah
       menjalankannya terhadap DOM tiruan. */
    const attributes = new Map<string, string>();
    const documentElement = {
      setAttribute: (name: string, value: string) => attributes.set(name, value),
    };
    const store = new Map([[SIDEBAR_STORAGE_KEY, 'closed']]);

    new Function(
      'document',
      'localStorage',
      SIDEBAR_BOOT_SCRIPT,
    )({ documentElement }, { getItem: (k: string) => store.get(k) ?? null });

    expect(attributes.get(SIDEBAR_ATTRIBUTE)).toBe('closed');
  });

  it('tidak menyentuh atribut saat localStorage melempar', () => {
    const attributes = new Map<string, string>();
    const documentElement = {
      setAttribute: (name: string, value: string) => attributes.set(name, value),
    };

    expect(() =>
      new Function(
        'document',
        'localStorage',
        SIDEBAR_BOOT_SCRIPT,
      )(
        { documentElement },
        {
          getItem() {
            throw new Error('penyimpanan diblokir');
          },
        },
      ),
    ).not.toThrow();

    expect(attributes.size).toBe(0);
  });
});
