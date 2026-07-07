const APP_PREFIX = 'fatherCarelog.v3';
const ACTIVE_PROFILE_KEY = `${APP_PREFIX}.activeProfile`;
const LAST_PROFILE_KEY = `${APP_PREFIX}.lastProfile`;
const CATEGORIES = [
  ['식사','meal','mL'], ['물','water','mL'], ['소변','urine','g'], ['대변','stool','g'],
  ['석션','care','회'], ['구강청소','care','회'], ['네뷸','care','회'], ['ROM','care','회'],
  ['체위변경','care','회'], ['활력징후','vitals','회']
];
const RISK_WORDS = ['기침','SpO','SpO₂','산소','혈압','투석','UF','비위관','막힘','혈성','가래','호흡','설사','구토','열','통증','욕창','소변 없음'];
const DEFAULT_ATTENTION = ['수분·소변·호흡 변화 우선 확인', '투석·UF 특이사항은 메모에 명시', '식사/물/배출량 누락 없이 기록'];

let activeProfile = '';
let selectedCategory = '식사';
let legacyCandidates = [];
let selectedLegacyKey = '';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => new Date().toISOString().slice(0, 10);
const localDateTimeValue = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const slug = (text) => String(text || 'default').trim().replace(/\s+/g, '-').slice(0, 60) || 'default';

function recordsKey(profile = activeProfile){ return `${APP_PREFIX}.records::${slug(profile)}`; }
function attentionKey(profile = activeProfile){ return `${APP_PREFIX}.attention::${slug(profile)}`; }

function safeParse(text){ try { return JSON.parse(text); } catch { return null; } }
function getRecords(profile = activeProfile){
  const data = safeParse(localStorage.getItem(recordsKey(profile)) || '[]');
  return Array.isArray(data) ? data : [];
}
function setRecords(records, profile = activeProfile){
  localStorage.setItem(recordsKey(profile), JSON.stringify(dedupeRecords(records)));
  renderAll();
}
function getAttention(profile = activeProfile){
  const data = safeParse(localStorage.getItem(attentionKey(profile)) || '[]');
  return Array.isArray(data) && data.length ? data : DEFAULT_ATTENTION;
}
function formatDateKo(date = todayISO()){
  const d = new Date(`${date}T00:00:00`);
  const day = ['일','월','화','수','목','금','토'][d.getDay()];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${day})`;
}
function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
}
function inferDefaultUnit(category){
  return CATEGORIES.find(([name]) => name === category)?.[2] || '회';
}
function categoryTone(category){
  if (category === '식사') return 'meal';
  if (category === '물') return 'water';
  if (category === '소변') return 'urine';
  if (category === '대변') return 'stool';
  if (category === '활력징후') return 'vitals';
  return 'care';
}
function normalizeRecord(raw){
  if (!raw || typeof raw !== 'object') return null;
  const dateTimeSource = raw.datetime || raw.dateTime || raw.timestamp || raw.createdAt || raw.timeStamp || null;
  let date = raw.date || '';
  let time = raw.time || '';

  if ((!date || !time) && dateTimeSource) {
    const d = new Date(dateTimeSource);
    if (!Number.isNaN(d.getTime())) {
      date = date || `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
      time = time || `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }

  if (typeof raw.date === 'string' && raw.date.includes('T')) {
    date = raw.date.slice(0,10);
    time = time || raw.date.slice(11,16);
  }

  const category = raw.category || raw.type || raw.kind || raw.label || '기타';
  const amountSource = raw.amount ?? raw.value ?? raw.qty ?? raw.quantity ?? raw.volume ?? '';
  const kcalSource = raw.kcal ?? raw.calories ?? raw.energy ?? '';
  const memo = raw.memo ?? raw.note ?? raw.description ?? raw.notes ?? '';
  const unit = raw.unit || inferDefaultUnit(category);

  if (!date) date = todayISO();
  if (!time) time = '00:00';

  return {
    id: String(raw.id || `${date}-${time}-${category}-${Math.random().toString(36).slice(2,7)}`),
    date,
    time,
    category,
    amount: amountSource === '' ? '' : Number(amountSource),
    unit,
    kcal: kcalSource === '' ? '' : Number(kcalSource),
    memo: String(memo || '').trim()
  };
}
function isRecordLike(item){
  if (!item || typeof item !== 'object') return false;
  return ['date','time','datetime','category','memo','note','amount','value','type'].some((key) => key in item);
}
function extractRecordsFromAny(payload){
  if (Array.isArray(payload)) return payload.filter(isRecordLike).map(normalizeRecord).filter(Boolean);
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.records)) return payload.records.filter(isRecordLike).map(normalizeRecord).filter(Boolean);
    if (Array.isArray(payload.items)) return payload.items.filter(isRecordLike).map(normalizeRecord).filter(Boolean);
  }
  return [];
}
function dedupeRecords(records){
  const map = new Map();
  for (const raw of records) {
    const rec = normalizeRecord(raw);
    if (!rec) continue;
    const key = `${rec.id}::${rec.date}::${rec.time}::${rec.category}::${rec.amount}::${rec.unit}::${rec.kcal}::${rec.memo}`;
    map.set(key, rec);
  }
  return Array.from(map.values()).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}
function recordsByDate(date = todayISO()){
  return getRecords().filter((r) => r.date === date).sort((a, b) => (b.time || '').localeCompare(a.time || ''));
}
function summarize(records){
  const result = { meal: 0, water: 0, urine: 0, stool: 0, treatment: 0, mealCount: 0, urineCount: 0, stoolCount: 0 };
  for (const record of records) {
    const amount = Number(record.amount) || 0;
    if (record.category === '식사') {
      result.meal += amount;
      result.mealCount += 1;
    } else if (record.category === '물') {
      result.water += amount;
    } else if (record.category === '소변') {
      result.urine += amount;
      result.urineCount += 1;
    } else if (record.category === '대변') {
      result.stool += amount;
      result.stoolCount += 1;
    } else if (['석션','구강청소','네뷸','ROM','체위변경','활력징후'].includes(record.category)) {
      result.treatment += amount || 1;
    }
  }
  return result;
}
function metricCard(label, value, sub){
  return `<article class="metric-card"><span class="metric-label">${escapeHtml(label)}</span><strong class="metric-value">${escapeHtml(value)}</strong><span class="metric-sub">${escapeHtml(sub)}</span></article>`;
}
function renderSummaryMetrics(records){
  const s = summarize(records);
  return [
    metricCard('식사', `${s.mealCount}회`, `총 ${s.meal} mL`),
    metricCard('물', `${s.water} mL`, '오늘 누적'),
    metricCard('소변', `${s.urineCount}회`, `총 ${s.urine} g`),
    metricCard('대변', `${s.stoolCount}회`, `총 ${s.stool} g`),
    metricCard('처치', `${s.treatment}회`, '석션·구강청소·네뷸 등')
  ].join('');
}
function buildChanges(records){
  const s = summarize(records);
  const changes = [];
  if (s.mealCount === 0) changes.push('오늘 식사 기록이 아직 없다. 병동 기록과 대조 필요.');
  if (s.water > 0 && s.water < 800) changes.push(`물 섭취량이 800mL 미만이다. 현재 ${s.water}mL.`);
  if (s.urineCount === 0) changes.push('소변 기록이 없다. 배출 여부 확인 필요.');
  if (records.some((r) => RISK_WORDS.some((word) => (r.memo || '').includes(word)))) {
    changes.push('메모에 호흡·투석·비위관·통증 관련 확인 단어가 있다.');
  }
  if (!changes.length) changes.push('자동 감지 기준상 큰 변화는 아직 없다.');
  return changes;
}
function buildHandoff(records){
  const items = [];
  for (const record of records) {
    if (RISK_WORDS.some((word) => (record.memo || '').includes(word))) {
      items.push(`${record.time} ${record.category}: ${record.memo}`);
    }
  }
  return items.length ? items.slice(0, 6) : ['직원에게 전달할 특이 메모가 아직 없다.'];
}
function renderLogList(target, records, compact = false){
  if (!target) return;
  target.innerHTML = records.length
    ? records.map((r) => `
      <article class="log-item">
        <div class="log-time">${escapeHtml(r.time)}</div>
        <div class="log-main">
          <strong>${escapeHtml(r.category)}${r.amount !== '' ? ` · ${escapeHtml(String(r.amount))}${escapeHtml(r.unit || '')}` : ''}${r.kcal !== '' ? ` · ${escapeHtml(String(r.kcal))}kcal` : ''}</strong>
          <small>${escapeHtml(r.memo || '메모 없음')}</small>
        </div>
        <button class="delete-btn" data-del="${escapeHtml(r.id)}" type="button">삭제</button>
      </article>
    `).join('')
    : '<p class="subtle">기록이 없다.</p>';
  target.classList.toggle('compact', compact);
}
function setStatus(html){
  $('backupStatus').innerHTML = html;
  $('backupStatus').classList.remove('hidden');
}
function showLogin(){
  $('loginView').classList.remove('hidden');
  $('app').classList.add('hidden');
}
function showApp(){
  $('loginView').classList.add('hidden');
  $('app').classList.remove('hidden');
}
function applyProfile(profile){
  activeProfile = slug(profile);
  if (!activeProfile) return;
  localStorage.setItem(LAST_PROFILE_KEY, activeProfile);
  $('currentProfileBadge').textContent = `코드 ${activeProfile}`;
  $('settingsCurrentCode').textContent = activeProfile;
  if (!$('filterDate').value) $('filterDate').value = todayISO();
  renderAll();
}
function login(profile, remember){
  activeProfile = slug(profile);
  if (!activeProfile) return;
  if (remember) localStorage.setItem(ACTIVE_PROFILE_KEY, activeProfile);
  else localStorage.removeItem(ACTIVE_PROFILE_KEY);
  applyProfile(activeProfile);
  showApp();
}
function logout(){
  localStorage.removeItem(ACTIVE_PROFILE_KEY);
  activeProfile = '';
  $('profileCodeInput').value = '';
  $('settingsDialog').close();
  showLogin();
}
function renderAll(){
  if (!activeProfile) return;
  const date = $('filterDate')?.value || todayISO();
  const todayRecords = recordsByDate(todayISO());
  $('todayLabel').textContent = `${formatDateKo(todayISO())} · 오늘`;
  $('homeSummary').innerHTML = renderSummaryMetrics(todayRecords);
  $('summaryMetrics').innerHTML = renderSummaryMetrics(todayRecords);
  $('attentionList').innerHTML = getAttention().map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  $('changeList').innerHTML = buildChanges(todayRecords).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  $('handoffList').innerHTML = buildHandoff(todayRecords).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  renderLogList($('summaryRecent'), todayRecords, true);
  renderLogList($('recentList'), recordsByDate(date));
}
function setView(name){
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
  $(`view-${name}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.go === name || (name === 'recent' && btn.dataset.go === 'home'));
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function download(name, text, type = 'text/plain;charset=utf-8'){
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
function toCSV(records){
  const header = ['id','date','time','category','amount','unit','kcal','memo'];
  const rows = records.map((record) => header.map((key) => `"${String(record[key] ?? '').replaceAll('"', '""')}"`).join(','));
  return [header.join(','), ...rows].join('\n');
}
function parseCSV(text){
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const header = lines.shift().match(/("([^"]|"")*"|[^,]+)/g)?.map((x) => x.replace(/^"|"$/g, '').replaceAll('""', '"')) || [];
  return lines.map((line) => {
    const cells = line.match(/("([^"]|"")*"|[^,]+)/g) || [];
    const obj = {};
    header.forEach((key, index) => {
      obj[key] = (cells[index] || '').replace(/^"|"$/g, '').replaceAll('""', '"');
    });
    return normalizeRecord(obj);
  }).filter(Boolean);
}
function summaryText(){
  const records = recordsByDate(todayISO());
  const s = summarize(records);
  return [
    `아버지 케어로그 요약 - ${formatDateKo(todayISO())}`,
    `코드: ${activeProfile}`,
    '',
    `식사: ${s.mealCount}회 / ${s.meal}mL`,
    `물: ${s.water}mL`,
    `소변: ${s.urineCount}회 / ${s.urine}g`,
    `대변: ${s.stoolCount}회 / ${s.stool}g`,
    `처치: ${s.treatment}회`,
    '',
    '주요 변화',
    ...buildChanges(records).map((item) => `- ${item}`),
    '',
    '직원에게 전달할 내용',
    ...buildHandoff(records).map((item) => `- ${item}`)
  ].join('\n');
}
function scanLegacyData(){
  const candidates = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    const parsed = safeParse(localStorage.getItem(key));
    const extracted = extractRecordsFromAny(parsed);
    if (!extracted.length) continue;
    candidates.push({
      key,
      count: extracted.length,
      sample: extracted[0],
      records: extracted
    });
  }
  legacyCandidates = candidates.sort((a, b) => b.count - a.count);
  renderLegacyCandidates();
}
function renderLegacyCandidates(){
  const container = $('legacyCandidates');
  if (!legacyCandidates.length) {
    container.className = 'legacy-list empty';
    container.textContent = '기록처럼 보이는 브라우저 데이터가 없다.';
    selectedLegacyKey = '';
    return;
  }
  container.className = 'legacy-list';
  container.innerHTML = legacyCandidates.map((candidate, idx) => `
    <label class="legacy-item">
      <input type="radio" name="legacyChoice" value="${escapeHtml(candidate.key)}" ${idx === 0 ? 'checked' : ''} />
      <div>
        <b>${escapeHtml(candidate.key)}</b>
        <small>${candidate.count}개 기록 추정 · 예시: ${escapeHtml(candidate.sample.date || '')} ${escapeHtml(candidate.sample.time || '')} ${escapeHtml(candidate.sample.category || '')}</small>
      </div>
    </label>
  `).join('');
  selectedLegacyKey = legacyCandidates[0].key;
}
function importSelectedLegacy(){
  if (!selectedLegacyKey) {
    alert('먼저 가져올 데이터를 선택해.');
    return;
  }
  const found = legacyCandidates.find((candidate) => candidate.key === selectedLegacyKey);
  if (!found) {
    alert('선택한 데이터를 찾지 못했다. 다시 검색해.');
    return;
  }
  const merged = dedupeRecords([...getRecords(), ...found.records]);
  setRecords(merged);
  setStatus(`<strong>기존 브라우저 데이터 가져오기 완료</strong><br><span>${escapeHtml(found.key)} 에서 ${found.records.length}개 후보를 현재 코드(${escapeHtml(activeProfile)})로 병합했다.</span>`);
}

function initCategoryChips(){
  $('categoryChips').innerHTML = CATEGORIES.map(([name, tone]) => `
    <button type="button" class="chip ${name === selectedCategory ? 'active' : ''}" data-cat="${escapeHtml(name)}">
      <span class="chip-kicker">${escapeHtml(tone)}</span>
      <span class="chip-label">${escapeHtml(name)}</span>
    </button>
  `).join('');
}
function handleCategoryChange(category){
  selectedCategory = category;
  document.querySelectorAll('.chip').forEach((chip) => chip.classList.toggle('active', chip.dataset.cat === category));
  $('unit').value = inferDefaultUnit(category);
  $('kcalWrap').classList.toggle('hidden', category !== '식사');
}

function init(){
  $('entryTime').value = localDateTimeValue();
  $('filterDate').value = todayISO();
  initCategoryChips();
  handleCategoryChange(selectedCategory);

  document.body.addEventListener('click', (event) => {
    const go = event.target.closest('[data-go]')?.dataset.go;
    if (go) setView(go);

    const category = event.target.closest('[data-cat]')?.dataset.cat;
    if (category) handleCategoryChange(category);

    const deleteId = event.target.closest('[data-del]')?.dataset.del;
    if (deleteId && confirm('이 기록을 삭제할까?')) {
      setRecords(getRecords().filter((record) => record.id !== deleteId));
    }
  });

  $('loginForm').addEventListener('submit', (event) => {
    event.preventDefault();
    login($('profileCodeInput').value, $('rememberProfile').checked);
  });

  $('entryForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const dt = new Date($('entryTime').value);
    const record = normalizeRecord({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: $('entryTime').value.slice(0, 10),
      time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
      category: selectedCategory,
      amount: $('amount').value,
      unit: $('unit').value,
      kcal: $('kcal').value,
      memo: $('memo').value.trim()
    });
    setRecords([record, ...getRecords()]);
    event.target.reset();
    $('entryTime').value = localDateTimeValue();
    handleCategoryChange(selectedCategory);
    setView('home');
  });

  $('filterDate').addEventListener('change', renderAll);
  $('clearFilter').addEventListener('click', () => {
    $('filterDate').value = todayISO();
    renderAll();
  });

  $('settingsBtn').addEventListener('click', () => {
    $('settingsCurrentCode').textContent = activeProfile || '-';
    $('switchProfileInput').value = activeProfile || '';
    $('settingsDialog').showModal();
  });
  $('switchProfileBtn').addEventListener('click', () => {
    const nextProfile = $('switchProfileInput').value.trim();
    if (!nextProfile) {
      alert('코드를 입력해.');
      return;
    }
    localStorage.setItem(ACTIVE_PROFILE_KEY, slug(nextProfile));
    applyProfile(nextProfile);
    $('settingsDialog').close();
  });
  $('logoutBtn').addEventListener('click', logout);

  $('scanLegacyBtn').addEventListener('click', scanLegacyData);
  $('legacyCandidates').addEventListener('change', (event) => {
    if (event.target.name === 'legacyChoice') selectedLegacyKey = event.target.value;
  });
  $('importLegacyBtn').addEventListener('click', importSelectedLegacy);

  $('exportCsv').addEventListener('click', () => {
    download(`carelog_${activeProfile}_${todayISO()}.csv`, toCSV(getRecords()), 'text/csv;charset=utf-8');
    setStatus('<strong>CSV 내보내기 완료</strong><br><span>현재 코드의 기록을 CSV로 저장했다.</span>');
  });
  $('exportJson').addEventListener('click', () => {
    const payload = { version: 3, profile: activeProfile, exportedAt: new Date().toISOString(), records: getRecords() };
    download(`carelog_${activeProfile}_${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    setStatus('<strong>JSON 백업 완료</strong><br><span>현재 코드의 원본 데이터를 저장했다.</span>');
  });
  $('saveDaySummary').addEventListener('click', () => {
    download(`carelog_summary_${activeProfile}_${todayISO()}.txt`, summaryText());
    setStatus('<strong>오늘 요약 저장 완료</strong><br><span>TXT 파일로 저장했다.</span>');
  });
  $('importCsv').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const imported = parseCSV(await file.text());
    setRecords([...getRecords(), ...imported]);
    setStatus(`<strong>CSV 가져오기 완료</strong><br><span>${imported.length}개 기록을 현재 코드에 병합했다.</span>`);
    event.target.value = '';
  });
  $('importJson').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const parsed = safeParse(await file.text());
    const imported = extractRecordsFromAny(parsed);
    setRecords([...getRecords(), ...imported]);
    setStatus(`<strong>JSON 가져오기 완료</strong><br><span>${imported.length}개 기록을 현재 코드에 병합했다.</span>`);
    event.target.value = '';
  });

  const remembered = localStorage.getItem(ACTIVE_PROFILE_KEY) || localStorage.getItem(LAST_PROFILE_KEY);
  if (remembered) {
    $('profileCodeInput').value = remembered;
    login(remembered, true);
  } else {
    showLogin();
  }
}

init();
