// Start the accessible shell before importing the 3D dependency graph.
(async()=>{
const $=id=>document.getElementById(id),loading=$('loading'),stage=$('stage');
if(!new URLSearchParams(location.search).has('demo')){const url=new URL(location.href);url.searchParams.set('demo','rain-routing');history.replaceState(null,'',url)}
const options=new URLSearchParams(location.search),diagnostic=options.get('diagnostic');
let delayed;
const setError=(title,detail)=>{
  clearTimeout(delayed);loading.classList.remove('hidden');loading.classList.add('load-error');
  $('loadTitle').textContent=title;$('loadDetail').textContent=detail;
  $('loadHint').textContent='다시 불러오기를 선택하거나 가벼운 모드를 이용해 주세요. 지형·수위는 시연 가정이며 안전 판단에 사용할 수 없습니다.';
  stage.dataset.loadState='error';
  if($('nameSearchInput')?.disabled)$('nameSearchStatus').textContent='지도를 시작하지 못해 이름 찾기를 사용할 수 없습니다. 다시 불러와 주세요.';
};
window.cheonggyeV32Load={
  status(detail){$('loadDetail').textContent=detail},
  error:setError,
  ready(){clearTimeout(delayed);loading.classList.add('hidden');stage.dataset.loadState='ready'},
  notice(detail){$('runtimeNotice').textContent=detail;$('runtimeNotice').hidden=false},
};
window.addEventListener('error',event=>{if(stage.dataset.loadState!=='ready')setError('지도 시작 중 오류가 발생했습니다','필요한 파일 또는 3D 화면을 준비하지 못했습니다. '+(event.message||''))});
window.addEventListener('unhandledrejection',event=>{if(stage.dataset.loadState!=='ready')setError('필요한 자료를 읽지 못했습니다',event.reason?.message||'연결 상태를 확인한 뒤 다시 불러와 주세요.')});
$('retryLoad').onclick=()=>{const url=new URL(location.href);url.searchParams.delete('diagnostic');location.assign(url.href)};
const light=new URL(location.href);light.searchParams.set('quality','light');light.searchParams.delete('diagnostic');$('lightLoad').href=light.href;
stage.dataset.loadState='loading';stage.dataset.diagnostic=diagnostic||'none';
if(diagnostic)window.cheonggyeV32Load.notice('검증용 실패 주입 모드 · '+diagnostic+' · 다시 불러오면 해제됩니다.');
delayed=setTimeout(()=>{if(stage.dataset.loadState==='loading')$('loadHint').textContent='준비가 길어지고 있습니다. 연결 상태를 확인하거나 가벼운 모드로 다시 열어 주세요. 일부 파일은 최대 20초 뒤 오류를 안내합니다.'},12000);
try{
 const ui=await import('./interface-v32.js');window.cheonggyeV32Shell=ui.createInterface();
 const hazardLab=await import('./hazard-lab-v17.js');hazardLab.createHazardLab();
 if(location.protocol==='file:')throw Error('파일을 직접 열면 브라우저가 지도 자료 읽기를 차단합니다. 웹 서버 주소로 접속해 주세요.');
 if(diagnostic==='module-error')throw Error('검증용: 3D 모듈을 읽지 못한 상황입니다.');
 if(diagnostic==='slow')await new Promise(resolve=>setTimeout(resolve,15000));
 const dashboard=await import('./dashboard-final.js?rev=risk-visible-20261122');dashboard.createDashboard();
 await import('./viewer-final.js?rev=risk-visible-20261122');
}catch(error){console.error('청계천 발표 마감본 시작 실패',error);setError('지도를 시작하지 못했습니다',error.message||'필요한 파일을 읽지 못했습니다.')}
})();
