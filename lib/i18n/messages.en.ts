/**
 * English catalogue — keys present, translations deliberately empty.
 *
 * PRODUCT_SPEC.md non-goal #13: the i18n layer ships in the MVP, the English
 * content does not. `scripts/check-i18n-keys.ts` fails if this file drifts out
 * of shape with the Vietnamese catalogue.
 */
import type { Messages } from './messages.vi';

export const en: Messages = {
  common: {
    appName: 'Nuôi Dạy Con',
    loading: '',
    save: '',
    cancel: '',
    back: '',
    next: '',
    done: '',
    delete: '',
    confirm: '',
    retry: '',
  },
  nav: { home: '', children: '', library: '', settings: '', assign: '' },
  marketing: { tagline: '', ctaSignUp: '', ctaLogIn: '', privacy: '', safety: '' },
  activityType: {
    handwriting: '',
    drawing_prompt: '',
    story_comprehension: '',
    story_summary: '',
    reflection: '',
    situation_judgment: '',
  },
  error: { generic: '', notFound: '' },
};
