import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// All dimensions below are model assumptions. OSM footprint, ID and height stay
// unchanged; architectural descriptions establish elements, not their dimensions.
export const landmarkContracts={
  355906424:{key:'samil',name:'삼일빌딩',source:'정림 · 원오원 설계 설명 / 2020 리노베이션',url:'https://junglim.com/en/31-bldg-renovation/',detailURL:'https://kiramonthly.com/1034',
    officialFloors:'정림 B2/31F · OSM 지상31 일치',features:'돌출 I형 리브·북측 금속 코어·두 층 높이 저층부·셋백 루버 옥탑',
    assumptions:{baseY:.1,lobbyHeight:7.4,roofHeight:3.0,roofInsetFactor:.76,verticalModuleM:2.65,horizontalModuleM:3.30,ribDepthM:.24,ribFlangeWidthM:.19,facadeInsetM:.32},
    limit:'높이111m는 기존 OSM 태그. 북측 코어 대응·모듈 수·치수·셋백·재질 수치는 추정. 선큰·지형 변경 없음.'},
  141957173:{key:'sk',name:'SK 서린빌딩',source:'한국건축가협회 설계 작품 기록',url:'https://www.kia.or.kr/data/works.php?code=works&idx=15770&page=13&ptype=view',detailURL:'https://www.skreit.co.kr/en/portfolio/skbuilding.php',
    officialFloors:'협회·소유자 지상36층 / 기존 OSM35층 · 불일치 보존',features:'짙은 금속 격자·유리면·후퇴한 투명 로비·필로티',
    assumptions:{baseY:.1,lobbyHeight:8.2,roofHeight:1.8,roofInsetFactor:.94,verticalModuleM:3.8,horizontalModuleM:4.4,ribDepthM:.16,ribFlangeWidthM:.13,facadeInsetM:.30},
    limit:'높이160m는 기존 OSM 태그. 격자 간격은 모델러 가정이며 공식36층 동일 분할 아님. 문헌 동서3m 캔틸레버로 외곽 확장하지 않음.'},
};

const material=(name,color,options={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.55,...options});m.name=name;m.userData.landmark23=true;return m};

export function buildLandmark(building){
  const contract=landmarkContracts[building.id];if(!contract)return null;
  const samil=contract.key==='samil',a=contract.assumptions,root=new THREE.Group();root.name='landmark-'+contract.key;
  root.userData.building=building;root.userData.landmark23=contract.key;
  const mats={
    glass:material(contract.key+'-glass',samil?'#627f8c':'#658795',{metalness:.53,roughness:.18,envMapIntensity:1.25}),
    frame:material(contract.key+'-frame',samil?'#292d31':'#404e56',{metalness:.68,roughness:.38}),
    panel:material(contract.key+'-panel',samil?'#353c40':'#3b4a52',{metalness:.40,roughness:.58}),
    stone:material(contract.key+'-plinth','#bbb8ac',{roughness:.88}),
    lobby:material(contract.key+'-lobby','#7c9b9f',{metalness:.12,roughness:.18,transparent:true,opacity:.36,depthWrite:false,side:THREE.DoubleSide}),
  };
  // Analytic pane variation, generated solely from mesh UVs. No photograph or
  // remote texture is sampled. The reflectance/colour ranges are artistic.
  mats.glass.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 v23PaneUV;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nv23PaneUV=uv;');
    shader.fragmentShader='varying vec2 v23PaneUV;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nvec2 v23Cell=floor(v23PaneUV);\nfloat v23Tone=fract(sin(dot(v23Cell,vec2(12.9898,78.233)))*43758.5453);\ndiffuseColor.rgb*=mix(0.83,1.17,v23Tone);');
  };
  mats.glass.customProgramCacheKey=()=> 'landmark23-procedural-pane-variation';
  const geometries=new Map(Object.keys(mats).map(k=>[k,[]]));
  function add(key,g){geometries.get(key).push(g.index?g.toNonIndexed():g);if(g.index)g.dispose()}
  function block(key,w,h,d,x,y,z,yaw=0){const g=new THREE.BoxGeometry(w,h,d);g.rotateY(yaw);g.translate(x,y,z);add(key,g)}
  const polygon=building.points.slice(0,-1),center=polygon.reduce((c,p)=>[c[0]+p[0]/polygon.length,c[1]+p[1]/polygon.length],[0,0]);
  let signedArea=0;for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length];signedArea+=p[0]*q[1]-q[0]*p[1]}
  const base=.1,top=base+building.height,lobbyTop=base+a.lobbyHeight,facadeTop=top-a.roofHeight;
  const edges=polygon.map((p,i)=>{const q=polygon[(i+1)%polygon.length],dx=q[0]-p[0],dz=q[1]-p[1],length=Math.hypot(dx,dz);return {i,p,q,length,dx:dx/length,dz:dz/length,nx:(signedArea>0?-dz:dz)/length,nz:(signedArea>0?dx:-dx)/length,yaw:-Math.atan2(dz,dx)}});
  function face(key,e,bottom,upper,inset=0,start=0,end=e.length){
    // Trim offset sheets at both ends: their original oblique corners must not
    // cross the neighbouring mapped boundary when displaced inward.
    start=Math.max(start,inset*1.1);end=Math.min(end,e.length-inset*1.1);
    const p=[e.p[0]+e.dx*start+e.nx*inset,e.p[1]+e.dz*start+e.nz*inset],q=[e.p[0]+e.dx*end+e.nx*inset,e.p[1]+e.dz*end+e.nz*inset];
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([p[0],bottom,p[1],q[0],bottom,q[1],q[0],upper,q[1],p[0],upper,p[1]],3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,(end-start)/a.verticalModuleM,0,(end-start)/a.verticalModuleM,(upper-bottom)/a.horizontalModuleM,0,(upper-bottom)/a.horizontalModuleM],2));
    // Outward normal: OSM rings may have either winding in the X/Z plane.
    g.setIndex(signedArea>0?[0,2,1,0,3,2]:[0,1,2,0,2,3]);g.computeVertexNormals();add(key,g);
  }
  function cap(key,points,y){const s=new THREE.Shape();points.forEach((p,i)=>i?s.lineTo(p[0],-p[1]):s.moveTo(p[0],-p[1]));s.closePath();const g=new THREE.ShapeGeometry(s);g.rotateX(-Math.PI/2);g.translate(0,y,0);add(key,g)}
  function along(key,e,t,y,w,h,d,inset){block(key,w,h,d,e.p[0]+e.dx*t+e.nx*inset,y,e.p[1]+e.dz*t+e.nz*inset,e.yaw)}
  let verticalRibs=0,horizontalBands=0,lobbyColumns=0,roofLouvers=0;
  for(const e of edges){
    const core=samil&&[0,1,7].includes(e.i),inset=a.facadeInsetM;
    face(core?'panel':'glass',e,lobbyTop,facadeTop,inset);
    if(core)face('panel',e,base+.30,lobbyTop,inset);
    // Low plinth and ceiling planes retain the original ground footprint.
    face('stone',e,base,base+.30,.03);
    along('panel',e,e.length/2,lobbyTop-.18,e.length-.18,.36,.48,.25);
    face('lobby',e,base+.30,lobbyTop-.4,samil?.95:2.25,.45,e.length-.45);
    // A transparent lobby is a visual abstraction, not a traversable indoor route.
    const columns=Math.max(1,Math.round(e.length/(samil?9:12)));
    for(let j=0;j<=columns;j++){const t=.65+(e.length-1.3)*j/columns;along('frame',e,t,(base+lobbyTop)/2,samil?1.05:.68,a.lobbyHeight-.32,samil?1.05:.78,samil?.9:2.15);lobbyColumns++}
    if(samil)along('frame',e,e.length/2,base+3.2,e.length-.2,.52,.45,.9);
    const modules=Math.max(1,Math.round(e.length/(core?3.1:a.verticalModuleM))),step=e.length/modules;
    for(let j=1;j<modules;j++){
      const t=j*step,h=facadeTop-lobbyTop;
      if(samil&&!core){
        // Explicit I section: inner flange, web, outer flange; all stay inset.
        along('frame',e,t,(lobbyTop+facadeTop)/2,.19,h,.045,inset-.015);
        along('frame',e,t,(lobbyTop+facadeTop)/2,.045,h,a.ribDepthM,inset-.10);
        along('frame',e,t,(lobbyTop+facadeTop)/2,.19,h,.045,inset-.21);
      }else along('frame',e,t,(lobbyTop+facadeTop)/2,core?.14:a.ribFlangeWidthM,h,core?.20:a.ribDepthM,inset-.08);
      verticalRibs++;
      if(!core&&samil)along('panel',e,t+step/2,(lobbyTop+facadeTop)/2,.035,h,.045,inset-.015);
    }
    if(core){for(let y=lobbyTop+6.6;y<facadeTop-.15;y+=6.6){along('frame',e,e.length/2,y,e.length-.2,.055,.08,inset-.015);horizontalBands++}}
    else for(let y=lobbyTop+a.horizontalModuleM;y<facadeTop-.15;y+=a.horizontalModuleM){
      along('panel',e,e.length/2,y-.28,e.length-.18,samil?.46:.70,.13,inset-.015);
      along('frame',e,e.length/2,y,e.length-.16,samil?.09:.105,samil?.15:.12,inset-.07);horizontalBands++;
    }
    along('frame',e,e.length/2,facadeTop-.12,e.length-.16,.24,.28,inset-.06);
  }
  cap('panel',polygon,facadeTop);cap('stone',polygon,base+.31);cap('panel',polygon,lobbyTop-.35);
  if(!samil)block('panel',10.5,a.lobbyHeight-.3,8.0,center[0],base+(a.lobbyHeight-.3)/2,center[1]);
  // Recessed penthouse is entirely within the footprint. Its size and location
  // are assumptions, not a survey of roof equipment or a high-point definition.
  const roofPolygon=polygon.map(p=>[center[0]+(p[0]-center[0])*a.roofInsetFactor,center[1]+(p[1]-center[1])*a.roofInsetFactor]);
  for(const e of edges){
    const p=roofPolygon[e.i],q=roofPolygon[(e.i+1)%polygon.length],length=Math.hypot(q[0]-p[0],q[1]-p[1]);
    const re={...e,p,q,length};face('panel',re,facadeTop,top-.12,.03);
    const count=Math.max(2,Math.floor(length/(samil?.43:1.25)));
    for(let j=0;j<count;j++){along('frame',re,(j+.5)*length/count,(facadeTop+top)/2,samil?.065:.12,a.roofHeight-.25,samil?.12:.10,.08);roofLouvers++}
  }
  cap('panel',roofPolygon,top);
  let triangles=0;
  for(const [key,parts] of geometries){
    if(!parts.length){mats[key].dispose();continue}
    const merged=mergeGeometries(parts,false);for(const g of parts)g.dispose();if(!merged)throw Error('landmark geometry merge failed: '+key);
    merged.computeBoundingBox();merged.computeBoundingSphere();const object=new THREE.Mesh(merged,mats[key]);object.name=contract.key+'-'+key;object.userData.building=building;object.userData.landmark23=contract.key;
    object.castShadow=key!=='lobby';object.receiveShadow=true;root.add(object);triangles+=merged.attributes.position.count/3;
  }
  root.updateMatrixWorld(true);const actualBounds=new THREE.Box3().setFromObject(root);
  root.userData.landmarkDiagnostics={id:building.id,name:building.name,contract,sourceHeightM:building.height,sourceLevelsTag:building.levels_tag,footprint:building.points,baseY:base,topY:top,facadeTopY:facadeTop,
    actualBounds:{min:actualBounds.min.toArray(),max:actualBounds.max.toArray()},
    orientation:'world X east / Y up / Z south; Samil core uses north edge indices 0,1,7 from unchanged footprint',meshCount:root.children.length,triangles,verticalRibs,horizontalBands,lobbyColumns,roofLouvers,
    originalPhotoPixelsUsed:false,sourceFootprintChanged:false,sourceHeightChanged:false,modelMeasured:false};
  return root;
}

export function landmarkPresets(){return {
  'samil-building':{position:[477,121,163],target:[391.6,56.3,18],fov:42,landmark:'samil',description:'삼일 전체 · 문헌 참고 / 외관 치수 추정'},
  'samil-facade':{position:[420,58,88],target:[391.6,51,35],fov:42,landmark:'samil',description:'삼일 입면 · I형 리브 / 반복수·단면 추정'},
  'samil-entry':{position:[394,10.5,95],target:[391.6,3.5,35],fov:42,landmark:'samil',description:'삼일 저층부 · 두 층 유리 로비·큰 기둥 / 치수·지면 추정'},
  'samil-core':{position:[354,112,-89],target:[389.5,75,5],fov:42,landmark:'samil',description:'삼일 북측 · 금속 코어와 물린 루버 / 세부치수 추정'},
  'sk-building':{position:[-112,158,77],target:[-209,80,-108],fov:42,landmark:'sk',description:'SK서린 전체 · 문헌 참고 / 외관 치수 추정'},
  'sk-facade':{position:[-148,56,-14],target:[-209,52,-87],fov:42,landmark:'sk',description:'SK서린 입면 · 금속 격자·필로티 / 반복수·단면 추정'},
  'sk-entry':{position:[-200,13,-10],target:[-209,3.5,-87],fov:42,landmark:'sk',description:'SK서린 저층부 · 후퇴 유리 로비·필로티 / 치수·지면 추정'},
}}
