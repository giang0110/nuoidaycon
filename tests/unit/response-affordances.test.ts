import { describe, expect, it } from 'vitest';
import type { ResponseSpec } from '@/lib/domain/activity/schema';
import { responseAffordances } from '@/lib/domain/activity/response-affordances';

function responseFor(mode: ResponseSpec['mode']): ResponseSpec {
  switch (mode) {
    case 'none':
      return { mode: 'none' };
    case 'text':
      return {
        mode: 'text',
        fields: [
          {
            id: 'q1',
            label: 'Trả lời',
            minWords: 0,
            maxWords: 20,
            sentenceStarters: [],
          },
        ],
        allowPhotoInstead: true,
      };
    case 'choice':
      return { mode: 'choice', autoScored: true };
    case 'photo':
      return { mode: 'photo', prompt: 'Chụp bài của con', maxAssets: 1 };
    case 'mixed':
      return { mode: 'mixed', parts: ['text', 'choice', 'photo'], maxAssets: 1 };
  }
}

describe('response affordances', () => {
  it.each([
    ['none', { text: false, choice: false, photo: false }],
    ['text', { text: true, choice: false, photo: false }],
    ['choice', { text: false, choice: true, photo: false }],
    ['photo', { text: false, choice: false, photo: true }],
    ['mixed', { text: true, choice: true, photo: true }],
  ] as const)('%s exposes only the inputs allowed by its mode', (mode, expected) => {
    expect(responseAffordances(responseFor(mode))).toEqual(expected);
  });

  it('mixed exposes only the parts actually declared', () => {
    expect(
      responseAffordances({ mode: 'mixed', parts: ['choice', 'photo'], maxAssets: 1 }),
    ).toEqual({
      text: false,
      choice: true,
      photo: true,
    });
  });
});
