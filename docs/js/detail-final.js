import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const ASSET=new URL('../assets/version-10/',import.meta.url);
function basicVisualAssets(mode,warning=''){
  const wall=new THREE.MeshStandardMaterial({color:'#b9b8af',roughness:.95});
  const floor=new THREE.MeshStandardMaterial({color:'#bcb7ac',roughness:.95});
  const water=new THREE.MeshPhysicalMaterial({color:'#46554b',roughness:.25,metalness:.08,transparent:true,opacity:.96,depthWrite:false,side:THREE.DoubleSide});
  return {wall,floor,water,environment:{texture:null},loaded:[],manifest:null,mode,warning,
    tick(now,evening){water.color.set(evening?'#2b3e40':'#46554b')},
  };
}
// Optional photographic surfaces must not prevent use of the map.
export async function loadVisualAssets(renderer,{basic=false,forceFailure=false}={}){
  if(basic)return basicVisualAssets('basic');
  if(forceFailure)return basicVisualAssets('fallback','검증용 자산 실패');
  const state={cancelled:false,resources:new Set()},controller=new AbortController();let timer;
  try{
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('표현 자산 준비 시간 초과')),12000)});
    return await Promise.race([loadDetailedVisualAssets(renderer,state,controller.signal),deadline]);
  }catch(error){
    state.cancelled=true;controller.abort();for(const resource of state.resources)resource.dispose?.();
    console.warn('1.4 기본 재질로 복구:',error.message);return basicVisualAssets('fallback',error.message);
  }finally{clearTimeout(timer)}
}
async function loadDetailedVisualAssets(renderer,state,signal){
  const manifest=await fetch(new URL('asset_manifest.json',ASSET),{signal}).then(r=>{if(!r.ok)throw Error('재질 출처 목록 누락');return r.json()});
  const loader=new THREE.TextureLoader(),loaded=[];
  async function load(name,color=false){
    const texture=await loader.loadAsync(new URL(name,ASSET).href);
    if(state.cancelled){texture.dispose();throw Error('표현 자산 취소')}state.resources.add(texture);
    if(color)texture.colorSpace=THREE.SRGBColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());loaded.push(name);return texture;
  }
  async function surface(id){
    const [map,normalMap,roughnessMap]=await Promise.all([load(id+'_diff.jpg',true),load(id+'_nor_gl.jpg'),load(id+'_rough.jpg')]);
    const material=new THREE.MeshStandardMaterial({map,normalMap,roughnessMap,normalScale:new THREE.Vector2(.4,.4),roughness:1,envMapIntensity:.6});state.resources.add(material);return material;
  }
  const [wall,floor,hdr]=await Promise.all([surface('stone_wall_02'),surface('pavement_05'),new RGBELoader().loadAsync(new URL('abandoned_parking_hdri.hdr',ASSET).href).then(texture=>{if(state.cancelled){texture.dispose();throw Error('환경광 준비 취소')}state.resources.add(texture);return texture})]);
  if(state.cancelled)throw Error('표현 자산 취소');
  loaded.push('abandoned_parking_hdri.hdr');
  const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromEquirectangular(hdr);hdr.dispose();pmrem.dispose();
  // Authored normal field, not a remotely sourced image or measured water surface.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const i=(y*256+x)*4,fx=x/256*Math.PI*2,fy=y/256*Math.PI*2;
    const nx=Math.sin(fx*7+Math.sin(fy*4))*.12+Math.cos(fx*3-fy*5)*.05;
    const ny=Math.cos(fy*9+Math.sin(fx*3))*.12+Math.sin(fx*8+fy*3)*.05;
    pixels.data.set([128+nx*110,128+ny*110,252,255],i);
  }
  ctx.putImageData(pixels,0,0);
  const normal=new THREE.CanvasTexture(canvas);normal.wrapS=normal.wrapT=THREE.RepeatWrapping;normal.repeat.set(.33,.33);
  const water=new THREE.MeshPhysicalMaterial({color:'#46554b',roughness:.2,metalness:.08,normalMap:normal,normalScale:new THREE.Vector2(.55,.55),clearcoat:1,clearcoatRoughness:.08,envMapIntensity:1.4,transparent:true,opacity:.96,depthWrite:false,side:THREE.DoubleSide});
  return {wall,floor,water,environment,loaded,manifest,mode:'textured',
    tick(now,evening){normal.offset.set(now*.000011,now*.000004);water.envMapIntensity=evening?.65:1.0;water.color.set(evening?'#2b3e40':'#46554b')},
  };
}

// Photo-informed appearance only. The official page supports width/length, not
// these assumed pier/rail elevations or the dimensions of the individual stones.
export function buildReferenceBridge(bridge,group,visual){
  const root=new THREE.Group(),stone=visual.wall.clone(),paving=visual.floor.clone();
  stone.color.set('#c8c8c0');stone.normalScale.set(.22,.22);
  const cap=new THREE.MeshStandardMaterial({color:'#a7a799',map:stone.map,roughnessMap:stone.roughnessMap,normalMap:stone.normalMap,normalScale:new THREE.Vector2(.15,.15),roughness:1});
  const w=bridge.official_width_m,span=Math.hypot(bridge.points.at(-1)[0]-bridge.points[0][0],bridge.points.at(-1)[1]-bridge.points[0][1]);
  const add=(width,height,depth,x,y,z,material=stone,round=.035)=>{
    const geometry=new RoundedBoxGeometry(width,height,depth,1,Math.min(round,width/5,height/5,depth/5));
    // World-sized UVs avoid stretching a whole texture onto a long pier.
    const uv=geometry.getAttribute('uv'),p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');
    for(let i=0;i<p.count;i++){
      const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));
      uv.setXY(i,(ay>ax&&ay>az?p.getX(i):ax>az?p.getZ(i):p.getX(i))/2,(ay>ax&&ay>az?p.getZ(i):p.getY(i))/2);
    }
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);return mesh;
  };
  add(w,.72,span,0,-.43,0);
  add(w+.22,.15,span+.2,0,.015,0,cap);
  // Two rectangular piers form three visible openings, as in the official photo.
  for(const z of [-span/6,span/6]){
    add(w+.65,.55,2.15,0,-4.55,z,cap);
    for(let row=0;row<5;row++)for(let i=0;i<6;i++)add(w/6-.025,.72,1.65,-w/2+w/12+i*w/6,-4.0+row*.72,z,stone,.045);
    add(w+.18,.32,2.03,0,-.76,z,cap);
  }
  for(const z of [-span/2+.6,span/2-.6])add(w,3.8,1.25,0,-2.3,z,stone);
  // A stone balustrade and distinct caps replace V2's thin metal box rail.
  for(const x of [-w/2+.2,w/2-.2]){
    add(.52,.3,span,x,.27,0,cap);
    add(.42,.24,span,x,1.08,0,cap);
    const count=Math.ceil(span/2.7);
    for(let i=0;i<=count;i++){
      const z=-span/2+span*i/count;add(.65,.92,.65,x,.68,z,stone,.055);add(.85,.22,.85,x,1.23,z,cap,.07);add(.57,.13,.57,x,1.4,z,cap,.04);
      if(i<count)for(let j=1;j<4;j++)add(.15,.58,.16,x,.65,z+span/count*j/4,stone,.025);
    }
  }
  // Slightly raised deck wearing surface, with a generic CC0 pavement material.
  add(w-.9,.035,span-.6,0,.11,0,paving,.005);
  root.position.set(bridge.center[0],0,bridge.center[1]);
  root.rotation.y=Math.atan2(bridge.points.at(-1)[0]-bridge.points[0][0],bridge.points.at(-1)[1]-bridge.points[0][1]);
  root.updateMatrixWorld(true);
  for(const child of [...root.children]){child.geometry.applyMatrix4(child.matrixWorld);child.position.set(0,0,0);child.rotation.set(0,0,0);child.scale.set(1,1,1);root.remove(child);group.add(child)}
  return {name:bridge.name,piers:2,openings:3,officialWidth:w,modeledSpan:span,elevations:'assumed',detailBasis:'official reference photo, no photogrammetry'};
}

export function createPostProcessing(renderer,scene,camera,sun){
  const sky=new Sky();sky.scale.setScalar(4500);scene.add(sky);
  sky.material.uniforms.turbidity.value=2;sky.material.uniforms.rayleigh.value=1.5;
  sky.material.uniforms.mieCoefficient.value=.004;sky.material.uniforms.mieDirectionalG.value=.8;
  const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
  // The composer renders into half-float targets, so canvas antialiasing alone
  // cannot smooth railings and roofs. Match the color/depth format sample counts
  // instead of assuming the device-wide MAX_SAMPLES works for half-float color.
  const highSamples=(()=>{
    try{
      const gl=renderer.getContext(),max=renderer.capabilities.maxSamples;
      const color=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES)||[]);
      const depth=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,gl.SAMPLES)||[]);
      return [4,2].find(n=>n<=max&&color.includes(n)&&depth.includes(n))||0;
    }catch{return 0}
  })();
  function setSamples(samples){
    for(const target of [composer.renderTarget1,composer.renderTarget2]){
      if(target.samples===samples)continue;
      // Releasing these targets also releases their old multisample buffers.
      // Keep their identities: the composer retains read/write buffer references.
      target.dispose();target.samples=samples;
    }
  }
  setSamples(highSamples);
  // Existing coarse SSAO darkened the entire low-level channel outline. The new
  // world-scale material and tracked PCF shadows retain contact without this halo.
  const ao=new SSAOPass(scene,camera,512,512,12);ao.enabled=false;composer.addPass(ao);
  composer.addPass(new OutputPass());const fxaa=new ShaderPass(FXAAShader);composer.addPass(fxaa);
  renderer.info.autoReset=false;renderer.shadowMap.autoUpdate=false;
  // Shadows are static between camera moves. Spend resolution on the desktop
  // presentation while preserving the 1024px light mode for smaller devices.
  const highResolution=Math.min(4096,renderer.capabilities.maxTextureSize);
  let high=true,wanted=true,span=650,updates=0;
  sun.shadow.mapSize.set(highResolution,highResolution);
  const center=new THREE.Vector3(),direction=new THREE.Vector3(-240,260,160);
  function refresh(){
    sun.target.position.set(center.x,0,center.z);sun.position.copy(sun.target.position).add(direction.clone().normalize().multiplyScalar(700));
    Object.assign(sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span,near:1,far:2000});sun.shadow.camera.updateProjectionMatrix();
    // Bias follows world-space texel size: enough offset for the district view,
    // without the large detached shadows of a fixed overview bias at close range.
    const shadowTexelM=2*span/(high?highResolution:1024);
    sun.shadow.bias=-THREE.MathUtils.clamp(shadowTexelM*.25/1999,.000008,.0001);
    sun.shadow.normalBias=THREE.MathUtils.clamp(shadowTexelM*.5,.018,.25);
    renderer.shadowMap.enabled=wanted;sun.castShadow=wanted;sun.shadow.needsUpdate=true;renderer.shadowMap.needsUpdate=true;updates++;
  }
  const api={
    get high(){return high},
    invalidateShadow(){refresh()},
    get shadowState(){return {active:renderer.shadowMap.enabled&&sun.castShadow,span,resolution:high?highResolution:1024,center:center.toArray(),direction:direction.toArray(),updates,ambientOcclusion:ao.enabled,kernelRadius:ao.kernelRadius,msaaSamples:composer.renderTarget1.samples}},
    setQuality(value){high=!!value;setSamples(high?highSamples:0);ao.enabled=false;renderer.setPixelRatio(Math.min(devicePixelRatio,high?1.5:1));const size=high?highResolution:1024;if(sun.shadow.mapSize.x!==size){sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null}refresh()},
    setShadows(value){wanted=!!value;refresh()},
    direction(value){direction.copy(value);refresh()},
    resize(w,h){composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(w,h);ao.setSize(Math.max(1,Math.ceil(w*renderer.getPixelRatio()*.5)),Math.max(1,Math.ceil(h*renderer.getPixelRatio()*.5)));fxaa.material.uniforms.resolution.value.set(1/(w*renderer.getPixelRatio()),1/(h*renderer.getPixelRatio()))},
    light(evening){sky.material.uniforms.sunPosition.value.copy(direction).multiplyScalar(12);sky.material.uniforms.rayleigh.value=evening?1.1:1.5},
    shadow(value,overview=false){center.copy(value);span=overview?720:110;refresh()},
    follow(value,distance){const wantedSpan=THREE.MathUtils.clamp(distance*.55,24,900);if(center.distanceTo(value)>span*.1||Math.abs(span-wantedSpan)>span*.2){center.copy(value);span=wantedSpan;refresh()}},
    render(){renderer.info.reset();composer.render()},
  };api.light(false);refresh();return api;
}

export function createBenchmark({button,output,camera,controls,setTourView,getState}){
  let running=false,start=0,previous=0,samples=[],saved=null,hiddenDuringRun=false;
  document.addEventListener('visibilitychange',()=>{if(running&&document.hidden)hiddenDuringRun=true});
  button.addEventListener('click',()=>{
    if(running)return;
    saved={position:camera.position.clone(),target:controls.target.clone()};
    setTourView();samples=[];start=previous=0;hiddenDuringRun=document.hidden;running=true;button.disabled=true;button.textContent='측정 중… 60초';output.textContent='';
  });
  return {
    get running(){return running},
    frame(now){
      if(!running)return;
      if(!start){start=previous=now;return}
      const elapsed=now-start,dt=now-previous;previous=now;
      // Every displayed animation frame is retained, including slow frames.
      samples.push(dt);const t=Math.min(elapsed/60000,1),x=-199+75*t;
      camera.position.set(x,1.1+Math.sin(t*Math.PI)*1.5,-2+Math.sin(t*Math.PI*2)*2);
      controls.target.set(x+37,-.7,-21);controls.update();
      button.textContent=`측정 중… ${Math.max(0,60-Math.floor(elapsed/1000))}초`;
      if(elapsed>=60000){
        const sorted=samples.slice().sort((a,b)=>a-b),pick=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];
        const result={durationMs:+elapsed.toFixed(2),frames:samples.length,medianFrameMs:+pick(.5).toFixed(3),p99FrameMs:+pick(.99).toFixed(3),averageFps:+(samples.length*1000/elapsed).toFixed(2),onePercentLowFps:+(1000/(sorted.slice(Math.floor(sorted.length*.99)).reduce((a,b)=>a+b,0)/Math.max(1,sorted.length-Math.floor(sorted.length*.99)))).toFixed(2),state:getState(),visibility:document.visibilityState,frameTimesMs:samples.map(n=>+n.toFixed(3))};
        result.hiddenDuringRun=hiddenDuringRun;result.valid=!hiddenDuringRun&&document.visibilityState==='visible';
        output.textContent=JSON.stringify(result);document.getElementById('benchmarkSummary').textContent=result.valid?`평균 ${result.averageFps} fps · 느린 1% ${result.onePercentLowFps} fps · 중앙 ${result.medianFrameMs} ms (현재 설정)`:'측정 중 창이 숨겨져 결과가 무효입니다. 다시 측정해 주세요.';running=false;button.disabled=false;button.textContent='다시 측정 (60초)';camera.position.copy(saved.position);controls.target.copy(saved.target);controls.update();
      }
    },
  };
}
