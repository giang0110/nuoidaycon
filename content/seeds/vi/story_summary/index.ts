import { envelope, storyMetrics, type Seed } from '../_shared';

/** ORIGINAL stories written for this product. */

const t1 = [
  'Cu Tí được mẹ giao tưới cây trước nhà mỗi chiều.',
  'Mấy hôm đầu Tí tưới rất chăm. Sau đó Tí mải chơi và quên mất.',
  'Một chiều, Tí thấy cây héo rũ, lá vàng đi. Tí thấy tiếc quá.',
  'Từ hôm đó, Tí đặt một hòn sỏi lên bậc cửa. Hòn sỏi nhắc Tí nhớ tưới cây.',
];

const t2 = [
  'Lớp của Mai chuẩn bị làm báo tường. Nhóm có bốn bạn. Ai cũng muốn vẽ ở giữa tờ giấy.',
  'Cãi nhau một lúc, chẳng ai vẽ được gì. Thời gian thì sắp hết.',
  'Mai đề nghị chia tờ giấy thành bốn phần, mỗi bạn một góc. Ở giữa cả nhóm vẽ chung một khung.',
  'Cuối buổi, tờ báo tường xong đúng giờ. Nhóm Mai thấy phần khung chung là đẹp nhất.',
];

export const summarySeeds: Seed[] = [
  {
    ...envelope({
      id: '70000000-0000-4000-8000-000000000001',
      slug: 'tom-tat-cu-ti-tuoi-cay',
      title: 'Tóm tắt: Cu Tí tưới cây',
      instructions: 'Con đọc truyện, rồi kể lại thật ngắn gọn bằng lời của con nhé.',
      band: 'lower_primary',
      difficulty: 2,
      estimatedMinutes: 12,
      interestTags: ['plants', 'responsibility'],
      layout: 'reading',
    }),
    type: 'story_summary',
    response: {
      mode: 'text',
      fields: [{ id: 'summary', label: 'Tóm tắt của con', minWords: 10, maxWords: 40 }],
      allowPhotoInstead: true,
    },
    payload: {
      story: { title: 'Cu Tí tưới cây', paragraphs: t1, ...storyMetrics(t1, 'lower_primary') },
      guidance: {
        minWords: 10,
        maxWords: 40,
        mustMention: ['Tí quên tưới cây', 'cây héo', 'Tí tìm cách nhớ'],
        promptHints: ['Ai là nhân vật chính?', 'Chuyện gì đã xảy ra?', 'Cuối cùng thế nào?'],
      },
    },
  },
  {
    ...envelope({
      id: '70000000-0000-4000-8000-000000000002',
      slug: 'tom-tat-to-bao-tuong',
      title: 'Tóm tắt: Tờ báo tường',
      instructions: 'Con đọc truyện, rồi kể lại thật ngắn gọn bằng lời của con nhé.',
      band: 'upper_primary',
      difficulty: 3,
      estimatedMinutes: 15,
      interestTags: ['friends', 'drawing'],
      layout: 'reading',
    }),
    type: 'story_summary',
    response: {
      mode: 'text',
      fields: [{ id: 'summary', label: 'Tóm tắt của con', minWords: 20, maxWords: 90 }],
      allowPhotoInstead: true,
    },
    payload: {
      story: { title: 'Tờ báo tường', paragraphs: t2, ...storyMetrics(t2, 'upper_primary') },
      guidance: {
        minWords: 20,
        maxWords: 90,
        mustMention: ['cả nhóm tranh chỗ vẽ', 'Mai nghĩ ra cách chia giấy', 'làm xong đúng giờ'],
        promptHints: ['Nhóm gặp khó khăn gì?', 'Ai đã nghĩ ra cách giải quyết?', 'Kết quả ra sao?'],
      },
    },
  },
];
