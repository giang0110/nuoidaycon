import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';
import './globals.css';

/*
 * Be Vietnam Pro has complete Vietnamese diacritic coverage at every weight,
 * which the UI needs (docs/product/UX_FLOW.md §7). The handwriting font used on
 * printed worksheets is a separate, deferred decision — Phase 7.
 */
const beVietnam = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-be-vietnam',
});

const messages = getMessages(DEFAULT_LOCALE);

export const metadata: Metadata = {
  title: messages.common.appName,
  description: messages.marketing.tagline,
  // No child data ever reaches a social card.
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never block a parent or child from zooming.
  maximumScale: 5,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={DEFAULT_LOCALE} className={beVietnam.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
