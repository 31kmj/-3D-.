// One input updates the existing inundation and route calculation for the same origin.
import {presentationSnapshot,routeComparisonReason} from './presentation-analysis.js';
const element = id => document.getElementById(id);

export function connectRainfallRouting() {
  const section = document.querySelector('.final-control');
  section.querySelector('.final-section-label').textContent = '강수량에 따른 대피로';
  const control = document.createElement('div');
  control.className = 'rainfall-route-control';
  control.innerHTML = `
    <label for="routingRain">시연 강수량 <output id="routingRainValue" for="routingRain">75 mm/h</output></label>
    <input id="routingRain" type="range" min="0" max="200" step="5" value="75">
    <small>0 ─────────── 100 ─────────── 200 mm/h</small>
    <p>30분 지속 가정 · 강수량을 바꾸면 같은 출발점의 침수색과 대피로를 다시 계산합니다.</p>
    <p id="routingChange" role="status" aria-live="polite"></p>
    <p id="routingReason" class="routing-reason"></p>
    <button id="resetRainDemo" type="button">기본 조건으로 초기화</button>
    <p id="rainDemoStatus" role="status">자동 시연: 75 → 100 → 150mm/h의 독립 조건을 비교합니다.</p>
  `;
  section.querySelector('.final-presets').replaceWith(control);
  let timer=null;
  let previousRoute = null;
  let reference=null,demoTimer=null,playing=false;
  let demoStarted=0;
  const playButton=document.createElement('button');playButton.id='playRainDemo';playButton.type='button';
  playButton.textContent='자동 시연';playButton.setAttribute('aria-pressed','false');
  element('toggleAnalytics').before(playButton);
  function stopDemo(message){
    clearTimeout(demoTimer);playing=false;playButton.textContent='자동 시연';playButton.setAttribute('aria-pressed','false');
    if(message)element('rainDemoStatus').textContent=message;
    element('stage').dataset.demoPlaying='false';
    document.dispatchEvent(new CustomEvent('cheonggye:demostate',{detail:{playing:false}}));
  }
  function resetReference(){document.dispatchEvent(new CustomEvent('cheonggye:comparisonreset'));}
  function resetDemoConditions(){
    element('exitClosures').querySelectorAll('input[type=checkbox]').forEach(input=>{input.checked=false});
    element('areaResolution').value='2';element('areaExtent').value='all';
    resetReference();
  }
  document.addEventListener('cheonggye:comparisonreset',()=>{reference=null;previousRoute=null});
  function setRain(value){
    clearTimeout(timer);timer=null;element('routingRain').value=String(value);element('routingRainValue').textContent=value+' mm/h';applyRainfall();
  }
  playButton.addEventListener('click',()=>{
    if(playing){stopDemo('시연 일시정지 · 현재 조건을 유지합니다.');return;}
    clearTimeout(timer);timer=null;resetDemoConditions();element('evacStart').value='north:32';playing=true;playButton.textContent='시연 정지';playButton.setAttribute('aria-pressed','true');
    if(element('toggleAnalytics').getAttribute('aria-expanded')==='false')element('toggleAnalytics').click();
    window.cheonggyeV32Shell?.showMap();
    demoStarted=performance.now();element('stage').dataset.demoPlaying='true';
    document.dispatchEvent(new CustomEvent('cheonggye:demostate',{detail:{playing:true}}));
    const steps=[{rain:75,view:'overview',label:'전체 구간'},{rain:75,view:'detail',label:'하천과 교량'},
      {rain:75,view:'walk',label:'산책로 시점'},{rain:100,view:'top',label:'강우 증가와 위험색'},
      {rain:150,view:'route',label:'변경된 대피경로'},{rain:150,view:'overview',label:'전체 결과'}];
    function advance(index){
      if(index>=steps.length){element('stage').dataset.demoElapsedMs=String(Math.round(performance.now()-demoStarted));stopDemo('24초 시연 완료 · 각 강우는 독립적인 30분 지속 가정입니다.');return;}
      const step=steps[index];element('rainDemoStatus').textContent=`${index+1}/6 · ${step.label} · ${step.rain}mm/h · 북안50%`;
      element('stage').dataset.demoStep=String(index+1);setRain(step.rain);
      if(step.view==='route')element('fitEvacRoute').click();else document.dispatchEvent(new CustomEvent('cheonggye:viewrequest',{detail:{view:step.view,source:'demo'}}));
      demoTimer=setTimeout(()=>advance(index+1),4000);
    }
    advance(0);
  });
  element('resetRainDemo').addEventListener('click',()=>{
    stopDemo('기본 조건으로 초기화했습니다.');resetDemoConditions();element('evacStart').value='north:32';setRain(75);
  });
  window.addEventListener('pagehide',()=>{clearTimeout(timer);stopDemo()});
  document.addEventListener('change',event=>{
    if(playing&&event.isTrusted&&event.target.closest('#controlsPanel'))stopDemo('설정을 변경해 자동 시연을 멈췄습니다.');
  });
  document.addEventListener('cheonggye:manualcamera',()=>{if(playing)stopDemo('지도 조작으로 자동 시연을 멈췄습니다.')});
  document.addEventListener('cheonggye:rotationrequest',()=>{if(playing)stopDemo('자동 회전을 위해 시연을 멈췄습니다.')});

  function applyRainfall() {
    // Use the existing declared prototype conditions for an isolated rain comparison.
    const inputs = {
      evacMode: 'rainfall', rainSource: 'manual',
      rainfallIntensity: element('routingRain').value, rainfallDuration: '30',
      hazardPolicy: 'aidr-prototype', hazardVelocityMode: 'assumed-constant',
      hazardVelocityMps: '0.5', facilityMode: 'scenario', facilityScenario: 'all-open',
      minModelWidthM: '0', maxModelGradePct: '0', boundaryMode: 'legacy'
    };
    for (const [id, value] of Object.entries(inputs)) element(id).value = value;
    element('requireStepFree').checked = false;
    element('rainSource').dispatchEvent(new Event('change', {bubbles: true}));
  }

  element('routingRain').addEventListener('input', () => {
    stopDemo('수동 강우 조건을 비교합니다.');
    element('routingRainValue').textContent = element('routingRain').value + ' mm/h';
    // Throttle continuous dragging, then flush the final value on release.
    if(timer===null)timer=setTimeout(()=>{timer=null;applyRainfall()},80);
  });
  element('routingRain').addEventListener('change',()=>{if(timer!==null){clearTimeout(timer);timer=null;applyRainfall()}});
  element('evacStart').addEventListener('change', () => stopDemo('선택한 출발점에서 비교합니다.'));
  document.addEventListener('cheonggye:analysisinput',()=>{if(playing)stopDemo('직접 조절해 자동 시연을 멈췄습니다.')});
  document.addEventListener('cheonggye:presetrequest',()=>{clearTimeout(timer);timer=null;resetReference();stopDemo('선택한 예시의 독립 조건을 계산합니다.')});
  document.addEventListener('cheonggye:panelchange',event=>{if(event.detail.panel!=='flood')stopDemo('시연 일시정지')});
  document.addEventListener('cheonggye:analysis', event => {
    const analysis = event.detail;
    const route = analysis.route;
    const snapshot=presentationSnapshot(analysis);
    if(!snapshot)reference=null;
    else if(!reference||reference.key!==snapshot.key)reference=snapshot;
    element('routingReason').textContent=routeComparisonReason(reference,analysis);
    if (element('rainSource').value === 'manual') {
      const intensity = Number(element('rainfallIntensity').value);
      element('routingRain').value = String(intensity);
      element('routingRainValue').textContent = intensity + ' mm/h';
    }
    const current = route.status === 'route' ? {
      origin: analysis.startId, exit: route.exit.name, distance: Math.round(route.lengthM)
    } : null;
    const label = element('routingChange');
    if (current) {
      const changed = previousRoute?.origin === current.origin && previousRoute.exit !== current.exit;
      label.textContent = (changed ? previousRoute.exit + ' → ' : '')
        + current.exit + ' · ' + current.distance + 'm';
    } else {
      label.textContent = route.reason || '현재 강수량에서는 통과 가능한 대피로가 없습니다.';
    }
    previousRoute = current;
  });
}
