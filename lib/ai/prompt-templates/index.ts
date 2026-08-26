/**
 * Prompt templates — AI_CONTENT_RULES.md stage 3.
 *
 * In-repo, version-controlled, human-reviewed artefacts. They are NEVER
 * assembled at runtime from user input: the parent chooses an activity type
 * and some interest slugs, and that selects one of these. Changing a template
 * is a pull request, reviewed like content.
 *
 * Each template pins the output contract, the age-band constraints, and the
 * prohibited-topic instructions.
 */
import type { ActivityType } from '@/lib/domain/entities';
import type { AgeBand } from '@/lib/domain/policy/age';

export interface PromptTemplate {
  readonly id: string;
  readonly version: string;
  readonly type: ActivityType;
  readonly system: string;
}

const SHARED_RULES = `
Bạn soạn hoạt động học ngắn cho trẻ em Việt Nam, để BỐ MẸ duyệt trước khi giao cho con.

QUY TẮC BẮT BUỘC:
- Viết hoàn toàn bằng tiếng Việt tự nhiên, ấm áp, xưng hô với con ở ngôi thứ hai.
- Khen sự cố gắng, không khen sự thông minh sẵn có. Không chê, không làm trẻ xấu hổ.
- TUYỆT ĐỐI KHÔNG nhắc tới: bạo lực, vũ khí, cái chết, nội dung tình dục, tự hại,
  chất gây nghiện, cờ bạc, tội phạm, thù ghét, kinh dị, tư vấn y tế hay pháp lý,
  tuyên truyền tôn giáo hay chính trị, quảng cáo thương hiệu.
- KHÔNG hỏi thông tin cá nhân của trẻ: tên đầy đủ, địa chỉ, trường học, số điện thoại,
  hay khi nào trẻ ở nhà một mình.
- KHÔNG khuyến khích trẻ giữ bí mật với bố mẹ.
- KHÔNG chèn đường link, email, số điện thoại, mã QR hay tên tài khoản mạng xã hội.
- Nội dung phải là bản gốc do bạn viết, không sao chép sách hay truyện có bản quyền.

Trả về DUY NHẤT một object JSON đúng schema được cung cấp. Không thêm lời dẫn.
`.trim();

function template(id: string, type: ActivityType, specific: string): PromptTemplate {
  return { id, version: '1.0.0', type, system: `${SHARED_RULES}\n\n${specific}` };
}

export const PROMPT_TEMPLATES: readonly PromptTemplate[] = [
  template(
    'reflection-vi',
    'reflection',
    `Bạn soạn hoạt động SUY NGẪM.
Chủ đề phải nằm trong danh sách cho phép và chỉ xoay quanh chuyện thường ngày.
KHÔNG hỏi về mâu thuẫn gia đình, tiền bạc trong nhà, sức khoẻ tâm lý, hình thể,
hay niềm tin tôn giáo. Câu hỏi phải là điều trẻ tự trả lời được, không cần tiết lộ
chuyện riêng của gia đình.`,
  ),
  template(
    'drawing-vi',
    'drawing_prompt',
    `Bạn soạn hoạt động VẼ.
Không có đáp án đúng. KHÔNG yêu cầu trẻ vẽ chính mình, ngôi nhà của mình, trường học,
đường tới trường, hay khuôn mặt người thân.`,
  ),
  template(
    'situation-vi',
    'situation_judgment',
    `Bạn soạn hoạt động "NẾU LÀ CON, CON SẼ LÀM GÌ".
Tình huống phải là chuyện THƯỜNG NGÀY mà trẻ tự xử lý được: bạn bè, anh chị em, lớp học.
TUYỆT ĐỐI KHÔNG mô tả xâm hại, dụ dỗ, bắt nạt gây thương tích, người lạ cho quà hay
rủ đi nhờ xe, hay bất kỳ tình huống nào mà cách giải quyết đúng là phải có người lớn
can thiệp. Nguy hiểm không phải là câu đố cho trẻ giải.
LUÔN có phương án "kể với người lớn đáng tin cậy", và không bao giờ trình bày việc
nhờ giúp đỡ như lựa chọn sai.`,
  ),
];

export function findTemplate(type: ActivityType): PromptTemplate | null {
  return PROMPT_TEMPLATES.find((t) => t.type === type) ?? null;
}

/** The task prompt, built entirely from validated constraints. */
export function buildUserPrompt(input: {
  type: ActivityType;
  band: AgeBand;
  grade: string;
  difficulty: number;
  interestSlugs: readonly string[];
}): string {
  return [
    `Loại hoạt động: ${input.type}`,
    `Nhóm tuổi: ${input.band.key} (${input.band.minAge}-${input.band.maxAge} tuổi)`,
    `Lớp: ${input.grade}`,
    `Mức độ khó: ${input.difficulty} trên thang 1-5`,
    `Chủ đề trẻ quan tâm: ${input.interestSlugs.join(', ') || 'không chỉ định'}`,
    '',
    'GIỚI HẠN THEO NHÓM TUỔI:',
    `- Câu dài nhất tối đa ${input.band.maxSentenceWords} từ.`,
    `- Câu trả lời của trẻ tối đa ${input.band.maxAnswerWords} từ.`,
    `- Độ khó phải nằm trong khoảng ${input.band.minDifficulty}-${input.band.maxDifficulty}.`,
  ].join('\n');
}
