import * as THREE from 'three';
import {worldSurface,rng} from './graphics-v21.js';

// Photo-referenced appearance only. These constants are authored optical choices,
// not surveyed bed levels, measured turbidity, discharge, depth or flow velocity.
export const WATER_DETAIL_POLICY=Object.freeze({version:'2.7-source28',seed:281105,photoIDs:['P007','P010','P070','P086','P088'],sourcePixelsUsed:false,measured:false,bedY:-5.0,initialWaterY:-4.2,bedTileM:1.65,bedResolution:[128,128],flowResolution:[128,64],mapBudgetBytes:131072,geometryAdded:0,waterLevelOrGraphChanged:false,reflection:'existing environment lighting only; no scene reflection or SSR',flow:'centerline tangent/order for artistic ripple orientation; no hydraulic speed'});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function mipBytes(width,height){let sum=0;for(;;){sum+=width*height*4;if(width===1&&height===1)return sum;width=Math.max(1,width>>1);height=Math.max(1,height>>1)}}
function dataTexture(bytes,w,h,{srgb=false,repeat=false}={}){const t=new THREE.DataTexture(bytes,w,h,THREE.RGBAFormat);t.wrapS=t.wrapT=repeat?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;if(srgb)t.colorSpace=THREE.SRGBColorSpace;return t}
export function makeBedTexture(){
  const size=128,bytes=new Uint8Array(size*size*4),random=rng(WATER_DETAIL_POLICY.seed),cells=8,centers=[];
  for(let z=0;z<cells;z++)for(let x=0;x<cells;x++)centers.push({x:x+.18+random()*.64,z:z+.18+random()*.64,tone:random(),aspect:.75+random()*.45});
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const px=x/size*cells,pz=y/size*cells,cx=Math.floor(px),cz=Math.floor(pz);let a=1e3,b=1e3,stone=null;
    for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){
      const ix=(cx+i+cells)%cells,iz=(cz+j+cells)%cells,c=centers[iz*cells+ix],dx=px-(c.x+(cx+i-ix)),dz=pz-(c.z+(cz+j-iz)),d=Math.hypot(dx*c.aspect,dz/c.aspect);
      if(d<a){b=a;a=d;stone=c}else if(d<b)b=d;
    }
    const seam=clamp((b-a)*7.0,0,1),grain=(random()-.5)*13,tone=stone.tone;
    const shade=.55+.45*seam,base=89+tone*49+grain,height=clamp(92+100*seam-a*40,35,205),offset=(y*size+x)*4;
    bytes.set([clamp((base+10)*shade,0,255),clamp((base+7)*shade,0,255),clamp((base-5)*shade,0,255),height],offset);
  }
  const map=dataTexture(bytes,size,size,{srgb:true,repeat:true});map.userData.graphicsPacked=true;map.userData.channels='RGB authored pebble colour / alpha authored relief; not a measured bathymetry map';return map;
}
function segments(line){
  if(!Array.isArray(line)||line.length<2||line.some(p=>!Array.isArray(p)||p.length<2||!p.slice(0,2).every(Number.isFinite)))throw new Error('Photo water requires a finite centerline');
  let total=0;const result=[];for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length>1e-8){result.push({a,b,dx,dz,length,along:total});total+=length}}
  if(!result.length)throw new Error('Photo water centerline has zero length');return {items:result,total};
}
export function flowAt(point,line){return nearestFlow(point,segments(line))}
function nearestFlow(point,source){let nearest=null;for(const s of source.items){const t=clamp(((point[0]-s.a[0])*s.dx+(point[1]-s.a[1])*s.dz)/(s.length*s.length),0,1),distance=Math.hypot(point[0]-s.a[0]-s.dx*t,point[1]-s.a[1]-s.dz*t);if(!nearest||distance<nearest.distance)nearest={tangent:[s.dx/s.length,s.dz/s.length],distance,along:s.along+t*s.length,total:source.total}}return nearest}
export function makeFlowTexture(data){
  const source=segments(data.centerline),ring=data.river_polygon;if(!Array.isArray(ring)||ring.length<3||ring.some(p=>!p?.slice(0,2).every(Number.isFinite)))throw new Error('Photo water requires a finite polygon');
  const min=[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1]))],range=[Math.max(...ring.map(p=>p[0]))-min[0],Math.max(...ring.map(p=>p[1]))-min[1]];if(range.some(n=>!(n>1e-6)))throw new Error('Photo water polygon has no area bounds');
  const w=128,h=64,bytes=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const f=nearestFlow([min[0]+x/(w-1)*range[0],min[1]+y/(h-1)*range[1]],source),along=Math.round(clamp(f.along/source.total,0,1)*65535);bytes.set([Math.round((f.tangent[0]*.5+.5)*255),Math.round((f.tangent[1]*.5+.5)*255),along>>8,along&255],(y*w+x)*4)}
  return {map:dataTexture(bytes,w,h),min,range,length:source.total,segmentCount:source.items.length};
}
export function opticalState(waterY,evening=false){const y=Number.isFinite(waterY)?waterY:WATER_DETAIL_POLICY.initialWaterY,depth=Math.max(0,y-WATER_DETAIL_POLICY.bedY);return {assumedOpticalDepthM:depth,alpha:clamp(.28+.56*(1-Math.exp(-depth*.38)),.28,.84),absorption:1-Math.exp(-depth*.28),light:evening?.65:1}}
function replaceOnce(text,anchor,replacement){if(text.split(anchor).length!==2)throw new Error('Photo water shader anchor missing or duplicated: '+anchor.slice(0,55));return text.replace(anchor,replacement)}
export function createPhotoWater({data,waterUniform,baseWater}){
  if(!baseWater?.material?.isMeshStandardMaterial||!baseWater.edge?.map||typeof baseWater.tick!=='function')throw new Error('Photo water requires the existing v21 base water instance');
  const flow=makeFlowTexture(data),bedMap=makeBedTexture(),material=baseWater.material.clone(),bedMaterial=worldSurface(new THREE.MeshStandardMaterial({color:'#d8d8ca',map:bedMap,bumpMap:bedMap,bumpScale:.023,roughness:.98,envMapIntensity:.35}),{tile:[1.65,1.65],waterUniform,wet:false});
  const previousHook=baseWater.material.onBeforeCompile,previousKey=baseWater.material.customProgramCacheKey.bind(baseWater.material),state={time:0,evening:false,optics:opticalState(waterUniform?.value)};
  const uDepth={value:state.optics.assumedOpticalDepthM};material.transparent=true;material.depthWrite=false;material.roughness=.19;material.metalness=.025;material.opacity=state.optics.alpha;material.color.set('#73958a');
  material.userData.photoWater28={...WATER_DETAIL_POLICY,sharesExistingBankTexture:true,assumedOpticalDepthM:state.optics.assumedOpticalDepthM};
  material.onBeforeCompile=(shader,renderer)=>{
    previousHook.call(material,shader,renderer);
    Object.assign(shader.uniforms,{photoFlow28:{value:flow.map},photoOpticalDepth28:uDepth});
    shader.fragmentShader='uniform sampler2D photoFlow28; uniform float photoOpticalDepth28;\n'+shader.fragmentShader;
    const oldStart='vec2 wp=vGraphicWorld.xz; float tm=graphicTime; float edgeD=graphicEdgeDistance;',oldEnd='normal=normalize(mat3(viewMatrix)*vec3(-slope.x,1.0,-slope.y));';
    const begin=shader.fragmentShader.indexOf(oldStart),end=shader.fragmentShader.indexOf(oldEnd,begin);if(begin<0||end<0)throw new Error('Photo water inherited ripple block not found');
    const ripple=`vec2 wp=vGraphicWorld.xz; float tm=graphicTime; float edgeD=graphicEdgeDistance;
vec4 photoFlowSample=texture2D(photoFlow28,clamp((wp-vec2(${flow.min.join(',')}))/vec2(${flow.range.join(',')}),0.0,1.0));
vec2 photoTangent=photoFlowSample.rg*2.0-1.0; photoTangent/=max(length(photoTangent),0.001); vec2 photoAcross=vec2(-photoTangent.y,photoTangent.x);
float photoAlong=dot(photoFlowSample.ba,vec2(65280.0,255.0))/65535.0*${flow.length.toFixed(6)};
float photoCross=dot(wp,photoAcross);
float photoPhaseA=photoAlong*5.7+sin(photoCross*2.1)*.62-tm*1.05;
float photoPhaseB=photoAlong*14.6-photoCross*3.3-tm*1.84;
float photoPhaseC=photoAlong*2.2+photoCross*5.1-tm*.47;
vec2 slope=photoTangent*(cos(photoPhaseA)*.042+cos(photoPhaseB)*.021)+photoAcross*(cos(photoPhaseC)*.025+sin(photoPhaseB)*.014);
slope*=mix(.40,1.0,smoothstep(.05,1.5,edgeD));
normal=normalize(mat3(viewMatrix)*vec3(-slope.x,1.0,-slope.y));`;
    shader.fragmentShader=shader.fragmentShader.slice(0,begin)+ripple+shader.fragmentShader.slice(end+oldEnd.length);
    shader.fragmentShader=replaceOnce(shader.fragmentShader,'#include <color_fragment>',`#include <color_fragment>
float photoAbsorption=1.0-exp(-max(0.0,photoOpticalDepth28)*.28);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.105,.205,.177),photoAbsorption*.58);`);
    // Narrow highlights come from small normal changes and the existing PBR sun /
    // environment. No additive white painted foam or reflected scene pixels.
    shader.fragmentShader=replaceOnce(shader.fragmentShader,'#include <opaque_fragment>',`diffuseColor.a=clamp(diffuseColor.a+grazing*.24,.0,.94);
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=>previousKey()+':photo28-centerline-translucent-optical-v1';material.needsUpdate=true;
  const tick=(seconds,evening=false)=>{const t=Number.isFinite(seconds)?seconds:state.time;baseWater.tick(t,!!evening);state.time=t;state.evening=!!evening;state.optics=opticalState(waterUniform?.value,!!evening);uDepth.value=state.optics.assumedOpticalDepthM;material.opacity=state.optics.alpha;material.color.set(evening?'#526c68':'#73958a');material.envMapIntensity=evening?.68:1.05;material.userData.photoWater28.assumedOpticalDepthM=uDepth.value};
  return {material,bedMaterial,tick,memoryBytes:mipBytes(128,128)+mipBytes(128,64),get diagnostics(){return {mode:'photo-referenced-water-28',policy:WATER_DETAIL_POLICY,newMapGpuBytesIncludingMipmaps:mipBytes(128,128)+mipBytes(128,64),newTextures:2,newMeshes:0,sharesExistingBankTexture:true,riverSegments:flow.segmentCount,centerlineLengthM:flow.length,waterTimeSeconds:state.time,evening:state.evening,optics:state.optics,alpha:material.opacity,depthWrite:material.depthWrite,bedY:-5.0,bedGeometryChanged:false,sourcePixelsUsed:false}}};
}
