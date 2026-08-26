import { envelope, storyMetrics, type Seed } from '../_shared';

/**
 * ORIGINAL stories, written for this product. No commercial book text, no
 * textbook extract, no in-copyright story (CHILD_SAFETY.md §5.4).
 *
 * Every question is answerable from the story text alone — no outside
 * knowledge required.
 */

const s1 = [
  'Mèo Mun sống ở một ngôi nhà nhỏ có sân gạch đỏ.',
  'Mỗi sáng, Mun ra sân nằm phơi nắng. Nắng ấm làm bộ lông đen của Mun bóng lên.',
  'Một hôm trời mưa. Mun ngồi bên cửa sổ nhìn ra sân ướt. Mun thấy hơi buồn.',
  'Bà chủ nhà đặt cạnh Mun một cái chăn nhỏ. Mun cuộn tròn trong chăn và ngủ ngon lành.',
];

const s2 = [
  'Ở cuối con ngõ có một cây bàng già. Lá bàng rộng như bàn tay.',
  'Mùa hè, bọn trẻ trong ngõ ra ngồi dưới gốc bàng chơi ô ăn quan.',
  'Mùa đông, lá bàng đỏ rực rồi rụng đầy mặt đất. Cây trơ cành, trông như đang ngủ.',
  'Đến mùa xuân, những chồi non bé xíu lại nhú ra. Bọn trẻ biết mùa hè sắp quay lại.',
];

const s3 = [
  'Linh có một chiếc hộp bút cũ mà bà tặng từ hồi lớp một.',
  'Chiếc hộp đã sờn góc, khoá cũng hơi khó bấm. Bạn cùng bàn hỏi sao Linh không mua hộp mới.',
  'Linh kể rằng bà đã đi bộ rất xa để mua chiếc hộp ấy, vì bà biết Linh thích màu xanh.',
  'Nghe xong, bạn cùng bàn ngồi im một lúc. Rồi bạn nói rằng chiếc hộp của Linh đẹp thật.',
];

export const comprehensionSeeds: Seed[] = [
  {
    ...envelope({
      id: '60000000-0000-4000-8000-000000000001',
      slug: 'doc-hieu-meo-mun',
      title: 'Đọc hiểu: Mèo Mun',
      instructions: 'Con đọc truyện thật kỹ, rồi trả lời các câu hỏi bên dưới nhé.',
      band: 'lower_primary',
      difficulty: 1,
      estimatedMinutes: 12,
      interestTags: ['animals'],
      layout: 'reading',
    }),
    type: 'story_comprehension',
    response: { mode: 'mixed', parts: ['choice', 'text'], maxAssets: 0 },
    payload: {
      story: { title: 'Mèo Mun', paragraphs: s1, ...storyMetrics(s1, 'lower_primary') },
      questions: [
        {
          kind: 'multiple_choice',
          id: 'q1',
          prompt: 'Mỗi sáng Mun thường làm gì?',
          choices: [
            { id: 'a', text: 'Ra sân nằm phơi nắng' },
            { id: 'b', text: 'Trèo lên cây' },
            { id: 'c', text: 'Đi chơi xa' },
          ],
          answerKey: 'a',
          rationale: 'Đoạn hai nói rõ mỗi sáng Mun ra sân nằm phơi nắng.',
        },
        {
          kind: 'multiple_choice',
          id: 'q2',
          prompt: 'Vì sao hôm đó Mun thấy hơi buồn?',
          choices: [
            { id: 'a', text: 'Vì trời mưa nên không ra sân được' },
            { id: 'b', text: 'Vì Mun bị đói' },
            { id: 'c', text: 'Vì Mun bị lạc đường' },
          ],
          answerKey: 'a',
          rationale: 'Đoạn ba kể trời mưa, Mun ngồi nhìn ra sân ướt và thấy hơi buồn.',
        },
        {
          kind: 'short_text',
          id: 'q3',
          prompt: 'Bà chủ nhà đã làm gì cho Mun?',
          exemplarAnswer: 'Bà đặt cạnh Mun một cái chăn nhỏ.',
          maxWords: 25,
        },
      ],
    },
  },
  {
    ...envelope({
      id: '60000000-0000-4000-8000-000000000002',
      slug: 'doc-hieu-cay-bang-cuoi-ngo',
      title: 'Đọc hiểu: Cây bàng cuối ngõ',
      instructions: 'Con đọc truyện, rồi trả lời các câu hỏi bên dưới nhé.',
      band: 'upper_primary',
      difficulty: 2,
      estimatedMinutes: 15,
      interestTags: ['nature', 'plants'],
      layout: 'reading',
    }),
    type: 'story_comprehension',
    response: { mode: 'mixed', parts: ['choice', 'text'], maxAssets: 0 },
    payload: {
      story: { title: 'Cây bàng cuối ngõ', paragraphs: s2, ...storyMetrics(s2, 'upper_primary') },
      questions: [
        {
          kind: 'multiple_choice',
          id: 'q1',
          prompt: 'Mùa hè, bọn trẻ làm gì dưới gốc bàng?',
          choices: [
            { id: 'a', text: 'Chơi ô ăn quan' },
            { id: 'b', text: 'Học bài' },
            { id: 'c', text: 'Trèo lên cây hái quả' },
          ],
          answerKey: 'a',
          rationale: 'Đoạn hai kể bọn trẻ ngồi dưới gốc bàng chơi ô ăn quan.',
        },
        {
          kind: 'multiple_choice',
          id: 'q2',
          prompt: 'Vì sao bọn trẻ biết mùa hè sắp quay lại?',
          choices: [
            { id: 'a', text: 'Vì những chồi non bắt đầu nhú ra' },
            { id: 'b', text: 'Vì lá bàng đỏ rực' },
            { id: 'c', text: 'Vì cây bàng trơ cành' },
          ],
          answerKey: 'a',
          rationale: 'Đoạn cuối nói mùa xuân chồi non nhú ra, và bọn trẻ biết mùa hè sắp tới.',
        },
        {
          kind: 'short_text',
          id: 'q3',
          prompt: 'Vào mùa đông, cây bàng trông như thế nào?',
          exemplarAnswer: 'Lá đỏ rực rồi rụng hết, cây trơ cành như đang ngủ.',
          maxWords: 40,
        },
      ],
    },
  },
  {
    ...envelope({
      id: '60000000-0000-4000-8000-000000000003',
      slug: 'doc-hieu-chiec-hop-but-cu',
      title: 'Đọc hiểu: Chiếc hộp bút cũ',
      instructions: 'Con đọc truyện, rồi trả lời các câu hỏi bên dưới nhé.',
      parentNote: 'Câu hỏi cuối không có đáp án đúng duy nhất — bố mẹ nghe con giải thích nhé.',
      band: 'preteen',
      difficulty: 3,
      estimatedMinutes: 18,
      interestTags: ['family', 'friends'],
      layout: 'reading',
    }),
    type: 'story_comprehension',
    response: { mode: 'mixed', parts: ['choice', 'text'], maxAssets: 0 },
    payload: {
      story: { title: 'Chiếc hộp bút cũ', paragraphs: s3, ...storyMetrics(s3, 'preteen') },
      questions: [
        {
          kind: 'multiple_choice',
          id: 'q1',
          prompt: 'Chiếc hộp bút của Linh có gì đặc biệt?',
          choices: [
            { id: 'a', text: 'Là quà bà tặng từ hồi lớp một' },
            { id: 'b', text: 'Là chiếc hộp đắt tiền nhất lớp' },
            { id: 'c', text: 'Là hộp Linh tự làm' },
          ],
          answerKey: 'a',
          rationale: 'Câu đầu tiên cho biết đó là quà bà tặng từ hồi lớp một.',
        },
        {
          kind: 'multiple_choice',
          id: 'q2',
          prompt: 'Vì sao bà chọn chiếc hộp màu xanh?',
          choices: [
            { id: 'a', text: 'Vì bà biết Linh thích màu xanh' },
            { id: 'b', text: 'Vì chỉ còn màu xanh' },
            { id: 'c', text: 'Vì màu xanh rẻ hơn' },
          ],
          answerKey: 'a',
          rationale: 'Đoạn ba nói bà biết Linh thích màu xanh.',
        },
        {
          kind: 'short_text',
          id: 'q3',
          prompt: 'Vì sao sau khi nghe Linh kể, bạn cùng bàn lại thấy chiếc hộp đẹp?',
          exemplarAnswer:
            'Vì bạn hiểu chiếc hộp mang một câu chuyện và tình cảm của bà, chứ không chỉ là đồ cũ.',
          maxWords: 60,
        },
      ],
    },
  },
];
