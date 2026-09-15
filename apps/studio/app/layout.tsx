import type { Metadata } from 'next';
import './studio.css';
export const metadata: Metadata = { title: '과학 제작실 · 교사 작업 공간', description: '교사용 과학 시뮬레이션 제작실. 현재 모의 실행 단계입니다.', robots: { index: false, follow: false } };
export default function Layout({ children }: {children: React.ReactNode}) {
  return <html lang="ko"><body>{children}</body></html>;
}
