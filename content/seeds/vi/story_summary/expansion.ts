import { envelope, storyMetrics, type Seed } from '../_shared';

const e1 = [
  'Lan nhặt ba chiếc lá trong sân.',
  'Một lá vàng, một lá đỏ, một lá xanh.',
  'Lan xếp lá thành hình con cá.',
  'Lan chụp bức tranh để khoe với mẹ.',
];

const e2 = [
  'Bình có ba chiếc xe đồ chơi.',
  'Chơi xong, Bình thấy xe nằm khắp sàn.',
  'Bình đẩy từng xe vào chiếc hộp xanh.',
  'Cuối cùng, góc chơi lại gọn gàng.',
];

const l1 = [
  'Nhóm của Hà muốn làm một cây cầu nhỏ bằng que gỗ.',
  'Lần đầu, các bạn xếp que rời nhau nên cầu dễ nghiêng.',
  'Hà đề nghị ghép que thành từng cụm rồi nối các cụm lại.',
  'Cây cầu mới đứng chắc hơn, và cả nhóm ghi lại cách làm để lần sau nhớ.',
];

const u1 = [
  'Lớp của Minh có một thùng trồng rau nhỏ cạnh cửa sổ.',
  'Tuần đầu, nhóm tưới cùng một lượng nước mỗi ngày nhưng vài cây phát triển chậm.',
  'Các bạn đổi cách theo dõi bằng cách ghi độ ẩm đất trước khi tưới.',
  'Sau một tuần, nhóm nhận ra những ngày đất còn ẩm thì không cần thêm nhiều nước.',
  'Minh đề nghị tiếp tục ghi chép để điều chỉnh thay vì dùng một lịch cố định.',
];

const p1 = [
  'Nhóm nhạc của lớp chuẩn bị một tiết mục ngắn cho buổi sinh hoạt.',
  'Trong lần tập đầu, mọi người chơi đúng phần riêng nhưng vào nhịp chưa đều.',
  'Cả nhóm thu một đoạn tập, nghe lại rồi đánh dấu hai chỗ thường bị lệch.',
  'Lần tập sau, nhóm dành thời gian riêng cho hai đoạn đó trước khi chơi toàn bài.',
  'Cuối buổi, các bạn nhận ra việc nghe lại giúp sửa lỗi cụ thể nhanh hơn.',
];

const p2 = [
  'Nhóm của Khoa muốn làm bản đồ những cây tạo bóng mát trong sân trường.',
  'Mỗi bạn phụ trách một khu vực và ghi loại cây, vị trí tương đối cùng độ rộng bóng mát.',
  'Khi ghép dữ liệu, nhóm phát hiện hai khu vực dùng cách ước lượng khác nhau.',
  'Cả nhóm thống nhất một cách đo đơn giản rồi quay lại kiểm tra những điểm chưa đồng nhất.',
  'Bản đồ cuối cùng dễ so sánh hơn vì mọi dữ liệu được ghi theo cùng một quy ước.',
];

export const summaryExpansionSeeds: Seed[] = [
  {
    ...envelope({ id: '71000000-0000-4000-8000-000000000001', slug: 'tom-tat-ba-chiec-la', title: 'Kể lại: Ba chiếc lá', instructions: 'Con nghe truyện rồi vẽ ba tranh kể lại nhé.', band: 'early', difficulty: 1, estimatedMinutes: 10, interestTags: ['nature', 'drawing'], layout: 'reading' }),
    type: 'story_summary', response: { mode: 'photo', prompt: 'Chụp ba tranh con dùng để kể lại truyện', maxAssets: 1 },
    payload: { story: { title: 'Ba chiếc lá', paragraphs: e1, ...storyMetrics(e1, 'early') }, guidance: { minWords: 5, maxWords: 20, mustMention: ['Lan nhặt ba chiếc lá', 'Lan xếp lá thành hình con cá'], promptHints: ['Đầu tiên Lan làm gì?', 'Sau đó Lan làm gì?'] } },
  },
  {
    ...envelope({ id: '71000000-0000-4000-8000-000000000002', slug: 'tom-tat-xe-do-choi-ve-hop', title: 'Kể lại: Xe đồ chơi về hộp', instructions: 'Con nghe truyện rồi vẽ ba tranh kể lại nhé.', band: 'early', difficulty: 2, estimatedMinutes: 10, interestTags: ['vehicles'], layout: 'reading' }),
    type: 'story_summary', response: { mode: 'photo', prompt: 'Chụp ba tranh con dùng để kể lại truyện', maxAssets: 1 },
    payload: { story: { title: 'Xe đồ chơi về hộp', paragraphs: e2, ...storyMetrics(e2, 'early') }, guidance: { minWords: 5, maxWords: 20, mustMention: ['xe nằm trên sàn', 'Bình cất xe vào hộp'], promptHints: ['Góc chơi lúc đầu ra sao?', 'Bình đã làm gì?'] } },
  },
  {
    ...envelope({ id: '71000000-0000-4000-8000-000000000003', slug: 'tom-tat-cay-cau-que-go', title: 'Tóm tắt: Cây cầu que gỗ', instructions: 'Con đọc truyện rồi tóm tắt vấn đề, cách thử và kết quả.', band: 'lower_primary', difficulty: 3, estimatedMinutes: 12, interestTags: ['building'], layout: 'reading' }),
    type: 'story_summary', response: { mode: 'text', fields: [{ id: 'summary', label: 'Tóm tắt của con', minWords: 15, maxWords: 40 }], allowPhotoInstead: true },
    payload: { story: { title: 'Cây cầu que gỗ', paragraphs: l1, ...storyMetrics(l1, 'lower_primary') }, guidance: { minWords: 15, maxWords: 40, mustMention: ['cầu đầu dễ nghiêng', 'ghép que thành cụm', 'cầu mới chắc hơn'], promptHints: ['Nhóm gặp vấn đề gì?', 'Hà đề nghị thay đổi điều gì?', 'Kết quả ra sao?'] } },
  },
  {
    ...envelope({ id: '71000000-0000-4000-8000-000000000004', slug: 'tom-tat-ke-hoach-tuoi-rau', title: 'Tóm tắt: Kế hoạch tưới rau', instructions: 'Con đọc truyện rồi tóm tắt cách nhóm thay đổi kế hoạch.', band: 'upper_primary', difficulty: 3, estimatedMinutes: 15, interestTags: ['plants', 'science'], layout: 'reading' }),
    type: 'story_summary', response: { mode: 'text', fields: [{ id: 'summary', label: 'Tóm tắt của con', minWords: 25, maxWords: 80 }], allowPhotoInstead: true },
    payload: { story: { title: 'Kế hoạch tưới rau', paragraphs: u1, ...storyMetrics(u1, 'upper_primary') }, guidance: { minWords: 25, maxWords: 80, mustMention: ['một số cây phát triển chậm', 'nhóm kiểm tra độ ẩm', 'nhóm điều chỉnh lượng nước'], promptHints: ['Cách cũ có vấn đề gì?', 'Nhóm bắt đầu theo dõi điều gì?', 'Minh đề nghị tiếp tục ra sao?'] } },
  },
  {
    ...envelope({ id: '71000000-0000-4000-8000-000000000005', slug: 'tom-tat-buoi-tap-dan-nhac', title: 'Tóm tắt: Buổi tập dàn nhạc', instructions: 'Con tóm tắt vấn đề của nhóm, cách sửa và điều họ học được.', band: 'preteen', difficulty: 4, estimatedMinutes: 18, interestTags: ['music', 'friends'], layout: 'reading' }),
    type: 'story_summary', response: { mode: 'text', fields: [{ id: 'summary', label: 'Tóm tắt của con', minWords: 35, maxWords: 120 }], allowPhotoInstead: true },
    payload: { story: { title: 'Buổi tập dàn nhạc', paragraphs: p1, ...storyMetrics(p1, 'preteen') }, guidance: { minWords: 35, maxWords: 120, mustMention: ['nhóm vào nhịp chưa đều', 'nghe lại đoạn thu', 'luyện riêng chỗ bị lệch'], promptHints: ['Vấn đề xuất hiện ở lần tập đầu thế nào?', 'Nhóm dùng thông tin gì để sửa?', 'Cách mới hiệu quả vì sao?'] } },
  },
  {
    ...envelope({ id: '71000000-0000-4000-8000-000000000006', slug: 'tom-tat-ban-do-cay-xanh', title: 'Tóm tắt: Bản đồ cây xanh', instructions: 'Con tóm tắt vì sao nhóm phải thống nhất cách thu thập dữ liệu.', band: 'preteen', difficulty: 5, estimatedMinutes: 18, interestTags: ['nature', 'science'], layout: 'reading' }),
    type: 'story_summary', response: { mode: 'text', fields: [{ id: 'summary', label: 'Tóm tắt của con', minWords: 40, maxWords: 150 }], allowPhotoInstead: true },
    payload: { story: { title: 'Bản đồ cây xanh', paragraphs: p2, ...storyMetrics(p2, 'preteen') }, guidance: { minWords: 40, maxWords: 150, mustMention: ['các khu dùng cách ước lượng khác nhau', 'nhóm thống nhất một cách đo', 'dữ liệu cuối dễ so sánh hơn'], promptHints: ['Nhóm phát hiện điểm chưa đồng nhất nào?', 'Họ sửa bằng cách nào?', 'Quy ước chung giúp ích gì?'] } },
  },
];
