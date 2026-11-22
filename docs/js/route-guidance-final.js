import * as THREE from 'three';

// Display-only projection of the calculated 3D path. It does not move a route,
// change its elevation, or imply that a building is traversable.
export function clipRouteSegment(a,b,padX=0,padY=0){
 if(![...a,...b].every(Number.isFinite))return null;
 let lo=0,hi=1;
 for(const plane of [[1,0,0,1+padX],[-1,0,0,1+padX],[0,1,0,1+padY],[0,-1,0,1+padY],[0,0,1,1],[0,0,-1,1]]){
  const da=plane.reduce((sum,n,i)=>sum+n*a[i],0),db=plane.reduce((sum,n,i)=>sum+n*b[i],0);
  if(da<0&&db<0)return null;
  if(da<0||db<0){const t=da/(da-db);if(da<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null}
 }
 const at=t=>a.map((n,i)=>n+(b[i]-n)*t),start=at(lo),end=at(hi);
 return start[3]>1e-8&&end[3]>1e-8?[start,end]:null;
}

export function createRouteGuidance(stage){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
 svg.classList.add('route-guidance');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
 const path=(color,width)=>{const el=document.createElementNS(ns,'path');for(const [key,value]of Object.entries({fill:'none',stroke:color,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'non-scaling-stroke'}))el.setAttribute(key,String(value));svg.append(el);return el};
 const halo=path('#f4fffc',7),line=path('#007f86',4),arrows=path('#f4fffc',2.5);
 arrows.setAttribute('fill','#075d66');arrows.setAttribute('paint-order','stroke fill');stage.append(svg);
 const viewProjection=new THREE.Matrix4(),vector=new THREE.Vector4(),lastMatrices=new Float64Array(32);
 let points=[],arrowAnchors=[],visible=true,dirty=true,lastWidth=0,lastHeight=0;
 const state={mode:'screen-pixel-route-guidance',visible:false,pointCount:0,segments:0,arrowCount:0,corePx:4,haloPx:7,opacity:0,elevationMeaning:'display-guide-not-physical-route-height'};
 const publish=()=>{svg.dataset.visible=String(state.visible);svg.dataset.arrowCount=String(state.arrowCount);svg.dataset.corePx=String(state.corePx);svg.dataset.haloPx=String(state.haloPx);svg.dataset.opacity=String(state.opacity);stage.dataset.routeGuideVisible=String(state.visible);stage.dataset.routeGuideArrowCount=String(state.arrowCount)};
 function hide(){svg.style.display='none';state.visible=false;state.arrowCount=0;state.segments=0;state.opacity=0;publish()}
 function setRoute(values){
  points=values.map(p=>new THREE.Vector3(...p));arrowAnchors=[];dirty=true;
  // Keep the original route's 15m arrow positions and forward direction. Only
  // their screen glyph changes; crowded glyphs are omitted after projection.
  let travelled=0,nextArrow=5;
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],length=a.distanceTo(b);if(length<.001)continue;
   const direction=b.clone().sub(a).normalize();
   while(nextArrow<travelled+length&&arrowAnchors.length<128){const point=a.clone().lerp(b,(nextArrow-travelled)/length);arrowAnchors.push({point,forward:point.clone().add(direction)});nextArrow+=15}
   travelled+=length;
  }
  state.pointCount=points.length;halo.setAttribute('d','');line.setAttribute('d','');arrows.setAttribute('d','');hide();
 }
 function setVisible(value){if(visible===value)return;visible=value;dirty=true;if(!visible)hide()}
 function frame(camera){
  if(!visible||points.length<2)return;
  const width=stage.clientWidth,height=stage.clientHeight;if(width<1||height<1){hide();return}
  camera.updateMatrixWorld();
  const matrices=[camera.matrixWorld.elements,camera.projectionMatrix.elements];let changed=dirty||width!==lastWidth||height!==lastHeight;
  for(let m=0;m<2;m++)for(let i=0;i<16;i++)if(lastMatrices[m*16+i]!==matrices[m][i]){changed=true;lastMatrices[m*16+i]=matrices[m][i]}
  if(!changed)return;dirty=false;lastWidth=width;lastHeight=height;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  const clip=point=>vector.set(point.x,point.y,point.z,1).applyMatrix4(viewProjection).toArray();
  const screen=p=>[(p[0]/p[3]+1)*width/2,(1-p[1]/p[3])*height/2];
  const projected=points.map(clip),depths=points.map(p=>-vector.set(p.x,p.y,p.z,1).applyMatrix4(camera.matrixWorldInverse).z).filter(d=>d>0);
  // The existing 0.6m flat ribbon is legible close up. Fade this screen guide
  // out there, retaining a fixed four-pixel line only in reduced map views.
  const metresPerPixel=depths.length?2*Math.min(...depths)/(camera.projectionMatrix.elements[5]*height):0;
  const t=THREE.MathUtils.clamp((metresPerPixel-.18)/.37,0,1),opacity=t*t*(3-2*t)*.96;
  if(opacity<.01){hide();return}
  let d='',segments=0;
  for(let i=1;i<projected.length;i++){
   const segment=clipRouteSegment(projected[i-1],projected[i],20/width,20/height);if(!segment)continue;
   const [a,b]=segment.map(screen);if(Math.hypot(b[0]-a[0],b[1]-a[1])<.1)continue;
   d+=`M${a[0].toFixed(2)},${a[1].toFixed(2)}L${b[0].toFixed(2)},${b[1].toFixed(2)}`;segments++;
  }
  if(!segments){hide();return}
  const glyphs=[],accepted=[];
  for(const anchor of arrowAnchors){
   const p=clip(anchor.point);if(p[3]<=1e-8||p[2]<-p[3]||p[2]>p[3])continue;
   const a=screen(p);if(a[0]<8||a[0]>width-8||a[1]<8||a[1]>height-8||accepted.some(q=>Math.hypot(q[0]-a[0],q[1]-a[1])<32))continue;
   const segment=clipRouteSegment(p,clip(anchor.forward));if(!segment)continue;
   const b=screen(segment[1]),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<.001)continue;
   const ux=dx/length,uy=dy/length,nx=-uy,ny=ux;
   const at=(along,across)=>`${(a[0]+ux*along+nx*across).toFixed(2)},${(a[1]+uy*along+ny*across).toFixed(2)}`;
   glyphs.push(`M${at(6,0)}L${at(-4.5,4.5)}L${at(-2,0)}L${at(-4.5,-4.5)}Z`);accepted.push(a);
  }
  halo.setAttribute('d',d);line.setAttribute('d',d);arrows.setAttribute('d',glyphs.join(''));
  svg.style.display='block';svg.style.opacity=opacity.toFixed(3);
  Object.assign(state,{visible:true,segments,arrowCount:glyphs.length,opacity:+opacity.toFixed(3)});publish();
 }
 hide();return{setRoute,setVisible,frame,get state(){return{...state}}};
}
