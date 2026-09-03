import { describe, expect, it } from 'vitest';

import { greetingPart, greetingText } from '@/lib/home/greeting';

describe('greetingPart', () => {
  it('pagi dari 04:00 sampai 10:59', () => {
    expect(greetingPart(4)).toBe('pagi');
    expect(greetingPart(8)).toBe('pagi');
    expect(greetingPart(10)).toBe('pagi');
  });

  it('siang dari 11:00 sampai 14:59', () => {
    expect(greetingPart(11)).toBe('siang');
    expect(greetingPart(13)).toBe('siang');
  });

  it('sore dari 15:00 sampai 17:59', () => {
    expect(greetingPart(15)).toBe('sore');
    expect(greetingPart(17)).toBe('sore');
  });

  it('malam dari 18:00 sampai 03:59', () => {
    expect(greetingPart(18)).toBe('malam');
    expect(greetingPart(23)).toBe('malam');
    expect(greetingPart(0)).toBe('malam');
    expect(greetingPart(3)).toBe('malam');
  });

  it('batas persis tidak tumpang tindih', () => {
    expect(greetingPart(3)).toBe('malam');
    expect(greetingPart(4)).toBe('pagi');
    expect(greetingPart(10)).toBe('pagi');
    expect(greetingPart(11)).toBe('siang');
    expect(greetingPart(14)).toBe('siang');
    expect(greetingPart(15)).toBe('sore');
    expect(greetingPart(17)).toBe('sore');
    expect(greetingPart(18)).toBe('malam');
  });

  it('nilai di luar 0-23 dibungkus mod 24', () => {
    expect(greetingPart(26)).toBe(greetingPart(2));
    expect(greetingPart(-1)).toBe(greetingPart(23));
  });

  it('jam tidak finite jatuh ke pagi', () => {
    expect(greetingPart(Number.NaN)).toBe('pagi');
    expect(greetingPart(Number.POSITIVE_INFINITY)).toBe('pagi');
  });
});

describe('greetingText', () => {
  it('membaca jam lokal Date', () => {
    expect(greetingText(new Date(2026, 0, 1, 7, 0))).toBe('Selamat pagi');
    expect(greetingText(new Date(2026, 0, 1, 12, 0))).toBe('Selamat siang');
    expect(greetingText(new Date(2026, 0, 1, 16, 0))).toBe('Selamat sore');
    expect(greetingText(new Date(2026, 0, 1, 20, 0))).toBe('Selamat malam');
  });
});
