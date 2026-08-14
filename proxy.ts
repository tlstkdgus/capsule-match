import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ADMIN_COOKIE, adminToken, safeEqual } from '@/lib/adminAuth';

// 어드민 영역 인증 가드 (Next 16: middleware → proxy).
// 보호 대상: /admin/* 페이지 + /api/admin/* + /api/status
// 공개: 로그인 화면과 로그인/로그아웃 엔드포인트만
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const PUBLIC_PATHS = new Set(['/admin/login', '/api/admin/auth']);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // API는 리다이렉트 대신 401 JSON — fetch 호출부가 로그인 HTML을 JSON으로 파싱하지 않도록
  const isApi = pathname.startsWith('/api/');
  const deny = () =>
    isApi
      ? NextResponse.json({ success: false, error: '관리자 인증이 필요합니다.' }, { status: 401 })
      : NextResponse.redirect(new URL('/admin/login', req.url));

  // 환경변수 미설정 시 모든 접근 차단 (fail-closed)
  if (!ADMIN_PASSWORD) return deny();

  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!cookie) return deny();

  if (!safeEqual(cookie, await adminToken(ADMIN_PASSWORD))) return deny();

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/api/status'],
};
