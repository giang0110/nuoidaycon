import { envelope, type Seed } from '../_shared';

export const situationExpansionSeeds: Seed[] = [
  {
    ...envelope({ id: '51000000-0000-4000-8000-000000000001', slug: 'tinh-huong-den-luot-cat-do-choi', title: 'Đến lượt cất đồ chơi', instructions: 'Con nghe tình huống rồi chọn cách con sẽ làm nhé.', band: 'early', difficulty: 1, estimatedMinutes: 8, interestTags: ['friends'], layout: 'prompt_card' }),
    type: 'situation_judgment', response: { mode: 'choice', autoScored: true },
    payload: { scenario: 'Con và bạn vừa chơi xong. Đồ chơi vẫn ở trên sàn. Bạn muốn đi chỗ khác.', question: 'Con sẽ làm gì?', mode: 'guided', options: [{ id: 'a', text: 'Rủ bạn cùng cất đồ chơi', isConstructive: true, feedback: 'Cùng cất giúp việc nhanh hơn và khu chơi gọn lại.' }, { id: 'b', text: 'Tự cất phần con đã dùng', isConstructive: true, feedback: 'Con đang chịu trách nhiệm với phần mình đã chơi.' }, { id: 'c', text: 'Bỏ đồ chơi lại rồi đi', isConstructive: false, feedback: 'Đồ chơi sẽ còn bừa bộn. Con thử chọn cách gọn hơn nhé.' }], trustedAdultPath: { present: true, text: 'Nếu hai bạn chưa biết cất ở đâu, con có thể hỏi người lớn.' } },
  },
  {
    ...envelope({ id: '51000000-0000-4000-8000-000000000002', slug: 'tinh-huong-ban-muon-dung-but-mau', title: 'Bạn muốn dùng bút màu', instructions: 'Con nghe tình huống rồi chọn cách con thấy phù hợp nhé.', band: 'early', difficulty: 2, estimatedMinutes: 8, interestTags: ['friends', 'drawing'], layout: 'prompt_card' }),
    type: 'situation_judgment', response: { mode: 'choice', autoScored: true },
    payload: { scenario: 'Con đang dùng hộp bút màu. Một bạn muốn mượn màu xanh. Con vẫn còn nhiều màu khác.', question: 'Con sẽ làm gì?', mode: 'guided', options: [{ id: 'a', text: 'Cho bạn mượn màu xanh một lúc', isConstructive: true, feedback: 'Chia sẻ một màu giúp cả hai cùng tiếp tục vẽ.' }, { id: 'b', text: 'Hẹn bạn dùng sau khi con tô xong', isConstructive: true, feedback: 'Nói rõ khi nào bạn được dùng là một cách công bằng.' }, { id: 'c', text: 'Ôm cả hộp và không nói gì', isConstructive: false, feedback: 'Bạn sẽ khó hiểu điều con muốn. Con có thể nói rõ hơn nhé.' }], trustedAdultPath: { present: true, text: 'Nếu hai bạn khó thống nhất, con có thể nhờ người lớn giúp chia lượt.' } },
  },
  {
    ...envelope({ id: '51000000-0000-4000-8000-000000000003', slug: 'tinh-huong-nhom-co-hai-y-tuong', title: 'Nhóm có hai ý tưởng khác nhau', instructions: 'Con đọc tình huống, chọn cách xử lý rồi giải thích suy nghĩ.', band: 'upper_primary', difficulty: 3, estimatedMinutes: 12, interestTags: ['friends'], layout: 'prompt_card' }),
    type: 'situation_judgment', response: { mode: 'mixed', parts: ['choice', 'text'], maxAssets: 0 },
    payload: { scenario: 'Nhóm con đang làm một tấm áp phích. Hai bạn muốn trình bày theo hai cách khác nhau. Cả hai ý tưởng đều có điểm hay, nhưng thời gian còn ít.', question: 'Con sẽ đề nghị nhóm làm gì?', mode: 'guided', options: [{ id: 'a', text: 'Nêu điểm mạnh của từng ý tưởng rồi chọn phần có thể kết hợp', isConstructive: true, feedback: 'So sánh điểm mạnh giúp nhóm quyết định dựa trên công việc.' }, { id: 'b', text: 'Chia nhanh việc thử hai bố cục nhỏ rồi cùng chọn', isConstructive: true, feedback: 'Thử ở quy mô nhỏ giúp nhóm nhìn thấy phương án rõ hơn.' }, { id: 'c', text: 'Cứ tranh luận đến khi một bạn chịu bỏ ý tưởng', isConstructive: false, feedback: 'Tranh luận kéo dài có thể làm nhóm hết thời gian. Một cách thử nhanh sẽ hữu ích hơn.' }], trustedAdultPath: { present: true, text: 'Nếu nhóm vẫn bế tắc, con có thể nhờ giáo viên giúp nhóm đặt tiêu chí chọn.' }, followUp: 'Tiêu chí nào giúp nhóm chọn cách trình bày công bằng?' },
  },
  {
    ...envelope({ id: '51000000-0000-4000-8000-000000000004', slug: 'tinh-huong-ke-hoach-nhom-bi-cham', title: 'Kế hoạch nhóm đang bị chậm', instructions: 'Con đọc tình huống rồi viết cách con sẽ giúp nhóm tiến tiếp.', band: 'preteen', difficulty: 4, estimatedMinutes: 15, interestTags: ['friends'], layout: 'prompt_card' }),
    type: 'situation_judgment', response: { mode: 'text', fields: [{ id: 'answer', label: 'Cách con sẽ xử lý', minWords: 30, maxWords: 150 }] },
    payload: { scenario: 'Nhóm con có một bài trình bày chung. Đến buổi ghép bài, một phần vẫn chưa hoàn thành. Người phụ trách phần đó nói rằng bạn đã đánh giá thời gian chưa đúng. Cả nhóm cần điều chỉnh để kịp buổi trình bày.', question: 'Nếu là một thành viên trong nhóm, con sẽ đề nghị cách xử lý nào?', mode: 'open', trustedAdultPath: { present: true, text: 'Nếu nhóm cần đổi phạm vi hoặc thời hạn, con có thể trao đổi với giáo viên.' }, followUp: 'Làm sao để nhóm rút kinh nghiệm mà không làm một bạn thấy bị trách móc?' },
  },
];
