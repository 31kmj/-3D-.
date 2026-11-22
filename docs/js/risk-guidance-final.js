import * as THREE from 'three';
import {clipRouteSegment} from './route-guidance-final.js?rev=route-visible-20261122';
import {displayRiskColor} from './display-palette-final.js?rev=submission2-20261121';

// A screen-width key for the existing walkway-edge hazard results. These bands
// are display emphasis, not additional flooded land or a change to road width.
export function createRiskGuidance(stage,graph){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
 svg.classList.add('risk-guidance');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
 const path=(color,width)=>{const el=document.createElementNS(ns,'path');for(const [key,value]of Object.entries({fill:'none',stroke:color,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'non-scaling-stroke'}))el.setAttribute(key,String(value));svg.append(el);return el};
 const halo=path('#f6fffd',8),codes=['dry','wet','deep','unknown','closed'],paths=new Map(codes.map(code=>[code,path(displayRiskColor(code),6)]));stage.append(svg);
 const nodes=new Map(graph.nodes.map(node=>[node.id,node])),edges=graph.edges.filter(edge=>edge.kind==='walk').map(edge=>({id:edge.id,ends:[edge.a,edge.b].map(id=>{const p=nodes.get(id).point;return new THREE.Vector3(p[0],-2.91,p[1])})}));
 const viewProjection=new THREE.Matrix4(),vector=new THREE.Vector4(),lastMatrices=new Float64Array(32);
 let results={},visible=true,dirty=true,lastWidth=0,lastHeight=0;
 const state={visible:false,segments:0,corePx:6,haloPx:8,opacity:0,counts:{},source:'same-walkway-edge-hazard-code',widthMeaning:'screen-emphasis-not-flood-extent'};
 function publish(){svg.dataset.visible=String(state.visible);svg.dataset.segments=String(state.segments);svg.dataset.corePx=String(state.corePx);svg.dataset.haloPx=String(state.haloPx);svg.dataset.opacity=String(state.opacity);svg.dataset.counts=JSON.stringify(state.counts);stage.dataset.riskGuideVisible=String(state.visible)}
 function hide(){svg.style.display='none';state.visible=false;state.segments=0;state.opacity=0;publish()}
 function setHazards(values){
  results=values;dirty=true;state.counts={};
  for(const edge of edges){const code=codes.includes(results[edge.id])?results[edge.id]:'unknown';state.counts[code]=(state.counts[code]||0)+1}
  // Clear synchronously, including when live rainfall becomes unavailable.
  halo.setAttribute('d','');for(const el of paths.values())el.setAttribute('d','');hide();
 }
 function setVisible(value){if(visible===value)return;visible=value;dirty=true;if(!visible)hide()}
 function frame(camera){
  if(!visible)return;
  const width=stage.clientWidth,height=stage.clientHeight;if(width<1||height<1){hide();return}
  camera.updateMatrixWorld();
  const matrices=[camera.matrixWorld.elements,camera.projectionMatrix.elements];let changed=dirty||width!==lastWidth||height!==lastHeight;
  for(let m=0;m<2;m++)for(let i=0;i<16;i++)if(lastMatrices[m*16+i]!==matrices[m][i]){changed=true;lastMatrices[m*16+i]=matrices[m][i]}
  if(!changed)return;dirty=false;lastWidth=width;lastHeight=height;svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  const clip=p=>vector.set(p.x,p.y,p.z,1).applyMatrix4(viewProjection).toArray(),screen=p=>[(p[0]/p[3]+1)*width/2,(1-p[1]/p[3])*height/2];
  let nearest=Infinity;for(const edge of edges)for(const p of edge.ends){const depth=-vector.set(p.x,p.y,p.z,1).applyMatrix4(camera.matrixWorldInverse).z;if(depth>0)nearest=Math.min(nearest,depth)}
  const metresPerPixel=Number.isFinite(nearest)?2*nearest/(camera.projectionMatrix.elements[5]*height):0,t=THREE.MathUtils.clamp((metresPerPixel-.18)/.37,0,1),opacity=t*t*(3-2*t)*.78;
  if(opacity<.01){hide();return}
  const ds=Object.fromEntries(codes.map(code=>[code,'']));let all='',segments=0;
  for(const edge of edges){
   const segment=clipRouteSegment(...edge.ends.map(clip),20/width,20/height);if(!segment)continue;
   const [a,b]=segment.map(screen);if(Math.hypot(b[0]-a[0],b[1]-a[1])<.1)continue;
   const d=`M${a[0].toFixed(2)},${a[1].toFixed(2)}L${b[0].toFixed(2)},${b[1].toFixed(2)}`,code=codes.includes(results[edge.id])?results[edge.id]:'unknown';ds[code]+=d;all+=d;segments++;
  }
  if(!segments){hide();return}
  // Dry is painted first, then caution/danger, so a green neighbouring band
  // cannot cover a red band when the two banks are close on screen.
  halo.setAttribute('d',all);for(const [code,el]of paths)el.setAttribute('d',ds[code]);
  svg.style.display='block';svg.style.opacity=opacity.toFixed(3);Object.assign(state,{visible:true,segments,opacity:+opacity.toFixed(3)});publish();
 }
 hide();return{setHazards,setVisible,frame,get state(){return{...state,counts:{...state.counts}}}};
}
