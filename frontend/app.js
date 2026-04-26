/**
 * ============================================================================
 *  너울 — 교육자료 배포 시스템 프론트엔드 로직
 * ============================================================================
 *
 *  Copyright © 2026 김태민 (상표 출원번호 TN26005859KJ)
 *  버전: 1.2.0 (v2.3 — 실시간 통계 제거 + QR코드 모바일 접속 추가)
 *
 *  배포 학습자료 운영 형태:
 *   - 사회탐구·과학탐구: 회차별 문제편 + 해설편 (2파일 1세트, O/X 선택형)
 *   - 한국사: 핵심용어 및 사건정리 단일 통합본
 *   - 경제이론요약집: 요약집 단일 통합본
 *
 *  모든 학습자료는 저작권자 김태민이 직접 출제·집필한 교육 저작물입니다.
 * ============================================================================
 */

// ✅ Apps Script 웹앱 URL — Vercel 사이트 정상 작동을 위해 실제 URL 입력
// (폴더 ID·시트 ID는 Code.gs에만 존재하며 깃허브에 노출되지 않음 — 가이드 7-4 보안 정책 부분 준수)
// 봇 트래픽이 의심되면 Apps Script doGet에 Referer 체크 등 추가 방어 가능
const API_URL = 'https://script.google.com/macros/s/AKfycbxiTEEtbGCZeqteQpVeAZYuwOiYeapz6QYjb-_6ptYTDUm1jRZaGPWjdoKqSowVtI4v/exec';

// 과목 설정 (백엔드와 동일)
// format: 'session' = 회차별 운영 (문제편+해설편 2파일 1세트)
// format: 'summary' = 단일 통합본 (요약집·정리본 형태, 문제·정답 분리 없음)
const SUBJECTS = {
  korean_geography:   { name: '한국지리',     category: '사회탐구', format: 'session' },
  politics_law:       { name: '정치와법',     category: '사회탐구', format: 'session' },
  ethics_thought:     { name: '윤리와사상',   category: '사회탐구', format: 'session' },
  world_geography:    { name: '세계지리',     category: '사회탐구', format: 'session' },
  world_history:      { name: '세계사',       category: '사회탐구', format: 'session' },
  life_ethics:        { name: '생활과윤리',   category: '사회탐구', format: 'session' },
  social_culture:     { name: '사회문화',     category: '사회탐구', format: 'session' },
  east_asian_history: { name: '동아시아사',   category: '사회탐구', format: 'session' },
  economics_social:   { name: '경제',         category: '사회탐구', format: 'session' },
  chemistry1:         { name: '화학1',        category: '과학탐구', format: 'session' },
  earth_science1:     { name: '지구과학1',    category: '과학탐구', format: 'session' },
  biology1:           { name: '생명과학1',    category: '과학탐구', format: 'session' },
  physics1:           { name: '물리학1',      category: '과학탐구', format: 'session' },
  chemistry2:         { name: '화학2',        category: '과학탐구', format: 'session' },
  earth_science2:     { name: '지구과학2',    category: '과학탐구', format: 'session' },
  biology2:           { name: '생명과학2',    category: '과학탐구', format: 'session' },
  physics2:           { name: '물리학2',      category: '과학탐구', format: 'session' },
  korean_history:     { name: '한국사',       category: '기타',     format: 'summary' },
  economic_theory:    { name: '경제이론요약집', category: '기타',  format: 'summary' }
};

let fileData = {};
let currentCategory = 'all';

document.addEventListener('DOMContentLoaded', () => {
  console.log('🌊 너울 시스템 시작 (v2.3 심사용 + QR접속)');
  console.log('📜 저작권자: 김태민 · 상표 출원번호 TN26005859KJ');
  console.log('📚 학습자료: 김태민 본인 출제 교육 저작물');
  initEmptyData();
  loadFileList();
  setupCategoryTabs();
});

function initEmptyData() {
  // 빈 데이터로 초기화 — 모든 과목 카드를 "준비 중" 상태로 먼저 표시
  // 실제 데이터는 loadFileList()가 비동기로 받아와서 덮어씀 (깜빡임 없음)
  fileData = {};
  Object.keys(SUBJECTS).forEach(key => {
    fileData[key] = { problems: [], answers: [] };
  });
  renderSubjects();
}

async function loadFileList() {
  if (API_URL === 'YOUR_APPS_SCRIPT_WEBAPP_URL') {
    console.warn('⚠️ API_URL 미설정 — 데모 데이터 사용 중');
    hideLoadingIndicator();
    return;
  }
  try {
    const response = await fetch(`${API_URL}?action=getFileList`);
    const result = await response.json();
    if (result.success) {
      fileData = result.files;
      renderSubjects();
    }
  } catch (error) {
    console.error('파일 목록 로드 실패:', error);
  } finally {
    hideLoadingIndicator();
  }
}

function hideLoadingIndicator() {
  const el = document.getElementById('loading-indicator');
  if (el) el.classList.add('hidden');
}

function renderSubjects() {
  const grid = document.getElementById('subject-grid');
  if (!grid) return;
  grid.innerHTML = '';

  Object.keys(SUBJECTS).forEach(key => {
    const subject = SUBJECTS[key];
    if (currentCategory !== 'all' && subject.category !== currentCategory) return;

    const data = fileData[key] || { problems: [], answers: [] };
    const totalFiles = data.problems.length + data.answers.length;
    const isEmpty = totalFiles === 0;
    const isSummary = subject.format === 'summary';

    // 운영 형태별 카운트 배지 분기
    let countsHTML;
    if (isSummary) {
      // 한국사·경제이론요약집 — 단일 통합본 (요약집 형태)
      // 백엔드 Code.gs는 요약집을 problems 배열에 담아서 응답 → 그 개수를 요약집 수로 표시
      countsHTML = `<span class="count-badge summary">📚 요약집 ${data.problems.length}</span>`;
    } else {
      // 사회탐구·과학탐구 — 회차별 (문제편+해설편 2파일 1세트)
      countsHTML = `
        <span class="count-badge">📝 문제 ${data.problems.length}</span>
        <span class="count-badge">✅ 정답 ${data.answers.length}</span>
      `;
    }

    // 파일 목록 또는 "준비 중" 메시지
    let listHTML;
    if (isEmpty) {
      listHTML = `<p class="empty-msg">자료 준비 중입니다.</p>`;
    } else if (isSummary) {
      listHTML = renderFileItems(data.problems, subject.name, 'summary');
    } else {
      listHTML = renderFileItems(data.problems, subject.name, 'problem')
               + renderFileItems(data.answers, subject.name, 'answer');
    }

    const card = document.createElement('div');
    card.className = isEmpty ? 'subject-card empty' : 'subject-card';
    card.innerHTML = `
      <h3 class="subject-title">${subject.name}</h3>
      <div class="subject-counts">
        ${countsHTML}
      </div>
      <div class="file-list">
        ${listHTML}
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderFileItems(files, subjectName, type) {
  if (!files || files.length === 0) return '';
  return files.map(file => `
    <div class="file-item">
      <span>${file.displayName} <small style="color: var(--neoul-text-secondary);">(${file.size || '-'})</small></span>
      <button class="download-btn" onclick="downloadFile('${file.id}', '${file.displayName}', '${subjectName}', '${type}')">
        📥 다운로드
      </button>
    </div>
  `).join('');
}

function setupCategoryTabs() {
  const tabs = document.querySelectorAll('.category-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentCategory = tab.dataset.category;
      renderSubjects();
    });
  });
}

async function downloadFile(fileId, fileName, category, type) {
  console.log(`[너울] 다운로드 시작: ${fileName}`);

  if (fileId.startsWith('demo-')) {
    alert(`🌊 너울 데모 버전입니다.\n\n실제 자료는 Apps Script 배포 후 제공됩니다.\n\n저작권자: 김태민\n상표 출원번호: TN26005859KJ\n학습자료: 김태민 본인 출제`);
    return;
  }

  try {
    await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'recordDownload',
        data: {
          timestamp: new Date().toISOString(),
          fileName, fileId, category, type,
          userAgent: navigator.userAgent,
          referrer: document.referrer
        }
      })
    });
  } catch (err) {
    console.warn('로그 기록 실패 (다운로드는 계속 진행):', err);
  }

  window.open(`https://drive.google.com/uc?export=download&id=${fileId}`, '_blank');
}
