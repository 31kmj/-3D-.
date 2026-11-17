import * as THREE from 'three';

// Authored visual treatment only: metres are modeled world units, not surveyed
// stone sizes, water hydraulics, wet marks or the positions of individual plants.
export const GRAPHICS_POLICY={seed:211031,tileMeters:{stone:[2.4,1.2],paving:[2.4,2.4],road:[2,2],metal:[1,1]},mapBudgetBytes:4194304,environmentBatchBudget:8,reflection:'environment lighting / no scene reflection',placement:'procedural assumed / excluded from egress graph'};
export function rng(seed=GRAPHICS_POLICY.seed){return()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296)}
export function surfaceUV(point,normal,tile){const a=normal.map(Math.abs);return [(a[0]>a[1]&&a[0]>a[2]?point[2]:point[0])/tile[0],(a[1]>a[0]&&a[1]>a[2]?point[2]:point[1])/tile[1]]}
export function distanceToSegment(p,a,b){const x=b[0]-a[0],z=b[1]-a[1],t=THREE.MathUtils.clamp(((p[0]-a[0])*x+(p[1]-a[1])*z)/(x*x+z*z||1),0,1);return Math.hypot(p[0]-a[0]-x*t,p[1]-a[1]-z*t)}
export function walkClearance(p,walks){return Math.min(...walks.map(w=>Math.min(...w.points.slice(1).map((q,i)=>distanceToSegment(p,w.points[i],q)))-w.width/2))}
function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes}return yes}
function texture(bytes,width,height,srgb=false){const t=new THREE.DataTexture(bytes,width,height,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;if(srgb)t.colorSpace=THREE.SRGBColorSpace;return t}
export function proceduralSurface(kind,size=256){
  const random=rng(kind==='stone'?211:kind==='paving'?213:217),colour=new Uint8Array(size*size*4),height=new Uint8Array(size*size*4),rough=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,row=Math.floor(v*(kind==='stone'?3:6)),column=(u*(kind==='stone'?3:6)+(row%2)*.5)%1;
    const seam=kind!=='road'&&(column<.016||column>.984||(v*(kind==='stone'?3:6))%1<.035),grain=random(),block=Math.sin(Math.floor(u*6+row%2*.5)*19.3+row*71.7)*6;
    let base=kind==='stone'?181:kind==='paving'?164:73;
    let n=base+(grain-.5)*(kind==='road'?22:18)+block+(seam?-35:0)+Math.sin(u*25+v*13)*2;
    const c=kind==='paving'?[n+14,n,n-9]:kind==='road'?[n-3,n,n+1]:[n+3,n+2,n-2],i=(y*size+x)*4;
    const h=seam?28:158+grain*35;colour.set([...c,h],i);height.set([h,h,h,255],i);const r=kind==='road'?210+grain*34:seam?248:205+grain*33;rough.set([r,r,r,255],i);
  }
  const map=texture(colour,size,size,true);map.userData.graphicsPacked=true;map.userData.channels='RGB sRGB colour / alpha linear authored height; roughness derived from height';
  return {map,bumpMap:texture(height,size,size),roughnessMap:texture(rough,size,size)};
}
const WORLD_DECL='varying vec3 vGraphicWorld; varying vec3 vGraphicNormal;';
function worldVertex(shader){shader.vertexShader=WORLD_DECL+'\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvec4 graphicLocal=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\ngraphicLocal=instanceMatrix*graphicLocal;\n#endif\nvGraphicWorld=(modelMatrix*graphicLocal).xyz; vGraphicNormal=normalize(vec3(dot(viewMatrix[0].xyz,transformedNormal),dot(viewMatrix[1].xyz,transformedNormal),dot(viewMatrix[2].xyz,transformedNormal)));')}
export function worldSurface(material,{tile=[2.4,1.2],waterUniform={value:-4.2},wet=false,metal=false}={}){
  material.userData.graphics21={tileMeters:tile,worldProjection:true,wet,metal};
  material.onBeforeCompile=shader=>{
    worldVertex(shader);shader.uniforms.graphicWaterY=waterUniform;
    shader.fragmentShader=WORLD_DECL+`\nuniform float graphicWaterY;\nvec2 graphicUV(){vec3 n=abs(vGraphicNormal);return vec2(n.x>n.y&&n.x>n.z?vGraphicWorld.z:vGraphicWorld.x,n.y>n.x&&n.y>n.z?vGraphicWorld.z:vGraphicWorld.y)/vec2(${tile[0].toFixed(3)},${tile[1].toFixed(3)});}\n`+shader.fragmentShader;
    if(material.map?.userData.graphicsPacked){
      // One colour/linear-height sample feeds diffuse, screen derivatives for
      // metre-scale relief and derived roughness. Avoid three forward-difference
      // height reads plus a separate roughness lookup on every corridor pixel.
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','vec4 graphicSample=texture2D(map,graphicUV());\ndiffuseColor.rgb*=graphicSample.rgb;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','float roughnessFactor=roughness*mix(.84,1.0,1.0-graphicSample.a);');
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','normal=perturbNormalArb(-vViewPosition,normal,vec2(dFdx(graphicSample.a),dFdy(graphicSample.a))*bumpScale,faceDirection);');
    }
    for(const chunk of ['map_fragment','roughnessmap_fragment','bumpmap_pars_fragment'])shader.fragmentShader=shader.fragmentShader.replace('#include <'+chunk+'>',THREE.ShaderChunk[chunk]);
    for(const name of ['vMapUv','vBumpMapUv','vRoughnessMapUv'])shader.fragmentShader=shader.fragmentShader.replaceAll(name,'graphicUV()');
    if(wet){shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\nfloat wetEdge=1.0-smoothstep(graphicWaterY+0.03,graphicWaterY+0.58,vGraphicWorld.y);\nfloat weather=0.96+0.04*sin(vGraphicWorld.x*0.21+sin(vGraphicWorld.z*0.34));\ndiffuseColor.rgb*=mix(vec3(weather),vec3(0.57,0.66,0.62),wetEdge*0.65);`);shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','roughnessFactor=mix(roughnessFactor,0.43,wetEdge*0.6);\n#include <metalnessmap_fragment>')}
    if(metal)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=0.96+0.04*sin(vGraphicWorld.y*81.0+vGraphicWorld.x*3.0);');
  };
  material.customProgramCacheKey=()=>`graphic21:${tile}:${wet}:${metal}`;material.needsUpdate=true;return material;
}
function edgeField(ring){
  const min=[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1]))],max=[Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))],w=512,h=128,bytes=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=[min[0]+x/(w-1)*(max[0]-min[0]),min[1]+y/(h-1)*(max[1]-min[1])];let d=100;for(let j=0;j<ring.length;j++)d=Math.min(d,distanceToSegment(p,ring[j],ring[(j+1)%ring.length]));const v=Math.min(255,d/16*255);bytes.set([v,v,v,255],(y*w+x)*4)}
  const map=texture(bytes,w,h);map.wrapS=map.wrapT=THREE.ClampToEdgeWrapping;return {map,min,range:[max[0]-min[0],max[1]-min[1]],bytes:w*h*4*4/3};
}
export function createWaterMaterial(ring,waterUniform){
  const edge=edgeField(ring),time={value:0},light={value:1},mat=new THREE.MeshStandardMaterial({color:'#39594e',roughness:.22,metalness:.06,envMapIntensity:1.1,transparent:true,opacity:.97,side:THREE.DoubleSide,depthWrite:false});
  mat.userData.graphics21={worldWavelengthsM:[4.91,1.1],edgeFieldResolution:[512,128],environmentReflectionOnly:true};
  mat.onBeforeCompile=shader=>{
    worldVertex(shader);Object.assign(shader.uniforms,{graphicTime:time,graphicLight:light,graphicWaterY:waterUniform,graphicBank:{value:edge.map}});
    shader.fragmentShader=WORLD_DECL+`\nuniform float graphicTime; uniform float graphicLight; uniform float graphicWaterY; uniform sampler2D graphicBank;\nfloat bankDistance(){return texture2D(graphicBank,(vGraphicWorld.xz-vec2(${edge.min.join(',')}))/vec2(${edge.range.join(',')})).r*16.0;}\n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>\nvec2 wp=vGraphicWorld.xz; float tm=graphicTime; float edgeD=graphicEdgeDistance;\nfloat large=sin(wp.x*1.208+wp.y*0.42-tm*0.38);\nfloat small=sin(wp.x*4.8-wp.y*3.1-tm*0.82);\n\nvec2 slope=vec2(cos(wp.x*1.208+wp.y*0.42-tm*0.38)*.085+small*.055,large*.04+cos(wp.x*4.8-wp.y*3.1-tm*.82)*.065);\nslope*=mix(.35,1.0,smoothstep(.1,2.2,edgeD));\nnormal=normalize(mat3(viewMatrix)*vec3(-slope.x,1.0,-slope.y));`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\nfloat graphicEdgeDistance=bankDistance(); float edgeTint=1.0-smoothstep(.1,2.0,graphicEdgeDistance);\nfloat ribbons=1.0;\ndiffuseColor.rgb*=mix(vec3(ribbons),vec3(.69,.78,.67),edgeTint*.6);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float grazing=pow(1.0-clamp(dot(normal,normalize(vViewPosition)),0.0,1.0),5.0);\noutgoingLight=mix(outgoingLight,vec3(.38,.48,.50)*graphicLight,grazing*.30);\n#include <opaque_fragment>`);
  };mat.customProgramCacheKey=()=> 'water21-world-2-frequency-bank-fresnel';
  return {material:mat,edge,tick(seconds,evening){time.value=seconds;light.value=evening?.65:1;mat.envMapIntensity=evening?.75:1.1;mat.color.set(evening?'#304b4c':'#39594e')},get time(){return time.value}};
}
export function bankPlacements(data){
  const random=rng(),ring=data.river_polygon,result=[];
  for(let j=0;j<ring.length;j++){
    const a=ring[j],b=ring[(j+1)%ring.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<8)continue;
    for(let d=2;d<len-1;d+=2.1+random()*2.4){const t=d/len,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],normal=[-(b[1]-a[1])/len,(b[0]-a[0])/len];let sign=inside([p[0]+normal[0]*.7,p[1]+normal[1]*.7],ring)?1:-1;
      const inset=.35+random()*.45,q=[p[0]+normal[0]*inset*sign,p[1]+normal[1]*inset*sign],radius=.23+random()*.3,clearance=walkClearance(q,data.walks);
      if(!inside(q,ring)||clearance<radius+.65||random()<.18)continue;
      result.push({point:q,radius,height:.3+random()*.55,y:-3.85-random()*.25,yaw:random()*Math.PI*2,grass:random()>.35,walkClearanceM:clearance});
    }
  }return result;
}
export function tuftGeometry(){
  const p=[],uv=[];for(let j=0;j<5;j++){const a=j*Math.PI*.4,dx=Math.cos(a),dz=Math.sin(a),h=.4+(j%3)*.15,w=.055;const points=[[-dx*w,0,-dz*w],[dx*w,0,dz*w],[dx*.10,h,dz*.10]];for(const q of points)p.push(...q);uv.push(0,0,1,0,.5,1)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
export function bankRockGeometry(){
  const g=new THREE.IcosahedronGeometry(1,1),p=g.attributes.position;
  // Continuous deformation preserves shared vertex positions while breaking the
  // regular icosphere silhouette. Low, angular stones are an artistic reference.
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),q=.86+.13*Math.sin(x*9.7+y*6.1+z*7.3)+.08*Math.cos(x*6.3-z*11.1);p.setXYZ(i,x*q*(1+.09*Math.sin(z*9)),y*q*.68,z*q)}g.computeVertexNormals();return g;
}
export function createGraphics({data,scene,renderer,visual,materials,art}){
  const waterUniform={value:-4.2},maps={stone:proceduralSurface('stone'),paving:proceduralSurface('paving'),road:proceduralSurface('road')};
  const compact=m=>({map:m.map,bumpMap:m.map});
  const stone=worldSurface(new THREE.MeshStandardMaterial({color:'#deddd3',...compact(maps.stone),bumpScale:.035,roughness:1,envMapIntensity:.58}),{tile:GRAPHICS_POLICY.tileMeters.stone,waterUniform,wet:true});
  const paving=worldSurface(new THREE.MeshStandardMaterial({color:'#e0d2c0',...compact(maps.paving),bumpScale:.018,roughness:.94,envMapIntensity:.5}),{tile:GRAPHICS_POLICY.tileMeters.paving,waterUniform,wet:true});
  const road=worldSurface(new THREE.MeshStandardMaterial({color:'#bac0bd',...compact(maps.road),bumpScale:.008,roughness:.96,envMapIntensity:.4}),{tile:GRAPHICS_POLICY.tileMeters.road});
  materials.stone=stone;materials.walk=paving;materials.road=road;materials.sidewalk=stone;materials.grass=worldSurface(new THREE.MeshStandardMaterial({color:'#c0c4b3',...compact(maps.paving),roughness:1,bumpScale:.008}),{tile:[4.8,4.8]});
  visual.wall=stone;visual.floor=paving;
  for(const m of art.sides){m.envMapIntensity=.55;m.clearcoat=.06}for(const m of art.roofs){m.color.multiplyScalar(.96);m.envMapIntensity=.45}
  const water=createWaterMaterial(data.river_polygon,waterUniform);visual.water=water.material;
  const oldTick=visual.tick;visual.tick=(now,evening)=>water.tick(now/1000,evening);
  const placements=bankPlacements(data),group=new THREE.Group();group.name='assumed-riverbank-detail-v21';scene.add(group);
  const rockMat=stone.clone();worldSurface(rockMat,{tile:[2.4,1.2],waterUniform,wet:true});rockMat.color.set('#9ba498');
  const rocks=new THREE.InstancedMesh(bankRockGeometry(),rockMat,placements.length);rocks.name='assumed-bank-stones';rocks.castShadow=rocks.receiveShadow=true;group.add(rocks);
  const grassMat=new THREE.MeshStandardMaterial({color:'#657d47',roughness:.95,side:THREE.DoubleSide});
  const grasses=placements.filter(p=>p.grass),grass=new THREE.InstancedMesh(tuftGeometry(),grassMat,grasses.length);grass.castShadow=false;grass.receiveShadow=true;grass.name='assumed-bank-tufts';group.add(grass);
  const dummy=new THREE.Object3D();placements.forEach((p,i)=>{dummy.position.set(p.point[0],p.y-.12-(i%4)*.055,p.point[1]);dummy.rotation.set(.3*Math.sin(i),p.yaw,.25*Math.cos(i));dummy.scale.set(p.radius*(1.05+(i%5)*.11),p.height*(.75+(i%4)*.12),p.radius*(.75+(i%3)*.15));dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);rocks.setColorAt(i,new THREE.Color().setHSL(.20,.035,.69+(i%5)*.025))});
  grasses.forEach((p,i)=>{const rockIndex=placements.indexOf(p);dummy.position.set(p.point[0],p.y-.14-(rockIndex%4)*.055+p.height*(.50+(rockIndex%4)*.08),p.point[1]);dummy.rotation.set(0,p.yaw,0);dummy.scale.set(.8+p.radius,.8+p.height,.8+p.radius);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);grass.setColorAt(i,new THREE.Color().setHSL(.19+(i%4)*.015,.23,.45+(i%5)*.025))});
  rocks.computeBoundingSphere();grass.computeBoundingSphere();
  let latest={evening:false,quality:'high',reducedMotion:false};
  return {waterUniform,water,materials:{stone,paving,road},placements,group,maps,oldTick,
    sync({y,evening,quality,reducedMotion,landscape}){waterUniform.value=y;latest={evening,quality,reducedMotion};group.visible=landscape;grass.visible=quality==='high';},
    get diagnostics(){return {mode:'authored-v21',policy:GRAPHICS_POLICY,newMapGpuBytesIncludingMipmaps:3*3*256*256*4*4/3+water.edge.bytes,newEnvironmentBatches:2,rocks:placements.length,tufts:grasses.length,minimumWalkClearanceM:Math.min(...placements.map(p=>p.walkClearanceM-p.radius)),wetBand:{virtualWaterY:waterUniform.value,fadeHeightM:.58,measured:false},waterTimeSeconds:water.time,waterClockFrozen:latest.reducedMotion,...latest}},
  };
}
