import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hashOpenCode } from '@/lib/hashCode';
import { blockedResponse, recordCodeFailure } from '@/lib/codeGuard';

export async function POST(req: NextRequest) {
  try {
    const { universityId, code } = await req.json();

    if (!universityId || !code) {
      return NextResponse.json({ success: false, error: '학교와 코드를 모두 입력해주세요.' }, { status: 400 });
    }

    const blocked = blockedResponse(req, universityId);
    if (blocked) return blocked;

    // 대학 정보 조회
    const { data: university, error } = await supabaseAdmin
      .from('universities')
      .select('id, name, open_code_hash, assigned_character_id')
      .eq('id', universityId)
      .single();

    if (error || !university) {
      return NextResponse.json({ success: false, error: '존재하지 않는 학교입니다.' }, { status: 404 });
    }

    // 이미 배정된 경우
    if (university.assigned_character_id) {
      return NextResponse.json({
        success: false,
        alreadyAssigned: true,
        error: '이미 캐릭터를 만난 학교예요. 결과를 확인해요.',
      });
    }

    // 코드 해시 비교
    const inputHash = hashOpenCode(code);
    if (inputHash !== university.open_code_hash) {
      recordCodeFailure(req, universityId);
      return NextResponse.json({ success: false, error: '선택한 학교와 티켓 코드가 일치하지 않아요.' }, { status: 401 });
    }

    return NextResponse.json({ success: true, universityName: university.name });
  } catch {
    return NextResponse.json({ success: false, error: '일시적인 오류가 발생했어요. 다시 시도해주세요.' }, { status: 500 });
  }
}
