/**
 * Vietnamese message catalogue — the primary locale.
 *
 * This file is the source of truth for available keys: `messages.en.ts` is
 * checked against it by `scripts/check-i18n-keys.ts`, and a lint rule keeps
 * user-facing literals out of components.
 */
export const vi = {
  common: {
    appName: 'Nuôi Dạy Con',
    loading: 'Đang tải…',
    save: 'Lưu',
    cancel: 'Huỷ',
    back: 'Quay lại',
    next: 'Tiếp tục',
    done: 'Xong',
    delete: 'Xoá',
    confirm: 'Xác nhận',
    retry: 'Thử lại',
  },
  nav: {
    home: 'Trang chủ',
    children: 'Các con',
    library: 'Thư viện',
    settings: 'Cài đặt',
    assign: 'Giao bài',
  },
  marketing: {
    tagline: 'Hoạt động học ngắn, do bố mẹ chọn và duyệt.',
    ctaSignUp: 'Tạo tài khoản',
    ctaLogIn: 'Đăng nhập',
    privacy: 'Quyền riêng tư',
    safety: 'An toàn cho trẻ',
  },
  activityType: {
    handwriting: 'Luyện viết',
    drawing_prompt: 'Vẽ & sáng tạo',
    story_comprehension: 'Đọc hiểu',
    story_summary: 'Tóm tắt truyện',
    reflection: 'Câu hỏi suy ngẫm',
    situation_judgment: 'Nếu là con, con sẽ làm gì?',
  },
  error: {
    generic: 'Có lỗi xảy ra. Bố mẹ thử lại nhé.',
    notFound: 'Không tìm thấy nội dung này.',
  },
} as const;

/**
 * Key shape of the catalogue, with values widened to `string`.
 *
 * `vi` is declared `as const` so its keys are exact, but other locales must be
 * free to hold any string (including the empty ones English ships with), not
 * the Vietnamese literal.
 */
type DeepStringValues<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringValues<T[K]>;
};

export type Messages = DeepStringValues<typeof vi>;
