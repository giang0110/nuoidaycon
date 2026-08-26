import type { Metadata } from 'next';
import './print.css';

export const metadata: Metadata = {
  title: 'Phiếu bài tập',
  // A worksheet URL is scoped to one family's assignment; keep it out of search.
  robots: { index: false, follow: false },
};

/**
 * Print layout: no application chrome at all.
 *
 * Separate from both the parent and child layouts so a printed sheet cannot
 * inherit navigation, and so `print.css` owns the page without competing with
 * app styling.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
