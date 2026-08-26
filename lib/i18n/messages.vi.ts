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
    unauthorized: 'Bố mẹ cần đăng nhập để tiếp tục.',
  },
  auth: {
    signUpTitle: 'Tạo tài khoản cho bố mẹ',
    signUpSubtitle: 'Bố mẹ tạo tài khoản, rồi thêm hồ sơ cho từng bé.',
    logInTitle: 'Đăng nhập',
    email: 'Email',
    password: 'Mật khẩu',
    displayName: 'Tên của bố mẹ',
    submitSignUp: 'Tạo tài khoản',
    submitLogIn: 'Đăng nhập',
    logOut: 'Đăng xuất',
    forgotPassword: 'Quên mật khẩu?',
    forgotTitle: 'Đặt lại mật khẩu',
    forgotSubtitle: 'Bố mẹ nhập email, hệ thống sẽ gửi liên kết đặt lại.',
    sendResetLink: 'Gửi liên kết',
    resetSent: 'Nếu email tồn tại, liên kết đặt lại đã được gửi.',
    resetTitle: 'Đặt mật khẩu mới',
    newPassword: 'Mật khẩu mới',
    savePassword: 'Lưu mật khẩu',
    haveAccount: 'Đã có tài khoản?',
    noAccount: 'Chưa có tài khoản?',
    invalidCredentials: 'Email hoặc mật khẩu chưa đúng.',
    emailInUse: 'Email này đã được dùng.',
    weakPassword: 'Mật khẩu cần ít nhất 8 ký tự.',
    invalidEmail: 'Email chưa hợp lệ.',
  },
  child: {
    listTitle: 'Các con',
    empty: 'Bố mẹ chưa thêm bé nào.',
    addFirst: 'Thêm con đầu tiên',
    addAnother: 'Thêm bé nữa',
    nickname: 'Tên gọi ở nhà',
    nicknameHint: 'Tên thân mật cũng được — không cần tên đầy đủ.',
    birthMonth: 'Tháng sinh',
    birthYear: 'Năm sinh',
    birthHint: 'Chỉ cần tháng và năm. Hệ thống không lưu ngày sinh chính xác.',
    grade: 'Lớp',
    avatar: 'Hình đại diện',
    avatarHint: 'Chọn một hình có sẵn. Không cần tải ảnh của bé lên.',
    interests: 'Sở thích',
    interestsHint: 'Chọn từ 3 đến 6 sở thích. Bố mẹ có thể bỏ qua và chọn sau.',
    create: 'Tạo hồ sơ',
    edit: 'Sửa hồ sơ',
    archive: 'Lưu trữ hồ sơ',
    archiveConfirm: 'Lưu trữ hồ sơ của bé? Bài đã làm vẫn được giữ lại.',
    archived: 'Đã lưu trữ',
    yearsOld: 'tuổi',
    ageBand: 'Nhóm tuổi',
    difficultyByType: 'Độ khó theo từng loại hoạt động',
  },
  grade: {
    preschool: 'Mẫu giáo',
    grade_1: 'Lớp 1',
    grade_2: 'Lớp 2',
    grade_3: 'Lớp 3',
    grade_4: 'Lớp 4',
    grade_5: 'Lớp 5',
    grade_6: 'Lớp 6',
  },
  ageBand: {
    early: 'Mầm non',
    lower_primary: 'Tiểu học đầu cấp',
    upper_primary: 'Tiểu học cuối cấp',
    preteen: 'Trước tuổi teen',
  },
  settings: {
    title: 'Cài đặt',
    account: 'Tài khoản',
    displayName: 'Tên hiển thị',
    safety: 'An toàn',
    dataTitle: 'Dữ liệu của gia đình',
  },
  library: {
    title: 'Thư viện hoạt động',
    filterType: 'Loại hoạt động',
    filterDifficulty: 'Độ khó',
    filterAll: 'Tất cả',
    minutes: 'phút',
    difficulty: 'Độ khó',
    empty: 'Không có hoạt động nào khớp bộ lọc.',
    preview: 'Xem trước',
    previewNote: 'Đây là những gì con sẽ thấy. Đáp án và gợi ý chỉ hiển thị cho bố mẹ.',
    parentOnly: 'Chỉ bố mẹ xem được',
    answerKey: 'Đáp án',
    rationale: 'Giải thích',
    exemplar: 'Câu trả lời tham khảo',
    mustMention: 'Bài tóm tắt nên nhắc tới',
    childSees: 'Phần con nhìn thấy',
    count: 'hoạt động',
  },
  dashboard: {
    title: 'Trang chủ',
    greeting: 'Xin chào',
    noChildren: 'Bố mẹ thêm hồ sơ cho bé để bắt đầu.',
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
