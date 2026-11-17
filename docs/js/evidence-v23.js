import * as THREE from 'three';

export function createEvidenceUI({data,official,groups,buildingMeshes,setView,scene,renderer,onBridgeSelect}){
  const $=id=>document.getElementById(id),facilityGroup=new THREE.Group();scene.add(facilityGroup);groups.facilities=facilityGroup;
  const originals=new WeakMap(),evidenceMaterials={osm_height_tag:new THREE.MeshStandardMaterial({color:'#4f91bd',roughness:.8}),'levels_times_3.2_assumed':new THREE.MeshStandardMaterial({color:'#d5ab4a',roughness:.8}),default_12m_assumed:new THREE.MeshStandardMaterial({color:'#b36765',roughness:.8})};
  let colorMode=false,tagOnly=false,selectedFacility=null;
  for(const root of buildingMeshes)root.traverse(object=>{if(object.isMesh)originals.set(object,object.material)});
  function apply(){
    for(const object of groups.buildings.children){const b=object.userData.building;object.visible=!tagOnly||b?.height_basis==='osm_height_tag';if(b)object.traverse(child=>{if(child.isMesh&&originals.has(child))child.material=colorMode?evidenceMaterials[b.height_basis]:originals.get(child)})}
    renderer.shadowMap.needsUpdate=true;
    const visible=groups.buildings.visible?buildingMeshes.filter(b=>b.visible):[];
    $('evidenceCount').textContent=`본체 ${data.buildings.length}개 + 부속체 ${data.building_parts.length}개 · 표시 ${visible.length}개 형상 · 현장 높이 검증 0개`;
  }
  $('showHeightBasis').addEventListener('change',e=>{colorMode=e.target.checked;apply()});
  $('hideAssumedHeight').addEventListener('change',e=>{tagOnly=e.target.checked;apply()});
  $('showBuildings').addEventListener('change',apply);
  const kinds={ramp_marker:'경사로 안내점',elevator_marker:'엘리베이터 안내점',toilet:'화장실 안내점',accessible_toilet:'장애인 화장실 안내점'};
  const markers=[];
  for(const r of official.records){
    const access=['ramp_marker','elevator_marker'].includes(r.kind),color=r.kind==='ramp_marker'?'#cba84d':r.kind==='elevator_marker'?'#9979b9':'#5995ab';
    const geometry=r.kind==='ramp_marker'?new THREE.ConeGeometry(1.15,2.8,3):new THREE.OctahedronGeometry(1.2,0);
    const marker=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.25,roughness:.7}));marker.position.set(r.position[0],2.0,r.position[1]);marker.userData.record=r;marker.visible=access;marker.castShadow=false;facilityGroup.add(marker);markers.push(marker);
    const option=document.createElement('option');option.value=r.id;option.textContent=`${kinds[r.kind]} · ${r.name}`;$('facilitySelect').append(option);
  }
  function rebuildMarkers(){for(const marker of markers)marker.visible=$('showOfficial').checked&&(['ramp_marker','elevator_marker'].includes(marker.userData.record.kind)||$('showToilets').checked)}
  $('showOfficial').addEventListener('change',rebuildMarkers);$('showToilets').addEventListener('change',rebuildMarkers);
  const box=$('evidenceBox');
  function facts(title,rows,url){
    const heading=document.createElement('strong'),dl=document.createElement('dl');heading.textContent=title;
    for(const [label,value] of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;dl.append(dt,dd)}
    const a=document.createElement('a');a.textContent='공식 자료 확인 ↗';a.href=url;a.target='_blank';a.rel='noreferrer';box.replaceChildren(heading,dl,a);
  }
  function showBridge(name){
    const b=data.bridges.find(b=>b.name===name);if(!b)return;
    $('bridgeSelect').value=b.name;
    const forms={'모전교':'단경간 아치','광통교':'석조 보·2개 교각·3개 개구부','광교':'주황 거더 외관','장통교':'밝은 상판·교각·난간','삼일교':'금속 곡면 난간'};
    facts(b.name,[['공식 안내 제원',`폭 ${b.official_width_m}m · 연장 ${b.official_length_range_m?b.official_length_range_m.join('~'):b.official_length_m}m`],['3D 표현 길이',`${b.render_length_m}m · ${b.modeled_length_basis==='official scalar length'?'공식 연장값으로 표현(길이 정의 대조 전)':'지도 연결선·공식 범위 내 참고값'}`],['지도 연결선',`${b.mapped_axis_length_m}m (접근부 포함 여부 미확인)`],['중심 위치',`${b.lonlat[1].toFixed(7)}, ${b.lonlat[0].toFixed(7)} · OSM 지도 중심, 현장 미검증`],['형태 참고',forms[b.name]],['미확보','표고·부재 단면·기초·실제 난간 치수·현 상태. 측량 모델이 아님.']],b.source_url);
  }
  for(const b of data.bridges){const o=document.createElement('option');o.value=b.name;o.textContent=b.name;$('bridgeSelect').append(o)}
  $('bridgeSelect').addEventListener('change',()=>{const b=data.bridges.find(b=>b.name===$('bridgeSelect').value);if(b){if(onBridgeSelect)onBridgeSelect(b);else{showBridge(b.name);setView('focus',new THREE.Vector3(b.center[0],0,b.center[1]))}}});
  $('viewBridgeClose').addEventListener('click',()=>{const b=data.bridges.find(b=>b.name===$('bridgeSelect').value);if(b)setView('bridgeClose',new THREE.Vector3(b.center[0],0,b.center[1]))});
  $('facilitySelect').addEventListener('change',()=>{
    const r=official.records.find(r=>r.id===$('facilitySelect').value);if(!r)return;selectedFacility=r.id;
    $('showOfficial').checked=true;if(['toilet','accessible_toilet'].includes(r.kind))$('showToilets').checked=true;rebuildMarkers();
    facts(`${kinds[r.kind]} · ${r.name}`,[['출처 좌표',`${r.lonlat[1]}, ${r.lonlat[0]}`],['좌표의 의미','공식 웹 안내 마커. 시설 중심/입구 정의·좌표 정확도·준거계 상세 미기재.'],['3D 표시','기호의 Y값은 가정. 실제 시설 구조물을 모델링한 것이 아님.'],['미확보','폭·표고·경사·전체 출구 완전성·현재 통행/운영 상태.']],r.source_url);
    setView('focus',new THREE.Vector3(r.position[0],0,r.position[1]));
  });
  function showPlaza(){facts('청계광장 · 자료와 모델의 차이',[['공식 안내','2단 폭포의 높이 4m와 미니어처 등의 존재를 안내.'],['현재 모델','OSM 광장 평면만 반영. 폭포·분수의 정확한 위치/단면/표고 미확보로 정밀 모델 적용 보류.'],['길이 비교',`공식 도면 합계898m / OSM 추출856.1m. 원인 미확정; 강제 축척 보정하지 않음.`]],'https://www.sisul.or.kr/open_content/cheonggye/enjoy/guide.jsp?bridge=cheonggye')}
  $('officialSummary').textContent=`공식 안내점 ${official.records.length}개: 경사로 2·엘리베이터 1·화장실 15(시설 중복 가능). 전역 원본84행 중 중복11행 제거·범위 오류3행 격리. 대상 구간 전체 시설 수나 운영 보장이 아닙니다.`;
  apply();showBridge('광통교');
  return {showBridge,showPlaza,get state(){return {heightBasis:colorMode,tagOnly,selectedFacility,visibleBuildingGeometry:groups.buildings.visible?buildingMeshes.filter(b=>b.visible).length:0,facilityMarkersVisible:markers.filter(m=>m.visible).length,officialRecords:official.records.length,buildingParts:data.building_parts.length,surveyVerifiedHeights:0}}};
}
