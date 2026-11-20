import * as THREE from 'three';

// Authored architectural appearance; no new measured geometry or photo pixels.
export const PRESENTATION_LOOK={id:'exhibition-refined-20261120',facadeTileM:24,
 source:'self-authored procedural surfaces',surveyed:false,changesHydrology:false};
function random(seed){return()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296)}
function texture(draw,renderer){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 draw(canvas.getContext('2d'),256);
 const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;
 t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;
}
function worldFacade(material,roofMap,index){
 material.userData.presentationLook=PRESENTATION_LOOK.id;
 material.onBeforeCompile=shader=>{
  shader.uniforms.cityRoofMap={value:roofMap};
  shader.vertexShader='varying vec3 vCityPosition; varying vec3 vCityNormal;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',
   '#include <worldpos_vertex>\nvCityPosition=(modelMatrix*vec4(transformed,1.0)).xyz; vCityNormal=normalize(mat3(modelMatrix)*objectNormal);');
  shader.fragmentShader='varying vec3 vCityPosition; varying vec3 vCityNormal; uniform sampler2D cityRoofMap;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
   vec3 cityN=abs(normalize(vCityNormal));
   vec2 cityUV=vec2(cityN.x>cityN.z?vCityPosition.z:vCityPosition.x,vCityPosition.y)/24.0;
   float cityRoof=step(.85,cityN.y);
   vec3 cityWall=texture2D(map,cityUV).rgb;
   vec3 cityTop=texture2D(cityRoofMap,vCityPosition.xz/20.0).rgb;
   diffuseColor.rgb*=mix(cityWall,cityTop,cityRoof);
   diffuseColor.rgb*=mix(.78,1.0,smoothstep(0.0,13.0,vCityPosition.y));`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
   'float roughnessFactor=roughness*mix(texture2D(roughnessMap,cityUV).g,.94,cityRoof);');
 };
 material.customProgramCacheKey=()=>PRESENTATION_LOOK.id+':facade:'+index;
 return material;
}
export function createPresentationLook({renderer,art,materials,visual}){
 const roofMap=texture((ctx,n)=>{
  ctx.fillStyle='#81909a';ctx.fillRect(0,0,n,n);const r=random(910);
  for(let y=0;y<n;y+=64)for(let x=0;x<n;x+=64){const v=145+r()*6;ctx.fillStyle=`rgb(${v},${v+6},${v+9})`;ctx.fillRect(x+1,y+1,62,62)}
 },renderer);roofMap.colorSpace=THREE.SRGBColorSpace;
 const palettes=[['#a3b0b8','#80959f','#a1b2ba'],['#d2d1ca','#7d909c','#9aabb4'],['#8199a8','#6d8899','#92a9b5'],['#c1c8cc','#8297a4','#a3b4bd']];
 const sides=palettes.map(([frame,dark,light],index)=>{
  const glass=index===0||index===2,cols=glass?8:6,rows=8,gap=glass?1.5:8,cw=256/cols,rh=256/rows;
  const map=texture((ctx,n)=>{
   ctx.fillStyle=frame;ctx.fillRect(0,0,n,n);const r=random(763+index);
   for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const wx=x*cw+gap,wy=y*rh+3,ww=cw-gap*2,wh=rh-(glass?5:11);
    const g=ctx.createLinearGradient(wx,wy,wx,wy+wh);g.addColorStop(0,light);g.addColorStop(1,dark);
    ctx.fillStyle=g;ctx.fillRect(wx,wy,ww,wh);
    // Keep broad, quiet glazing rather than random per-window highlights.
    ctx.fillStyle=glass?'#9badba':'#deddd6';ctx.fillRect(wx+ww*.5,wy,.55,wh);
    ctx.fillStyle='rgba(20,37,45,.35)';ctx.fillRect(wx,wy+wh,ww,1.5);
   }
   if(index===2){ctx.fillStyle='#afbec5';for(let x=0;x<n;x+=64)ctx.fillRect(x,0,2,n)}
  },renderer);map.colorSpace=THREE.SRGBColorSpace;
  const roughness=texture(ctx=>{
   ctx.fillStyle='#dfdfdf';ctx.fillRect(0,0,256,256);ctx.fillStyle=glass?'#888888':'#a0a0a0';
   for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)ctx.fillRect(x*cw+gap,y*rh+3,cw-gap*2,rh-(glass?5:11));
  },renderer);
  return worldFacade(new THREE.MeshPhysicalMaterial({color:'#ffffff',map,roughnessMap:roughness,
   roughness:1,metalness:glass?.08:.03,clearcoat:glass?.2:.08,clearcoatRoughness:.35,envMapIntensity:.8}),roofMap,index);
 });
 // Replace unused generic materials before the first rendered frame.
 for(const m of art.sides){m.map?.dispose();m.roughnessMap?.dispose();m.dispose()}
 for(const m of art.roofs)m.dispose();
 art.sides=sides;art.roofs=palettes.map(()=>new THREE.MeshStandardMaterial({color:'#d5dce0',map:roofMap,roughness:.88,envMapIntensity:.7}));
 materials.grass.color.set('#b8bfc3');materials.road.color.set('#a5b0b7');
 materials.sidewalk.color.set('#d1d6d6');materials.base.color.set('#465c69');
 const waterTick=visual.tick;
 visual.tick=(now,evening)=>{waterTick(now,evening);visual.water.color.set(evening?'#426970':'#638b92');visual.water.envMapIntensity=evening?.8:1.05;};
 let contextBatches=0;
 return {applyContext(group){
  group.children.forEach((object,index)=>{if(!object.userData.bridgeCameraContextBuildingCount)return;
   object.material.dispose();object.material=sides[index%sides.length];contextBatches++;
  });
 },get diagnostics(){return {...PRESENTATION_LOOK,facadeStyles:4,textureCount:9,textureGpuBytes:9*256*256*4*4/3,
  contextBatches,additionalMeshes:0,footprintsAndHeightsUnchanged:true}}};
}
