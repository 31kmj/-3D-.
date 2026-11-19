const element = id => document.getElementById(id);
const format = (value, digits = 0) => Number.isFinite(value)
  ? value.toLocaleString('ko-KR', {maximumFractionDigits: digits}) : '—';

// All cards consume the existing map/route calculation. The rain slider supplies
// the same manual input as the advanced controls, with their full validation.
export function describeRainRoute(analysis) {
  const summary = analysis.inundationArea?.summary;
  const valid = Boolean(analysis.result?.valid && analysis.inundationArea?.valid);
  let risk = 'unknown';
  if (valid) {
    risk = summary.unknownAreaM2 > 0 ? 'unknown'
      : summary.dangerAreaM2 > 0 ? 'danger'
      : summary.cautionAreaM2 > 0 ? 'caution' : 'safe';
  }
  const route = analysis.route;
  const hasRoute = route?.status === 'route';
  return {
    valid, risk, hasRoute,
    depthM: valid ? summary.maxDepthM : null,
    areaM2: valid ? summary.inundatedWalkwayAreaM2 : null,
    destination: hasRoute ? route.exit.name : '경로 미산정',
    distanceM: hasRoute ? route.lengthM : null,
    travelSeconds: hasRoute ? route.travelSeconds ?? route.arrivalSeconds : null,
    reason: hasRoute ? '위험·미확인 구간을 제외하고 이동 전 구간을 검사한 결과'
      : route?.reason || '자료와 출발 위치를 확인하세요.'
  };
}

function updateInput(id, value, eventName = 'input') {
  element(id).value = String(value);
  element(id).dispatchEvent(new Event(eventName, {bubbles: true}));
}

function observationTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '자료 시각 미확인';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(value)) + ' KST';
}

export function createRainRouteDashboard() {
  const controls = document.querySelector('.final-control');
  const presets = controls.querySelector('.final-presets');
  const label = controls.querySelector('.final-section-label');
  label.textContent = '강우 조건';
  const rainCard = document.createElement('section');
  rainCard.className = 'rain-control-card';
  rainCard.setAttribute('aria-label', '강우와 관측 자료');
  rainCard.innerHTML = `
    <div class="rain-source-tabs" role="group" aria-label="강우 자료 선택">
      <button type="button" data-rain-source="manual" aria-pressed="true">강우 시연</button>
      <button type="button" data-rain-source="live" aria-pressed="false">실시간 관측</button>
      <button type="button" data-rain-source="history" aria-pressed="false">과거 관측</button>
    </div>
    <div class="rain-number"><label for="quickRain">시간당 강우량</label><output id="quickRainValue" for="quickRain">75 <small>mm/h</small></output></div>
    <input id="quickRain" type="range" min="0" max="200" step="5" value="75">
    <div class="rain-ticks"><span>0</span><span>50</span><span>100</span><span>150</span><span>200mm/h</span></div>
    <div class="rain-examples" role="group" aria-label="강우량 예시">
      <button data-quick-rain="10">10mm/h</button><button data-quick-rain="75">75mm/h</button><button data-quick-rain="150">150mm/h</button>
    </div>
    <label class="rain-duration" for="quickDuration">강우 지속시간 <select id="quickDuration"><option value="10">10분</option><option value="30" selected>30분</option><option value="60">60분</option><option value="120">120분</option></select></label>
    <p id="quickObservation" class="rain-observation" role="status">수동 강우 시연 준비 중</p>
    <button type="button" id="quickRefresh" hidden>관측 새로고침</button>
  `;
  label.after(rainCard);
  const comparisons = document.createElement('details');
  comparisons.className = 'rain-comparisons';
  comparisons.innerHTML = '<summary>강우·출구 조건 비교 시연</summary>';
  presets.before(comparisons);
  comparisons.append(presets);
  const basis = element('finalBasis');
  basis.hidden = true;
  const pickButton = document.createElement('button');
  pickButton.id = 'pickEvacStart';
  pickButton.type = 'button';
  pickButton.className = 'pick-start-button';
  pickButton.setAttribute('aria-pressed', 'false');
  pickButton.textContent = '지도에서 출발 위치 선택';
  element('evacStart').after(pickButton);

  const hud = document.createElement('section');
  hud.className = 'rain-map-hud';
  hud.setAttribute('aria-label', '강우와 침수 위험 요약');
  hud.innerHTML = `
    <div class="hud-source"><strong id="hudSource">강우 시연</strong><span id="hudTimestamp">가정 입력</span></div>
    <div class="hud-values"><div><span>강우량</span><b id="hudRain">—</b><small id="hudRainUnit">mm/h</small></div><div><span>최대 보행 수심</span><b id="hudDepth">—</b><small>m · 모형</small></div><div class="hud-risk" data-risk="unknown"><span>보행영역 최대 위험도</span><b id="hudRisk">미확인</b></div></div>
    <div class="risk-steps" aria-label="위험 등급"><span data-level="safe">초록 · 안전</span><span data-level="caution">노랑 · 주의</span><span data-level="danger">빨강 · 위험</span></div>
    <p id="pickStartHint" hidden role="status">지도 산책로를 눌러 출발 위치를 선택하세요. 가까운 보행 노드에 맞춥니다.</p>
  `;
  element('stage').append(hud);

  const routeCard = document.createElement('section');
  routeCard.className = 'map-route-card';
  routeCard.setAttribute('aria-label', '현재 계산된 대피경로');
  routeCard.innerHTML = `
    <div class="route-card-heading"><span>모형 추천 대피경로</span><span id="mapRouteStatus">계산 준비 중</span></div>
    <div class="route-card-main"><div><small id="mapStartName">출발 위치</small><strong id="mapRouteExit">경로 준비 중</strong></div><button type="button" id="mapFitRoute">경로 보기 ↗</button></div>
    <div class="route-card-metrics"><b id="mapRouteLength">—</b><span id="mapRouteTime">—</span><span>청록선 · 대피 방향 화살표</span></div>
    <p id="mapRouteReason"></p>
  `;
  document.querySelector('.final-analytics').prepend(routeCard);
  element('mapFitRoute').addEventListener('click', () => element('fitEvacRoute').click());
  element('quickRefresh').addEventListener('click', () => element('refreshLiveRain').click());

  let sliderTimer;
  function prepareManual() {
    element('evacMode').value = 'rain-time';
    element('rainSource').value = 'manual';
    element('rainfallIntensity').value = element('quickRain').value;
    element('rainfallDuration').value = element('quickDuration').value;
    element('rainTimeView').value = '0';
    // Future rain is an explicit steady assumption for this direct manipulation.
    element('rainFuture').value = 'steady';
    element('rainFreeze').checked = false;
    element('rainSource').dispatchEvent(new Event('change', {bubbles: true}));
  }
  function scheduleManual() {
    element('quickRainValue').textContent = element('quickRain').value + ' mm/h';
    clearTimeout(sliderTimer);
    sliderTimer = setTimeout(prepareManual, 100);
  }
  element('quickRain').addEventListener('input', scheduleManual);
  element('quickDuration').addEventListener('change', prepareManual);
  rainCard.querySelectorAll('[data-quick-rain]').forEach(button => {
    button.addEventListener('click', () => {
      clearTimeout(sliderTimer);
      element('quickRain').value = button.dataset.quickRain;
      prepareManual();
    });
  });
  rainCard.querySelectorAll('[data-rain-source]').forEach(button => {
    button.addEventListener('click', () => {
      clearTimeout(sliderTimer);
      const source = button.dataset.rainSource;
      if (source === 'history') {
        element('demoHistoryPeak').click();
        return;
      }
      if (source === 'manual') {
        prepareManual();
        return;
      }
      element('evacMode').value = 'rain-time';
      element('rainTimeView').value = '0';
      updateInput('rainSource', source, 'change');
    });
  });

  document.addEventListener('cheonggye:pickstart', event => {
    pickButton.setAttribute('aria-pressed', String(event.detail.active));
    pickButton.textContent = event.detail.active ? '출발 위치 선택 취소' : '지도에서 출발 위치 선택';
    element('pickStartHint').hidden = !event.detail.active && !event.detail.message;
    element('pickStartHint').textContent = event.detail.message || '지도 산책로를 눌러 출발 위치를 선택하세요. 가까운 보행 노드에 맞춥니다.';
  });
  document.addEventListener('cheonggye:panelchange', event => {hud.hidden = event.detail.panel !== 'flood';});
  document.addEventListener('cheonggye:analysis', event => {
    const analysis = event.detail;
    const state = describeRainRoute(analysis);
    const source = element('rainSource').value;
    const isRainMode = ['rain-time', 'rainfall'].includes(analysis.mode);
    const observation = analysis.live?.observation;
    const history = analysis.history?.replay;
    const rainfall = analysis.currentRainResult?.rainfall;
    const value = source === 'history' ? history?.lastBinIntensityMmH : rainfall?.intensityMmH;
    const sourceTitle = !isRainMode ? '합성 침수 실험'
      : source === 'live' ? (analysis.live?.status === 'ready' ? '기상청 관측' : '기상청 미연결')
      : source === 'history' ? '과거 관측 재생' : '수동 강우 시연';
    element('hudSource').textContent = sourceTitle;
    element('hudTimestamp').textContent = source === 'manual' && isRainMode
      ? '강우 지속 ' + element('rainfallDuration').value + '분 가정'
      : observationTime(observation?.observedAt || history?.observedEndAt);
    element('hudRain').textContent = isRainMode ? format(value, 1) : '—';
    element('hudRainUnit').textContent = source === 'live' ? '최근 1시간 mm' : 'mm/h';
    element('hudDepth').textContent = format(state.depthM, 2);
    const riskLabel = {safe: '안전', caution: '주의', danger: '위험', unknown: '미확인'}[state.risk];
    element('hudRisk').textContent = riskLabel;
    hud.querySelector('.hud-risk').dataset.risk = state.risk;
    hud.querySelectorAll('[data-level]').forEach(item => {item.dataset.active = String(item.dataset.level === state.risk);});
    rainCard.querySelectorAll('[data-rain-source]').forEach(button => {button.setAttribute('aria-pressed', String(isRainMode && button.dataset.rainSource === source));});
    const manual = source === 'manual' && isRainMode;
    element('quickRain').disabled = !manual;
    element('quickDuration').disabled = !manual;
    rainCard.querySelectorAll('[data-quick-rain]').forEach(button => {button.disabled = !manual;});
    if (manual) {
      const intensity = Number(element('rainfallIntensity').value);
      if (intensity <= 200) element('quickRain').value = String(intensity);
      element('quickRainValue').textContent = format(intensity, 1) + ' mm/h';
      const duration = element('rainfallDuration').value;
      if (![...element('quickDuration').options].some(option => option.value === duration)) {
        element('quickDuration').add(new Option(duration + '분', duration));
      }
      element('quickDuration').value = duration;
    } else {
      element('quickRainValue').textContent = format(value, 1) + (source === 'live' ? ' mm/1h' : ' mm/h');
    }
    element('quickObservation').textContent = source === 'live' && isRainMode
      ? (analysis.live?.reason || '실시간 관측 확인 중')
      : source === 'history' && isRainMode ? '서울시 과거 10분 강우 · ' + (history?.observedEndAt || '로딩 중')
      : manual ? '강우 → 근사 침수 → 위험색 → 대피경로를 함께 계산합니다.' : '합성 침수 시나리오 선택 중';
    element('quickRefresh').hidden = source !== 'live' || !isRainMode;
    element('mapRouteExit').textContent = state.destination;
    element('mapRouteLength').textContent = state.hasRoute ? format(state.distanceM) + ' m' : '—';
    element('mapRouteTime').textContent = Number.isFinite(state.travelSeconds)
      ? '예상 이동 ' + Math.ceil(state.travelSeconds / 60) + '분' : '이동시간 미산정';
    element('mapRouteStatus').textContent = state.hasRoute ? '조건 내 경로 있음'
      : analysis.route?.status === 'insufficient-data' ? '자료 확인 필요'
      : analysis.route?.status === 'origin-blocked' ? '출발지 위험' : '통과 경로 없음';
    element('mapRouteReason').textContent = state.reason;
    element('mapStartName').textContent = element('evacStart').selectedOptions[0]?.textContent || '출발 위치';
    element('mapFitRoute').disabled = !state.hasRoute;
    routeCard.dataset.available = String(state.hasRoute);
    document.querySelector('.final-analytics').dataset.routeAvailable = String(state.hasRoute);
  });
}
