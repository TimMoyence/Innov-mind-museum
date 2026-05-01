import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { formatDate, formatDateTime, useDateLocale } from './i18n-format';

const mockLocale = vi.fn<() => string>();
vi.mock('@/lib/admin-dictionary', () => ({
  useAdminLocale: () => mockLocale(),
}));

describe('useDateLocale', () => {
  it('returns fr-FR when admin locale is fr', () => {
    mockLocale.mockReturnValue('fr');
    const { result } = renderHook(() => useDateLocale());
    expect(result.current).toBe('fr-FR');
  });

  it('returns en-US when admin locale is en', () => {
    mockLocale.mockReturnValue('en');
    const { result } = renderHook(() => useDateLocale());
    expect(result.current).toBe('en-US');
  });
});

describe('formatDate', () => {
  const SAMPLE = new Date('2026-04-30T10:00:00Z');

  it('formats with fr-FR (long month)', () => {
    const out = formatDate(SAMPLE, 'fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    expect(out).toMatch(/avril/);
  });

  it('formats with en-US (long month)', () => {
    const out = formatDate(SAMPLE, 'en-US', { day: '2-digit', month: 'long', year: 'numeric' });
    expect(out).toMatch(/April/);
  });

  it('accepts an ISO string input', () => {
    const out = formatDate('2026-04-30T10:00:00Z', 'fr-FR', { day: '2-digit', month: 'long' });
    expect(out).toMatch(/avril/);
  });
});

describe('formatDateTime', () => {
  it('produces a string containing both date and time fragments (FR)', () => {
    const out = formatDateTime('2026-04-30T10:00:00Z', 'fr-FR');
    expect(out).toMatch(/\d{2}\/\d{2}\/\d{4}/); // dd/mm/yyyy
    expect(out).toMatch(/:/); // time separator
  });

  it('produces a string containing both date and time fragments (EN)', () => {
    const out = formatDateTime('2026-04-30T10:00:00Z', 'en-US');
    expect(out).toMatch(/\d{1,2}\/\d{1,2}\/\d{2,4}/); // m/d/yy or m/d/yyyy
    expect(out).toMatch(/:/); // time separator
  });
});
