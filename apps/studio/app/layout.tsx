import type { Metadata } from 'next';
import './studio.css';
export const metadata: Metadata = { title: '과학 제작실 · 교사 작업 공간', description: '과제를 구체화하고 과학 시뮬레이션의 제작 과정과 검토 결과를 확인하는 교사 작업 공간입니다.', robots: { index: false, follow: false } };
export default function Layout({ children }: {children: React.ReactNode}) {
  return <html lang="ko"><body>{children}</body></html>;
}
