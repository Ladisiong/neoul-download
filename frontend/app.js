/**
 * ============================================================================
 *  너울 — 교육자료 배포 시스템 프론트엔드 로직
 * ============================================================================
 *
 *  Copyright © 2026 김태민 (상표 출원번호 TN26005859KJ)
 *  버전: 1.1.0 (v2.2 정합화)
 *
 *  배포 학습자료 운영 형태:
 *   - 사회탐구·과학탐구: 회차별 문제편 + 해설편 (2파일 1세트, O/X 선택형)
 *   - 한국사: 핵심용어 및 사건정리 단일 통합본
 *   - 경제이론요약집: 요약집 단일 통합본
 *
 *  모든 학습자료는 저작권자 김태민이 직접 출제·집필한 교육 저작물입니다.
 * ============================================================================
 */

// ⚠️ D-3 작업 시 Apps Script 배포 후 본인의 실제 URL로 교체 필수.
// 깃허브 공개 코드에는 플레이스홀더 상태로만 푸시하고,
// Vercel 배포 직전 로컬 또는 Vercel 환경변수에서만 실제 값을 사용하세요.
const API_URL = 'https://script.google.com/macros/s/AKfycbx30z-z93T4YYSgjwFSXdj5zb0x5PID5FZzO2Byj7gEjnszuWCp0PCyy0NnNb6x5kYWWA/exec';

// 과목 설정 (백엔드와 동일)
const SUBJECTS = {
  korean_geography: { name: '한국지리', category: '사회탐구' },
  politics_law: { name: '정치와법', category: '사회탐구' },
  ethics_thought: { name: '윤리와사상', category: '사회탐구' },
  world_geography: { name: '세계지리', category: '사회탐구' },
  world_history: { name: '세계사', category: '사회탐구' },
  life_ethics: { name: '생활과윤리', category: '사회탐구' },
  social_culture: { name: '사회문화', category: '사회탐구' },
  east_asian_history: { name: '동아시아사', category: '사회탐구' },
  economics_social: { name: '경제', category: '사회탐구' },
  chemistry1: { name: '화학1', category: '과학탐구' },
  earth_science1: { name: '지구과학1', category: '과학탐구' },
  biology1: { name: '생명과학1', category: '과학탐구' },
  physics1: { name: '물리학1', category: '과학탐구' },
  chemistry2: { name: '화학2', category: '과학탐구' },
  earth_science2: { name: '지구과학2', category: '과학탐구' },
  biology2: { name: '생명과학2', category: '과학탐구' },
  physics2: { name: '물리학2', category: '과학탐구' },
  korean_history: { name: '한국사', category: '기타' },
  economic_theory: { name: '경제이론요약집', category: '기타' }
};

let fileData = {};
let statsData = {};
let currentCategory = 'all';

document.addEventListener('DOMContentLoaded', () => {
  console.log('🌊 너울 시스템 시작');
  console.log('📜 저작권자: 김태민 · 상표 출원번호 TN26005859KJ');
  console.log('📚 학습자료: 김태민 본인 출제 교육 저작물');
  initDemoData();
  loadFileList();
  loadStats();
  setupCategoryTabs();
});

function initDemoData() {
  fileData = {};
  Object.keys(SUBJECTS).forEach(key => {
    fileData[key] = {
      problems: [
        { id: `demo-${key}-1`, displayName: `${SUBJECTS[key].name} 1회차`, size: '2.5 MB' },
        { id: `demo-${key}-2`, displayName: `${SUBJECTS[key].name} 2회차`, size: '2.3 MB' }
      ],
      answers: [
        { id: `demo-${key}-ans-1`, displayName: `${SUBJECTS[key].name} 정답 1회차`, size: '0.5 MB' }
      ]
    };
  });
  statsData = {
    totalDownloads: '운영 시작',
    todayDownloads: '신규',
    thisWeekDownloads: '런칭 주간',
    thisMonthDownloads: '2026년 4월'
  };
  renderSubjects();
  renderStats();
}

async function loadFileList() {
  if (API_URL === 'YOUR_APPS_SCRIPT_WEBAPP_URL') {
    console.warn('⚠️ API_URL 미설정 — 데모 데이터 사용 중');
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
  }
}

async function loadStats() {
  if (API_URL === 'YOUR_APPS_SCRIPT_WEBAPP_URL') return;
  try {
    const response = await fetch(`${API_URL}?action=getStats`);
    const result = await response.json();
    statsData = result;
    renderStats();
  } catch (error) {
    console.error('통계 로드 실패:', error);
  }
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
    if (totalFiles === 0) return;

    const card = document.createElement('div');
    card.className = 'subject-card';
    card.innerHTML = `
      <h3 class="subject-title">${subject.name}</h3>
      <div class="subject-counts">
        <span class="count-badge">📝 문제 ${data.problems.length}</span>
        <span class="count-badge">✅ 정답 ${data.answers.length}</span>
      </div>
      <div class="file-list">
        ${renderFileItems(data.problems, subject.name, 'problem')}
        ${renderFileItems(data.answers, subject.name, 'answer')}
      </div>
    `;
    grid.appendChild(card);
  });

  if (grid.children.length === 0) {
    grid.innerHTML = `
      <div class="subject-card">
        <h3 class="subject-title">준비 중</h3>
        <p style="color: var(--neoul-text-secondary); font-size: 0.9rem;">
          해당 카테고리의 자료가 곧 업로드됩니다.
        </p>
      </div>
    `;
  }
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

function renderStats() {
  const format = (val) => {
    if (typeof val === 'number') return val.toLocaleString();
    return val || '-';
  };
  document.getElementById('total-downloads').textContent = format(statsData.totalDownloads);
  document.getElementById('today-downloads').textContent = format(statsData.todayDownloads);
  document.getElementById('week-downloads').textContent = format(statsData.thisWeekDownloads);
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
