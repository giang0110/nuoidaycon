import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default function PrivacyPage() {
  const t = getMessages(DEFAULT_LOCALE);
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">{t.marketing.privacy}</h1>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Dữ liệu chúng tôi lưu</h2>
        <p className="text-pretty">
          Về bố mẹ: email và tên hiển thị. Về con: tên gọi ở nhà, tháng và năm sinh, lớp, sở thích,
          hình đại diện có sẵn, và bài con đã làm.
        </p>
        <h2 className="font-medium">Dữ liệu chúng tôi không lưu</h2>
        <p className="text-pretty">
          Ngày sinh chính xác của con, tuổi (tuổi được tính khi cần rồi bỏ đi), họ tên đầy đủ, email
          hay số điện thoại của con, địa chỉ, tên trường, vị trí, hay ảnh chân dung.
        </p>
        <h2 className="font-medium">Quyền của bố mẹ</h2>
        <p className="text-pretty">
          Bố mẹ có thể xem, tải về và xoá toàn bộ dữ liệu của gia đình. Xoá tài khoản sẽ xoá mọi hồ
          sơ của con, bài đã giao và ảnh bài làm.
        </p>
      </section>
    </main>
  );
}
