import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createStairLayout} from './field-details-v27.js';

// Authored exterior details from user photographs. These never enter the
// rainfall, risk, route, collision, gate-control or live alert data contracts.
export const FIXTURE_EVIDENCE={
  302087643:{number:5,photoIDs:['P053','P054','P055','P056'],primary:'P054',features:['open metal gate','hinges and controller casing','red lamp exterior','EXIT / PUSH / 미세요']},
  302093056:{number:7,photoIDs:['P094','P095','P096','P097','P098'],primary:'P094',features:['white warning riser strips with blue edges','alternating Korean / English wording']}
};
export const FIXTURE_WORDING={ko:'비가 내리면 산책로가 침수되어 출입을 통제합니다',en:'When it rains heavily, the path will be closed',gate:['비상대피','EXIT','PUSH','미세요']};
const EPS=1e-8;

function makeAtlas(canvasFactory){
  const canvas=canvasFactory?canvasFactory(1024,512):globalThis.document?.createElement('canvas');
  if(!canvas?.getContext)throw Error('Exit fixture canvas unavailable');
  canvas.width=1024;canvas.height=512;const c=canvas.getContext('2d');if(!c)throw Error('Exit fixture canvas context unavailable');
  c.fillStyle='#f1f0e6';c.fillRect(0,0,1024,512);
  // Rewritten text and geometric icon, not a sampled photograph or bitmap.
  c.fillStyle='#d9bc3f';c.fillRect(0,0,512,256);c.fillStyle='#eeeede';c.fillRect(10,12,492,232);
  c.fillStyle='#183e36';c.textAlign='left';c.textBaseline='middle';c.font='bold 43px "Malgun Gothic",sans-serif';c.fillText('비상대피',26,73,230);c.font='bold 55px Arial,sans-serif';c.fillText('EXIT',26,139,210);
  c.fillStyle='#4f7d59';c.fillRect(270,36,6,163);c.fillRect(270,36,74,6);c.fillRect(270,193,74,6);
  c.beginPath();c.arc(323,69,13,0,Math.PI*2);c.fill();c.lineWidth=13;c.lineCap='round';c.strokeStyle='#4f7d59';c.beginPath();c.moveTo(319,91);c.lineTo(306,126);c.lineTo(329,159);c.moveTo(308,122);c.lineTo(281,144);c.moveTo(315,103);c.lineTo(345,117);c.stroke();
  c.beginPath();c.moveTo(348,76);c.lineTo(374,76);c.lineTo(374,64);c.lineTo(397,88);c.lineTo(374,112);c.lineTo(374,100);c.lineTo(348,100);c.closePath();c.fill();
  c.textAlign='center';c.fillStyle='#263d31';c.font='bold 35px Arial,sans-serif';c.fillText('PUSH',431,143,130);c.font='bold 26px "Malgun Gothic",sans-serif';c.fillText('미세요',431,184,132);
  for(const [row,text] of [[256,FIXTURE_WORDING.ko],[384,FIXTURE_WORDING.en]]){
    c.fillStyle='#517b9b';c.fillRect(0,row,1024,128);c.fillStyle='#f6f6ee';c.fillRect(3,row+5,1018,118);
    c.strokeStyle='#273c43';c.lineWidth=4;c.beginPath();c.moveTo(30,row+99);c.lineTo(63,row+24);c.lineTo(96,row+99);c.closePath();c.stroke();c.fillStyle='#273c43';c.font='bold 48px Arial,sans-serif';c.fillText('!',63,row+72);
    c.textAlign='left';c.font=text===FIXTURE_WORDING.ko?'bold 36px "Malgun Gothic",sans-serif':'bold 41px Arial,sans-serif';c.fillText(text,112,row+66,884);c.textAlign='center';
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=4;texture.userData={authoredTextAndShapes:true,photoPixelsUsed:false,source27FixtureAtlas:true};
  return texture;
}

export function buildExitFixtures({data,groups,visual,waterUniform,canvasFactory}={}){
  if(!Array.isArray(data?.stairs)||!Array.isArray(data?.walks)||!groups?.stairs?.isObject3D)throw Error('Exit fixtures require scene stairs/walks and stairs group');
  const entries=data.stairs.filter(s=>FIXTURE_EVIDENCE[s.id]);
  if(new Set(entries.map(s=>s.id)).size!==entries.length)throw Error('Duplicate fixture stair ID');
  const atlas=entries.length?makeAtlas(canvasFactory):null;
  const materials={metal:new THREE.MeshStandardMaterial({color:'#b4bcb9',metalness:.76,roughness:.34}),dark:new THREE.MeshStandardMaterial({color:'#3d4949',metalness:.62,roughness:.47}),red:new THREE.MeshStandardMaterial({color:'#a52931',emissive:'#651016',emissiveIntensity:.12,metalness:.15,roughness:.31}),atlas:new THREE.MeshStandardMaterial({color:'#ffffff',map:atlas,roughness:.81,metalness:0,side:THREE.FrontSide})};
  const root=new THREE.Group();root.name='photo-exit-fixtures-source27';root.userData.fieldPhotoDetail=true;const buckets=new Map(),piecesByFixture=[],gatePositions=[];let pieces=0,warningPanels=0;
  const dummy=new THREE.Object3D();
  function add(g,key){if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(g);pieces++;}
  function box(w,h,d,p,key,yaw=0){dummy.position.fromArray(p);dummy.rotation.set(0,yaw,0);dummy.scale.set(1,1,1);dummy.updateMatrix();const g=new THREE.BoxGeometry(w,h,d);g.applyMatrix4(dummy.matrix);add(g,key)}
  function bar(a,b,r,key='metal'){const pa=new THREE.Vector3(...a),pb=new THREE.Vector3(...b),delta=pb.clone().sub(pa),len=delta.length();if(len<EPS)throw Error('Zero length fixture bar');dummy.position.copy(pa).add(pb).multiplyScalar(.5);dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());dummy.scale.set(1,1,1);dummy.updateMatrix();const g=new THREE.CylinderGeometry(r,r,len,8,1);g.applyMatrix4(dummy.matrix);add(g,key)}
  function panel(w,h,center,xAxis,yAxis,region){const normal=new THREE.Vector3().crossVectors(new THREE.Vector3(...xAxis),new THREE.Vector3(...yAxis));const matrix=new THREE.Matrix4().makeBasis(new THREE.Vector3(...xAxis),new THREE.Vector3(...yAxis),normal);matrix.setPosition(...center);const g=new THREE.PlaneGeometry(w,h);const uv=g.attributes.uv;for(let i=0;i<uv.count;i++){const x=uv.getX(i),y=uv.getY(i);uv.setXY(i,(region[0]+1+x*(region[2]-2))/1024,1-(region[1]+1+(1-y)*(region[3]-2))/512)}g.applyMatrix4(matrix);add(g,'atlas');}
  for(const stair of entries){
    const beforePieces=pieces,evidence=FIXTURE_EVIDENCE[stair.id],l=createStairLayout(stair,data.walks),top=l.at(l.total),u=top.direction,n=[-u[1],u[0]],width=l.widthM||2.7,yaw=Math.atan2(u[0],u[1]);
    // local side/along/up coordinates, high endpoint is the unmodified origin.
    const local=(side,along,y)=>[top.point[0]+n[0]*side+u[0]*along,y,top.point[2]+n[1]*side+u[1]*along];
    if(evidence.number===5){
      const side=width/2-.18,along=-.10,gateLength=1.02,origin=local(side,along,0),gatePoint=(s,y)=>local(side,along-s,y);
      // The leaf lies parallel to the right hand rail. Its closed pose across
      // the stair is deliberately never constructed, animated or calculated.
      box(.15,1.43,.15,local(side,along,.715),'metal',yaw);box(.34,.035,.34,local(side,along,.018),'metal',yaw);
      for(const bx of [-.115,.115])for(const bz of [-.115,.115])box(.03,.025,.03,local(side+bx,along+bz,.048),'dark',yaw);
      box(.31,.35,.24,local(side,along,1.50),'metal',yaw);box(.27,.008,.20,local(side,along+.123,1.5),'dark',yaw);
      // Non flashing fixed red material only: zero actual Three.js lights.
      const lamp=new THREE.CylinderGeometry(.084,.088,.11,12,1);lamp.translate(...local(side,along,1.73));add(lamp,'red');
      for(const y of [.45,1.25]){box(.13,.10,.13,local(side,along-.025,y),'dark',yaw);bar(local(side,along-.025,y-.08),local(side,along-.025,y+.08),.036)}
      const r=.13,bottom=.25,upper=1.38;
      // Rounded frame corners use short straight chords, merged by material.
      const outline=[];for(const [cx,cy,start] of [[r,bottom+r,Math.PI],[gateLength-r,bottom+r,Math.PI*1.5],[gateLength-r,upper-r,0],[r,upper-r,Math.PI*.5]])for(let i=0;i<=5;i++){const a=start+i*Math.PI/10;outline.push([cx+r*Math.cos(a),cy+r*Math.sin(a)])}
      for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length];bar(gatePoint(a[0],a[1]),gatePoint(b[0],b[1]),.032)}
      for(const h of [.49,1.12])bar(gatePoint(.07,h),gatePoint(gateLength-.06,h),.022);
      const center=gatePoint(gateLength/2,.82),axis=[-u[0],0,-u[1]],normal=[n[0],0,n[1]];
      // The photographed front is printed once. A closed, blank metal plate
      // covers its reverse so backside cameras never see mirrored EXIT text.
      const textCenter=[center[0]+normal[0]*.038,center[1],center[2]+normal[2]*.038],front=[-normal[0],0,-normal[2]];
      panel(.84,.47,textCenter,axis,[0,1,0],[0,0,512,256]);
      const backingCenter=new THREE.Vector3(...textCenter).addScaledVector(new THREE.Vector3(...front),-.016),backingMatrix=new THREE.Matrix4().makeBasis(new THREE.Vector3(...axis),new THREE.Vector3(0,1,0),new THREE.Vector3(...front));backingMatrix.setPosition(backingCenter);const backing=new THREE.BoxGeometry(.84,.47,.024);backing.applyMatrix4(backingMatrix);add(backing,'metal');
      gatePositions.push({stairId:stair.id,number:5,origin,sideOffsetM:side,alongOffsetM:along,leafDirection:[-u[0],0,-u[1]],leafLengthM:gateLength,leafSideMinM:side-.17,clearCentralHalfWidthM:.95,pose:'open-static-parallel-to-stair',openAngleFromClosedDegrees:90,printedFrontNormal:front,printedSide:'single-front-only',reverseSide:'blank-metal-backing-not-photo-verified',placementAssumed:true,dimensionsAssumed:true,realControlConnected:false,animated:false,collisionConnected:false,lamp:{material:'fixed-red-exterior',flashing:false,actualLights:0,riskConnected:false}});
    }
    if(evidence.number===7){
      let i=0;for(const tread of l.treads){if(tread.flat)continue;const p=l.at(tread.start),dir=p.direction,normal=[-dir[1],dir[0]],height=Math.min(.112,Math.max(.055,(tread.y-p.point[1])*.7)),center=[p.point[0]-dir[0]*.030,tread.y-.074,p.point[2]-dir[1]*.030];
        panel(width*.79,height,center,[normal[0],0,normal[1]],[0,1,0],i++%2?[0,384,1024,128]:[0,256,1024,128]);warningPanels++;
      }
    }
    piecesByFixture.push({stairId:stair.id,number:evidence.number,photoIDs:evidence.photoIDs,primaryPhoto:evidence.primary,createdPieces:pieces-beforePieces,low:[...l.low],high:[...l.high],lowY:l.yAt(0),highY:l.yAt(l.total),widthM:width,placement:'assumed relative to unchanged mapped stair endpoint',exteriorOnly:true});
  }
  const metrics=[];
  for(const [key,list] of buckets){const merged=mergeGeometries(list,false);if(!merged)throw Error('Fixture geometry merge failed '+key);merged.computeBoundingBox();merged.computeBoundingSphere();const mesh=new THREE.Mesh(merged,materials[key]);mesh.name='exit-fixture-'+key;mesh.castShadow=key!=='atlas';mesh.receiveShadow=true;mesh.userData.fieldPhotoDetail=true;root.add(mesh);metrics.push({material:key,inputPieces:list.length,vertices:merged.attributes.position.count,triangles:merged.index.count/3});for(const g of list)g.dispose();}
  groups.stairs.add(root);
  const diagnostics={version:'source27',scope:'photo-informed static exterior only',photoPixelsUsed:false,pointCloudOrPhotogrammetry:false,measuredDimensions:false,routeGraphChanged:false,waterChanged:false,liveControlConnected:false,riskSignalConnected:false,newGraphConnections:0,actualLights:0,animated:false,atlasCount:atlas?1:0,atlasSize:atlas?[1024,512]:null,atlasSource:'authored canvas text and geometric icons only',observedWording:FIXTURE_WORDING,uiNotice:'사진 속 정적 표식 · 현재 통제/경보 상태 아님',fixtures:piecesByFixture,gates:gatePositions,warningPanels,geometry:{inputPieces:pieces,batches:metrics.length,metrics},originalMaterialsMutated:false,usesWaterUniform:false};
  root.userData.exitFixturesDiagnostics=diagnostics;return diagnostics;
}
