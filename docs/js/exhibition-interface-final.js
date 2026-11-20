const $=id=>document.getElementById(id);

// One native set of calculation inputs is shared by the HUD and the workbench.
export function createExhibitionInterface(){
 if(['#stage','#routeCalculator'].includes(location.hash))history.replaceState(null,'',location.pathname+location.search);
 document.body.classList.add('exhibition-layout');
 document.querySelector('.workspace').classList.add('panel-collapsed');window.cheonggyeV32Shell?.showMap();
 document.title='청계천 시뮬레이터';
 const stage=$('stage'),control=document.querySelector('.rainfall-route-control');
 const hud=document.createElement('section');hud.className='rain-hud';hud.setAttribute('aria-label','지도 강우 조절');
 const heading=document.createElement('div');heading.className='rain-hud-heading';heading.innerHTML='<b>시연 강우</b><span>30분 지속 가정</span>';
 hud.append(heading);
 for(const child of [control.querySelector('label'),$('routingRain'),control.querySelector('small')])if(child)hud.append(child);
 const actions=document.createElement('div');actions.className='rain-hud-actions';
 actions.append($('playRainDemo'));
 const calculate=document.createElement('a');calculate.href='#routeCalculator';calculate.textContent='대피경로 계산';calculate.id='openRouteCalculator';actions.append(calculate);
 hud.append(actions,$('rainDemoStatus'));document.querySelector('.final-analytics .analytics-heading').after(hud);

 const tools=document.createElement('div');tools.className='map-presentation-tools';
 tools.innerHTML='<button id="mapOnly" type="button" aria-pressed="false">지도 크게</button><button id="rotateScene" type="button" aria-pressed="false" disabled>자동 회전</button>';
 stage.append(tools);
 tools.append($('quality'),$('lighting'));
 document.querySelector('.display-buttons')?.remove();
 const scrollHint=document.createElement('a');scrollHint.className='map-scroll-hint';scrollHint.href='#routeCalculator';scrollHint.textContent='아래로 내려 대피경로 계산';stage.append(scrollHint);
 const restore=document.createElement('button');restore.id='restoreMapUI';restore.type='button';restore.textContent='화면 복원';restore.hidden=true;document.body.append(restore);
 let focusMode=false,lastScroll=0;
 function mapOnly(value){
  focusMode=value;if(value){lastScroll=scrollY;window.cheonggyeV32Shell?.showMap();scrollTo(0,0)}
  document.body.classList.toggle('map-only',value);$('mapOnly').setAttribute('aria-pressed',String(value));restore.hidden=!value;
  document.dispatchEvent(new CustomEvent('cheonggye:mapfocus',{detail:{active:value}}));
  if(value)restore.focus({preventScroll:true});else{scrollTo(0,lastScroll);$('mapOnly').focus({preventScroll:true})}
 }
 $('mapOnly').addEventListener('click',()=>mapOnly(!focusMode));restore.addEventListener('click',()=>mapOnly(false));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&focusMode){e.preventDefault();mapOnly(false)}});

 const work=document.createElement('section');work.id='routeCalculator';work.className='route-workbench';work.setAttribute('aria-labelledby','routeWorkbenchTitle');
 work.innerHTML=`<div class="workbench-heading"><div><span class="eyebrow">CHEONGGYE SIMULATOR</span><h2 id="routeWorkbenchTitle">상황에 맞는 최적 대피경로</h2><p>강우와 위험구간·출구 조건을 함께 비교합니다.</p></div><a href="#stage" class="back-to-map">지도로 돌아가기</a></div>
 <nav class="calculator-tabs" aria-label="대피 계산 정보"><button type="button" data-calculator-tab="route" aria-pressed="true">경로 탐색</button><button type="button" data-calculator-tab="facilities" aria-pressed="false">시설·구간</button><button type="button" data-calculator-tab="model" aria-pressed="false">모델 정보</button></nav>
 <div id="calculator-route" class="calculator-content"><div class="route-start-panel"><h3>출발 위치</h3><button id="pickRouteStart" type="button" aria-pressed="false" disabled>지도에서 위치 선택</button><p id="routePickHint">지도 산책로를 눌러 출발점을 고르거나 아래 구간을 선택하세요.</p><div id="routeNativeStart"></div></div><div class="route-result-panel"><h3>계산된 비상대피경로</h3><div id="routeNativeResult"></div><p id="routeDecision" role="status"></p><div id="routeReset"></div></div></div>
 <div id="calculator-facilities" class="calculator-content" hidden><div><h3>등록 출구와 현재 계산 조건</h3><p>아래는 시제품에 등록된 출구의 계산 상태입니다. 현장 개방 정보가 아닙니다.</p><div id="routeFacilitySummary"></div></div></div>
 <div id="calculator-model" class="calculator-content" hidden><div><h3>계산과 자료의 범위</h3><p>수동 강우 → 가정 저류·보행영역 수심 → 수심·유속 위험도 → 통과 가능한 위험가중 경로를 연결한 시제품입니다.</p><p>초록은 모형상 안전, 노랑은 주의·경로비용×3, 빨강·미확인은 경로에서 제외합니다. 미래 강우와 유속·표고·출구 운영은 표시된 가정입니다.</p><p>OSM 평면·서울시설공단 교량 자료와 현장사진을 참고했습니다. 현재 기상청 실시간 연결은 미완료이며, 정밀 수리·현장 안전 인증을 받은 안내가 아닙니다.</p><button type="button" id="openRouteSources">출처와 가정 확인</button></div></div>
 <p class="workbench-basis" id="workbenchBasis">계산 준비 중</p>`;
 document.querySelector('.workspace').after(work);
 const start=$('routeNativeStart'),result=$('routeNativeResult');
 for(const node of [document.querySelector('label[for="evacStart"]'),$('evacStart')])if(node)start.append(node);
 for(const node of [document.querySelector('.evac-result'),$('fitEvacRoute'),$('fitRouteStatus'),$('routingChange'),$('routingReason')])if(node)result.append(node);
 $('routeReset').append($('resetRainDemo'));
 control.replaceChildren();control.innerHTML='<p>지도 위에서 강우를 조절하고, 아래 계산 탭에서 출발점과 경로를 확인하세요.</p><a href="#routeCalculator" class="open-calculator-link">대피경로 계산 탭 열기</a>';
 $('finalRouteControls').remove();
 for(const link of document.querySelectorAll('a[href="#stage"],a[href="#routeCalculator"]'))link.addEventListener('click',event=>{
  event.preventDefault();document.dispatchEvent(new CustomEvent('cheonggye:manualcamera'));window.cheonggyeV32Shell?.showMap();
  const target=document.getElementById(link.getAttribute('href').slice(1));
  target?.scrollIntoView({behavior:document.body.classList.contains('reduce-motion')?'instant':'smooth',block:'start'});
 });
 $('pickRouteStart').addEventListener('click',()=>{
  const active=$('pickRouteStart').getAttribute('aria-pressed')!=='true';
  document.dispatchEvent(new CustomEvent('cheonggye:pickrequest',{detail:{active}}));
  window.cheonggyeV32Shell?.showMap();stage.scrollIntoView({behavior:document.body.classList.contains('reduce-motion')?'instant':'smooth',block:'start'});
 });
 document.addEventListener('cheonggye:pickstate',e=>{
  $('pickRouteStart').setAttribute('aria-pressed',String(e.detail.active));$('pickRouteStart').textContent=e.detail.active?'위치 선택 취소':'지도에서 위치 선택';
  $('routePickHint').textContent=e.detail.message||'지도 산책로에서 출발점을 선택하세요.';
 });
 // Only an explicit route-view request scrolls the document. Calculation never does.
 $('fitEvacRoute').addEventListener('click',event=>{if(!event.isTrusted)return;document.dispatchEvent(new CustomEvent('cheonggye:manualcamera'));window.cheonggyeV32Shell?.showMap();stage.scrollIntoView({behavior:document.body.classList.contains('reduce-motion')?'instant':'smooth',block:'start'})});
 const analysisPanel=document.querySelector('.final-analytics');
 for(const type of ['pointerdown','keydown'])analysisPanel.addEventListener(type,event=>{
  if(!event.target.closest('input,select,textarea'))return;
  if(type==='keydown'&&!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))return;
  document.dispatchEvent(new CustomEvent('cheonggye:analysisinput'));event.stopPropagation();
 });
 const mapRoute=document.createElement('p');mapRoute.id='mapRouteSummary';mapRoute.setAttribute('role','status');mapRoute.setAttribute('aria-live','polite');$('finalMapBasis').after(mapRoute);
 $('openRouteSources').addEventListener('click',()=>$('sourcesDialog').showModal());
 work.querySelectorAll('[data-calculator-tab]').forEach(button=>button.addEventListener('click',()=>{
  const selected=button.dataset.calculatorTab;
  work.querySelectorAll('[data-calculator-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  for(const name of ['route','facilities','model'])$('calculator-'+name).hidden=name!==selected;
 }));
 document.addEventListener('cheonggye:analysis',event=>{
  const d=event.detail,r=d.route;
  mapRoute.textContent=r.status==='route'?`${r.exit.name} · ${Math.round(r.lengthM)}m${Number.isFinite(r.arrivalSeconds)?' · 도착 '+r.arrivalSeconds+'초':''}`:'경로 없음 · '+(r.reason||'계산 조건을 확인하세요.');
  mapRoute.dataset.status=r.status;
  $('workbenchBasis').textContent=$('finalBasis').textContent;
  $('routeDecision').textContent=r.status==='route'?'현재 설정에서 계산된 경로 · 실제 현장 안전 미검증':r.reason||'경로를 계산할 입력을 확인하세요.';
  const list=$('routeFacilitySummary');list.replaceChildren();
  for(const f of r.facilityCandidates||[]){const item=document.createElement('p');item.className='facility-summary-row';const name=document.createElement('b');name.textContent=f.name;const state=document.createElement('span');state.textContent=f.reason|| (f.blocked?'계산에서 제외':'대피 허용 가정');item.append(name,state);list.append(item)}
  if(!list.children.length)list.textContent='이 분석 모드에서는 출구 상세 조건이 제공되지 않습니다.';
 });
}
