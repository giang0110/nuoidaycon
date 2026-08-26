import { envelope, type Seed } from '../_shared';

/**
 * Reflection themes are a CLOSED set, precisely so these questions can never
 * wander into family conflict, health, or private household matters
 * (CHILD_SAFETY.md §5.3).
 */
export const reflectionSeeds: Seed[] = [
  {
    ...envelope({
      id: '40000000-0000-4000-8000-000000000001',
      slug: 'suy-ngam-viec-tot-hom-nay',
      title: 'Một việc tốt hôm nay',
      instructions: 'Con hãy nghĩ về hôm nay, rồi viết câu trả lời của con nhé.',
      band: 'lower_primary',
      difficulty: 1,
      estimatedMinutes: 8,
      interestTags: ['helping'],
      layout: 'prompt_card',
    }),
    type: 'reflection',
    response: {
      mode: 'text',
      fields: [{ id: 'q1', label: 'Câu trả lời của con', minWords: 3, maxWords: 30 }],
    },
    payload: {
      theme: 'kindness',
      questions: [
        {
          id: 'q1',
          prompt: 'Hôm nay con đã làm điều gì tốt cho một người khác?',
          sentenceStarters: ['Hôm nay con đã…', 'Con đã giúp…'],
        },
      ],
      conversationStarter: 'Bố mẹ thử kể cho con nghe một việc tốt bố mẹ làm hôm nay nhé.',
    },
  },
  {
    ...envelope({
      id: '40000000-0000-4000-8000-000000000002',
      slug: 'suy-ngam-viec-kho-ma-con-lam-duoc',
      title: 'Việc khó mà con làm được',
      instructions: 'Con hãy nhớ lại một việc lúc đầu thấy khó, rồi trả lời nhé.',
      band: 'lower_primary',
      difficulty: 2,
      estimatedMinutes: 10,
      layout: 'prompt_card',
    }),
    type: 'reflection',
    response: {
      mode: 'text',
      fields: [{ id: 'q1', label: 'Việc đó là gì?', minWords: 3, maxWords: 30 }],
    },
    payload: {
      theme: 'effort',
      questions: [
        {
          id: 'q1',
          prompt: 'Có việc gì lúc đầu con thấy khó, nhưng cố mãi rồi con làm được?',
          sentenceStarters: ['Lúc đầu con thấy khó khi…', 'Con đã cố bằng cách…'],
        },
      ],
      conversationStarter: 'Bố mẹ khen con vì đã kiên trì, chứ không phải vì con giỏi sẵn nhé.',
    },
  },
  {
    ...envelope({
      id: '40000000-0000-4000-8000-000000000003',
      slug: 'suy-ngam-dieu-con-biet-on',
      title: 'Điều con thấy biết ơn',
      instructions: 'Con hãy nghĩ về tuần vừa rồi, rồi viết câu trả lời nhé.',
      band: 'upper_primary',
      difficulty: 2,
      estimatedMinutes: 10,
      layout: 'prompt_card',
    }),
    type: 'reflection',
    response: {
      mode: 'text',
      fields: [{ id: 'q1', label: 'Câu trả lời của con', minWords: 10, maxWords: 80 }],
    },
    payload: {
      theme: 'gratitude',
      questions: [
        {
          id: 'q1',
          prompt: 'Tuần này có điều gì làm con thấy vui và biết ơn?',
          sentenceStarters: ['Con thấy biết ơn vì…'],
        },
        {
          id: 'q2',
          prompt: 'Con muốn nói lời cảm ơn với ai? Vì sao?',
          sentenceStarters: ['Con muốn cảm ơn…'],
        },
      ],
    },
  },
  {
    ...envelope({
      id: '40000000-0000-4000-8000-000000000004',
      slug: 'suy-ngam-to-mo-cau-hoi',
      title: 'Câu hỏi con muốn biết',
      instructions: 'Con hãy nghĩ ra những câu hỏi mà con thật sự muốn biết câu trả lời.',
      band: 'upper_primary',
      difficulty: 3,
      estimatedMinutes: 12,
      interestTags: ['science', 'curiosity'],
      layout: 'prompt_card',
    }),
    type: 'reflection',
    response: {
      mode: 'text',
      fields: [{ id: 'q1', label: 'Câu hỏi của con', minWords: 10, maxWords: 90 }],
    },
    payload: {
      theme: 'curiosity',
      questions: [
        {
          id: 'q1',
          prompt: 'Có điều gì con vẫn thắc mắc mà chưa ai giải thích cho con?',
          sentenceStarters: ['Con vẫn thắc mắc là…'],
        },
        {
          id: 'q2',
          prompt: 'Con sẽ tìm câu trả lời bằng cách nào?',
          sentenceStarters: ['Con sẽ thử…'],
        },
      ],
      conversationStarter: 'Bố mẹ cùng con tìm câu trả lời cho một câu hỏi nhé.',
    },
  },
  {
    ...envelope({
      id: '40000000-0000-4000-8000-000000000005',
      slug: 'suy-ngam-trung-thuc',
      title: 'Nói thật dù hơi ngại',
      instructions: 'Con hãy đọc câu hỏi và viết điều con thật sự nghĩ nhé.',
      band: 'preteen',
      difficulty: 3,
      estimatedMinutes: 12,
      layout: 'prompt_card',
    }),
    type: 'reflection',
    response: {
      mode: 'text',
      fields: [{ id: 'q1', label: 'Câu trả lời của con', minWords: 20, maxWords: 150 }],
    },
    payload: {
      theme: 'honesty',
      questions: [
        {
          id: 'q1',
          prompt: 'Vì sao nói thật đôi khi khó, dù con biết đó là điều nên làm?',
          sentenceStarters: ['Nói thật khó vì…'],
        },
        {
          id: 'q2',
          prompt: 'Điều gì giúp con thấy dễ nói thật hơn?',
        },
      ],
    },
  },
];
