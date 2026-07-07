const STORAGE_KEY = 'fatherCarelog.v2.records';
const ATTENTION_KEY = 'fatherCarelog.v2.attention';
const CATEGORIES = [
  ['식사','🥣','mL'], ['물','💧','mL'], ['소변','🚽','g'], ['대변','💩','g'],
  ['석션','💉','회'], ['구강청소','🪥','회'], ['네뷸','🌫️','회'], ['ROM','🦾','회'],
  ['체위변경','↔️','회'], ['활력징후','💓','회']
];
const RISK_WORDS = ['기침','SpO','산소','혈압','투석','UF','비위관','막힘','혈성','가래','호흡','설사','구토','열','통증','욕창','소변 없음'];
let selectedCategory = '식사';

const $ = (id) => document.getElementById(id);
const todayISO = () => new Date().toISOString().slice(0,10);
const pad = n => String(n).padStart(2,'0');
function localDateTimeValue(d=new Date()){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`}
function getRecords(){ try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]')}catch{return[]} }
function setRecords(records){ localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); renderAll(); }
function getAttention(){ return JSON.parse(localStorage.getItem(ATTENTION_KEY)||'[]') }
function setStatus(html){ $('backupStatus').innerHTML=html; $('backupStatus').classList.remove('hidden'); }
function formatDateKo(date=todayISO()){
  const d = new Date(date+'T00:00:00');
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${['일','월','화','수','목','금','토'][d.getDay()]}) 오늘`;
}
function recordsByDate(date=todayISO()){ return getRecords().filter(r=>r.date===date).sort((a,b)=>(b.time||'').localeCompare(a.time||'')); }
function summarize(records){
  const sum = {meal:0, water:0, urine:0, stool:0, treatment:0, mealCount:0, urineCount:0, stoolCount:0};
  for(const r of records){
    const amt = Number(r.amount)||0;
    if(r.category==='식사'){sum.meal += amt; sum.mealCount++}
    else if(r.category==='물') sum.water += amt;
    else if(r.category==='소변'){sum.urine += amt; sum.urineCount++}
    else if(r.category==='대변'){sum.stool += amt; sum.stoolCount++}
    else if(['석션','구강청소','네뷸','ROM','체위변경','활력징후'].includes(r.category)) sum.treatment += amt || 1;
  }
  return sum;
}
function metric(icon,label,value,unit='') { return `<div class="metric"><span class="icon">${icon}</span><small>${label}</small><b>${value}</b><small>${unit}</small></div>` }
function renderSummaryMetrics(records){
  const s = summarize(records);
  return [
    metric('🥣','식사',`${s.mealCount}회`,`${s.meal} mL`), metric('💧','물',`${s.water}`,'mL'),
    metric('🚽','소변',`${s.urineCount}회`,`${s.urine} g`), metric('💩','대변',`${s.stoolCount}회`,`${s.stool} g`),
    metric('💉','처치',`${s.treatment}`,'회')
  ].join('');
}
function buildChanges(records){
  const s = summarize(records); const arr=[];
  if(s.mealCount===0) arr.push('아직 식사 기록이 없습니다.');
  if(s.water && s.water < 800) arr.push(`물 섭취량이 800mL 미만입니다. 현재 ${s.water}mL.`);
  if(s.urineCount===0) arr.push('소변 기록이 없습니다. 병동 기록과 대조 필요.');
  if(records.some(r=>RISK_WORDS.some(w=>(r.memo||'').includes(w)))) arr.push('메모에 호흡/투석/비위관/통증 등 확인 단어가 있습니다.');
  if(!arr.length) arr.push('현재 기록상 큰 변화 후보는 자동 감지되지 않았습니다.');
  return arr;
}
function buildHandoff(records){
  const items=[];
  records.forEach(r=>{ if(RISK_WORDS.some(w=>(r.memo||'').includes(w))) items.push(`${r.time} ${r.category}: ${r.memo}`); });
  if(!items.length) items.push('직원에게 전달할 특이 메모가 아직 없습니다.');
  return items.slice(0,5);
}
function renderLogList(target, records, compact=false){
  target.innerHTML = records.length ? records.map(r=>`<article class="log-item">
    <span class="time">${r.time}</span><div><b>${r.category} ${r.amount?`${r.amount}${r.unit||''}`:''}${r.kcal?` · ${r.kcal}kcal`:''}</b></div>
    <button class="delete-btn" data-del="${r.id}">삭제</button>${r.memo?`<p>${escapeHtml(r.memo)}</p>`:''}</article>`).join('') : '<p class="subtle">기록이 없습니다.</p>';
  target.classList.toggle('compact', compact);
}
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) }
function renderAll(){
  const date = $('filterDate')?.value || todayISO();
  const todayRecords = recordsByDate(todayISO());
  $('todayLabel').textContent = formatDateKo(todayISO());
  $('homeSummary').innerHTML = renderSummaryMetrics(todayRecords);
  $('summaryMetrics').innerHTML = renderSummaryMetrics(todayRecords);
  $('changeList').innerHTML = buildChanges(todayRecords).map(x=>`<li>${escapeHtml(x)}</li>`).join('');
  $('handoffList').innerHTML = buildHandoff(todayRecords).map(x=>`<li>${escapeHtml(x)}</li>`).join('');
  renderLogList($('summaryRecent'), todayRecords, true);
  renderLogList($('recentList'), recordsByDate(date));
  const attention = getAttention();
  $('attentionList').innerHTML = (attention.length?attention:['수분/소변/호흡 변화 확인','투석·UF 관련 특이사항은 메모']).map(x=>`<li>${escapeHtml(x)}</li>`).join('');
}
function setView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  $(`view-${name}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.go===name || (name==='recent'&&b.dataset.go==='home')));
  window.scrollTo({top:0,behavior:'smooth'});
}
function download(name, text, type='text/plain;charset=utf-8'){
  const blob = new Blob([text], {type}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
}
function toCSV(records){
  const header=['id','date','time','category','amount','unit','kcal','memo'];
  const rows=records.map(r=>header.map(k=>`"${String(r[k]??'').replaceAll('"','""')}"`).join(','));
  return [header.join(','),...rows].join('\n');
}
function parseCSV(text){
  const lines=text.trim().split(/\r?\n/); const header=lines.shift().split(',').map(x=>x.replaceAll('"',''));
  return lines.map(line=>{const cells=line.match(/("([^"]|"")*"|[^,]+)/g)||[]; const obj={}; header.forEach((h,i)=>obj[h]=(cells[i]||'').replace(/^"|"$/g,'').replaceAll('""','"')); return obj;});
}
function summaryText(){
  const records=recordsByDate(todayISO()), s=summarize(records);
  return `아버지 케어로그 요약 - ${formatDateKo(todayISO())}\n\n식사: ${s.mealCount}회 / ${s.meal}mL\n물: ${s.water}mL\n소변: ${s.urineCount}회 / ${s.urine}g\n대변: ${s.stoolCount}회 / ${s.stool}g\n처치: ${s.treatment}회\n\n주요 변화\n${buildChanges(records).map(x=>'- '+x).join('\n')}\n\n직원에게 전달할 내용\n${buildHandoff(records).map(x=>'- '+x).join('\n')}`;
}
function init(){
  $('entryTime').value = localDateTimeValue(); $('filterDate').value=todayISO();
  $('categoryChips').innerHTML = CATEGORIES.map(([name,icon])=>`<button type="button" class="chip ${name===selectedCategory?'active':''}" data-cat="${name}"><span>${icon}</span>${name}</button>`).join('');
  document.body.addEventListener('click', e=>{
    const go=e.target.closest('[data-go]')?.dataset.go; if(go) setView(go);
    const cat=e.target.closest('[data-cat]')?.dataset.cat; if(cat){ selectedCategory=cat; document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c.dataset.cat===cat)); const found=CATEGORIES.find(x=>x[0]===cat); $('unit').value=found?.[2]||'회'; $('kcalWrap').style.display=cat==='식사'?'block':'none'; }
    const del=e.target.closest('[data-del]')?.dataset.del; if(del && confirm('이 기록을 삭제할까요?')) setRecords(getRecords().filter(r=>r.id!==del));
  });
  $('entryForm').addEventListener('submit', e=>{ e.preventDefault(); const dt=new Date($('entryTime').value); const rec={id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,date:$('entryTime').value.slice(0,10),time:`${pad(dt.getHours())}:${pad(dt.getMinutes())}`,category:selectedCategory,amount:$('amount').value,unit:$('unit').value,kcal:$('kcal').value,memo:$('memo').value.trim()}; setRecords([rec,...getRecords()]); e.target.reset(); $('entryTime').value=localDateTimeValue(); $('kcalWrap').style.display=selectedCategory==='식사'?'block':'none'; setView('home'); });
  $('filterDate').addEventListener('change',renderAll); $('clearFilter').onclick=()=>{$('filterDate').value=todayISO();renderAll()};
  $('exportCsv').onclick=()=>{download(`carelog_${todayISO()}.csv`, toCSV(getRecords()), 'text/csv;charset=utf-8'); setStatus('<b>CSV 내보내기 완료</b><br><small>파일을 안전한 곳에 보관하세요.</small>')};
  $('exportJson').onclick=()=>{download(`carelog_${todayISO()}.json`, JSON.stringify({version:2,exportedAt:new Date().toISOString(),records:getRecords()},null,2), 'application/json;charset=utf-8'); setStatus('<b>JSON 백업 성공</b><br><small>복원용 원본 백업입니다.</small>')};
  $('saveDaySummary').onclick=()=>download(`carelog_summary_${todayISO()}.txt`, summaryText());
  $('importCsv').addEventListener('change', async e=>{ const file=e.target.files[0]; if(!file)return; const text=await file.text(); const imported=parseCSV(text).map(r=>({...r,id:r.id||`${Date.now()}-${Math.random().toString(36).slice(2,7)}`})); setRecords([...imported,...getRecords()]); setStatus(`<b>CSV 가져오기 완료</b><br><small>${imported.length}개 기록 추가</small>`); });
  $('kcalWrap').style.display='block'; renderAll();
}
init();
