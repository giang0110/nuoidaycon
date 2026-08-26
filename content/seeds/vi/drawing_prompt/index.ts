import { envelope, type Seed } from '../_shared';

const photoResponse = { mode: 'photo' as const, prompt: 'Chụp bức tranh của con', maxAssets: 1 };

export const drawingSeeds: Seed[] = [
  {
    ...envelope({
      id: '30000000-0000-4000-8000-000000000001',
      slug: 've-khu-vuon-cua-con',
      title: 'Vẽ khu vườn của con',
      instructions: 'Con hãy vẽ một khu vườn mà con muốn có. Trong vườn có gì cũng được nhé.',
      band: 'early',
      difficulty: 1,
      estimatedMinutes: 15,
      interestTags: ['nature', 'plants'],
      layout: 'prompt_card',
    }),
    type: 'drawing_prompt',
    response: photoResponse,
    payload: {
      prompt: 'Con hãy vẽ một khu vườn mà con thích, có cây và có ít nhất hai con vật nhỏ.',
      checklist: ['Vẽ ít nhất một cái cây', 'Vẽ hai con vật nhỏ', 'Tô màu cho bức tranh'],
      suggestedMedium: ['crayon', 'pencil'],
      openEnded: true,
    },
  },
  {
    ...envelope({
      id: '30000000-0000-4000-8000-000000000002',
      slug: 've-mon-an-con-thich',
      title: 'Vẽ món ăn con thích',
      instructions: 'Con vẽ món ăn con thích nhất. Rồi con vẽ thêm cái đĩa nhé.',
      band: 'early',
      difficulty: 2,
      estimatedMinutes: 15,
      interestTags: ['cooking'],
      layout: 'prompt_card',
    }),
    type: 'drawing_prompt',
    response: photoResponse,
    payload: {
      prompt: 'Con vẽ món ăn con thích nhất, đặt trên đĩa. Vẽ thêm một món ăn kèm nhé.',
      checklist: ['Vẽ món ăn', 'Vẽ cái đĩa', 'Vẽ thêm một món ăn kèm'],
      suggestedMedium: ['crayon', 'marker'],
      openEnded: true,
    },
  },
  {
    ...envelope({
      id: '30000000-0000-4000-8000-000000000003',
      slug: 've-con-vat-tuong-tuong',
      title: 'Vẽ con vật tưởng tượng',
      instructions: 'Con nghĩ ra một con vật chưa từng có. Rồi con vẽ và đặt tên cho nó.',
      parentNote: 'Không có đáp án đúng. Bố mẹ hỏi con vì sao con vật ấy trông như vậy nhé.',
      band: 'lower_primary',
      difficulty: 2,
      estimatedMinutes: 18,
      interestTags: ['animals', 'drawing'],
      layout: 'prompt_card',
    }),
    type: 'drawing_prompt',
    response: photoResponse,
    payload: {
      prompt:
        'Con tưởng tượng một con vật chưa từng có. Con vẽ nó ra và đặt tên. Rồi vẽ nơi nó sống.',
      checklist: ['Vẽ con vật', 'Đặt tên cho nó', 'Vẽ nơi nó sống'],
      warmUp: 'Nó có mấy chân? Nó ăn gì? Nó thích trời nắng hay trời mưa?',
      suggestedMedium: ['pencil', 'crayon', 'marker'],
      openEnded: true,
    },
  },
  {
    ...envelope({
      id: '30000000-0000-4000-8000-000000000004',
      slug: 've-mot-ngay-mua',
      title: 'Vẽ một ngày mưa',
      instructions: 'Con vẽ một ngày trời mưa. Vẽ cả những việc mọi người đang làm nhé.',
      band: 'lower_primary',
      difficulty: 3,
      estimatedMinutes: 18,
      interestTags: ['weather', 'drawing'],
      layout: 'prompt_card',
    }),
    type: 'drawing_prompt',
    response: photoResponse,
    payload: {
      prompt: 'Con vẽ một ngày trời mưa. Trong tranh có ít nhất ba thứ cho thấy trời mưa to.',
      checklist: ['Vẽ trời mưa', 'Vẽ ba dấu hiệu trời mưa', 'Vẽ một người đang làm gì đó'],
      suggestedMedium: ['watercolour', 'crayon'],
      openEnded: true,
    },
  },
];
