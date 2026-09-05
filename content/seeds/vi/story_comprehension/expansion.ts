import { envelope, storyMetrics, type Seed } from '../_shared';

const e1 = [
  'Mai đặt một hạt đậu vào cốc đất nhỏ.',
  'Mỗi sáng, Mai tưới một ít nước.',
  'Ba ngày sau, một mầm xanh nhú lên.',
  'Mai đặt cốc gần cửa sổ có nắng.',
];

const e2 = [
  'Nam gấp một chiếc thuyền giấy màu vàng.',
  'Nam đặt thuyền vào chậu nước.',
  'Nam thổi nhẹ và thuyền trôi sang bên kia.',
  'Nam đổi hướng thổi và thử lại.',
];

const l1 = [
  'Chiều thứ bảy, An cùng bố làm bánh chuối ở nhà.',
  'An cân bột, nghiền chuối rồi trộn mọi thứ trong một chiếc bát lớn.',
  'Mẻ đầu hơi dày vì An đổ quá nhiều bột vào khuôn.',
  'Mẻ sau, An dùng thìa đong từng phần bằng nhau nên bánh chín đều hơn.',
];

const u1 = [
  'Lớp của Huy làm một bảng quan sát mây trong năm ngày.',
  'Mỗi buổi sáng, nhóm ghi hình dạng mây và mức độ sáng của bầu trời.',
  'Ngày đầu trời trong, còn ngày thứ ba có nhiều mây xám hơn.',
  'Khi so các ghi chép, Huy nhận ra chỉ một lần quan sát chưa đủ để thấy xu hướng.',
];

const p1 = [
  'Nhóm của Vy muốn tìm tuyến đi bộ dễ chịu quanh công viên để giới thiệu trong giờ học.',
  'Mỗi bạn đề xuất một lộ trình, nhưng các tuyến có độ dài và số điểm nghỉ khác nhau.',
  'Cả nhóm thống nhất dùng ba tiêu chí: quãng đường, bóng mát và số ghế nghỉ.',
  'Sau khi chấm từng tuyến theo cùng tiêu chí, nhóm chọn được phương án phù hợp nhất.',
  'Vy ghi lại cả phương án đứng thứ hai để dùng khi lối chính đông người.',
];

export const comprehensionExpansionSeeds: Seed[] = [
  {
    ...envelope({ id: '61000000-0000-4000-8000-000000000001', slug: 'doc-hieu-hat-dau-thuc-day', title: 'Đọc hiểu: Hạt đậu thức dậy', instructions: 'Con nghe truyện rồi chọn câu trả lời đúng nhé.', band: 'early', difficulty: 1, estimatedMinutes: 8, interestTags: ['plants', 'nature'], layout: 'reading' }),
    type: 'story_comprehension', response: { mode: 'choice', autoScored: true },
    payload: { story: { title: 'Hạt đậu thức dậy', paragraphs: e1, ...storyMetrics(e1, 'early') }, questions: [{ kind: 'multiple_choice', id: 'q1', prompt: 'Mai đặt gì vào cốc đất?', choices: [{ id: 'a', text: 'Một hạt đậu' }, { id: 'b', text: 'Một viên sỏi' }, { id: 'c', text: 'Một chiếc lá' }], answerKey: 'a', rationale: 'Câu đầu kể Mai đặt một hạt đậu vào cốc đất.' }, { kind: 'multiple_choice', id: 'q2', prompt: 'Mầm xanh xuất hiện khi nào?', choices: [{ id: 'a', text: 'Ba ngày sau' }, { id: 'b', text: 'Ngay lập tức' }, { id: 'c', text: 'Một tháng sau' }], answerKey: 'a', rationale: 'Truyện nói ba ngày sau một mầm xanh nhú lên.' }] },
  },
  {
    ...envelope({ id: '61000000-0000-4000-8000-000000000002', slug: 'doc-hieu-chiec-thuyen-giay', title: 'Đọc hiểu: Chiếc thuyền giấy', instructions: 'Con nghe truyện rồi chọn câu trả lời đúng nhé.', band: 'early', difficulty: 2, estimatedMinutes: 8, interestTags: ['drawing'], layout: 'reading' }),
    type: 'story_comprehension', response: { mode: 'choice', autoScored: true },
    payload: { story: { title: 'Chiếc thuyền giấy', paragraphs: e2, ...storyMetrics(e2, 'early') }, questions: [{ kind: 'multiple_choice', id: 'q1', prompt: 'Chiếc thuyền có màu gì?', choices: [{ id: 'a', text: 'Màu vàng' }, { id: 'b', text: 'Màu tím' }, { id: 'c', text: 'Màu xanh' }], answerKey: 'a', rationale: 'Câu đầu nói chiếc thuyền giấy màu vàng.' }, { kind: 'multiple_choice', id: 'q2', prompt: 'Nam làm gì để thuyền trôi?', choices: [{ id: 'a', text: 'Thổi nhẹ' }, { id: 'b', text: 'Lắc chậu' }, { id: 'c', text: 'Đẩy bằng bút' }], answerKey: 'a', rationale: 'Nam thổi nhẹ và thuyền trôi sang bên kia.' }] },
  },
  {
    ...envelope({ id: '61000000-0000-4000-8000-000000000003', slug: 'doc-hieu-me-banh-chuoi', title: 'Đọc hiểu: Mẻ bánh chuối', instructions: 'Con đọc truyện rồi trả lời các câu hỏi bằng chi tiết trong bài.', band: 'lower_primary', difficulty: 2, estimatedMinutes: 12, interestTags: ['cooking'], layout: 'reading' }),
    type: 'story_comprehension', response: { mode: 'mixed', parts: ['choice', 'text'], maxAssets: 0 },
    payload: { story: { title: 'Mẻ bánh chuối', paragraphs: l1, ...storyMetrics(l1, 'lower_primary') }, questions: [{ kind: 'multiple_choice', id: 'q1', prompt: 'Vì sao mẻ bánh đầu hơi dày?', choices: [{ id: 'a', text: 'An cho quá nhiều bột vào khuôn' }, { id: 'b', text: 'An quên nghiền chuối' }, { id: 'c', text: 'An dùng bát quá nhỏ' }], answerKey: 'a', rationale: 'Truyện nói mẻ đầu dày vì An đổ quá nhiều bột vào khuôn.' }, { kind: 'short_text', id: 'q2', prompt: 'An đã thay đổi cách làm thế nào ở mẻ sau?', exemplarAnswer: 'An dùng thìa đong từng phần bằng nhau.', maxWords: 30 }] },
  },
  {
    ...envelope({ id: '61000000-0000-4000-8000-000000000004', slug: 'doc-hieu-bang-quan-sat-may', title: 'Đọc hiểu: Bảng quan sát mây', instructions: 'Con đọc ghi chép rồi giải thích điều nhóm Huy rút ra.', band: 'upper_primary', difficulty: 3, estimatedMinutes: 15, interestTags: ['weather', 'science'], layout: 'reading' }),
    type: 'story_comprehension', response: { mode: 'mixed', parts: ['choice', 'text'], maxAssets: 0 },
    payload: { story: { title: 'Bảng quan sát mây', paragraphs: u1, ...storyMetrics(u1, 'upper_primary') }, questions: [{ kind: 'multiple_choice', id: 'q1', prompt: 'Nhóm ghi lại điều gì mỗi buổi sáng?', choices: [{ id: 'a', text: 'Hình dạng mây và mức độ sáng' }, { id: 'b', text: 'Số cây trong sân' }, { id: 'c', text: 'Tên các môn học' }], answerKey: 'a', rationale: 'Đoạn hai nêu hai thông tin nhóm ghi mỗi sáng.' }, { kind: 'short_text', id: 'q2', prompt: 'Vì sao Huy cho rằng một lần quan sát là chưa đủ?', exemplarAnswer: 'Vì cần nhiều lần quan sát để so sánh và nhận ra xu hướng thay đổi.', maxWords: 70 }] },
  },
  {
    ...envelope({ id: '61000000-0000-4000-8000-000000000005', slug: 'doc-hieu-chon-tuyen-di-bo', title: 'Đọc hiểu: Chọn tuyến đi bộ', instructions: 'Con đọc cách nhóm Vy ra quyết định rồi phân tích các bước.', band: 'preteen', difficulty: 4, estimatedMinutes: 18, interestTags: ['travel', 'nature'], layout: 'reading' }),
    type: 'story_comprehension', response: { mode: 'mixed', parts: ['choice', 'text'], maxAssets: 0 },
    payload: { story: { title: 'Chọn tuyến đi bộ', paragraphs: p1, ...storyMetrics(p1, 'preteen') }, questions: [{ kind: 'multiple_choice', id: 'q1', prompt: 'Nhóm dùng những tiêu chí nào để so sánh lộ trình?', choices: [{ id: 'a', text: 'Quãng đường, bóng mát và số ghế nghỉ' }, { id: 'b', text: 'Màu đường, số cây và tên phố' }, { id: 'c', text: 'Chỉ dùng độ dài quãng đường' }], answerKey: 'a', rationale: 'Đoạn ba liệt kê ba tiêu chí nhóm thống nhất.' }, { kind: 'short_text', id: 'q2', prompt: 'Việc giữ phương án đứng thứ hai giúp nhóm linh hoạt như thế nào?', exemplarAnswer: 'Nhóm có phương án dự phòng khi lối chính đông người hoặc không thuận tiện.', maxWords: 120 }] },
  },
];
