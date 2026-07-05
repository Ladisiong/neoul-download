/**
 * NEOUL 무료 학습자료 — 100% 무인 생성 엔진 (3축: Claude · OpenAI · Gemini)
 * GitHub Actions에서 2일마다 실행 → 8과목 생성 → 한글 PDF(LibreOffice) → materials.json → commit.
 * 모델명은 전부 env로 승격 가능(코드 수정 불필요).
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import { execSync } from 'child_process';

const OUT = 'frontend/materials';
const MANIFEST = 'frontend/materials.json';
mkdirSync(OUT, { recursive: true });

const MODELS = {
  anthropic: process.env.ANTHROPIC_MODEL || 'claude-opus-4-8',
  openai:    process.env.OPENAI_MODEL    || 'gpt-5.5',
  gemini:    process.env.GEMINI_MODEL    || 'gemini-3.1-pro',
};
const KEYS = {
  anthropic: process.env.ANTHROPIC_API_KEY || '',
  openai:    process.env.OPENAI_API_KEY    || '',
  gemini:    process.env.GEMINI_API_KEY    || process.env.GOOGLE_API_KEY || '',
};

// 8과목 → 강점별 3축 배정 (국·영=OpenAI 창작 / 수·과탐=Gemini 추론 / 나머지=Claude 종합)
const SUBJECTS = [
  { cat:'국어',     sub:'독서',        provider:'openai'    },
  { cat:'영어',     sub:'독해',        provider:'openai'    },
  { cat:'수학',     sub:'수학1',       provider:'gemini'    },
  { cat:'과탐',     sub:'생명과학1',   provider:'gemini'    },
  { cat:'사탐',     sub:'생활과윤리',  provider:'anthropic' },
  { cat:'한국사',   sub:'한국사',      provider:'anthropic' },
  { cat:'통합사회', sub:'통합사회',    provider:'anthropic' },
  { cat:'통합과학', sub:'통합과학',    provider:'anthropic' },
];

const PROMPT = (s) => `당신은 대한민국 수능 ${s.cat} 최고 출제 전문가입니다. 무료 배포용 학습자료 1세트를 만드세요.
[원칙]
- 벤치마킹: 평가원 기출·저명 사설·EBS의 출제 유형·난이도·평가요소를 최대한 차용하되, 지문·선지·수치·표현은 완전히 새로 창작한다. 기출 원문 재수록·"단어 하나만 교체"식 변형 절대 금지(저작권).
- 난이도 3단(기본·심화·킬러), 5~7문항. 정답 일관성 필수(수학·과탐은 계산 재검산).
- 해설은 4블록: 정답근거 → 오답분석 → 연관개념 → 메타인지.
- EBS 연계(소재·개념) 반영. 표기는 "SKY 멘토 × AI 협업 출제". "김태민" 등 개인명·성적보장·과장·타사 브랜드(메가/대성/시대인재/더프 등) 금지.
- 과목: ${s.cat} / 세부: ${s.sub}
[출력] 오직 JSON 하나만 출력(코드펜스 금지):
{"concept_html":"개념요약 본문 HTML(h2/p/ul 등, <html>·<body> 없이 본문만)","problems_html":"문제편 본문 HTML(지문 box + 문항)","solutions_html":"해설편 본문 HTML(정답표 + 4블록 해설)"}`;

async function callAnthropic(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'x-api-key':KEYS.anthropic, 'anthropic-version':'2023-06-01', 'content-type':'application/json' },
    body: JSON.stringify({ model:MODELS.anthropic, max_tokens:8000, messages:[{role:'user',content:prompt}] })
  });
  const j = await r.json();
  if (!r.ok) throw new Error('anthropic '+r.status+' '+JSON.stringify(j).slice(0,200));
  return j.content.map(c=>c.text||'').join('');
}
async function callOpenAI(prompt) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{ 'authorization':'Bearer '+KEYS.openai, 'content-type':'application/json' },
    body: JSON.stringify({ model:MODELS.openai, messages:[{role:'user',content:prompt}], max_completion_tokens:8000 })
  });
  const j = await r.json();
  if (!r.ok) throw new Error('openai '+r.status+' '+JSON.stringify(j).slice(0,200));
  return j.choices[0].message.content;
}
async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent?key=${KEYS.gemini}`;
  const r = await fetch(url, {
    method:'POST', headers:{ 'content-type':'application/json' },
    body: JSON.stringify({ contents:[{ parts:[{ text:prompt }] }] })
  });
  const j = await r.json();
  if (!r.ok) throw new Error('gemini '+r.status+' '+JSON.stringify(j).slice(0,200));
  return j.candidates[0].content.parts.map(p=>p.text||'').join('');
}
const CALL = { anthropic:callAnthropic, openai:callOpenAI, gemini:callGemini };

function extractJSON(text){
  let t = text.trim().replace(/^```(json)?/i,'').replace(/```$/,'').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a<0||b<0) throw new Error('no json in model output');
  return JSON.parse(t.slice(a,b+1));
}

const CSS = `<style>@page{size:A4;margin:18mm}body{font-family:"Noto Serif CJK KR","Noto Sans CJK KR",serif;color:#12222f;line-height:1.7;font-size:11pt}h1{color:#0A3D62;font-size:16pt;border-bottom:3px solid #1B6CA8;padding-bottom:6px}h2{color:#1B6CA8;font-size:12.5pt;margin-top:16px}.tag{color:#5A7890;font-size:9pt}.box{background:#EAF4FB;border-left:4px solid #3498DB;padding:8px 12px;margin:10px 0}.foot{margin-top:22px;color:#5A7890;font-size:8.5pt;border-top:1px solid #D6E9F5;padding-top:8px}b{color:#0A3D62}</style>`;
const FOOT = `<div class="foot">너울(NEOUL) 무료 학습자료 · SKY 출신 교과 멘토 × AI 공동 출제 · ${new Date().toISOString().slice(0,10)}<br>교육과정 성취기준 기반 새 창작(기출 지문·문항 미수록). 어떤 성적도 보장하지 않습니다. 학습 목적 제공·무단 상업적 재배포 금지.</div>`;
const page = (title, tag, body) => `<html><head><meta charset="utf-8">${CSS}</head><body><h1>${title}</h1><div class="tag">${tag}</div>${body}${FOOT}</body></html>`;

function htmlToPdf(html, outPdf){
  const tmp = '/tmp/_nk_'+Math.random().toString(36).slice(2)+'.html';
  writeFileSync(tmp, html);
  execSync(`soffice --headless --convert-to pdf --outdir /tmp "${tmp}"`, { stdio:'ignore' });
  const pdf = tmp.replace(/\.html$/, '.pdf');
  execSync(`gs -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outPdf}" "${pdf}"`, { stdio:'ignore' });
}

const items = [];
for (const s of SUBJECTS) {
  const order = [s.provider, 'anthropic', 'openai', 'gemini'];
  let data=null, used=null, lastErr='';
  for (const p of order) {
    if (!KEYS[p]) continue;
    try { data = extractJSON(await CALL[p](PROMPT(s))); used=p; break; }
    catch(e){ lastErr=String(e); console.log(`  [${s.cat}] ${p} 실패: ${lastErr.slice(0,120)}`); }
  }
  if (!data) { console.log(`  [${s.cat}] 전 provider 실패 — 스킵`); continue; }
  const tag = `${s.cat} · ${s.sub} · SKY 멘토 × AI(${used}) 협업 출제 · v-auto`;
  const set = [
    { type:'개념요약', body:data.concept_html },
    { type:'문제편',   body:data.problems_html },
    { type:'해설편',   body:data.solutions_html },
  ];
  for (const d of set) {
    if (!d.body) continue;
    const file = `${s.cat}_${s.sub}_${d.type}.pdf`;
    try {
      htmlToPdf(page(`${s.cat} ${s.sub} · ${d.type}`, tag, d.body), `${OUT}/${file}`);
      items.push({ category:s.cat, subject:s.sub, type:d.type, file, provider:used });
      console.log(`  [${s.cat}] ${d.type} PDF OK (${used})`);
    } catch(e){ console.log(`  [${s.cat}] ${d.type} PDF 실패: ${String(e).slice(0,120)}`); }
  }
}

// 매니페스트 = 이번 생성분(신규 회차가 전과목 교체)
const manifest = { updated:new Date().toISOString().slice(0,10), provenance:'SKY 멘토 × AI 협업 출제', items };
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(`\n완료: PDF ${items.length}개 / materials.json 갱신`);
if (items.length === 0) { console.error('생성 0개 — 실패로 종료'); process.exit(1); }
