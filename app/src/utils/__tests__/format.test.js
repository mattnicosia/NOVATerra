import { describe, it, expect } from 'vitest';
import { fmt, fmt2, nn, pct, titleCase } from '@/utils/format';

describe('fmt — currency formatting (no decimals)', () => {
  it('formats a positive number', () => {
    expect(fmt(1234567)).toBe('$1,234,567');
  });

  it('formats zero', () => {
    expect(fmt(0)).toBe('$0');
  });

  it('formats null/undefined as $0', () => {
    expect(fmt(null)).toBe('$0');
    expect(fmt(undefined)).toBe('$0');
  });

  it('formats a small number', () => {
    expect(fmt(42)).toBe('$42');
  });

  it('formats a negative number', () => {
    expect(fmt(-500)).toBe('-$500');
  });

  it('rounds decimals away (no fraction digits)', () => {
    // Intl rounds to nearest, so 1234.56 → $1,235
    const result = fmt(1234.56);
    expect(result).toBe('$1,235');
  });
});

describe('fmt2 — currency formatting (2 decimals)', () => {
  it('formats with two decimal places', () => {
    expect(fmt2(1234.5)).toBe('$1,234.50');
  });

  it('formats whole number with .00', () => {
    expect(fmt2(1000)).toBe('$1,000.00');
  });

  it('formats null as $0.00', () => {
    expect(fmt2(null)).toBe('$0.00');
  });
});

describe('nn — normalize to number', () => {
  it('converts a string number', () => {
    expect(nn('42.5')).toBe(42.5);
  });

  it('returns 0 for empty string', () => {
    expect(nn('')).toBe(0);
  });

  it('returns 0 for null', () => {
    expect(nn(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(nn(undefined)).toBe(0);
  });

  it('returns 0 for non-numeric string', () => {
    expect(nn('abc')).toBe(0);
  });

  it('passes through a number', () => {
    expect(nn(99)).toBe(99);
  });

  it('returns 0 for NaN', () => {
    expect(nn(NaN)).toBe(0);
  });
});

describe('pct — percentage formatting', () => {
  it('formats a percentage', () => {
    expect(pct(10.5)).toBe('10.5%');
  });

  it('formats zero', () => {
    expect(pct(0)).toBe('0.0%');
  });

  it('formats null as 0.0%', () => {
    expect(pct(null)).toBe('0.0%');
  });

  it('formats an integer', () => {
    expect(pct(25)).toBe('25.0%');
  });
});

describe('titleCase', () => {
  it('capitalizes first letter of each word', () => {
    expect(titleCase('joint compound')).toBe('Joint Compound');
  });

  it('handles empty string', () => {
    expect(titleCase('')).toBe('');
  });

  it('handles null', () => {
    expect(titleCase(null)).toBe('');
  });

  it('handles undefined', () => {
    expect(titleCase(undefined)).toBe('');
  });
});
