/**
 * Fixtures for the activity schema tests. Deliberately minimal and valid, so a
 * test can mutate exactly one thing and assert the failure it expects.
 */
import type { ActivityInput } from '@/lib/domain/activity/schema';

export const baseEnvelope = {
  schemaVersion: 1 as const,
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'mau-hoat-dong',
  locale: 'vi' as const,
  version: 1,
  title: 'Hoạt động mẫu',
  instructions: 'Con hãy làm theo hướng dẫn dưới đây nhé.',
  audience: { minAge: 7, maxAge: 8, gradeMin: 'grade_2' as const, gradeMax: 'grade_3' as const },
  difficulty: 2,
  estimatedMinutes: 10,
  interestTags: ['animals'],
  printable: { supported: true as const, layout: 'prompt_card' as const, pageEstimate: 1 },
  safety: {
    policyVersion: 'age-policy@2026-08-25',
    ageBand: 'lower_primary' as const,
    reviewedBy: 'doi-ngu-noi-dung',
    reviewedAt: '2026-08-25T00:00:00Z',
    checks: [],
  },
  provenance: { source: 'seed' as const, authoredBy: 'doi-ngu-noi-dung' },
  status: 'approved' as const,
};

export const reflectionFixture: ActivityInput = {
  ...baseEnvelope,
  type: 'reflection',
  response: {
    mode: 'text',
    fields: [{ id: 'q1', label: 'Câu trả lời của con', maxWords: 30, minWords: 0 }],
  },
  payload: {
    theme: 'kindness',
    questions: [
      {
        id: 'q1',
        prompt: 'Hôm nay con đã làm điều gì tốt cho bạn?',
        sentenceStarters: ['Hôm nay con đã…'],
      },
    ],
  },
};

export const comprehensionFixture: ActivityInput = {
  ...baseEnvelope,
  slug: 'doc-hieu-mau',
  type: 'story_comprehension',
  printable: { supported: true, layout: 'reading', pageEstimate: 1 },
  response: { mode: 'mixed', parts: ['choice', 'text'], maxAssets: 0 },
  payload: {
    story: {
      title: 'Chú mèo nhỏ',
      paragraphs: ['Một chú mèo nhỏ sống trong khu vườn. Mỗi sáng chú ra sân phơi nắng.'],
      wordCount: 20,
      readingLevel: { avgWordsPerSentence: 10, avgSyllablesPerWord: 1, band: 'lower_primary' },
    },
    questions: [
      {
        kind: 'multiple_choice',
        id: 'q1',
        prompt: 'Chú mèo sống ở đâu?',
        choices: [
          { id: 'a', text: 'Trong khu vườn' },
          { id: 'b', text: 'Trên núi cao' },
        ],
        answerKey: 'a',
        rationale: 'Câu đầu tiên của truyện nói rõ điều này.',
      },
      {
        kind: 'short_text',
        id: 'q2',
        prompt: 'Mỗi sáng chú mèo làm gì?',
        exemplarAnswer: 'Chú ra sân phơi nắng.',
        maxWords: 20,
      },
    ],
  },
};

export const situationFixture: ActivityInput = {
  ...baseEnvelope,
  slug: 'tinh-huong-mau',
  type: 'situation_judgment',
  response: { mode: 'mixed', parts: ['choice', 'text'], maxAssets: 0 },
  payload: {
    scenario: 'Giờ ra chơi, con thấy một bạn mới ngồi một mình ở góc sân. Bạn ấy trông hơi buồn.',
    question: 'Nếu là con, con sẽ làm gì?',
    mode: 'guided',
    options: [
      {
        id: 'a',
        text: 'Đến rủ bạn cùng chơi',
        isConstructive: true,
        feedback: 'Rủ bạn cùng chơi là một cách rất ấm áp để bạn thấy được chào đón.',
      },
      {
        id: 'b',
        text: 'Đi chơi tiếp, không để ý',
        isConstructive: false,
        feedback: 'Bạn ấy có thể vẫn thấy lạc lõng. Con thử nghĩ xem có cách nào khác không nhé.',
      },
    ],
    trustedAdultPath: { present: true, text: 'Con có thể kể với cô giáo để cô giúp bạn hoà nhập.' },
  },
};

export const handwritingFixture: ActivityInput = {
  ...baseEnvelope,
  slug: 'luyen-viet-mau',
  type: 'handwriting',
  printable: { supported: true, layout: 'worksheet', pageEstimate: 1 },
  response: { mode: 'photo', prompt: 'Chụp bài viết của con', maxAssets: 1 },
  payload: {
    script: 'print',
    unit: 'words',
    items: ['bà', 'mẹ', 'con'],
    repetitions: 3,
    ruling: 'o_ly_grid',
    tracingGuides: true,
    focusDiacritics: ['à'],
  },
};

export const drawingFixture: ActivityInput = {
  ...baseEnvelope,
  slug: 've-mau',
  type: 'drawing_prompt',
  response: { mode: 'photo', prompt: 'Chụp bức tranh của con', maxAssets: 1 },
  payload: {
    prompt: 'Con hãy vẽ một khu vườn có ít nhất ba loài vật mà con thích.',
    checklist: ['Vẽ ít nhất ba con vật', 'Tô màu cho khu vườn'],
    openEnded: true,
  },
};

export const summaryFixture: ActivityInput = {
  ...baseEnvelope,
  slug: 'tom-tat-mau',
  type: 'story_summary',
  printable: { supported: true, layout: 'reading', pageEstimate: 1 },
  response: {
    mode: 'text',
    fields: [{ id: 'summary', label: 'Tóm tắt của con', maxWords: 40, minWords: 10 }],
  },
  payload: {
    story: {
      title: 'Hạt đậu nhỏ',
      paragraphs: ['Một hạt đậu nhỏ được gieo xuống đất. Ít lâu sau, hạt nảy mầm thành cây xanh.'],
      wordCount: 20,
      readingLevel: { avgWordsPerSentence: 10, avgSyllablesPerWord: 1, band: 'lower_primary' },
    },
    guidance: {
      minWords: 10,
      maxWords: 40,
      mustMention: ['hạt đậu', 'nảy mầm'],
      promptHints: ['Chuyện bắt đầu thế nào?'],
    },
  },
};

export const ALL_FIXTURES: ActivityInput[] = [
  reflectionFixture,
  comprehensionFixture,
  situationFixture,
  handwritingFixture,
  drawingFixture,
  summaryFixture,
];
