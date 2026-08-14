import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, adminToken } from '@/lib/adminAuth';
import { clientIp, isBlocked, recordFailure } from '@/lib/rateLimit';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const LOGIN_FAILURE_LIMIT = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  // 관리자 비밀번호 무차별 대입 방지 (실패한 시도만 카운트)
  const loginKey = `admin-login:${clientIp(req)}`;
  const limit = isBlocked(loginKey, LOGIN_FAILURE_LIMIT);
  if (limit.blocked) {
    return NextResponse.json(
      { success: false, error: '시도가 너무 많아요. 잠시 후 다시 시도해주세요.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  const { password } = await req.json();

  // 환경변수 미설정 시 로그인 자체를 막음 (빈 비밀번호로 뚫리는 것 방지)
  if (!ADMIN_PASSWORD) {
    return NextResponse.json({ success: false, error: '서버에 비밀번호가 설정되지 않았어요.' }, { status: 500 });
  }

  if (password !== ADMIN_PASSWORD) {
    recordFailure(loginKey, LOGIN_WINDOW_MS);
    return NextResponse.json({ success: false, error: '비밀번호가 올바르지 않아요.' }, { status: 401 });
  }

  const res = NextResponse.json({ success: true });
  // 쿠키에는 비밀번호 원문 대신 파생 토큰만 저장
  res.cookies.set(ADMIN_COOKIE, await adminToken(ADMIN_PASSWORD), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8, // 8시간
    path: '/',
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
