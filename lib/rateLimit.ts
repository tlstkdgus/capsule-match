// 실패 횟수 기반 인메모리 레이트 리미터 (고정 윈도우).
//
// 성공한 요청은 예산을 소모하지 않는다. 행사장 와이파이처럼 여러 학교 대표가
// 같은 공용 IP를 쓰는 상황에서 정상 이용자끼리 서로를 잠그는 것을 피하기 위함이다.
// 즉, 코드를 제대로 입력하는 사람은 몇 명이 몰려도 절대 차단되지 않고
// 틀린 코드를 반복해서 던지는 쪽만 막힌다.
//
// ⚠️ 서버리스에서는 인스턴스마다 카운터가 따로 놀고 콜드 스타트 때 초기화된다.
//    완벽한 차단이 아니라 무차별 대입 "속도"를 실용적인 수준 아래로 떨어뜨리는 것이 목적이다.
//    더 강한 보장이 필요하면 Upstash Redis 같은 공유 저장소로 옮겨야 한다.

type Bucket = { failures: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

// 만료된 버킷 정리 — Map이 무한정 커지는 것 방지
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { blocked: boolean; retryAfter: number };

// 이미 실패 한도를 넘었는지 확인만 한다 (카운터를 올리지 않음).
export function isBlocked(key: string, limit: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) return { blocked: false, retryAfter: 0 };
  if (bucket.failures < limit) return { blocked: false, retryAfter: 0 };

  return { blocked: true, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
}

// 인증 실패 시에만 호출한다.
export function recordFailure(key: string, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { failures: 1, resetAt: now + windowMs });
    return;
  }
  bucket.failures += 1;
}

// x-forwarded-for 의 첫 값이 실제 클라이언트 IP (그 뒤는 프록시 체인)
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
