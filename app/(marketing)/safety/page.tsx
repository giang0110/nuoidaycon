import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

/** Plain-language summary of docs/product/CHILD_SAFETY.md. */
export default function SafetyPage() {
  const t = getMessages(DEFAULT_LOCALE);
  const promises = [
    'Bố mẹ là chủ tài khoản. Con không có tài khoản riêng, không đăng nhập, không có mật khẩu.',
    'Không có trò chuyện tự do giữa con và AI. Không bao giờ.',
    'Con không nhắn tin được với ai — không bình luận, không chia sẻ, không bảng tin.',
    'Chúng tôi chỉ lưu tên gọi ở nhà, tháng và năm sinh, lớp và sở thích. Không lưu ngày sinh chính xác, không email, không số điện thoại, không tên trường.',
    'Ảnh bài làm của con được lưu riêng tư, chỉ bố mẹ xem được, và siêu dữ liệu vị trí bị xoá trước khi lưu.',
    'Không quảng cáo, không mã theo dõi hành vi của bên thứ ba.',
    'Không tính giờ, không bảng xếp hạng, không so sánh giữa các bé.',
    'Bố mẹ có thể tải về hoặc xoá toàn bộ dữ liệu của gia đình bất cứ lúc nào.',
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">{t.marketing.safety}</h1>
      <ul className="flex flex-col gap-3">
        {promises.map((p) => (
          <li key={p} className="text-pretty">
            {p}
          </li>
        ))}
      </ul>
    </main>
  );
}
