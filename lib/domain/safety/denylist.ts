/**
 * Prohibited-topic lexicon — CHILD_SAFETY.md §5.1.
 *
 * Kept as its own reviewable data file so a change to what counts as unsafe is
 * a visible diff, not a tweak buried in logic.
 *
 * This is a NECESSARY check, never a sufficient one. Passing it does not make
 * content safe; failing it makes content unusable. Human review remains
 * authoritative on tone and nuance (validation layer L4).
 */

export interface DenylistCategory {
  readonly id: string;
  readonly label: string;
  /** Matched case-insensitively against word boundaries. */
  readonly terms: readonly string[];
}

export const DENYLIST: readonly DenylistCategory[] = [
  {
    id: 'violence',
    label: 'Bạo lực, vũ khí, thương tích',
    terms: [
      'giết',
      'đâm',
      'bắn',
      'đánh nhau',
      'đấm',
      'máu me',
      'vũ khí',
      'súng',
      'dao găm',
      'bom',
      'tra tấn',
      'hành hạ',
      'kill',
      'murder',
      'stab',
      'shoot',
      'weapon',
      'gun',
      'knife',
      'bomb',
      'torture',
    ],
  },
  {
    id: 'death',
    label: 'Cái chết',
    terms: ['chết chóc', 'tử vong', 'đám tang', 'xác chết', 'corpse', 'funeral', 'die', 'death'],
  },
  {
    id: 'sexual',
    label: 'Nội dung tình dục',
    terms: [
      'tình dục',
      'khiêu dâm',
      'khoả thân',
      'ngực trần',
      'hôn môi',
      'sex',
      'sexual',
      'porn',
      'nude',
      'naked',
      'kiss on the lips',
    ],
  },
  {
    id: 'self_harm',
    label: 'Tự hại, tự tử, rối loạn ăn uống',
    terms: [
      'tự tử',
      'tự sát',
      'tự làm đau',
      'rạch tay',
      'nhịn ăn để gầy',
      'suicide',
      'self-harm',
      'cutting myself',
      'anorexia',
      'starve yourself',
    ],
  },
  {
    id: 'substances',
    label: 'Chất gây nghiện',
    terms: [
      'rượu bia',
      'thuốc lá',
      'ma tuý',
      'ma túy',
      'cần sa',
      'thuốc lá điện tử',
      'alcohol',
      'beer',
      'cigarette',
      'smoking',
      'vape',
      'drugs',
      'cannabis',
    ],
  },
  {
    id: 'gambling',
    label: 'Cờ bạc',
    terms: ['cờ bạc', 'cá độ', 'đánh bạc', 'lô đề', 'gambling', 'betting', 'casino', 'lottery'],
  },
  {
    id: 'crime',
    label: 'Tội phạm, che giấu sai phạm',
    terms: [
      'ăn trộm',
      'ăn cắp',
      'trộm cắp',
      'lừa đảo',
      'giấu tội',
      'buôn lậu',
      'steal',
      'theft',
      'rob',
      'smuggle',
      'get away with it',
    ],
  },
  {
    id: 'hate',
    label: 'Thù ghét, phân biệt đối xử',
    terms: [
      'kỳ thị',
      'phân biệt chủng tộc',
      'miệt thị',
      'chê bai người',
      'racist',
      'hate speech',
      'slur',
      'inferior race',
    ],
  },
  {
    id: 'horror',
    label: 'Kinh dị, gây sợ hãi',
    terms: [
      'ma quỷ',
      'quái vật đáng sợ',
      'kinh dị',
      'rùng rợn',
      'hồn ma',
      'horror',
      'nightmare',
      'haunted',
      'monster attacks',
    ],
  },
  {
    id: 'advice',
    label: 'Tư vấn y tế, tâm lý, pháp lý, tài chính',
    terms: [
      'chẩn đoán',
      'kê đơn',
      'liều thuốc',
      'trầm cảm lâm sàng',
      'tư vấn pháp lý',
      'đầu tư sinh lời',
      'diagnosis',
      'prescribe',
      'dosage',
      'clinical depression',
      'legal advice',
      'invest',
    ],
  },
  {
    id: 'persuasion',
    label: 'Tuyên truyền tôn giáo, chính trị',
    terms: [
      'bầu cử',
      'đảng phái',
      'cải đạo',
      'truyền đạo',
      'vote for',
      'political party',
      'convert to',
      'true religion',
    ],
  },
  {
    id: 'commercial',
    label: 'Quảng cáo, thương hiệu',
    terms: [
      'mua ngay',
      'giảm giá',
      'khuyến mãi',
      'đặt hàng',
      'buy now',
      'discount',
      'sponsored',
      'subscribe to',
      'order now',
    ],
  },
  {
    id: 'secrecy',
    label: 'Giữ bí mật với bố mẹ',
    terms: [
      'đừng nói với bố mẹ',
      'giữ bí mật với người lớn',
      'giấu bố mẹ',
      "don't tell your parents",
      'keep it a secret from',
      'our little secret',
    ],
  },
  {
    id: 'pii_solicitation',
    label: 'Hỏi thông tin cá nhân',
    terms: [
      'địa chỉ nhà con',
      'trường con học',
      'số điện thoại của con',
      'con ở nhà một mình lúc nào',
      'your home address',
      'what school do you go to',
      'your phone number',
      'are you home alone',
    ],
  },
];

export const DENYLIST_CATEGORY_IDS = DENYLIST.map((c) => c.id);
