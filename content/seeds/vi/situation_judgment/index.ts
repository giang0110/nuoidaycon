import { envelope, type Seed } from '../_shared';

/**
 * The highest-risk activity type, with the strictest rules (CHILD_SAFETY.md §5.6).
 *
 * Every scenario here is EVERYDAY and CHILD-SOLVABLE. None depicts abuse,
 * grooming, strangers offering lifts, or any situation whose correct
 * resolution is adult intervention — danger is not a puzzle for a child.
 *
 * `trustedAdultPath` is required by the schema, so telling a trusted adult is
 * always present and always a valid answer. No option frames asking for help
 * as the wrong choice, and feedback on a weaker option explains the
 * consequence without shaming the child for picking it.
 */
export const situationSeeds: Seed[] = [
  {
    ...envelope({
      id: '50000000-0000-4000-8000-000000000001',
      slug: 'tinh-huong-ban-moi-ngoi-mot-minh',
      title: 'Bạn mới ngồi một mình',
      instructions:
        'Con đọc tình huống rồi chọn cách con sẽ làm. Sau đó viết thêm suy nghĩ của con nhé.',
      band: 'lower_primary',
      difficulty: 1,
      estimatedMinutes: 10,
      interestTags: ['friends'],
      layout: 'prompt_card',
    }),
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
          feedback: 'Rủ bạn cùng chơi là cách rất ấm áp để bạn thấy mình được chào đón.',
        },
        {
          id: 'b',
          text: 'Hỏi bạn có muốn chơi cùng không',
          isConstructive: true,
          feedback: 'Hỏi trước là rất tinh tế. Có bạn cần thêm chút thời gian mới sẵn sàng.',
        },
        {
          id: 'c',
          text: 'Đi chơi tiếp, không để ý',
          isConstructive: false,
          feedback: 'Bạn ấy có thể vẫn thấy lạc lõng. Con thử nghĩ xem có cách nào khác không nhé.',
        },
      ],
      trustedAdultPath: {
        present: true,
        text: 'Con cũng có thể kể với cô giáo để cô giúp bạn làm quen với lớp.',
      },
      followUp: 'Con nghĩ bạn ấy sẽ cảm thấy thế nào?',
    },
  },
  {
    ...envelope({
      id: '50000000-0000-4000-8000-000000000002',
      slug: 'tinh-huong-lam-vo-do-cua-em',
      title: 'Con làm vỡ đồ của em',
      instructions:
        'Con đọc tình huống rồi chọn cách con sẽ làm. Sau đó viết thêm suy nghĩ của con nhé.',
      band: 'lower_primary',
      difficulty: 2,
      estimatedMinutes: 10,
      interestTags: ['family'],
      layout: 'prompt_card',
    }),
    type: 'situation_judgment',
    response: { mode: 'mixed', parts: ['choice', 'text'], maxAssets: 0 },
    payload: {
      scenario:
        'Con đang chơi thì vô tình làm gãy món đồ chơi của em. Em chưa biết. Con thấy hơi lo.',
      question: 'Nếu là con, con sẽ làm gì?',
      mode: 'guided',
      options: [
        {
          id: 'a',
          text: 'Nói thật với em và xin lỗi',
          isConstructive: true,
          feedback: 'Nói thật ngay thường là cách nhanh nhất để mọi chuyện ổn trở lại.',
        },
        {
          id: 'b',
          text: 'Kể với bố mẹ rồi cùng nói với em',
          isConstructive: true,
          feedback: 'Nhờ bố mẹ giúp là hoàn toàn ổn. Người lớn có thể giúp con nói cho dễ hơn.',
        },
        {
          id: 'c',
          text: 'Cất đi và không nói gì',
          isConstructive: false,
          feedback: 'Giấu đi thường làm con thấy nặng lòng hơn, và em sẽ buồn hơn khi biết muộn.',
        },
      ],
      trustedAdultPath: {
        present: true,
        text: 'Con luôn có thể kể với bố mẹ trước, rồi cùng nghĩ cách nói với em.',
      },
    },
  },
  {
    ...envelope({
      id: '50000000-0000-4000-8000-000000000003',
      slug: 'tinh-huong-nhat-duoc-do-cua-ban',
      title: 'Con nhặt được đồ của bạn',
      instructions:
        'Con đọc tình huống rồi chọn cách con sẽ làm. Sau đó viết thêm suy nghĩ của con nhé.',
      band: 'upper_primary',
      difficulty: 2,
      estimatedMinutes: 12,
      layout: 'prompt_card',
    }),
    type: 'situation_judgment',
    response: { mode: 'mixed', parts: ['choice', 'text'], maxAssets: 0 },
    payload: {
      scenario:
        'Con nhặt được một chiếc bút rất đẹp ở sân trường. Con đoán là của một bạn trong lớp, nhưng không chắc là của ai. Con cũng đang rất thích chiếc bút đó.',
      question: 'Nếu là con, con sẽ làm gì?',
      mode: 'guided',
      options: [
        {
          id: 'a',
          text: 'Đưa cho cô giáo để cô trả lại bạn',
          isConstructive: true,
          feedback: 'Đưa cho cô là cách chắc chắn nhất để bút về đúng chủ của nó.',
        },
        {
          id: 'b',
          text: 'Hỏi cả lớp xem bút của ai',
          isConstructive: true,
          feedback: 'Hỏi cả lớp cũng rất tốt. Nếu không ai nhận, con vẫn có thể nhờ cô giúp.',
        },
        {
          id: 'c',
          text: 'Giữ lại vì mình nhặt được',
          isConstructive: false,
          feedback:
            'Bạn làm mất bút chắc đang rất tiếc. Con thử nghĩ nếu là con mất bút thì sao nhé.',
        },
      ],
      trustedAdultPath: {
        present: true,
        text: 'Con có thể nhờ cô giáo hoặc bố mẹ giúp tìm chủ nhân của chiếc bút.',
      },
      followUp: 'Nếu con là bạn làm mất bút, con mong điều gì xảy ra?',
    },
  },
  {
    ...envelope({
      id: '50000000-0000-4000-8000-000000000004',
      slug: 'tinh-huong-bi-do-loi-oan',
      title: 'Con bị đổ lỗi oan',
      instructions: 'Con đọc tình huống rồi viết cách con sẽ xử lý nhé.',
      band: 'preteen',
      difficulty: 4,
      estimatedMinutes: 15,
      layout: 'prompt_card',
    }),
    type: 'situation_judgment',
    response: {
      mode: 'text',
      fields: [{ id: 'answer', label: 'Con sẽ làm gì?', minWords: 20, maxWords: 150 }],
    },
    payload: {
      scenario:
        'Trong lớp có bạn làm đổ nước ra bàn. Một bạn khác nói là con làm. Con không làm việc đó. Con thấy vừa bực vừa ngại vì cả lớp đang nhìn.',
      question: 'Nếu là con, con sẽ làm gì trong lúc đó?',
      mode: 'open',
      trustedAdultPath: {
        present: true,
        text: 'Nếu con thấy khó nói ngay lúc đó, con hoàn toàn có thể gặp riêng cô giáo sau.',
      },
      followUp: 'Con nghĩ vì sao bạn ấy lại nói như vậy?',
    },
  },
];
