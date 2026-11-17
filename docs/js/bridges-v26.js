import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {worldSurface} from './graphics-v21.js';
import {buildEvidenceBridge as buildPreviousBridge} from './bridges-v21.js';

// Original geometry informed by the owner's 2026-10-28 field photos.
// No photo pixels, surveyed sections, new elevation datum or route edges are used.
const PHOTO_IDS={모전교:['P008','P014'],광통교:['P019','P020','P021'],광교:['P037','P040','P042','P043'],장통교:['P063','P064','P067','P069'],삼일교:['P079','P080','P081','P082','P094']};
function geometryMetrics(group,start=0){
  const result={meshes:0,triangles:0,finitePositions:true};
  for(const child of group.children.slice(start))child.traverse(o=>{if(!o.isMesh)return;result.meshes++;const g=o.geometry,p=g.getAttribute('position');result.triangles+=(g.index?.count??p.count)/3;for(const v of p.array)if(!Number.isFinite(v))result.finitePositions=false});
  return result;
}

export function buildEvidenceBridge(bridge,group,visual,buildStoneBridge,{waterUniform={value:-4.2}}={}){
  if(!['광교','장통교','삼일교'].includes(bridge.name)){
    const before=group.children.length,old=buildPreviousBridge(bridge,group,visual,buildStoneBridge,{waterUniform});
    return {...old,photoIDs:PHOTO_IDS[bridge.name]??[],photoRevision:'inherited geometry; field comparison recorded, not newly rebuilt',sourcePixelsUsed:false,fieldMetricSurvey:false,photoGeometryMetrics:geometryMetrics(group,before)};
  }
  const width=bridge.official_width_m,span=bridge.render_length_m;
  if(!Number.isFinite(width)||!Number.isFinite(span)||width<=2||span<=2)throw new Error('Invalid bridge dimensions');
  const buckets=new Map(),mergeChecks=[],memberCounts={},dimensions=[];
  const stone=worldSurface(visual.wall.clone(),{tile:[2.4,1.2],waterUniform,wet:true});stone.color.set('#d8d6cf');
  const concrete=worldSurface(new THREE.MeshStandardMaterial({color:'#b7b5ad',roughness:.88}),{tile:[2.4,1.2],waterUniform,wet:true});
  const metal=worldSurface(new THREE.MeshStandardMaterial({color:'#8e9698',metalness:.74,roughness:.31,envMapIntensity:.8}),{metal:true});
  const orange=worldSurface(new THREE.MeshStandardMaterial({color:'#ba673e',metalness:.50,roughness:.49}),{metal:true});
  const dark=worldSurface(new THREE.MeshStandardMaterial({color:'#596263',metalness:.6,roughness:.47}),{metal:true});
  const teal=worldSurface(new THREE.MeshStandardMaterial({color:'#73bdb4',metalness:.18,roughness:.37,transparent:true,opacity:.57,side:THREE.DoubleSide,depthWrite:false}),{metal:true});
  const light=new THREE.MeshStandardMaterial({color:'#d9e9ed',emissive:'#c5e7f3',emissiveIntensity:.8,roughness:.38});
  const count=tag=>memberCounts[tag]=(memberCounts[tag]??0)+1;
  function stash(g,mat,tag){if(g.index){const expanded=g.toNonIndexed();g.dispose();g=expanded}if(!g.getAttribute('normal'))g.computeVertexNormals();if(!g.getAttribute('uv'))g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));if(!buckets.has(mat))buckets.set(mat,[]);buckets.get(mat).push(g);count(tag)}
  function box(w,h,d,x,y,z,mat=stone,tag='block'){
    if(![w,h,d,x,y,z].every(Number.isFinite)||Math.min(w,h,d)<=0)throw new Error('Invalid bridge member');
    dimensions.push([w,h,d]);const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);stash(g,mat,tag);
  }
  function tube(points,r,mat=metal,tag='tube',sides=8){
    if(!(r>0)||points.length<2)throw new Error('Invalid tube');
    const curve=points.length===2?new THREE.LineCurve3(new THREE.Vector3(...points[0]),new THREE.Vector3(...points[1])):new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    stash(new THREE.TubeGeometry(curve,points.length===2?1:24,r,sides,false),mat,tag);
  }
  function column(r,h,x,y,z,mat=concrete,tag='column'){const g=new THREE.CylinderGeometry(r,r,h,16);g.translate(x,y,z);stash(g,mat,tag)}
  box(width,.55,span,0,-.48,0,concrete,'deck');
  let form,features;
  if(bridge.name==='장통교'){
    form='stone trapezoidal apertures, layered rails and rounded caps';
    features={aperture:'trapezoid; short top / wider bottom',greenTopRail:false,roundedCaps:true,railBaysPerSide:9,pierRows:2,pierColumnsPerRow:3};
    for(const z of [-span/6,span/6]){
      box(width*.72,.38,1.0,0,-.90,z,concrete,'pier-cap');
      for(const x of [-width*.28,0,width*.28])column(.38,2.935,x,-2.5575,z,concrete,'round-pier');
    }
    const bays=9,spacing=span/bays;
    for(const x of [-width/2+.25,width/2-.25]){
      box(.48,.16,span,x,.16,0,stone,'rail-base');
      box(.40,.12,span,x,.30,0,stone,'rail-bottom');
      const shape=new THREE.Shape();shape.moveTo(-span/2,.36);shape.lineTo(span/2,.36);shape.lineTo(span/2,1.0);shape.lineTo(-span/2,1.0);shape.closePath();
      for(let j=0;j<bays;j++){
        const mid=-span/2+(j+.5)*spacing,halfBottom=spacing*.37,halfTop=spacing*.20,hole=new THREE.Path();
        hole.moveTo(mid-halfBottom,.46);hole.lineTo(mid-halfTop,.87);hole.lineTo(mid+halfTop,.87);hole.lineTo(mid+halfBottom,.46);hole.closePath();shape.holes.push(hole);
      }
      const g=new THREE.ExtrudeGeometry(shape,{depth:.32,bevelEnabled:false,steps:1});g.rotateY(Math.PI/2);g.translate(x-.16,0,0);stash(g,stone,'trapezoid-rail');
      box(.44,.10,span,x,1.015,0,stone,'rail-top');
      for(let j=0;j<=bays;j++){
        const z=-span/2+j*spacing;box(.50,1.00,.50,x,.535,z,stone,'rail-post');box(.65,.15,.65,x,1.105,z,stone,'post-cap');
        const cap=new THREE.SphereGeometry(.145,12,6,0,Math.PI*2,0,Math.PI/2);cap.scale(1,.38,1);cap.translate(x,1.18,z);stash(cap,stone,'rounded-finial');
        box(.40,.50,.43,x,-.50,z,stone,'fascia-lug');
      }
      box(.22,.12,span,x,-.11,0,stone,'fascia-course');
    }
  }else if(bridge.name==='광교'){
    form='orange multigirder underside with cross frames, pipe rack and linear luminaire faces';
    features={girderCount:7,transverseFrames:9,pipes:5,emissiveLuminaireFaces:16,addedLights:0};
    for(let i=0;i<7;i++){
      const x=-width/2+.6+(width-1.2)*i/6;
      box(.16,.75,span,x,-1.05,0,orange,'girder-web');box(.56,.10,span,x,-1.45,0,orange,'girder-lower-flange');box(.56,.10,span,x,-.68,0,orange,'girder-upper-flange');
      for(let j=0;j<9;j++)box(.08,.68,.34,x,-1.06,-span/2+(j+.5)*span/9,orange,'girder-stiffener');
    }
    for(let j=0;j<9;j++)box(width-.9,.18,.13,0,-1.20,-span/2+(j+.5)*span/9,orange,'cross-frame');
    for(const z of [-span/6,span/6]){
      box(width*.72,.42,1.35,0,-1.55,z,concrete,'pier-cap');
      // Same old lowest Y (-4.365); photo-visible circular support family, not surveyed count.
      for(const x of [-width*.26,0,width*.26])column(.30,2.65,x,-3.04,z,concrete,'round-pier');
    }
    for(let j=0;j<5;j++){const x=-width/2+.95+j*.15;tube([[x,-1.10,-span/2],[x,-1.10,span/2]],.045,dark,'pipe')}
    for(let j=0;j<8;j++)for(const side of [-1,1]){
      const x=side*(width/2-1.7),z=-span/2+(j+.5)*span/8;
      box(.12,.09,1.4,x,-1.37,z,dark,'luminaire-housing');box(.075,.018,1.28,x,-1.422,z,light,'luminaire-face');
    }
    for(const x of [-width/2+.2,width/2-.2]){
      tube([[x,1.0,-span/2],[x,1.0,span/2]],.045,dark,'top-rail');tube([[x,.47,-span/2],[x,.47,span/2]],.033,dark,'mid-rail');
      for(let j=0;j<=Math.ceil(span/.3);j++){const z=-span/2+j*span/Math.ceil(span/.3);tube([[x,.05,z],[x,.99,z]],.018,dark,'picket',6)}
    }
  }else{
    form='curved teal lower infill with periodic curved ribs and continuous horizontal louvers';
    features={curvedScreen:true,flatFullHeightPanel:false,ribsPerSide:12,horizontalLouversPerSide:17,transparentLowerInfill:true,screenSideBatches:2};
    const curvePoint=(side,t,z)=>[side*(width/2-.25+.60*Math.sin(Math.PI*t)+.05*Math.sin(Math.PI*t/2)),.06+2.09*t,z];
    const segments=20;
    for(const side of [-1,1]){
      // Separate transparent side objects retain sorting granularity across the bridge.
      const screen=teal.clone();screen.onBeforeCompile=teal.onBeforeCompile;screen.customProgramCacheKey=teal.customProgramCacheKey;
      const positions=[],uv=[];
      for(let i=0;i<segments;i++){
        const a=.13+.50*i/segments,b=.13+.50*(i+1)/segments;
        for(const [t,z] of [[a,-span/2],[a,span/2],[b,span/2],[a,-span/2],[b,span/2],[b,-span/2]]){positions.push(...curvePoint(side,t,z));uv.push((z+span/2)/span,t)}
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();stash(g,screen,'curved-teal-infill');
      for(let j=0;j<12;j++){
        const z=-span/2+j*span/11,points=Array.from({length:25},(_,i)=>curvePoint(side,i/24,z));tube(points,.065,metal,'curved-rib');
        box(.22,.09,.26,side*(width/2-.25),.045,z,metal,'rib-shoe');
      }
      for(let i=0;i<17;i++){const p=curvePoint(side,i/16,0);box(.075,.045,span,p[0],p[1],0,metal,'horizontal-louver')}
      box(.16,.11,span,side*(width/2-.25),.005,0,dark,'screen-base');
    }
    for(let i=0;i<8;i++){
      const x=-width/2+.5+(width-1)*i/7;box(.15,.40,span,x,-.95,0,dark,'underside-girder');
    }
    for(let i=0;i<10;i++)box(width-.3,.17,.13,0,-1.17,-span/2+(i+.5)*span/10,dark,'underside-transverse');
  }
  const yaw=Math.atan2(bridge.points.at(-1)[0]-bridge.points[0][0],bridge.points.at(-1)[1]-bridge.points[0][1]);
  const matrix=new THREE.Matrix4().makeRotationY(yaw);matrix.setPosition(bridge.center[0],0,bridge.center[1]);
  const localBounds=new THREE.Box3(),worldBounds=new THREE.Box3();let triangles=0,meshCount=0,sourceGeometryCount=0;
  for(const [mat,geometries] of buckets){
    sourceGeometryCount+=geometries.length;
    for(const g of geometries){g.computeBoundingBox();localBounds.union(g.boundingBox);g.applyMatrix4(matrix)}
    const merged=mergeGeometries(geometries,false);if(!merged)throw new Error('Bridge material batch merge failed');
    let equal=true;
    for(const name of ['position','normal','uv']){const output=merged.getAttribute(name).array;let offset=0;for(const g of geometries){const a=g.getAttribute(name).array;for(let i=0;i<a.length;i++)if(output[offset+i]!==a[i])equal=false;offset+=a.length}if(offset!==output.length)equal=false}
    mergeChecks.push({sourceParts:geometries.length,attributesExactlyEqual:equal,attributes:['position','normal','uv'],transparent:mat.transparent});
    if(!equal)throw new Error('Bridge merged attributes differ');
    merged.computeBoundingBox();merged.computeBoundingSphere();worldBounds.union(merged.boundingBox);triangles+=merged.getAttribute('position').count/3;
    const mesh=new THREE.Mesh(merged,mat);mesh.castShadow=!mat.transparent;mesh.receiveShadow=true;if(mat.transparent)mesh.renderOrder=1;mesh.name=`photo-v26-${bridge.name}-${meshCount}`;group.add(mesh);meshCount++;
    for(const g of geometries)g.dispose();
  }
  const bounds=b=>({min:b.min.toArray(),max:b.max.toArray()});
  return {name:bridge.name,officialWidth:width,modeledSpan:span,center:[...bridge.center],yawRadians:yaw,lengthBasis:bridge.modeled_length_basis,mappedAxis:bridge.mapped_axis_length_m,form,features,memberCounts,photoIDs:PHOTO_IDS[bridge.name],reference:'owner field photos; captured 2026-10-28; intake 2026-11-03',visualRevision:'v26 authored photo-informed geometry',elevations:'inherited assumed datum',memberDimensions:'assumed proportions, no field measurement',countsSurveyed:false,fieldMetricSurvey:false,sourcePixelsUsed:false,assumedFields:['member sizes','spacing/counts','elevations','hidden faces','screen curvature','pier placement'],metrics:{meshes:meshCount,triangles,sourceParts:sourceGeometryCount,positiveMemberDimensions:dimensions.every(d=>d.every(v=>v>0&&Number.isFinite(v))),localBounds:bounds(localBounds),worldBounds:bounds(worldBounds),mergeChecks,addedLights:0}};
}
