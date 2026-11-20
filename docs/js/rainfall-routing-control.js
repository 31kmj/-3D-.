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
  let timer;
  let focusNextRoute = false;
  let previousRoute = null;
  let reference=null,demoTimer=null,playing=false;
  const playButton=document.createElement('button');playButton.id='playRainDemo';playButton.type='button';
  playButton.textContent='자동 시연';playButton.setAttribute('aria-pressed','false');
  element('toggleAnalytics').before(playButton);
  function stopDemo(message){
    clearTimeout(demoTimer);playing=false;playButton.textContent='자동 시연';playButton.setAttribute('aria-pressed','false');
    if(message)element('rainDemoStatus').textContent=message;
  }
  function resetReference(){document.dispatchEvent(new CustomEvent('cheonggye:comparisonreset'));}
  function resetDemoConditions(){
    element('exitClosures').querySelectorAll('input[type=checkbox]').forEach(input=>{input.checked=false});
    element('areaResolution').value='2';element('areaExtent').value='all';
    resetReference();
  }
  document.addEventListener('cheonggye:comparisonreset',()=>{reference=null;previousRoute=null});
  function setRain(value){
    clearTimeout(timer);element('routingRain').value=String(value);element('routingRainValue').textContent=value+' mm/h';applyRainfall();
  }
  playButton.addEventListener('click',()=>{
    if(playing){stopDemo('시연 일시정지 · 현재 조건을 유지합니다.');return;}
    clearTimeout(timer);resetDemoConditions();playing=true;playButton.textContent='시연 정지';playButton.setAttribute('aria-pressed','true');
    if(element('toggleAnalytics').getAttribute('aria-expanded')==='false')element('toggleAnalytics').click();
    window.cheonggyeV32Shell?.showMap();
    const steps=[75,100,150];
    function advance(index){
      if(index>=steps.length){stopDemo('시연 완료 · 각 강우가 30분 지속되는 독립 가정입니다.');return;}
      element('rainDemoStatus').textContent=`조건 비교 ${index+1}/3 · ${steps[index]}mm/h × 30분 가정`;
      setRain(steps[index]);demoTimer=setTimeout(()=>advance(index+1),6000);
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

  function applyRainfall() {
    focusNextRoute = true;
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
    clearTimeout(timer);
    timer = setTimeout(applyRainfall, 100);
  });
  element('evacStart').addEventListener('change', () => {stopDemo('선택한 출발점에서 비교합니다.');focusNextRoute = true;});
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
    if (!focusNextRoute) {
      label.textContent = current ? current.exit + ' · ' + current.distance + 'm'
        : route.reason || '현재 조건에서 경로를 산정할 수 없습니다.';
      previousRoute = current;
      return;
    }
    focusNextRoute = false;
    if (current) {
      const changed = previousRoute?.origin === current.origin && previousRoute.exit !== current.exit;
      label.textContent = (changed ? previousRoute.exit + ' → ' : '')
        + current.exit + ' · ' + current.distance + 'm';
      element('fitEvacRoute').click();
    } else {
      label.textContent = route.reason || '현재 강수량에서는 통과 가능한 대피로가 없습니다.';
    }
    previousRoute = current;
  });
}
