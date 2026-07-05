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

const PROMPT = (s, unit) => `당신은 대한민국 수능 ${s.cat}(${s.sub}) 최고 출제 전문가입니다. 무료 배포용 학습자료 1세트를 만드세요.

이번 자료의 단원(unit)은 「${unit}」 이다. 반드시 이 단원 범위 안에서만 개념·문항·해설을 구성하라(다른 단원 내용 혼입 금지).

[절대 원칙]
1. 자기완결성: 문제는 스스로 완결되어야 한다. "그림과 같이", "다음 그래프에서"처럼 도형·그래프를 언급하면 그 도형·그래프를 반드시 문항 안에 인라인 <svg>로 직접 그려 넣는다. 외부 이미지/링크 금지. 도형을 언급하면서 도형이 없는 문제 절대 금지.
2. 수식: 모든 수식·기호는 반드시 인라인은 $ ... $, 별행은 $$ ... $$ 로 감싼다. (예: $\lim_{x\to 2}\frac{x^2+ax+b}{x-2}=5$) 다른 구분자나 순수 텍스트 수식 금지.
3. 도형/그래프: <svg viewBox="0 0 W H"> 에 좌표축·눈금·라벨·점 좌표를 정확히 그린다. 함수 그래프는 실제 좌표로 <path>/<polyline>, 기하 도형은 정확한 비율·각도. 색은 흑/남색 위주, 폰트 12px 내외.
4. 정확성: 정답·풀이 수치는 반드시 재검산(수학·과탐은 계산 2회 검증). 정답표와 해설의 수치가 일치해야 한다.
5. 벤치마킹: 평가원 기출·EBS의 유형·난이도·평가요소만 차용하고, 지문·선지·수치·표현·도형은 완전히 새로 창작한다. 기출 원문 재수록·부분치환 절대 금지(저작권).
6. 구성: 난이도 3단(기본·심화·킬러), 5~7문항. 해설 4블록(정답근거 → 오답분석 → 연관개념 → 메타인지).
7. 표기: "SKY 멘토 × AI 협업 출제"만 사용. 개인명(김태민 등)·특정 AI 모델명(gemini/gpt/claude 등)·타사 브랜드(메가/대성/시대인재/이투스/EBS 강사명 등)·성적보장·과장 표현 금지.

[출력] 오직 JSON 하나만 출력(코드펜스 금지):
{"topic":"이 단원의 핵심 소주제 한 줄(15자 내외)","concept_html":"개념요약 본문 HTML","problems_html":"문제편 본문 HTML","solutions_html":"해설편 본문 HTML"}
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
