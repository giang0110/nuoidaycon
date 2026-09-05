import { envelope, type Seed } from '../_shared';

const photoResponse = { mode: 'photo' as const, prompt: 'Chụp bức tranh của con', maxAssets: 1 };

export const drawingExpansionSeeds: Seed[] = [
  {
    ...envelope({
      id: '31000000-0000-4000-8000-000000000001',
      slug: 've-doan-tau-hinh-khoi',
      title: 'Vẽ đoàn tàu hình khối',
      instructions: 'Con dùng các hình đơn giản để vẽ một đoàn tàu nhé.',
      band: 'early',
      difficulty: 1,
      estimatedMinutes: 15,
      interestTags: ['vehicles', 'drawing'],
      layout: 'prompt_card',
    }),
    type: 'drawing_prompt',
    response: photoResponse,
    payload: {
      prompt: 'Con vẽ một đoàn tàu bằng hình tròn, hình vuông và hình chữ nhật.',
      checklist: ['Vẽ đầu tàu', 'Vẽ ít nhất hai toa', 'Tô màu các toa'],
      suggestedMedium: ['crayon', 'marker'],
      openEnded: true,
    },
  },
  {
    ...envelope({
      id: '31000000-0000-4000-8000-000000000002',
      slug: 've-ngoi-nha-tuong-lai',
      title: 'Vẽ ngôi nhà tương lai',
      instructions: 'Con vẽ một ngôi nhà mới lạ và ghi chú ba phần.',
      band: 'lower_primary',
      difficulty: 2,
      estimatedMinutes: 18,
      interestTags: ['building', 'drawing'],
      layout: 'prompt_card',
    }),
    type: 'drawing_prompt',
    response: photoResponse,
    payload: {
      prompt:
        'Con tưởng tượng một ngôi nhà trong tương lai. Hãy vẽ ba chi tiết khiến ngôi nhà đặc biệt.',
      checklist: ['Vẽ toàn bộ ngôi nhà', 'Thêm ba chi tiết mới lạ', 'Ghi tên ba chi tiết'],
      suggestedMedium: ['pencil', 'marker'],
      warmUp: 'Ngôi nhà có thể tiết kiệm chỗ, đón ánh sáng hoặc trồng nhiều cây.',
      openEnded: true,
    },
  },
  {
    ...envelope({
      id: '31000000-0000-4000-8000-000000000003',
      slug: 've-tram-quan-sat-vu-tru',
      title: 'Vẽ trạm quan sát vũ trụ',
      instructions: 'Con thiết kế một trạm quan sát và giải thích các khu vực.',
      band: 'upper_primary',
      difficulty: 2,
      estimatedMinutes: 20,
      interestTags: ['space', 'science'],
      layout: 'prompt_card',
    }),
    type: 'drawing_prompt',
    response: photoResponse,
    payload: {
      prompt:
        'Con vẽ một trạm quan sát bầu trời. Hãy thể hiện nơi quan sát, nơi làm việc và khu nghỉ.',
      checklist: ['Có khu quan sát', 'Có khu làm việc', 'Có lối đi rõ ràng'],
      suggestedMedium: ['pencil', 'marker'],
      openEnded: true,
    },
  },
  {
    ...envelope({
      id: '31000000-0000-4000-8000-000000000004',
      slug: 've-the-gioi-duoi-dai-duong',
      title: 'Vẽ thế giới dưới đại dương',
      instructions: 'Con tạo một cảnh dưới biển có nhiều tầng và sinh vật.',
      band: 'upper_primary',
      difficulty: 3,
      estimatedMinutes: 20,
      interestTags: ['ocean', 'animals'],
      layout: 'prompt_card',
    }),
    type: 'drawing_prompt',
    response: photoResponse,
    payload: {
      prompt:
        'Con vẽ cảnh dưới đại dương từ gần mặt nước xuống đáy. Mỗi tầng có chi tiết khác nhau.',
      checklist: ['Thể hiện mặt nước', 'Có ít nhất ba sinh vật', 'Có chi tiết ở đáy biển'],
      suggestedMedium: ['watercolour', 'crayon'],
      warmUp: 'Con nghĩ ánh sáng thay đổi thế nào khi xuống sâu hơn?',
      openEnded: true,
    },
  },
  {
    ...envelope({
      id: '31000000-0000-4000-8000-000000000005',
      slug: 've-le-hoi-trong-khu-pho',
      title: 'Vẽ lễ hội trong khu phố',
      instructions: 'Con vẽ một lễ hội vui và sắp xếp nhiều hoạt động rõ ràng.',
      band: 'upper_primary',
      difficulty: 4,
      estimatedMinutes: 22,
      interestTags: ['festivals', 'music'],
      layout: 'prompt_card',
    }),
    type: 'drawing_prompt',
    response: photoResponse,
    payload: {
      prompt:
        'Con thiết kế một lễ hội trong khu phố. Hãy vẽ sân khấu, khu trò chơi và nơi nghỉ chân.',
      checklist: ['Có sân khấu', 'Có khu trò chơi', 'Có lối đi giữa các khu'],
      suggestedMedium: ['marker', 'collage'],
      openEnded: true,
    },
  },
  {
    ...envelope({
      id: '31000000-0000-4000-8000-000000000006',
      slug: 've-ban-do-hanh-trinh-tuong-tuong',
      title: 'Vẽ bản đồ hành trình tưởng tượng',
      instructions: 'Con tạo một bản đồ dễ đọc cho chuyến đi tưởng tượng.',
      band: 'preteen',
      difficulty: 3,
      estimatedMinutes: 20,
      interestTags: ['travel'],
      layout: 'prompt_card',
    }),
    type: 'drawing_prompt',
    response: photoResponse,
    payload: {
      prompt:
        'Con vẽ bản đồ một hành trình tưởng tượng. Dùng ký hiệu cho điểm bắt đầu, ba điểm dừng và đích đến.',
      checklist: ['Có điểm bắt đầu', 'Có ba điểm dừng', 'Có chú giải ký hiệu', 'Có đích đến'],
      suggestedMedium: ['pencil', 'marker'],
      openEnded: true,
    },
  },
  {
    ...envelope({
      id: '31000000-0000-4000-8000-000000000007',
      slug: 'thiet-ke-goc-hoc-tap-gon-gang',
      title: 'Thiết kế góc học tập gọn gàng',
      instructions: 'Con phác thảo một góc học tập và giải thích cách sắp xếp.',
      band: 'preteen',
      difficulty: 4,
      estimatedMinutes: 22,
      interestTags: ['building'],
      layout: 'prompt_card',
    }),
    type: 'drawing_prompt',
    response: photoResponse,
    payload: {
      prompt:
        'Con thiết kế một góc học tập nhỏ. Hãy bố trí bàn, ánh sáng, sách và đồ dùng sao cho dễ sử dụng.',
      checklist: ['Có bàn và ghế', 'Có nguồn sáng', 'Có chỗ để sách', 'Có khoảng trống làm việc'],
      suggestedMedium: ['pencil', 'marker'],
      warmUp: 'Ưu tiên thứ con dùng thường xuyên ở vị trí dễ lấy.',
      openEnded: true,
    },
  },
  {
    ...envelope({
      id: '31000000-0000-4000-8000-000000000008',
      slug: 'minh-hoa-y-tuong-khoa-hoc',
      title: 'Minh họa một ý tưởng khoa học',
      instructions: 'Con chọn một hiện tượng và minh họa bằng hình cùng mũi tên.',
      band: 'preteen',
      difficulty: 5,
      estimatedMinutes: 25,
      interestTags: ['science', 'weather'],
      layout: 'prompt_card',
    }),
    type: 'drawing_prompt',
    response: photoResponse,
    payload: {
      prompt:
        'Con minh họa cách mây tạo mưa hoặc cách nước thay đổi trạng thái. Dùng mũi tên để chỉ trình tự.',
      checklist: ['Có ít nhất ba bước', 'Có mũi tên chỉ thứ tự', 'Có nhãn ngắn cho từng bước'],
      suggestedMedium: ['pencil', 'marker'],
      openEnded: true,
    },
  },
];
