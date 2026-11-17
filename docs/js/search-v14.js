// 검색 대상과 문자열 비교는 기존 지도 자료만 사용한다. 외부 요청/저장은 없다.
export function normalizeName(value){return String(value??'').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/gu,'')}
export function buildLocalNameIndex(data){
 const records=[];
 for(const building of data.buildings??[]){if(typeof building.name!=='string'||!building.name.trim())continue;records.push({key:'building:'+building.id,name:building.name,kind:'building',kindLabel:'지도 건물',sourceId:String(building.id),building})}
 for(const bridge of data.bridges??[]){if(typeof bridge.name!=='string'||!bridge.name.trim())continue;records.push({key:'bridge:'+(bridge.osm_way??bridge.id??bridge.name),name:bridge.name,kind:'bridge',kindLabel:'교량',sourceId:String(bridge.osm_way??bridge.id??bridge.name),bridge})}
 records.push({key:'plaza:cheonggye',name:'청계광장',kind:'plaza',kindLabel:'기존 모델 지점',sourceId:'cheonggye-plaza'});
 return records.map(record=>({...record,foldedName:normalizeName(record.name)}));
}
export function findLocalNames(index,query,limit=6){
 const folded=normalizeName(query);if(!folded)return {empty:true,total:0,results:[]};
 const matches=index.filter(record=>record.foldedName.includes(folded));
 const rank=record=>record.foldedName===folded?0:record.foldedName.startsWith(folded)?1:2;
 matches.sort((a,b)=>rank(a)-rank(b)||a.name.localeCompare(b.name,'ko-KR')||a.key.localeCompare(b.key));
 return {empty:false,total:matches.length,results:matches.slice(0,Math.min(6,Math.max(1,limit)))};
}

export function createLocalNameSearch({data,onSelect,onClear=()=>{}}){
 const $=id=>document.getElementById(id),input=$('nameSearchInput'),list=$('nameSearchResults'),status=$('nameSearchStatus'),clear=$('nameSearchClear');
 const index=buildLocalNameIndex(data),namedBuildings=index.filter(record=>record.kind==='building').length;
 let matches=[],total=0,active=-1,composing=false,lastSelected=null,lastSelectionHidden=false;
 const setStatus=message=>{status.textContent=message};
 function close(){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;for(const option of list.children)option.setAttribute('aria-selected','false')}
 function activate(next){
  active=next;for(const [i,option]of [...list.children].entries())option.setAttribute('aria-selected',String(i===active));
  const option=list.children[active];if(option){input.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'})}else input.removeAttribute('aria-activedescendant');
 }
 function render(){
  const found=findLocalNames(index,input.value);matches=found.results;total=found.total;active=-1;list.replaceChildren();input.removeAttribute('aria-activedescendant');
  if(found.empty){close();setStatus('이름을 입력해 주세요. 지도 건물 '+namedBuildings+'개·교량 '+(data.bridges?.length??0)+'개·청계광장을 찾을 수 있습니다.');return}
  if(!matches.length){close();setStatus('일치하는 이름이 없습니다. 이름 일부로 다시 찾아보세요. 무명 건물·공식 시설 안내점은 검색 대상이 아닙니다.');return}
  matches.forEach((record,i)=>{
   const option=document.createElement('li'),name=document.createElement('strong'),detail=document.createElement('span');
   option.id='name-result-'+i;option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.dataset.searchKey=record.key;
   name.textContent=record.name;detail.textContent=record.kindLabel+(record.kind==='building'?' · OSM #'+record.sourceId:'');option.append(name,detail);
   option.addEventListener('pointerdown',event=>event.preventDefault());option.addEventListener('click',()=>choose(i));list.append(option);
  });
  list.hidden=false;input.setAttribute('aria-expanded','true');setStatus(total+'개 중 '+matches.length+'개를 표시합니다. 위아래 방향키로 고르고 Enter로 이동합니다.');
 }
 function choose(position){
  const record=matches[position];if(!record)return;
  try{const selected=onSelect(record)||{};lastSelected=record.key;lastSelectionHidden=!!selected.hidden;input.value=record.name;close();setStatus(selected.message||record.name+' 자료를 열었습니다.');const target=selected.focusTarget;if(target&&!target.closest('[inert]'))target.focus({preventScroll:true});else if(!input.closest('[inert]'))input.focus()}
  catch(error){close();setStatus('해당 모델 지점으로 이동하지 못했습니다. 다른 결과를 선택하거나 지도를 다시 불러와 주세요.');console.error('로컬 이름 찾기 처리 실패',error)}
 }
 input.addEventListener('input',()=>{if(!composing)render()});
 input.addEventListener('compositionstart',()=>{composing=true});input.addEventListener('compositionend',()=>{composing=false;render()});
 input.addEventListener('keydown',event=>{
  if(composing||event.isComposing||event.keyCode===229){if(event.key==='Escape')event.stopPropagation();return}
  if(!['ArrowDown','ArrowUp','Enter','Escape'].includes(event.key))return;
  if(event.key==='Escape'){if(list.hidden)return;event.preventDefault();event.stopPropagation();close();setStatus('결과 목록을 닫았습니다. 방향키로 다시 열 수 있고, Escape를 한 번 더 누르면 모바일 제어를 닫습니다.');return}
  event.preventDefault();event.stopPropagation();
  if(list.hidden)render();if(!matches.length)return;
  if(event.key==='Enter'){choose(active<0?0:active);return}
  const next=event.key==='ArrowDown'?(active<0?0:(active+1)%matches.length):(active<0?matches.length-1:(active+matches.length-1)%matches.length);activate(next);
 });
 input.addEventListener('blur',()=>{close();if(input.value.trim())setStatus('검색어는 유지됩니다. 입력창에서 방향키로 결과를 다시 열 수 있습니다.')});
 clear.addEventListener('click',()=>{input.value='';lastSelected=null;lastSelectionHidden=false;render();onClear();input.focus()});
 input.disabled=false;clear.disabled=false;render();
 return {syncSelection(record,hidden=false){lastSelected=record?.key??null;lastSelectionHidden=hidden;input.value=record?.name??'';close();if(!record)setStatus('이름을 입력해 주세요. 지도 이름 등록부 안에서만 찾습니다.')},get state(){return {scope:'named core OSM buildings + bridges + existing plaza landmark; official facility records excluded',recordCount:index.length,namedBuildings,queryLength:input.value.length,totalMatches:total,shown:list.hidden?0:matches.length,activeIndex:active,expanded:!list.hidden,lastSelected,lastSelectionHidden,persistentStorage:false,externalSearch:false}}};
}
