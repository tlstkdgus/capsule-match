// 학교별 오픈 코드를 일괄 변경한다 (open_code_hash = sha256(code.trim().toUpperCase())).
// 실행:  node scripts/update-codes.mjs
// 매칭 기준: universities.name
//
// 코드 표는 저장소에 두지 않는다 — scripts/codes.local.json (gitignore 대상) 에서 읽는다.
// 형식은 scripts/codes.example.json 참고: { "학교명": "코드", ... }

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(join(root, '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
  return env;
}

function loadCodes() {
  const path = join(__dirname, 'codes.local.json');
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error('❌ scripts/codes.local.json 이 없습니다.');
    console.error('   scripts/codes.example.json 을 복사해 실제 코드를 채워주세요.');
    process.exit(1);
  }
  // { "학교명": "코드" } → [[학교명, 코드]] (_ 로 시작하는 주석 키는 제외)
  return Object.entries(JSON.parse(raw)).filter(([name]) => !name.startsWith('_'));
}

const env = loadEnv();
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('❌ .env.local 키 필요'); process.exit(1); }

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
const hash = (code) => createHash('sha256').update(code.trim().toUpperCase()).digest('hex');

const CODES = loadCodes();

async function main() {
  console.log(`🔑 ${CODES.length}개 학교 코드 업데이트 시작...`);
  let ok = 0;
  for (const [name, code] of CODES) {
    const { error, count } = await supabase
      .from('universities')
      .update({ open_code_hash: hash(code) }, { count: 'exact' })
      .eq('name', name);
    if (error) console.warn(`  ⚠️ ${name} — ${error.message}`);
    else if (count === 0) console.warn(`  ⚠️ ${name} — 매칭되는 학교 없음 (이름 확인)`);
    else ok++;
  }
  console.log(`✅ 완료 — ${ok}/${CODES.length}개 적용됨.`);
}

main();
