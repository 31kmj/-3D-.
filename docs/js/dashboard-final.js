// Presentation dashboard: reads the same computed state as the 3D flood map.
// No independent hazard thresholds or fabricated chart data.
import {connectRainfallRouting} from './rainfall-routing-control.js?rev=interaction-20261120';
import {presentationSnapshot} from './presentation-analysis.js';
import {createExhibitionInterface} from './exhibition-interface-final.js?rev=interaction-20261120';
const $=id=>document.getElementById(id);
const number=(value,digits=0)=>Number.isFinite(value)?value.toLocaleString('ko-KR',{maximumFractionDigits:digits}):'—';
const svgNS='http://www.w3.org/2000/svg';
function svgElement(tag,attrs={},text){const el=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;return el}

export function chartSeries(d){
 const area=d.inundationArea;
 const valid=Boolean(d.result?.valid&&area?.valid);
 return {valid,area:valid?(area.timeline||[]).filter(p=>p.valid&&Number.isFinite(p.inundatedWalkwayAreaM2)).map(p=>[p.atSeconds,p.inundatedWalkwayAreaM2]):[],
  stage:valid?(d.timeStudy?.stages||[]).filter(p=>Number.isFinite(p.stageM)).map(p=>[p.seconds,p.stageM]):[],
  currentTime:d.mapTimeSeconds||0,
  summary:valid?area.summary:null};
}

function analysisBasis(mode, source, valid){
 if(mode==='static'||mode==='temporal')return '합성 침수 시나리오 · 대피 계산 실험';
 if(source==='live')return valid?'기상청 관측 입력 · 침수결과는 근사모형':'기상청 미연결 · 위험도와 대피경로 미산정';
 if(source==='history')return '서울시 과거 관측 재생 · 미래 강우 가정';
 return `수동 시연 ${$('rainfallIntensity').value}mm/h × ${$('rainfallDuration').value}분 · 근사모형`;
}
function drawLine(svg,points,color,unit,currentTime){
 svg.replaceChildren();svg.setAttribute('viewBox','0 0 280 96');
 if(!points.length){drawEmpty(svg,'계산 자료 확인 필요');return}
 const left=38,right=270,top=9,bottom=75,maxT=Math.max(1,...points.map(p=>p[0])),maxY=Math.max(.01,...points.map(p=>p[1]))*1.12;
 const x=t=>left+(right-left)*t/maxT,y=v=>bottom-(bottom-top)*v/maxY;
 for(let i=0;i<3;i++){const v=maxY*i/2;svg.append(svgElement('line',{x1:left,x2:right,y1:y(v),y2:y(v),stroke:'#dae4e8','stroke-dasharray':'2 3'}),svgElement('text',{x:left-5,y:y(v)+3,'text-anchor':'end'},number(v,unit==='m'?2:0)))}
 for(const t of [0,maxT/2,maxT])svg.append(svgElement('text',{x:x(t),y:91,'text-anchor':'middle'},number(t/60,1)+'분'));
 const line=points.map(([t,v],i)=>(i?'L':'M')+x(t).toFixed(2)+','+y(v).toFixed(2)).join(' ');
 svg.append(svgElement('path',{d:line+` L${x(points.at(-1)[0])},${bottom} L${x(points[0][0])},${bottom} Z`,fill:color,opacity:.08}),svgElement('path',{d:line,stroke:color,'stroke-width':2.5,fill:'none','stroke-linejoin':'round'}));
 svg.append(svgElement('line',{x1:x(currentTime),x2:x(currentTime),y1:top,y2:bottom,stroke:'#294957','stroke-dasharray':'3 3'}));
}

function drawEmpty(svg,message){
 svg.replaceChildren();svg.setAttribute('viewBox','0 0 280 96');
 svg.append(svgElement('text',{x:140,y:49,'text-anchor':'middle',class:'chart-empty'},message));
}
function drawComparison(svg,reference,current,field,color){
 svg.replaceChildren();svg.setAttribute('viewBox','0 0 280 96');
 const maximum=Math.max(.001,reference[field],current[field]);
 for(const [row,snapshot,label,fill] of [[0,reference,'기준','#7c989f'],[1,current,'현재',color]]){
  const y=17+row*47;
  svg.append(svgElement('text',{x:2,y},label+' '+number(snapshot.intensity)+'mm/h'),
   svgElement('text',{x:278,y,'text-anchor':'end'},number(snapshot[field],field==='stage'?3:0)),
   svgElement('rect',{x:2,y:y+9,width:276,height:10,rx:3,fill:'#e1e9eb'}),
   svgElement('rect',{x:2,y:y+9,width:276*snapshot[field]/maximum,height:10,rx:3,fill}));
 }
}

export function createDashboard(){
 const panel=$('panel-flood'),advanced=document.createElement('details');advanced.className='final-advanced';advanced.id='finalAdvanced';
 advanced.innerHTML='<summary>세부 분석 설정 · 계산 근거</summary><div class="advanced-body"></div>';
 const body=advanced.lastElementChild;
 while(panel.firstChild)body.append(panel.firstChild);
 panel.append(advanced);
 const intro=document.querySelector('.intro');if(intro){intro.innerHTML='<span class="eyebrow">CHEONGGYE DIGITAL TWIN</span><h1>강우 · 침수 · 대피</h1><p>청계광장 — 삼일교<br>강우 조건에 따른 보행 위험을 살펴봅니다.</p>'}
 const main=document.createElement('section');main.className='final-control';main.innerHTML=`
 <div class="final-section-label">상황 선택</div>
 <div class="final-presets">
 <button data-preset="demoAreaRising">강우 증가<small>75mm/h · 30분 가정</small></button>
 <button data-preset="demoAreaHigh">강한 강우<small>150mm/h · 30분 가정</small></button>
 <button data-preset="demoFacilityOpen">출구 열림<small>모든 출구 대피 허용 가정</small></button>
 <button data-preset="demoFacilityEgress">출구 차단<small>5번 · 90초 후 차단 가정</small></button>
 <button data-preset="demoHistoryPeak">과거 강우<small>종로 · 보존 관측 재생</small></button>
 <button id="finalLive">관측 연결<small>기상청 연결 상태 확인</small></button>
 </div>
 <p id="finalBasis" class="final-basis" role="status">계산 준비 중</p>
 <div class="final-section-label">비상대피</div><div id="finalRouteControls"></div>
 <p class="final-disclaimer">졸업작품 시제품 · 수리·지형 가정에 따른 결과입니다. 실제 재난 시 현장 통제와 안내를 따르세요.</p>`;
 panel.prepend(main);
 const routeControls=$('finalRouteControls');
 for(const node of [document.querySelector('label[for="evacStart"]'),$('evacStart'),document.querySelector('.evac-result'),$('fitEvacRoute'),$('fitRouteStatus')])if(node)routeControls.append(node);
 const landmarks=document.querySelector('.bottom-panel');if(landmarks){landmarks.classList.add('final-landmarks');$('panel-explore').prepend(landmarks)}
 main.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.preset).click()));
 $('finalLive').addEventListener('click',()=>{$('evacMode').value='rain-time';$('rainSource').value='live';$('rainSource').dispatchEvent(new Event('change',{bubbles:true}));window.cheonggyeV32Shell?.showMap()});
 $('finalSourcesLink').addEventListener('click',e=>{e.preventDefault();$('sourcesDialog').showModal()});
 document.querySelectorAll('a[href="#sourcesDialog"]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();$('sourcesDialog').showModal()}));
 const tray=document.createElement('section');tray.className='final-analytics';tray.setAttribute('aria-label','침수 분석 그래프');tray.innerHTML=`
 <div class="analytics-heading"><div><b>모형 침수 분석</b><span id="finalAnalysisTime">지도 0분</span></div><button id="toggleAnalytics" aria-expanded="true" aria-controls="finalCharts">그래프 접기</button></div>
 <p id="finalMapBasis" class="final-map-basis">계산 준비 중</p>
 <div class="risk-key"><span><i class="risk-green"></i>안전</span><span><i class="risk-yellow"></i>주의</span><span><i class="risk-red"></i>위험</span><span><i class="risk-gray"></i>미확인</span><small>모형 판정 · 청록선은 계산된 대피경로</small></div>
 <div id="finalCharts"><div class="final-chart-grid">
 <article><h3>보행 침수면적 <small>m²</small></h3><strong id="finalArea">—</strong><svg id="finalAreaChart" role="img" aria-label="보행 침수면적 비교"></svg></article>
 <article><h3>상대 수면 높이 <small>m · 모형 기준</small></h3><strong id="finalStage">—</strong><svg id="finalStageChart" role="img" aria-label="상대 수면 높이 비교"></svg></article>
 <article><h3>보행영역 위험도 <small>m²</small></h3><div id="finalRiskBars"></div><p id="finalChartNote">기상·수리 자료 준비 중</p></article>
 </div><div class="final-time"><label for="rainTimeView">지도 조회시각</label><div id="finalTimeSlider"></div><output id="finalTimeOutput">0분</output></div></div>`;
 $('stage').append(tray);
 // Reuse the original slider: a single change updates map, route diagnostics and charts.
 document.querySelector('label[for="rainTimeView"]').removeAttribute('for');
 $('finalTimeSlider').append($('rainTimeView'));
 let collapsed=true;
 function sync(){tray.classList.toggle('charts-collapsed',collapsed);$('finalCharts').hidden=collapsed;$('toggleAnalytics').textContent=collapsed?'그래프 펼치기':'그래프 접기';$('toggleAnalytics').setAttribute('aria-expanded',String(!collapsed))}
 $('toggleAnalytics').addEventListener('click',()=>{collapsed=!collapsed;sync()});sync();
 let reference=null;
 document.addEventListener('cheonggye:comparisonreset',()=>{reference=null});
 document.addEventListener('cheonggye:panelchange',e=>{tray.hidden=e.detail.panel!=='flood'});
 document.addEventListener('cheonggye:analysis',e=>{
  const d=e.detail,s=chartSeries(d),source=$('rainSource').value;
  const snapshot=presentationSnapshot(d);
  if(!snapshot)reference=null;
  else if(!reference||reference.key!==snapshot.key)reference=snapshot;
  const basis=analysisBasis(d.mode,source,d.result?.valid);
  $('finalBasis').textContent=basis;
  $('finalMapBasis').textContent=basis;
  $('finalAnalysisTime').textContent=d.mode==='rain-time'?'지도 '+number(s.currentTime/60,1)+'분':snapshot?number(snapshot.intensity)+'mm/h · '+snapshot.duration+'분':'현재 조건';$('finalTimeOutput').textContent=number(s.currentTime/60,1)+'분';
  $('rainTimeView').disabled=d.mode!=='rain-time'||!s.valid;
  tray.querySelector('.final-time').hidden=d.mode!=='rain-time';
  $('finalArea').textContent=s.valid?number(s.summary.inundatedWalkwayAreaM2):'미산정';$('finalStage').textContent=s.valid?number(d.inundationArea.stageM,3):'미산정';
  if(snapshot){
   drawComparison($('finalAreaChart'),reference,snapshot,'area','#197d91');
   drawComparison($('finalStageChart'),reference,snapshot,'stage','#4f72af');
  }else if(d.mode==='rain-time'&&s.valid){
   drawLine($('finalAreaChart'),s.area,'#197d91','m²',s.currentTime);drawLine($('finalStageChart'),s.stage,'#4f72af','m',s.currentTime);
  }else{
   const message=source==='live'?'관측 미연결':'입력 확인 필요';
   drawEmpty($('finalAreaChart'),message);drawEmpty($('finalStageChart'),message);
  }
  $('finalAreaChart').setAttribute('aria-label',snapshot?'기준 강우와 현재 강우의 보행 침수면적 비교':'시간별 보행 침수면적');
  $('finalStageChart').setAttribute('aria-label',snapshot?'기준 강우와 현재 강우의 상대 수면 높이 비교':'시간별 상대 수면 높이');
  const bars=$('finalRiskBars');bars.replaceChildren();
  for(const [key,label,color] of [['dryAreaM2','안전','#30916a'],['cautionAreaM2','주의','#d9aa24'],['dangerAreaM2','위험','#d95050'],['unknownAreaM2','미확인','#8d9aa5']]){const value=s.summary?.[key],row=document.createElement('div');row.className='risk-bar-row';const labelEl=document.createElement('span');labelEl.textContent=label;const track=document.createElement('span');track.className='risk-bar-track';const bar=document.createElement('i');bar.style.width=(s.valid?100*value/Math.max(1,s.summary.walkwayAreaM2):0)+'%';bar.style.background=color;track.append(bar);const count=document.createElement('b');count.textContent=s.valid?number(value):'—';row.append(labelEl,track,count);bars.append(row)}
  $('finalChartNote').textContent=snapshot?'기준 '+number(reference.intensity)+' → 현재 '+number(snapshot.intensity)+'mm/h · 동일 '+snapshot.duration+'분 가정':s.valid?(s.area.length?'0~15분 강우 가정 · 점선은 지도 조회시각':'현재 계산 결과'):'입력 미확인 · 0으로 간주하지 않습니다.';
 });
 connectRainfallRouting();
 createExhibitionInterface();
}
