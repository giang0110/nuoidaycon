import { describe, expect, it } from 'vitest';
import { responseAffordances } from '@/lib/domain/activity/response-affordances';

describe('response affordances', () => {
  it.each([
    ['none', { text: false, choice: false, photo: false }],
    ['text', { text: true, choice: false, photo: false }],
    ['choice', { text: false, choice: true, photo: false }],
    ['photo', { text: false, choice: false, photo: true }],
    ['mixed', { text: true, choice: true, photo: true }],
  ] as const)('%s exposes only the inputs allowed by its mode', (mode, expected) => {
    const response =
      mode === 'text'
        ? ({ mode, fields: [{ id: 'q1', label: 'Trả lời', minWords: 0, maxWords: 20 }] } as const)
        : mode === 'choice'
          ? ({ mode, autoScored: true } as const)
          : mode === 'photo'
            ? ({ mode, prompt: 'Chụp bài của con', maxAssets: 1 } as const)
            : mode === 'mixed'
              ? ({ mode, parts: ['text', 'choice', 'photo'], maxAssets: 1 } as const)
              : ({ mode } as const);

    expect(responseAffordances(response)).toEqual(expected);
  });

  it('mixed exposes only the parts actually declared', () => {
    expect(responseAffordances({ mode: 'mixed', parts: ['choice', 'photo'], maxAssets: 1 })).toEqual({
      text: false,
      choice: true,
      photo: true,
    });
  });
});
