// One input updates the existing inundation and route calculation for the same origin.
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
  `;
  section.querySelector('.final-presets').replaceWith(control);
  let timer;
  let focusNextRoute = false;
  let previousRoute = null;

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
    element('routingRainValue').textContent = element('routingRain').value + ' mm/h';
    clearTimeout(timer);
    timer = setTimeout(applyRainfall, 100);
  });
  element('evacStart').addEventListener('change', () => {focusNextRoute = true;});
  document.addEventListener('cheonggye:analysis', event => {
    const analysis = event.detail;
    const route = analysis.route;
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
