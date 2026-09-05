import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ChildViewActivity } from '@/lib/domain/activity/child-view';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useActionState: () => [{}, '/noop', false],
  };
});

import { ActivityPlayer } from '@/components/activity-player';

const common = {
  schemaVersion: 1 as const,
  id: '11111111-1111-4111-8111-111111111111',
  locale: 'vi' as const,
  version: 1,
  title: 'Hoạt động thử',
  instructions: 'Con hãy làm hoạt động này nhé.',
  difficulty: 1,
  estimatedMinutes: 8,
  printable: {
    supported: true as const,
    layout: 'prompt_card' as const,
    pageEstimate: 1,
  },
};

const action = async () => ({});

function render(activity: ChildViewActivity): string {
  return renderToStaticMarkup(
    React.createElement(ActivityPlayer, { activity, action, printHref: '/print/test' }),
  );
}

describe('ActivityPlayer response-mode controls', () => {
  it('renders photo instead of textarea for an early reflection', () => {
    const html = render({
      ...common,
      slug: 'reflection-photo',
      type: 'reflection',
      response: { mode: 'photo', prompt: 'Chụp phiếu của con', maxAssets: 1 },
      payload: {
        theme: 'kindness',
        questions: [
          {
            id: 'q1',
            prompt: 'Con hãy vẽ một việc tốt con muốn làm.',
            sentenceStarters: [],
          },
        ],
      },
    });

    expect(html).toContain('type="file"');
    expect(html).not.toContain('<textarea');
  });

  it('renders photo instead of textarea for an early story summary', () => {
    const html = render({
      ...common,
      slug: 'summary-photo',
      type: 'story_summary',
      response: { mode: 'photo', prompt: 'Chụp tranh kể chuyện của con', maxAssets: 1 },
      printable: { supported: true, layout: 'reading', pageEstimate: 1 },
      payload: {
        story: {
          title: 'Hạt mầm',
          paragraphs: ['Hạt mầm nằm trong đất ấm. Một hôm, mầm xanh nhú lên đón nắng.'],
          wordCount: 20,
          readingLevel: {
            avgWordsPerSentence: 8,
            avgSyllablesPerWord: 1,
            band: 'early',
          },
        },
        guidance: {
          minWords: 5,
          maxWords: 20,
          promptHints: ['Con vẽ chuyện bắt đầu và kết thúc thế nào?'],
        },
      },
    });

    expect(html).toContain('type="file"');
    expect(html).not.toContain('<textarea');
  });

  it('renders choices without textarea for an early guided situation', () => {
    const html = render({
      ...common,
      slug: 'situation-choice',
      type: 'situation_judgment',
      response: { mode: 'choice', autoScored: true },
      payload: {
        scenario:
          'Trong giờ chơi, con thấy hai bạn cùng muốn dùng một hộp bút màu đang để trên bàn.',
        question: 'Con sẽ chọn cách nào?',
        mode: 'guided',
        options: [
          { id: 'a', text: 'Rủ hai bạn thay phiên nhau dùng' },
          { id: 'b', text: 'Lấy hộp bút rồi đi chỗ khác' },
        ],
        trustedAdultPath: {
          present: true,
          text: 'Con có thể nhờ cô giáo giúp nếu các bạn chưa thống nhất được.',
        },
      },
    });

    expect(html).toContain('type="radio"');
    expect(html).not.toContain('<textarea');
  });
});
