// 관리자 인증 토큰.
// 쿠키에 비밀번호 원문을 담지 않기 위해 비밀번호에서 파생한 해시를 세션 토큰으로 쓴다.
// proxy(Edge 런타임)와 Route Handler(Node) 양쪽에서 돌아야 하므로 node:crypto 대신 Web Crypto 사용.

export const ADMIN_COOKIE = 'admin_auth';

export async function adminToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`capsule-match:admin:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// 문자 단위 조기 반환을 없애 비교 시간이 값에 따라 달라지지 않게 한다.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
