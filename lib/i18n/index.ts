import { vi } from './messages.vi';
import { en } from './messages.en';
import type { Messages } from './messages.vi';

export type Locale = 'vi' | 'en';

export const DEFAULT_LOCALE: Locale = 'vi';

/** Every locale that has a catalogue, complete or not. Tooling-facing. */
export const SUPPORTED_LOCALES: readonly Locale[] = ['vi', 'en'] as const;

const catalogues: Record<Locale, Messages> = { vi, en };

/** True when a catalogue has no empty values — i.e. it is fully translated. */
export function isCatalogueComplete(locale: Locale): boolean {
  return !hasEmptyValue(catalogues[locale]);
}

function hasEmptyValue(value: unknown): boolean {
  if (typeof value === 'string') return value.length === 0;
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some(hasEmptyValue);
  }
  return false;
}

/**
 * Locales a user may actually be offered.
 *
 * Derived from catalogue completeness rather than hand-listed, so an
 * intentionally untranslated locale can never be surfaced in a picker
 * (PRODUCT_SPEC.md non-goal #13: the i18n layer ships in the MVP, the English
 * content does not). When English is eventually translated, it becomes
 * selectable automatically — nobody has to remember to update a list.
 */
export const SELECTABLE_LOCALES: readonly Locale[] = SUPPORTED_LOCALES.filter(isCatalogueComplete);

/** Type guard over the locale union — accepts any locale with a catalogue. */
export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Guard for anything a user chose (a query param, a cookie, a settings form).
 * Rejects locales that exist but are not ready to be shown.
 */
export function isSelectableLocale(value: string): value is Locale {
  return (SELECTABLE_LOCALES as readonly string[]).includes(value);
}

/**
 * Narrow untrusted input to a locale safe to render, falling back to the
 * default. Use this at every boundary rather than casting.
 */
export function resolveLocale(value: string | undefined | null): Locale {
  return value && isSelectableLocale(value) ? value : DEFAULT_LOCALE;
}

export function getMessages(locale: Locale = DEFAULT_LOCALE): Messages {
  return catalogues[locale];
}

/**
 * Resolve a message, falling back to Vietnamese when a locale has no
 * translation for that key. Typed against the Vietnamese catalogue, so a
 * missing key is a compile error rather than a runtime blank.
 */
export function translate<S extends keyof Messages, K extends keyof Messages[S]>(
  locale: Locale,
  section: S,
  key: K,
): string {
  const value = catalogues[locale][section][key];
  if (typeof value === 'string' && value.length > 0) return value;
  return vi[section][key] as string;
}

export type { Messages };
