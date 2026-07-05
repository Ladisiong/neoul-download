/**
 * NEOUL 무료 학습자료 — 100% 무인 생성 엔진 v2 (품질 최우선)
 * 변경 핵심(v1 결함 4종 근본수정):
 *  1) 모델명 비노출  — PDF 표기에서 AI(provider)/v-auto 제거 → "SKY 멘토 × AI 협업 출제"만.
 *  2) 수식 렌더      — LibreOffice(JS 미실행) → Chromium(Playwright) 프린트 + KaTeX 렌더. raw LaTeX 제거.
 *  3) 도형/그래프    — 문항 내 인라인 <svg> 강제(자기완결). "그림과 같이"인데 그림 없는 문제 금지.
 *  4) 라우팅 품질    — 전 과목 주력 = Opus 4.8(anthropic). 타 모델은 폴백만. (수학=flash 자의배정 폐기)
 *  + 레이아웃        — 문항 카드/여백/줄바꿈(overflow-wrap) 정비로 글자 잘림 제거.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { chromium } from 'playwright';

const OUT = 'frontend/materials';
const MANIFEST = 'frontend/materials.json';
mkdirSync(OUT, { recursive: true });

const MODELS = {
  anthropic: process.env.ANTHROPIC_MODEL || 'claude-opus-4-8',
  openai:    process.env.OPENAI_MODEL    || 'gpt-5.5',
  gemini:    process.env.GEMINI_MODEL    || 'gemini-3.5-flash',
};
const KEYS = {
  anthropic: process.env.ANTHROPIC_API_KEY || '',
  openai:    process.env.OPENAI_API_KEY || '',
  gemini:    process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
};

// 품질 최우선(거버넌스: 전 부서 1순위 = Opus 4.8). 전 과목 주력 = anthropic, 나머지는 폴백만.
const FALLBACK = ['anthropic', 'openai', 'gemini'];

const SUBJECTS = [
  { cat:'국어', sub:'독서' }, { cat:'국어', sub:'문학' }, { cat:'국어', sub:'화법과작문' }, { cat:'국어', sub:'언어와매체' },
  { cat:'영어', sub:'독해' },
  { cat:'한국사', sub:'한국사' },
  { cat:'수학', sub:'수학1' }, { cat:'수학', sub:'수학2' }, { cat:'수학', sub:'확률과통계' }, { cat:'수학', sub:'미적분' }, { cat:'수학', sub:'기하' },
  { cat:'사탐', sub:'생활과윤리' }, { cat:'사탐', sub:'윤리와사상' }, { cat:'사탐', sub:'한국지리' }, { cat:'사탐', sub:'세계지리' }, { cat:'사탐', sub:'정치와법' }, { cat:'사탐', sub:'경제' }, { cat:'사탐', sub:'사회문화' }, { cat:'사탐', sub:'동아시아사' }, { cat:'사탐', sub:'세계사' },
  { cat:'과탐', sub:'물리학1' }, { cat:'과탐', sub:'물리학2' }, { cat:'과탐', sub:'화학1' }, { cat:'과탐', sub:'화학2' }, { cat:'과탐', sub:'생명과학1' }, { cat:'과탐', sub:'생명과학2' }, { cat:'과탐', sub:'지구과학1' }, { cat:'과탐', sub:'지구과학2' },
  { cat:'통합사회', sub:'통합사회' }, { cat:'통합과학', sub:'통합과학' },
];

// 파일럿: ONLY_SUBJECTS="미적분,물리학1" 지정 시 해당 세부과목만 생성(검증용). 미지정=전 과목.
const ONLY=(process.env.ONLY_SUBJECTS||'').split(',').map(x=>x.trim()).filter(Boolean);
const RUN=ONLY.length?SUBJECTS.filter(s=>ONLY.includes(s.sub)):SUBJECTS;

const PROMPT = (s) => `당신은 대한민국 수능 ${s.cat}(${s.sub}) 최고 출제 전문가입니다. 무료 배포용 학습자료 1세트를 만드세요.

[절대 원칙]
1. 자기완결성: 문제는 스스로 완결되어야 한다. "그림과 같이", "다음 그래프에서"처럼 도형·그래프를 언급하면 그 도형·그래프를 반드시 문항 안에 인라인 <svg>로 직접 그려 넣는다. 외부 이미지/링크 금지. 도형을 언급하면서 도형이 없는 문제 절대 금지.
2. 수식: 모든 수식·기호는 반드시 인라인은 $ ... $, 별행은 $$ ... $$ 로 감싼다. (예: $\\lim_{x\\to 2}\\frac{x^2+ax+b}{x-2}=5$) 다른 구분자(\\( \\) \\[ \\])나 순수 텍스트 수식 금지.
3. 도형/그래프: <svg viewBox="0 0 W H"> 에 좌표축·눈금·라벨·점 좌표를 정확히 그린다. 함수 그래프는 실제 좌표로 <path>/<polyline>, 기하 도형은 정확한 비율·각도. 색은 흑/남색 위주, 폰트 12px 내외.
4. 정확성: 정답·풀이 수치는 반드시 재검산(수학·과탐은 계산 2회 검증). 정답표와 해설의 수치가 일치해야 한다.
5. 벤치마킹: 평가원 기출·EBS의 유형·난이도·평가요소만 차용하고, 지문·선지·수치·표현·도형은 완전히 새로 창작한다. 기출 원문 재수록·부분치환 절대 금지(저작권).
6. 구성: 난이도 3단(기본·심화·킬러), 5~7문항. 해설 4블록(정답근거→오답분석→연관개념→메타인지).
7. 표기: "SKY 멘토 × AI 협업 출제"만 사용. 개인명(김태민 등)·특정 AI 모델명(gemini/gpt/claude 등)·타사 브랜드(메가/대성/시대인재/이투스/EBS 강사명 등)·성적보장·과장 표현 금지.

[출력] 오직 JSON 하나만 출력(코드펜스 금지):
{"concept_html":"개념요약 본문 HTML","problems_html":"문제편 본문 HTML","solutions_html":"해설편 본문 HTML"}
- 각 값은 <html>/<body> 없이 본문 HTML만. 문항은 <div class="q"><span class="no">[기본] 1</span> ... </div> 구조.
- 도형·그래프는 인라인 <svg>, 수식은 $ ... $ / $$ ... $$.`;

async function callAnthropic(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'x-api-key':KEYS.anthropic, 'anthropic-version':'2023-06-01', 'content-type':'application/json' },
    body: JSON.stringify({ model:MODELS.anthropic, max_tokens:20000, messages:[{role:'user',content:prompt}] })
  });
  const j = await r.json();
  if (!r.ok) throw new Error('anthropic '+r.status+' '+JSON.stringify(j).slice(0,200));
  return j.content.map(c=>c.text||'').join('');
}
async function callOpenAI(prompt) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{ 'authorization':'Bearer '+KEYS.openai, 'content-type':'application/json' },
    body: JSON.stringify({ model:MODELS.openai, messages:[{role:'user',content:prompt}], max_completion_tokens:24000, reasoning_effort:'low' })
  });
  const j = await r.json();
  if (!r.ok) throw new Error('openai '+r.status+' '+JSON.stringify(j).slice(0,200));
  return j.choices[0].message.content;
}
async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent?key=${KEYS.gemini}`;
  const r = await fetch(url, { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ contents:[{ parts:[{ text:prompt }] }] }) });
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

const CSS = `<style>
@page{size:A4}
*{box-sizing:border-box}
body{font-family:"Noto Sans CJK KR","Noto Serif CJK KR",sans-serif;color:#12222f;line-height:1.65;font-size:11pt;margin:0}
h1{color:#0A3D62;font-size:17pt;border-bottom:3px solid #1B6CA8;padding-bottom:8px;margin:0 0 4px}
h2{color:#1B6CA8;font-size:12.5pt;margin:18px 0 6px}
h3{font-size:11.5pt;margin:14px 0 4px}
p{margin:6px 0;word-break:keep-all;overflow-wrap:anywhere}
ul,ol{margin:6px 0 6px 18px}
.tag{color:#5A7890;font-size:9pt;margin-bottom:10px}
.q{border:1px solid #CFE2F0;border-radius:8px;padding:12px 14px;margin:12px 0;page-break-inside:avoid;overflow-wrap:anywhere}
.q .no{display:inline-block;background:#1B6CA8;color:#fff;font-size:9pt;border-radius:4px;padding:1px 8px;margin-bottom:6px}
.box{background:#EAF4FB;border-left:4px solid #3498DB;padding:8px 12px;margin:10px 0;overflow-wrap:anywhere}
svg{max-width:100%;height:auto;display:block;margin:10px auto}
table{border-collapse:collapse;width:100%;margin:8px 0}
th,td{border:1px solid #CFE2F0;padding:5px 8px;font-size:10.5pt;text-align:center;overflow-wrap:anywhere}
.foot{margin-top:22px;color:#5A7890;font-size:8.5pt;border-top:1px solid #D6E9F5;padding-top:8px}
b{color:#0A3D62}
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">`;

const KATEX_JS =
  '<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>' +
  '<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>' +
  '<script>window.addEventListener("load",function(){try{renderMathInElement(document.body,{delimiters:[{left:"$$",right:"$$",display:true},{left:"$",right:"$",display:false}],throwOnError:false});}catch(e){}document.body.setAttribute("data-katex-done","1");});</script>';

const FOOT = `<div class="foot">너울(NEOUL) 무료 학습자료 · SKY 출신 교과 멘토 × AI 협업 출제 · ${new Date().toISOString().slice(0,10)}<br>교육과정 성취기준 기반 새 창작(기출 지문·문항 미수록). 어떤 성적도 보장하지 않습니다. 학습 목적 제공·무단 상업적 재배포 금지.</div>`;
const page = (title, tag, body) => `<!doctype html><html><head><meta charset="utf-8">${CSS}</head><body><h1>${title}</h1><div class="tag">${tag}</div>${body}${FOOT}${KATEX_JS}</body></html>`;

let BROWSER = null;
async function getBrowser(){ if(!BROWSER) BROWSER = await chromium.launch({ args:['--no-sandbox'] }); return BROWSER; }
async function htmlToPdf(html, outPdf){
  const b = await getBrowser();
  const pg = await b.newPage();
  try {
    await pg.setContent(html, { waitUntil:'networkidle', timeout:60000 });
    await pg.waitForFunction('document.body.getAttribute("data-katex-done")==="1"', { timeout:15000 }).catch(()=>{});
    await pg.pdf({ path: outPdf, format:'A4', printBackground:true, margin:{ top:'16mm', bottom:'16mm', left:'14mm', right:'14mm' } });
  } finally { await pg.close(); }
}

const items = [];
for (const s of RUN) {
  let data=null, used=null;
  for (const p of FALLBACK) {
    if (!KEYS[p]) continue;
    try { data = extractJSON(await CALL[p](PROMPT(s))); used=p; break; }
    catch(e){ console.log(` [${s.cat}] ${s.sub} ${p} 실패: ${String(e).slice(0,120)}`); }
  }
  if (!data) { console.log(` [${s.cat}] ${s.sub} 전 provider 실패 — 스킵`); continue; }
  const tag = `${s.cat} · ${s.sub} · SKY 멘토 × AI 협업 출제`;
  const set = [
    { type:'개념요약', body:data.concept_html },
    { type:'문제편', body:data.problems_html },
    { type:'해설편', body:data.solutions_html },
  ];
  for (const d of set) {
    if (!d.body) continue;
    const file = `${s.cat}_${s.sub}_${d.type}.pdf`;
    try {
      await htmlToPdf(page(`${s.cat} ${s.sub} · ${d.type}`, tag, d.body), `${OUT}/${file}`);
      items.push({ category:s.cat, subject:s.sub, type:d.type, file });
      console.log(` [${s.cat}] ${s.sub} ${d.type} PDF OK`);
    } catch(e){ console.log(` [${s.cat}] ${s.sub} ${d.type} PDF 실패: ${String(e).slice(0,120)}`); }
  }
}
if (BROWSER) await BROWSER.close();

const manifest = { updated:new Date().toISOString().slice(0,10), provenance:'SKY 멘토 × AI 협업 출제', items };
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(`\n완료: PDF ${items.length}개 / materials.json 갱신`);
if (items.length === 0) { console.error('생성 0개 — 실패로 종료'); process.exit(1); }
