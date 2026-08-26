import { describe, it, expect } from 'vitest';
import {
  translate,
  getMessages,
  isLocale,
  isSelectableLocale,
  isCatalogueComplete,
  resolveLocale,
  SUPPORTED_LOCALES,
  SELECTABLE_LOCALES,
  DEFAULT_LOCALE,
} from '@/lib/i18n';
import { vi } from '@/lib/i18n/messages.vi';
import { en } from '@/lib/i18n/messages.en';

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, child]) =>
    flatten(child, prefix ? `${prefix}.${k}` : k),
  );
}

describe('i18n catalogues', () => {
  it('exposes the same key shape in every locale', () => {
    expect(flatten(en).sort()).toEqual(flatten(vi).sort());
  });

  it('has no empty Vietnamese strings — vi is the source of truth', () => {
    const empties = flatten(vi).filter((path) => {
      const value = path
        .split('.')
        .reduce<unknown>((acc, key) => (acc as Record<string, unknown>)[key], vi);
      return value === '';
    });
    expect(empties).toEqual([]);
  });

  it('recognises supported locales only', () => {
    expect(SUPPORTED_LOCALES.every(isLocale)).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });
});

describe('translate', () => {
  it('returns the requested locale when a translation exists', () => {
    expect(translate('vi', 'nav', 'home')).toBe('Trang chủ');
  });

  it('falls back to Vietnamese when the locale has no translation yet', () => {
    // English ships with empty strings on purpose (non-goal #13).
    expect(en.nav.home).toBe('');
    expect(translate('en', 'nav', 'home')).toBe('Trang chủ');
  });

  it('does not fall back when the locale does have a value', () => {
    expect(translate('en', 'common', 'appName')).toBe('Nuôi Dạy Con');
  });
});

describe('getMessages', () => {
  it('defaults to Vietnamese', () => {
    expect(getMessages().common.appName).toBe(vi.common.appName);
  });
});

describe('locale selectability', () => {
  it('does not offer English while its translations are intentionally empty', () => {
    // Non-goal #13: the i18n layer ships in the MVP, the English content does not.
    expect(isCatalogueComplete('en')).toBe(false);
    expect(SELECTABLE_LOCALES).not.toContain('en');
    expect(isSelectableLocale('en')).toBe(false);
  });

  it('offers Vietnamese, which is complete', () => {
    expect(isCatalogueComplete('vi')).toBe(true);
    expect(SELECTABLE_LOCALES).toContain('vi');
    expect(isSelectableLocale('vi')).toBe(true);
  });

  it('derives selectability from completeness, not a hand-maintained list', () => {
    const derived = SUPPORTED_LOCALES.filter(isCatalogueComplete);
    expect([...SELECTABLE_LOCALES]).toEqual([...derived]);
  });

  it('still recognises en as a known locale for tooling', () => {
    expect(isLocale('en')).toBe(true);
    expect(SUPPORTED_LOCALES).toContain('en');
  });

  it('resolveLocale rejects untrusted or unready input', () => {
    expect(resolveLocale('vi')).toBe('vi');
    expect(resolveLocale('en')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('fr')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('')).toBe(DEFAULT_LOCALE);
  });
});
