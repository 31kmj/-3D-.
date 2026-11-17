// 1.1 shell works before the 3D graph is loaded.
export function createInterface(){
 const $=id=>document.getElementById(id),workspace=document.querySelector('.workspace'),panel=$('controlsPanel'),stage=$('stage');
 const mobile=matchMedia('(max-width:850px)'),motion=matchMedia('(prefers-reduced-motion:reduce)');
 let reduced=motion.matches;$('reduceMotion').checked=reduced;
 function applyMotion(){reduced=$('reduceMotion').checked;document.body.classList.toggle('reduce-motion',reduced)}
 $('reduceMotion').addEventListener('change',applyMotion);applyMotion();
 motion.addEventListener('change',e=>{$('reduceMotion').checked=e.matches;applyMotion()});
 const tabs=[...document.querySelectorAll('[role=tab]')];
 function activate(tab,focus=false){
  tabs.forEach(t=>{const selected=t===tab;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;$(t.getAttribute('aria-controls')).hidden=!selected});
  $('mapModeLabel').textContent={hazard:'문헌 위험 기준 계산 · 청계천 적용 미검증',flood:'강우 변화와 이동시간 · 근사 시제품',explore:'사진 참고 수변 표면 / 표고·색도 추정',water:'가상 수위 비교 · 실측 침수 아님',evidence:'자료 근거 · 현장 검증 전',rain:'과거 강우 관측 · 침수위험 산정 보류'}[tab.dataset.panel];
  document.dispatchEvent(new CustomEvent('cheonggye:panelchange',{detail:{panel:tab.dataset.panel}}));
  if(focus)tab.focus();
 }
 tabs.forEach((tab,i)=>{tab.addEventListener('click',()=>activate(tab));tab.addEventListener('keydown',e=>{let target;if(e.key==='ArrowRight')target=(i+1)%tabs.length;else if(e.key==='ArrowLeft')target=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')target=0;else if(e.key==='End')target=tabs.length-1;else return;e.preventDefault();activate(tabs[target],true)})});
 const toggle=$('togglePanel'),backdrop=$('panelBackdrop');
 function sync(){
  const drawerOpen=mobile.matches&&workspace.classList.contains('mobile-open');
  const expanded=mobile.matches?drawerOpen:!workspace.classList.contains('panel-collapsed');
  toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-label',expanded?'지도 제어 접기':'지도 제어 펼치기');
  backdrop.hidden=!drawerOpen;stage.inert=drawerOpen;panel.inert=!expanded;
 }
 function close(){workspace.classList.remove('mobile-open');if(!mobile.matches)workspace.classList.add('panel-collapsed');sync();toggle.focus()}
 $('closePanel').addEventListener('click',close);backdrop.addEventListener('click',close);
 toggle.addEventListener('click',()=>{workspace.classList.toggle(mobile.matches?'mobile-open':'panel-collapsed');sync();if(mobile.matches&&workspace.classList.contains('mobile-open'))$('closePanel').focus()});
 document.addEventListener('keydown',e=>{
  if(!mobile.matches||!workspace.classList.contains('mobile-open'))return;
  if(e.key==='Escape'){e.preventDefault();close();return}
  if(e.key==='Tab'){
   const items=[...panel.querySelectorAll('button,a[href],input,select,summary,[tabindex="0"]')].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length);
   const first=items[0],last=items.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  }
 });
 mobile.addEventListener('change',()=>{workspace.classList.remove('mobile-open','panel-collapsed');sync()});sync();
 // Sources remain readable if the scene cannot start.
 $('openSources').addEventListener('click',()=>$('sourcesDialog').showModal());
 $('closeSources').addEventListener('click',()=>$('sourcesDialog').close());
 return {get drawerOpen(){return mobile.matches&&workspace.classList.contains('mobile-open')},showMap(){if(mobile.matches)workspace.classList.remove('mobile-open');sync()},openControls(name,target){workspace.classList.remove('panel-collapsed');if(mobile.matches)workspace.classList.add('mobile-open');sync();const tab=tabs.find(t=>t.dataset.panel===name);if(tab)activate(tab);const focusTarget=target||tab;if(focusTarget){if(!focusTarget.matches('button,input,select,a'))focusTarget.tabIndex=-1;focusTarget.focus({preventScroll:true});focusTarget.scrollIntoView({block:'nearest'})}},activatePanel(name){const tab=tabs.find(t=>t.dataset.panel===name);if(tab)activate(tab)},get reducedMotion(){return reduced},get panel(){return tabs.find(t=>t.getAttribute('aria-selected')==='true').dataset.panel}};
}
