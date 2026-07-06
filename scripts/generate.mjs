/**
 * NEOUL 무료 학습자료 — 100% 무인 생성 엔진 v2 (품질 최우선)
 * 변경 핵심(v1 결함 4종 근본수정):
 *  1) 모델명 비노출  — PDF 표기에서 AI(provider)/v-auto 제거 → "SKY 멘토 × AI 협업 출제"만.
 *  2) 수식 렌더      — LibreOffice(JS 미실행) → Chromium(Playwright) 프린트 + KaTeX 렌더. raw LaTeX 제거.
 *  3) 도형/그래프    — 문항 내 인라인 <svg> 강제(자기완결). "그림과 같이"인데 그림 없는 문제 금지.
 *  4) 라우팅 품질    — 전 과목 주력 = Opus 4.8(anthropic). 타 모델은 폴백만. (수학=flash 자의배정 폐기)
 *  + 레이아웃        — 문항 카드/여백/줄바꿈(overflow-wrap) 정비로 글자 잘림 제거.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
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

const PROMPT = (s, unit) => `당신은 대한민국 수능·내신 ${s.cat}(${s.sub}) 최고 출제·해설 집필 전문가입니다. 시중 최상위 문제집과 평가원 해설집 수준의 학습자료 1세트를 만드세요. 타깃 독자는 고3 1~2등급·재수생 상위권이다. 시대인재·대성 최상위 프리미엄 교재 수준으로 만들어 '무료 배포이지만 유료 교재보다 낫다'는 인상을 주어야 한다(화장품이 샘플에 최고 퀄리티를 넣는 전략과 동일—무료라고 퀄리티가 낮으면 실패한다). 이 자료의 궁극 목적은 학생이 감탄해 '너울(NEOUL)'로 유입되는 매개체가 되는 것이다.

이번 자료의 단원(unit)은 「${unit}」 이다. 반드시 이 단원 범위 안에서만 개념·문항·해설을 구성하라(다른 단원 내용 혼입 금지).

[절대 원칙]
1. 자기완결성: 문제는 스스로 완결되어야 한다. "그림과 같이", "다음 그래프에서"처럼 도형·그래프를 언급하면 그 도형·그래프를 반드시 문항 안에 인라인 <svg>로 직접 그려 넣는다. 외부 이미지/링크 금지. 도형을 언급하면서 도형이 없는 문제 절대 금지.
2. 수식: 모든 수식·기호는 반드시 인라인은 $ ... $, 별행은 $$ ... $$ 로 감싼다. (예: $\lim_{x\to 2}\frac{x^2+ax+b}{x-2}=5$) 다른 구분자나 순수 텍스트 수식 금지. 수식 안 부등호는 반드시 \lt \gt \le \ge 로 쓰고 원시 문자 <, >, ≤, ≥ 는 수식 안에서 사용 금지(HTML 파싱이 깨져 날raw LaTeX가 노출됨).
3. 도형/그래프: <svg viewBox="0 0 W H"> 에 좌표축·눈금·라벨·점 좌표를 정확히 그린다. 함수 그래프는 실제 좌표로 <path>/<polyline>, 기하 도형은 정확한 비율·각도. 색은 흑/남색 위주, 폰트 12px 내외.
4. 정확성: 정답·풀이 수치는 반드시 재검산(수학·과탐은 계산 2회 검증). 정답표와 해설의 수치가 일치해야 한다.
5. 벤치마킹: 평가원 기출·EBS의 유형·난이도·평가요소만 차용하고, 지문·선지·수치·표현·도형은 완전히 새로 창작한다. 기출 원문 재수록·부분치환 절대 금지(저작권).
6. 난이도(고3 1~2등급·재수 상위권 상향): 5~7문항. 전체 기준선은 "1·2등급이 풀어야 실력이 붙는" 수준으로, 단순 대입·생기초 유형은 배제한다. 3단으로 구성 — 기본=평가원 3점 상~4점 하(1·2등급 변별, 개념의 정확한 적용·정오 판별, 단순 대입 금지), 심화=4점 준킬러(2~3개 개념 통합·조건 해석·역방향 사고), 킬러=최상위 4점 킬러(평가원 21·22·29·30번급). ★킬러는 말 그대로 의대·치대·한의대 지망 최상위권(1등급 최상단)을 변별하는 난이도·퀄리티여야 한다—단순 계산량이 아니라 발상 전환·숨은 조건 포착·다단계 추론·경우 나눔이 결합돼 시대인재 킬러 N제/서바이벌 모의고사급 변별력을 낸다. 무료 자료라고 절대 쉽게 내지 말 것. 각 문항 [기본]/[심화]/[킬러] 옆에 배점 [3점] 또는 [4점]을 표기하고 킬러를 최소 1문항 포함한다. ★배점↔체감난이도 정합 강제: [3점]은 3점다운(핵심 개념+1회 사고), [4점]은 4점다운(다단계·개념 통합) 실제 난이도여야 하며, 배점만 높고 쉬운(또는 배점 낮고 어려운) 불일치는 금지. 흔한 실수(부호·정의역·극한의 존재조건·경계값·필요충분·수렴판정)를 유발하는 매력적 오답 선지를 의도적으로 배치한다. 정답은 반드시 깔끔한 값이어야 하며(지저분한 분수·무리수 남발 금지), 모든 수치는 손계산으로 2회 재검산해 문항·정답표·해설이 완전히 일치해야 한다. 7. 개념요약(빈약·생기초 금지): concept_html은 고3 1~2등급이 시험 직전 단권화로 쓸 밀도여야 한다. 정의 나열에 그치지 말고 ①핵심 정의·정리·공식(필요 시 유도 과정) ②시험 빈출 유형별 접근 전략 ③자주 틀리는 함정·주의점 ④암기용 요약표/도식을 담는다. 중학·자명 상식 수준(생기초) 서술 금지. <h3> 소제목으로 구획한다.
8. 해설편(가독성·해설집 어휘·스텝 필수, 전 과목 공통 — 시각적 구조화 필수): 어떤 과목이든 줄글 나열식 해설은 학생이 즉시 스킵하므로 반드시 단계로 끊는다. ▸수학·과탐=계산·논리 단계 / ▸국어·영어=[지문 근거 찾기]→[선지 대조]→[정답 확정] / ▸사탐·한국사=[개념 적용]→[자료 해석]→[선지 판별]로 사고 흐름을 단계화한다. 반드시 <div class="sol"> 안에서 <div class="step"><b>Step 1.</b> …</div> 을 단계마다 반복해 각 단계에서 '무엇을 왜' 하는지 짧게 제시하고, 핵심 수식은 별행 $$…$$. 실제 시중 해설집·평가원 해설의 표준 어휘·표기("조건에 의하여", "주어진 식을 정리하면", "~이므로", "양변을 …", "∴", "따라서", "그러므로")를 사용한다. 스텝 풀이 뒤에 <div class="blk">…</div>로 4블록(<span class="lb">정답근거</span> → <span class="lb">오답분석</span>[배치한 함정 명시] → <span class="lb">연관개념</span> → <span class="lb">메타인지</span> 한 줄)을 붙인다.
9. 표기: "SKY 멘토 × AI 협업 출제"만 사용. 개인명(김태민 등)·특정 AI 모델명(gemini/gpt/claude 등)·타사 브랜드(메가/대성/시대인재/이투스/EBS 강사명 등)·성적보장·과장 표현 금지.
10. 시각화·가독성 최우선(개념·문제·해설 전부): 긴 글 덩어리 금지. 핵심은 <table>(비교·분류·공식표), <div class="box">(정의·핵심·함정 강조 박스), <b>색 강조</b>, 번호 목록, 필요한 곳엔 인라인 <svg> 도식(개념 관계도·그래프·기하)으로 시각화한다. 한눈에 구조가 들어오는 프리미엄 편집(시대인재式)을 지향한다.
11. 통합사회·통합과학: 절대 중학·기초 나열 수준 금지. 수능 통합과학/통합사회 상위 수준으로 여러 개념의 연결·자료(그래프·표) 해석·실생활 적용 추론을 담아 고3 상위권도 사고하게 만든다.

[출력] 오직 JSON 하나만 출력(코드펜스 금지):
{"topic":"이 단원의 핵심 소주제 한 줄(15자 내외)","concept_html":"개념요약 본문 HTML","problems_html":"문제편 본문 HTML","solutions_html":"해설편 본문 HTML"}
- 각 값은 <html>/<body> 없이 본문 HTML만. 문항은 <div class="q"><span class="no">[기본] 1</span> ... </div> 구조(심화는 class="no adv", 킬러는 class="no killer").
- 개념요약은 <h3>소제목</h3>으로 구획하고 필요 시 <table>/<div class="box"> 사용. 해설편 각 풀이는 반드시 <div class="sol"> 안에 <div class="step"><b>Step 1.</b>…</div>을 단계마다 반복(줄글 금지)한 뒤 <div class="blk">…4블록…</div>.
- 도형·그래프는 인라인 <svg>, 수식은 $ ... $ / $$ ... $$.`;

const LOG_URL = 'https://iwrblahmszuthemfrhmy.supabase.co/functions/v1/log-usage';
function logUsage(provider, model, inTok, outTok){
  try{ fetch(LOG_URL,{method:'POST',headers:{'content-type':'application/json','x-bhtm-log':'bhtm-usage-2026'},body:JSON.stringify({provider,model,feature:'free-dist-engine',input_tokens:inTok||0,output_tokens:outTok||0})}).catch(function(){}); }catch(e){}
}
async function callAnthropic(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'x-api-key':KEYS.anthropic, 'anthropic-version':'2023-06-01', 'content-type':'application/json' },
    body: JSON.stringify({ model:MODELS.anthropic, max_tokens:20000, messages:[{role:'user',content:prompt}] })
  });
  const j = await r.json();
  if (!r.ok) throw new Error('anthropic '+r.status+' '+JSON.stringify(j).slice(0,200));
  logUsage('anthropic', MODELS.anthropic, j.usage&&j.usage.input_tokens, j.usage&&j.usage.output_tokens);
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
  logUsage('openai', MODELS.openai, j.usage&&j.usage.prompt_tokens, j.usage&&j.usage.completion_tokens);
  return j.choices[0].message.content;
}
async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent?key=${KEYS.gemini}`;
  const r = await fetch(url, { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ contents:[{ parts:[{ text:prompt }] }] }) });
  const j = await r.json();
  if (!r.ok) throw new Error('gemini '+r.status+' '+JSON.stringify(j).slice(0,200));
  logUsage('gemini', MODELS.gemini, j.usageMetadata&&j.usageMetadata.promptTokenCount, j.usageMetadata&&j.usageMetadata.candidatesTokenCount);
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
.q .no.adv{background:#B8860B}
.q .no.killer{background:#7B241C}
.sol{margin:8px 0}
.step{margin:5px 0;padding:6px 10px 6px 12px;border-left:3px solid #1B6CA8;background:#F6FAFD;border-radius:0 6px 6px 0;overflow-wrap:anywhere}
.step>b,.step .s{color:#1B6CA8;font-weight:700;margin-right:5px}
.blk{margin:9px 0;padding:9px 12px;border-radius:6px;background:#F4F9FD;border:1px solid #E1EEF7;page-break-inside:avoid}
.blk .lb{display:inline-block;font-weight:700;color:#0A3D62;margin-right:6px}
.concept h3{color:#0A3D62;border-left:4px solid #1B6CA8;padding-left:8px}
svg{max-width:100%;height:auto;display:block;margin:10px auto}
.katex svg{margin:0;max-width:none;height:inherit}
table{border-collapse:collapse;width:100%;margin:8px 0}
th,td{border:1px solid #CFE2F0;padding:5px 8px;font-size:10.5pt;text-align:center;overflow-wrap:anywhere}
.foot{margin-top:22px;color:#5A7890;font-size:8.5pt;border-top:1px solid #D6E9F5;padding-top:8px}
b{color:#0A3D62}
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">`;

const KATEX_JS =
  '<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>' +
  '<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>' +
  '<script>window.addEventListener("load",function(){function done(){document.body.setAttribute("data-katex-done","1");}function render(){try{renderMathInElement(document.body,{delimiters:[{left:"$$",right:"$$",display:true},{left:"$",right:"$",display:false}],throwOnError:false});}catch(e){}setTimeout(done,180);}var fam=["KaTeX_Main","KaTeX_Math","KaTeX_Size1","KaTeX_Size2","KaTeX_Size3","KaTeX_Size4","KaTeX_AMS","KaTeX_Caligraphic","KaTeX_Fraktur","KaTeX_SansSerif","KaTeX_Script","KaTeX_Typewriter"];if(document.fonts&&document.fonts.load){var ps=[];fam.forEach(function(f){["16px ","italic 16px ","bold 16px "].forEach(function(w){ps.push(document.fonts.load(w+f).catch(function(){}));});});Promise.all(ps).then(function(){return (document.fonts.ready||Promise.resolve()).catch(function(){});}).then(render);}else{setTimeout(render,700);}});</script>';

const FOOT = `<div class="foot">너울(NEOUL) 무료 학습자료 · SKY 출신 교과 멘토 × AI 협업 출제 · ${new Date().toISOString().slice(0,10)}<br>교육과정 성취기준 기반 새 창작(기출 지문·문항 미수록). 어떤 성적도 보장하지 않습니다. 학습 목적 제공·무단 상업적 재배포 금지.</div>`;
const CTA = '<div class="box" style="text-align:center;margin-top:16px"><b>이 자료가 도움이 됐다면</b> — 너울(NEOUL)은 5회독 누적복습·AI 맞춤 학습으로 이어집니다. 무료 자료 더 보기 → <b>neoulai.com</b></div>';
const page = (title, tag, body) => `<!doctype html><html><head><meta charset="utf-8">${CSS}</head><body><h1>${title}</h1><div class="tag">${tag}</div>${body}${CTA}${FOOT}${KATEX_JS}</body></html>`;

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

// ---- 커리큘럼 단원 선택(누적) ----
let CURRICULUM={}, COVERAGE={};
try{ CURRICULUM=JSON.parse(readFileSync(new URL('./curriculum.json', import.meta.url),'utf-8')); }catch(e){ console.log('curriculum load fail: '+String(e).slice(0,90)); }
try{ COVERAGE=JSON.parse(readFileSync('frontend/coverage.json','utf-8')); }catch(e){ COVERAGE={}; }
function pickUnit(cat, sub){
  const key=cat+'|'+sub; const units=CURRICULUM[key]||['1단원'];
  let next=units.find(u=>!(COVERAGE[key]||[]).includes(u));
  if(!next){ COVERAGE[key]=[]; next=units[0]; }
  return next;
}
const plan = RUN.map(s=>({cat:s.cat, sub:s.sub, unit:pickUnit(s.cat,s.sub)}));
console.log('생성 계획: '+plan.map(p=>p.sub+'/'+p.unit).join(', '));

// ---- QC(자가치유) ----
const CRIT=['rawLatex','modelName','brand','figMissing'];
function qcStatic(d){
  const html=[d.concept_html,d.problems_html,d.solutions_html].join(' ');
  const pr=d.problems_html||'';
  const flags=[];
  if(/\\\(|\\\[/.test(html)) flags.push('rawLatex');
  if(/gemini|openai|anthropic|claude|gpt-/i.test(html)) flags.push('modelName');
  if(/메가스터디|대성마이맥|시대인재|이투스|김태민/.test(html)) flags.push('brand');
  if(/그림|그래프|좌표|아래 그림|그림과 같이|다음 그림/.test(pr) && !/<svg/i.test(pr)) flags.push('figMissing');
  if(pr.replace(/<[^>]+>/g,'').replace(/\s/g,'').length < 120) flags.push('problemsShort');
  return flags;
}
const RETRY_NOTE='\n\n[재요청] 직전 출력에 결함이 있었다. 규칙 100% 준수: 모든 수식은 $ … $ / $$ … $$, 도형·그래프는 반드시 인라인 <svg>, 특정 AI 모델명·타사 브랜드·개인명 금지. 다시 출력하라.';
async function genData(s, unit, extra){
  for(const pv of FALLBACK){ if(!KEYS[pv]) continue;
    try{ return { data: extractJSON(await CALL[pv](PROMPT(s, unit)+(extra||''))), used:pv }; }
    catch(e){ console.log(` [${s.cat}] ${s.sub} ${pv} 실패: ${String(e).slice(0,100)}`); }
  }
  return null;
}
async function answerAudit(s, unit, data){
  if(!KEYS.anthropic) return null;
  const strip=(h)=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,3500);
  const prompt=`다음은 수능 ${s.cat}(${s.sub}) 「${unit}」 문제편과 해설편이다. 각 문항의 정답과 풀이가 문제와 논리적으로 일치하고 계산이 정확한지 점검하라. 오류가 있는 문항 번호와 한줄 사유만 JSON으로: {"issues":[{"no":정수,"why":"..."}]}. 문제 없으면 {"issues":[]}. 오직 JSON만.\n\n[문제편]\n${strip(data.problems_html)}\n\n[해설편]\n${strip(data.solutions_html)}`;
  try{ const j=extractJSON(await callAnthropic(prompt)); return Array.isArray(j.issues)? j.issues : []; }catch(e){ return null; }
}
const AUDIT = ONLY.length
  ? new Set(plan.map(s=>s.cat+'|'+s.sub))
  : (()=>{ const pool=plan.filter(s=>s.cat==='수학'||s.cat==='과탐'); for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];} return new Set(pool.slice(0,4).map(s=>s.cat+'|'+s.sub)); })();

function fnsafe(u){ return String(u).replace(/[\/\\?%*:|"<>·().,\s]+/g,'').slice(0,28); }
const items=[]; const qc=[];
for (const s of plan) {
  let r = await genData(s, s.unit);
  if(!r){ console.log(` [${s.cat}] ${s.sub} 전 provider 실패 — 스킵`); qc.push({subject:s.sub,category:s.cat,unit:s.unit,status:'fail',flags:['noData']}); continue; }
  let flags = qcStatic(r.data);
  if(flags.some(f=>CRIT.includes(f))){
    console.log(` [${s.cat}] ${s.sub} QC 결함 ${JSON.stringify(flags)} → 1회 재생성`);
    const r2 = await genData(s, s.unit, RETRY_NOTE);
    if(r2){ const f2=qcStatic(r2.data); if(f2.filter(f=>CRIT.includes(f)).length <= flags.filter(f=>CRIT.includes(f)).length){ r=r2; flags=f2; } }
  }
  const data=r.data;
  const topic=String(data.topic||s.unit).slice(0,40);
  const uf=fnsafe(s.unit);
  const tag=`${s.cat} · ${s.sub} · ${s.unit} · SKY 멘토 × AI 협업 출제`;
  const set=[{type:'개념요약',body:data.concept_html},{type:'문제편',body:data.problems_html},{type:'해설편',body:data.solutions_html}];
  for (const d of set){ if(!d.body) continue; const file=`${s.cat}_${s.sub}_${uf}_${d.type}.pdf`;
    try{ await htmlToPdf(page(`${s.cat} ${s.sub} · ${s.unit} · ${d.type}`, tag, d.body), `${OUT}/${file}`); items.push({category:s.cat,subject:s.sub,unit:s.unit,topic,type:d.type,file}); console.log(` [${s.cat}] ${s.sub}/${s.unit} ${d.type} PDF OK`);}catch(e){console.log(` [${s.cat}] ${s.sub} ${d.type} PDF 실패: ${String(e).slice(0,100)}`);}
  }
  const key=s.cat+'|'+s.sub; COVERAGE[key]=Array.from(new Set([...(COVERAGE[key]||[]), s.unit]));
  const entry={subject:s.sub,category:s.cat,unit:s.unit,topic,status: flags.length?'flagged':'ok', flags};
  if(AUDIT.has(s.cat+'|'+s.sub)){ const iss=await answerAudit(s, s.unit, data); if(iss!==null) entry.answerIssues=iss; }
  qc.push(entry);
}
if (BROWSER) await BROWSER.close();

// ---- 매니페스트 누적(단원키 병합) + 이번 주 무료 샘플 ----
let prev=[]; try{ prev=(JSON.parse(readFileSync(MANIFEST,'utf-8')).items)||[]; }catch(e){}
const runKeys=new Set(plan.map(s=>s.cat+'|'+s.sub+'|'+s.unit));
let merged = prev.filter(it=> it.unit && !runKeys.has(it.category+'|'+it.subject+'|'+it.unit)).concat(items);
merged.forEach(it=>{ delete it.sample; });
const samplePick = plan.find(s=>s.cat==='수학'||s.cat==='과탐') || plan[0];
const sampleKey = samplePick ? (samplePick.cat+'|'+samplePick.sub+'|'+samplePick.unit) : null;
if(sampleKey) merged.forEach(it=>{ if(it.category+'|'+it.subject+'|'+it.unit===sampleKey) it.sample=true; });
writeFileSync(MANIFEST, JSON.stringify({ updated:new Date().toISOString().slice(0,10), provenance:'SKY 멘토 × AI 협업 출제', sample:sampleKey, items:merged }, null, 2));
writeFileSync('frontend/coverage.json', JSON.stringify(COVERAGE, null, 2));

// ---- QC 리포트 ----
const critCount = qc.filter(q=>(q.flags||[]).some(f=>CRIT.includes(f))).length;
const answerFlagged = qc.filter(q=>Array.isArray(q.answerIssues)&&q.answerIssues.length>0).map(q=>q.subject+'/'+q.unit);
writeFileSync('frontend/qc_report.json', JSON.stringify({ generated:new Date().toISOString(), run: ONLY.length?('pilot:'+ONLY.join(',')):'full', sample:sampleKey, subjects_checked:qc.length, critical_flagged:critCount, answer_flagged:answerFlagged, subjects:qc }, null, 2));
console.log(`\n완료: PDF ${items.length}개 / 누적 ${merged.length}개 / QC critical ${critCount} · 정답이슈 ${answerFlagged.length} / 무료샘플 ${sampleKey}`);
if (items.length === 0) { console.error('생성 0개 — 실패로 종료'); process.exit(1); }
