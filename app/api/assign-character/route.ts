import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hashOpenCode } from '@/lib/hashCode';
import { blockedResponse, recordCodeFailure } from '@/lib/codeGuard';
import { createHash } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const { universityId, code } = await req.json();

    if (!universityId || !code) {
      return NextResponse.json({ success: false, error: '요청 정보가 올바르지 않습니다.' }, { status: 400 });
    }

    const blocked = blockedResponse(req, universityId);
    if (blocked) return blocked;

    // 대학 정보 재확인 (이중 검증)
    const { data: university, error: uniError } = await supabaseAdmin
      .from('universities')
      .select('id, name, open_code_hash, assigned_character_id')
      .eq('id', universityId)
      .single();

    if (uniError || !university) {
      return NextResponse.json({ success: false, error: '존재하지 않는 학교입니다.' }, { status: 404 });
    }

    // 이미 배정된 경우
    if (university.assigned_character_id) {
      return NextResponse.json({
        success: false,
        alreadyAssigned: true,
        error: '이미 캐릭터가 배정된 학교입니다.',
        universityId: university.id,
      });
    }

    // 코드 검증
    const inputHash = hashOpenCode(code);
    if (inputHash !== university.open_code_hash) {
      recordCodeFailure(req, universityId);
      return NextResponse.json({ success: false, error: '코드가 일치하지 않습니다.' }, { status: 401 });
    }

    // Supabase RPC를 통해 원자적(atomic) 랜덤 배정 실행
    // 동시 접속 시 중복 배정을 방지하기 위해 서버 사이드 트랜잭션을 사용합니다.
    const { data: result, error: rpcError } = await supabaseAdmin.rpc('assign_random_character', {
      p_university_id: universityId,
    });

    if (rpcError) {
      console.error('RPC Error:', rpcError);
      return NextResponse.json({ success: false, error: '일시적인 오류가 발생했어요. 다시 시도해주세요.' }, { status: 500 });
    }

    if (!result || result.error_code) {
      const errorMessages: Record<string, string> = {
        ALREADY_ASSIGNED: '이미 캐릭터가 배정된 학교입니다.',
        NO_CHARACTERS: '남아 있는 캐릭터가 없습니다.',
      };
      return NextResponse.json({
        success: false,
        error: errorMessages[result?.error_code] ?? '일시적인 오류가 발생했어요.',
      });
    }

    // 배정 로그 기록
    const userAgent = req.headers.get('user-agent') ?? '';
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
    const ipHash = createHash('sha256').update(ip).digest('hex');

    await supabaseAdmin.from('assignment_logs').insert({
      university_id: universityId,
      character_id: result.character_id,
      user_agent: userAgent.slice(0, 255),
      ip_hash: ipHash,
    });

    // 배정된 캐릭터 정보 조회
    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('id, name, image_url')
      .eq('id', result.character_id)
      .single();

    return NextResponse.json({
      success: true,
      character,
      universityName: university.name,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ success: false, error: '일시적인 오류가 발생했어요. 다시 시도해주세요.' }, { status: 500 });
  }
}
