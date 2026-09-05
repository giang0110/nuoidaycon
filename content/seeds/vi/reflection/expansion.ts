import { envelope, type Seed } from '../_shared';

const earlyPhoto = {
  mode: 'photo' as const,
  prompt: 'Chụp bức vẽ câu trả lời của con',
  maxAssets: 1,
};

export const reflectionExpansionSeeds: Seed[] = [
  {
    ...envelope({
      id: '41000000-0000-4000-8000-000000000001',
      slug: 'suy-ngam-ve-viec-giup-do',
      title: 'Một việc con có thể giúp',
      instructions: 'Con nghe câu hỏi rồi vẽ câu trả lời nhé.',
      band: 'early',
      difficulty: 1,
      estimatedMinutes: 8,
      interestTags: ['helping'],
      layout: 'prompt_card',
    }),
    type: 'reflection',
    response: earlyPhoto,
    payload: {
      theme: 'kindness',
      questions: [
        { id: 'q1', prompt: 'Con có thể giúp một người bằng việc nhỏ nào?', sentenceStarters: [] },
      ],
      conversationStarter: 'Bố mẹ cùng con chọn một việc nhỏ để làm hôm nay nhé.',
    },
  },
  {
    ...envelope({
      id: '41000000-0000-4000-8000-000000000002',
      slug: 'suy-ngam-khi-lam-duoc-viec-kho',
      title: 'Khi con làm được việc khó',
      instructions: 'Con vẽ gương mặt cho cảm xúc của con nhé.',
      band: 'early',
      difficulty: 1,
      estimatedMinutes: 8,
      interestTags: ['drawing'],
      layout: 'prompt_card',
    }),
    type: 'reflection',
    response: earlyPhoto,
    payload: {
      theme: 'feelings',
      questions: [
        {
          id: 'q1',
          prompt: 'Con cảm thấy thế nào khi tự làm được một việc khó?',
          sentenceStarters: [],
        },
      ],
      conversationStarter: 'Bố mẹ hỏi con điều gì đã giúp con cố gắng đến cùng.',
    },
  },
  {
    ...envelope({
      id: '41000000-0000-4000-8000-000000000003',
      slug: 'suy-ngam-dieu-con-muon-kham-pha',
      title: 'Điều con muốn khám phá',
      instructions: 'Con vẽ điều con đang tò mò nhất nhé.',
      band: 'early',
      difficulty: 2,
      estimatedMinutes: 10,
      interestTags: ['nature', 'science'],
      layout: 'prompt_card',
    }),
    type: 'reflection',
    response: earlyPhoto,
    payload: {
      theme: 'curiosity',
      questions: [
        {
          id: 'q1',
          prompt: 'Trong thiên nhiên, con muốn biết thêm điều gì?',
          sentenceStarters: [],
        },
      ],
      conversationStarter: 'Bố mẹ cùng con nghĩ một cách đơn giản để tìm hiểu thêm.',
    },
  },
  {
    ...envelope({
      id: '41000000-0000-4000-8000-000000000004',
      slug: 'suy-ngam-viec-con-tu-nho',
      title: 'Việc con tự nhớ và hoàn thành',
      instructions: 'Con nhớ lại một việc rồi viết ngắn gọn về cách con làm.',
      band: 'lower_primary',
      difficulty: 2,
      estimatedMinutes: 10,
      interestTags: ['helping'],
      layout: 'prompt_card',
    }),
    type: 'reflection',
    response: {
      mode: 'text',
      fields: [{ id: 'q1', label: 'Câu trả lời của con', minWords: 5, maxWords: 30 }],
    },
    payload: {
      theme: 'responsibility',
      questions: [
        {
          id: 'q1',
          prompt: 'Có việc nào con đã tự nhớ và làm xong mà không cần nhắc?',
          sentenceStarters: ['Con đã tự nhớ…', 'Con làm xong bằng cách…'],
        },
      ],
      conversationStarter: 'Bố mẹ ghi nhận việc con đã tự chủ động nhé.',
    },
  },
  {
    ...envelope({
      id: '41000000-0000-4000-8000-000000000005',
      slug: 'suy-ngam-khi-lam-viec-cung-ban',
      title: 'Khi làm việc cùng bạn',
      instructions: 'Con nghĩ về cách hợp tác tốt rồi viết câu trả lời của con.',
      band: 'upper_primary',
      difficulty: 3,
      estimatedMinutes: 12,
      interestTags: ['friends'],
      layout: 'prompt_card',
    }),
    type: 'reflection',
    response: {
      mode: 'text',
      fields: [{ id: 'q1', label: 'Câu trả lời của con', minWords: 15, maxWords: 80 }],
    },
    payload: {
      theme: 'friendship',
      questions: [
        {
          id: 'q1',
          prompt:
            'Khi hai bạn có ý tưởng khác nhau, điều gì giúp cả hai vẫn làm việc tốt cùng nhau?',
          sentenceStarters: ['Con nghĩ điều quan trọng là…'],
        },
        {
          id: 'q2',
          prompt: 'Con có thể làm gì để lắng nghe ý kiến khác với mình?',
          sentenceStarters: ['Con có thể…'],
        },
      ],
      conversationStarter: 'Bố mẹ có thể kể một lần mình đã đổi ý sau khi nghe người khác.',
    },
  },
  {
    ...envelope({
      id: '41000000-0000-4000-8000-000000000006',
      slug: 'suy-ngam-cach-con-quan-ly-viec-can-lam',
      title: 'Cách con quản lý việc cần làm',
      instructions: 'Con chọn một cách sắp xếp phù hợp và giải thích vì sao.',
      band: 'preteen',
      difficulty: 4,
      estimatedMinutes: 15,
      interestTags: ['science'],
      layout: 'prompt_card',
    }),
    type: 'reflection',
    response: {
      mode: 'text',
      fields: [{ id: 'q1', label: 'Cách của con', minWords: 25, maxWords: 140 }],
    },
    payload: {
      theme: 'responsibility',
      questions: [
        {
          id: 'q1',
          prompt: 'Khi có nhiều việc cần hoàn thành, con muốn sắp xếp thứ tự bằng cách nào?',
          sentenceStarters: ['Con sẽ bắt đầu bằng…', 'Con chọn cách này vì…'],
        },
        {
          id: 'q2',
          prompt: 'Dấu hiệu nào cho con biết kế hoạch đang cần điều chỉnh?',
          sentenceStarters: ['Con sẽ điều chỉnh khi…'],
        },
      ],
    },
  },
  {
    ...envelope({
      id: '41000000-0000-4000-8000-000000000007',
      slug: 'suy-ngam-cau-hoi-tot',
      title: 'Thế nào là một câu hỏi tốt?',
      instructions: 'Con nghĩ về việc đặt câu hỏi rồi viết quan điểm của mình.',
      band: 'preteen',
      difficulty: 5,
      estimatedMinutes: 15,
      interestTags: ['science'],
      layout: 'prompt_card',
    }),
    type: 'reflection',
    response: {
      mode: 'text',
      fields: [{ id: 'q1', label: 'Suy nghĩ của con', minWords: 30, maxWords: 150 }],
    },
    payload: {
      theme: 'curiosity',
      questions: [
        {
          id: 'q1',
          prompt: 'Theo con, một câu hỏi tốt cần có đặc điểm gì để giúp mình tìm hiểu sâu hơn?',
          sentenceStarters: ['Một câu hỏi tốt…'],
        },
        {
          id: 'q2',
          prompt: 'Con hãy nêu một câu hỏi mà con muốn tự tìm câu trả lời.',
          sentenceStarters: ['Con muốn tìm hiểu…'],
        },
      ],
      conversationStarter: 'Bố mẹ cùng con thử biến một câu hỏi rộng thành câu hỏi cụ thể hơn.',
    },
  },
];
