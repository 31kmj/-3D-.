import {landmarkContracts} from './landmarks-v23.js';
// 이 버전의 정적 등록부에 있는 안정 ID만 fragment 경로로 허용한다.
export function placeFragment(key){return '#'+new URLSearchParams({place:key}).toString()}
export function placeAddress(href,key){const url=new URL(href);url.searchParams.delete('diagnostic');url.hash=placeFragment(key);return url.href}
export function parsePlaceFragment(fragment,knownKeys){
 try{
  const raw=String(fragment??'').replace(/^#/,'');
  if(!raw)return {kind:'empty',key:null};
  if(raw==='stage')return {kind:'anchor',key:null};
  if(raw.length>256)return {kind:'invalid',key:null};
  decodeURIComponent(raw);
  const params=new URLSearchParams(raw),keys=[...params.keys()];
  if(keys.length!==1||keys[0]!=='place'||params.getAll('place').length!==1)return {kind:'invalid',key:null};
  const key=params.get('place');
  if(!/^(?:(?:building|bridge):[1-9][0-9]{0,15}|plaza:cheonggye)$/.test(key))return {kind:'invalid',key:null};
  if(!knownKeys.has(key))return {kind:'unknown',key:null};
  return {kind:'place',key};
 }catch{return {kind:'invalid',key:null}}
}
export function placeSummary(record){
 if(record.kind==='building'){
  const b=record.building,basis=b.height_basis==='osm_height_tag'?'OSM 높이 태그 · 현장 미검증':b.height_basis==='levels_times_3.2_assumed'?'층수 × 3.2m 추정 · 현장 미검증':'높이 미확보 · 12m 임의 표현';
  const landmark=landmarkContracts[b.id];
  return {name:record.name,meta:'지도 건물 · OSM way #'+b.id,basis:b.height.toFixed(1)+'m · '+basis+(landmark?' · '+landmark.features+' / '+landmark.officialFloors+' · 세부치수·색·현 상태 미검증':'')};
 }
 if(record.kind==='bridge')return {name:record.name,meta:'교량 · OSM way #'+record.bridge.osm_way,basis:'평면은 지도 자료, 제원은 공식 안내 참고. 표고·부재 치수·현재 상태는 현장 미검증.'};
 return {name:record.name,meta:'기존 모델 지점 · '+record.key+' · 개별 OSM ID 없음',basis:'기존 광장 모델 위치입니다. 실측 표고·정밀 형상·현재 운영은 확인되지 않았습니다.'};
}

export function createPlaceSelection({records,shell,stage,getCanvas,onNavigate,onDetails,isHidden,onFallback,onChange}){
 const $=id=>document.getElementById(id),card=$('placeCard'),routeStatus=$('placeRouteStatus'),manual=$('placeManualCopy');
 const registry=new Map(records.map(record=>[record.key,record])),knownKeys=new Set(registry.keys());
 let selected=null,origin=null,ready=false,lastURL=null,routeKind='empty',copyStatus='idle',writeStatus='idle';
 const notify=()=>onChange?.(selected,selected?!!isHidden(selected):false);
 function focusMap(){shell.showMap();(getCanvas()||$('togglePanel')).focus({preventScroll:true})}
 function renderVisibility(){if(!selected)return;const hidden=!!isHidden(selected);$('placeVisibility').textContent=hidden?'형상 숨김 · 현재 건물 레이어/높이 필터를 유지합니다.':'모델 지점을 선택했습니다. 실제 출입구·통행 상태를 뜻하지 않습니다.';card.dataset.hiddenGeometry=String(hidden)}
 function write(key){
  try{
   const url=new URL(location.href),current=parsePlaceFragment(url.hash,knownKeys);
   if(key&&current.kind==='place'&&current.key===key){writeStatus='unchanged-same-selection';lastURL=location.href;return}
   if(!key&&!new URLSearchParams(url.hash.slice(1)).has('place')){writeStatus='preserved-non-place-fragment';lastURL=location.href;return}
   url.hash=key?placeFragment(key):'';
   if(url.href!==location.href)history.pushState(null,'',url.href);
   writeStatus='written';lastURL=location.href;
  }catch{writeStatus='unavailable';routeStatus.textContent='선택은 열었지만 주소에 기록하지 못했습니다. 지도 탐색은 계속할 수 있습니다.';routeStatus.hidden=false}
 }
 function paint(record){
  const summary=placeSummary(record);$('placeTitle').textContent=summary.name;$('placeMeta').textContent=summary.meta;$('placeBasis').textContent=summary.basis;
  $('placeCopyStatus').textContent='';copyStatus='idle';manual.hidden=true;card.hidden=false;stage.classList.add('has-place');renderVisibility();
 }
 function select(key,{source='explicit',writeURL=true,focus=true}={}){
  const record=registry.get(key);if(!record)return {accepted:false};
  const wasDrawerOpen=shell.drawerOpen;selected=record;origin=source;routeKind='place';routeStatus.hidden=true;
  onNavigate(record);paint(record);shell.showMap();if(writeURL)write(record.key);notify();
  if(focus||wasDrawerOpen)card.focus({preventScroll:true});
  return {accepted:true,hidden:!!isHidden(record),message:record.name+' 모델 지점을 선택했습니다.',focusTarget:card};
 }
 function clear({source='clear',writeURL=true,focus=false}={}){
  selected=null;origin=source;routeKind='empty';manual.hidden=true;card.hidden=true;stage.classList.remove('has-place');routeStatus.hidden=true;copyStatus='idle';
  if(writeURL)write(null);notify();if(focus)focusMap();
 }
 function restore(source){
  if(!ready)return;let currentURL,currentHash;
  try{currentURL=location.href;currentHash=location.hash}catch{clear({source:'url-unavailable',writeURL:false});routeKind='unavailable';routeStatus.textContent='주소의 선택 정보를 읽지 못해 전체 기본 시점으로 열었습니다. 지도 탐색은 계속할 수 있습니다.';routeStatus.hidden=false;onFallback();return}
  if(lastURL===currentURL)return;lastURL=currentURL;
  const route=parsePlaceFragment(currentHash,knownKeys);routeKind=route.kind;
  if(route.kind==='place'){select(route.key,{source,writeURL:false,focus:false});return}
  const focusWasInCard=card.contains(document.activeElement);clear({source,writeURL:false});routeKind=route.kind;
  if(route.kind==='invalid'||route.kind==='unknown'){
   routeStatus.textContent='이 주소의 모델 지점을 찾을 수 없어 전체 기본 시점으로 열었습니다. 지도 이름 찾기에서 다시 선택해 주세요.';routeStatus.hidden=false;onFallback();
  }else if(route.kind==='empty')onFallback();
  // #stage는 기존 이동 앵커로 존중하며 주소나 카메라를 다시 쓰지 않는다.
  if(focusWasInCard)focusMap();
 }
 $('placeClose').addEventListener('click',()=>clear({focus:true}));
 $('placeMap').addEventListener('click',()=>{if(selected)onNavigate(selected);focusMap()});
 $('placeDetails').addEventListener('click',()=>{if(selected)onDetails(selected)});
 $('placeManualClose').addEventListener('click',()=>{manual.hidden=true;$('placeCopy').focus({preventScroll:true})});
 $('placeCopy').addEventListener('click',async()=>{
  if(!selected)return;
  const key=selected.key;let address,url;
  try{address=placeAddress(location.href,key);url=new URL(address)}catch{copyStatus='unavailable';$('placeCopyStatus').textContent='현재 주소를 읽지 못했습니다. 선택한 모델 탐색은 계속할 수 있습니다.';return}
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname),note=local?' 이 localhost 주소는 원격 접속 서비스가 아닙니다.':'';
  try{
   if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');
   await navigator.clipboard.writeText(address);if(selected?.key!==key)return;
   copyStatus='copied';manual.hidden=true;$('placeCopyStatus').textContent='선택 지점 주소를 복사했습니다.'+note;
  }catch{
   if(selected?.key!==key)return;copyStatus='manual';manual.hidden=false;$('placeCopyAddress').value=address;
   $('placeCopyStatus').textContent='자동 복사를 사용할 수 없습니다. 아래 주소를 선택해 수동으로 복사하세요.'+note;
   const field=$('placeCopyAddress');
   // 지연된 권한 응답이 열린 제어창의 초점을 빼앗지 않도록 한다.
   if(!stage.inert&&!shell.drawerOpen&&!card.hidden&&!field.closest('[inert]')){field.focus({preventScroll:true});field.select();field.scrollIntoView({block:'nearest',inline:'nearest'})}
  }
 });
 for(const event of ['hashchange','popstate'])window.addEventListener(event,()=>restore(event));
 for(const id of ['showBuildings','hideAssumedHeight','showHeightBasis'])$(id).addEventListener('change',()=>{renderVisibility()});
 return {select,clear,start(){ready=true;restore('initial-url')},refreshVisibility:renderVisibility,get state(){return {key:selected?.key??null,kind:selected?.kind??null,origin,hidden:selected?!!isHidden(selected):false,cardVisible:!card.hidden,routeKind,writeStatus,copyStatus,recordCount:registry.size,externalNavigation:false}}};
}
