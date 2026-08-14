import { NextResponse } from 'next/server';
import { clientIp, isBlocked, recordFailure } from './rateLimit';

// 티켓 코드는 5자리라 조합이 10만개뿐 — 틀린 코드를 반복해서 던지는 것을 막는다.
// verify-code 와 assign-character 가 같은 키를 공유하므로 한쪽으로 우회할 수 없다.
const IP_FAILURE_LIMIT = 10;         // IP당 10분에 10회 실패
const UNIVERSITY_FAILURE_LIMIT = 30; // 학교당 10분에 30회 실패
const WINDOW_MS = 10 * 60 * 1000;

const ipKey = (req: Request) => `code:ip:${clientIp(req)}`;
const universityKey = (universityId: string) => `code:uni:${universityId}`;

// 차단 상태면 429 응답을, 아니면 null 을 돌려준다.
export function blockedResponse(req: Request, universityId: string): NextResponse | null {
  const byIp = isBlocked(ipKey(req), IP_FAILURE_LIMIT);
  const byUniversity = isBlocked(universityKey(universityId), UNIVERSITY_FAILURE_LIMIT);
  const hit = byIp.blocked ? byIp : byUniversity.blocked ? byUniversity : null;
  if (!hit) return null;

  return NextResponse.json(
    { success: false, error: '코드 입력 시도가 너무 많아요. 잠시 후 다시 시도해주세요.' },
    { status: 429, headers: { 'Retry-After': String(hit.retryAfter) } }
  );
}

// 코드가 틀렸을 때만 호출한다 (성공은 예산을 소모하지 않음).
export function recordCodeFailure(req: Request, universityId: string): void {
  recordFailure(ipKey(req), WINDOW_MS);
  recordFailure(universityKey(universityId), WINDOW_MS);
}
