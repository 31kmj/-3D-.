import * as THREE from 'three';
import {worldSurface} from './graphics-v21.js';

// Authored visual materials, informed by P032/P033/P070/P086/P094, not sampled
// image pixels. Tile dimensions, optical values and the two border positions are
// assumptions; the GPS-free photographs do not establish a surveyed material map.
export const BANK_SURFACE_POLICY=Object.freeze({seed:281105,mapSizes:{stone:256,paving:128},tileMeters:{stone:[3.2,2],paving:[1.8,1.8],border:[3.2,2]},borderWidthM:.34,borderY:-2.985,walkY:-3,riskY:-2.91,photoReferences:['P032','P033','P070','P086','P094'],measured:false,sourcePixelsUsed:false,routeGraphChanged:false});
const clamp=x=>Math.max(0,Math.min(255,Math.round(x)));
function hash(x,y,seed){let n=Math.imul(x+Math.imul(y,374761393)+seed,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;}
export function textureMemoryBytes(width,height){let sum=0;for(;;){sum+=width*height*4;if(width===1&&height===1)return sum;width=Math.max(1,width>>1);height=Math.max(1,height>>1);}}
export function makeBankTexture(kind){
  if(!['stone','paving'].includes(kind))throw new Error('Unsupported bank surface');
  const size=BANK_SURFACE_POLICY.mapSizes[kind],bytes=new Uint8Array(size*size*4),stone=kind==='stone',seed=BANK_SURFACE_POLICY.seed+(stone?17:37);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,grain=hash(x,y,seed),mineral=hash(x,y,seed+8),broad=Math.sin(u*Math.PI*2+Math.cos(v*Math.PI*2))*.5+Math.cos(v*Math.PI*4-u*Math.PI*2)*.5;
    let r,g,b,h;
    if(stone){
      const row=Math.floor(v*5),cu=u*4+(row%2)*.5,fx=cu-Math.floor(cu),fy=v*5-row;
      const column=Math.floor(cu)%4,cell=hash(column,row,seed+11)-.5;
      const edge=Math.min(fx,1-fx)*.8<.008||Math.min(fy,1-fy)*.4<.005;
      const bevel=Math.min(fx,1-fx)*.8<.018||Math.min(fy,1-fy)*.4<.014;
      const fleck=mineral<.065?-32:mineral>.952?23:0;
      const base=164+cell*13+(grain-.5)*22+broad*3+fleck;
      r=base+4;g=base+3;b=base;h=153+(grain-.5)*42;
      if(bevel){r-=8;g-=8;b-=8;h-=17;}
      if(edge){r=91+(grain-.5)*12;g=r+1;b=r;h=43+grain*13;}
    }else{
      // Continuous granular paving: no regular pink grid. A periodic broad
      // pattern avoids a hard texture edge; mineral specks are deterministic.
      const fleck=mineral<.06?-27:mineral>.95?22:0;
      const base=139+(grain-.5)*22+broad*3+fleck;
      r=base+10;g=base+3;b=base-3;h=143+(grain-.5)*48+(mineral>.95?13:0);
    }
    bytes.set([clamp(r),clamp(g),clamp(b),clamp(h)],(y*size+x)*4);
  }
  const map=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);map.name=`authored-bank-${kind}-v28`;map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
  map.userData={graphicsPacked:true,channels:'RGB sRGB authored colour / A linear authored height; derived roughness',seed,sourcePixelsUsed:false,gpuBytesIncludingMipmaps:textureMemoryBytes(size,size)};return map;
}
export function createBankSurfaces({data,waterUniform={value:-4.2}}={}){
  if(!data||!Array.isArray(data.walks))throw new Error('Mapped walks required');
  const stone=makeBankTexture('stone'),paving=makeBankTexture('paving');
  const material=(name,map,tile,bump,roughness,color)=>{const m=worldSurface(new THREE.MeshStandardMaterial({name,color,map,bumpMap:map,bumpScale:bump,roughness,envMapIntensity:.48,side:THREE.DoubleSide}),{tile,waterUniform,wet:true});const oldKey=m.customProgramCacheKey.bind(m);m.customProgramCacheKey=()=>`${oldKey()}:bank28:${name}`;m.userData.bankSurface28={assumed:true,photoReferences:BANK_SURFACE_POLICY.photoReferences,sourcePixelsUsed:false};return m;};
  const wallMaterial=material('bank28-gray-ashlar',stone,BANK_SURFACE_POLICY.tileMeters.stone,.042,.98,'#efefea');
  const pavingMaterial=material('bank28-continuous-granular',paving,BANK_SURFACE_POLICY.tileMeters.paving,.026,.96,'#e8e5df');
  const borderMaterial=material('bank28-assumed-light-borders',stone,BANK_SURFACE_POLICY.tileMeters.border,.025,.98,'#ffffff');
  const memoryBytes=stone.userData.gpuBytesIncludingMipmaps+paving.userData.gpuBytesIncludingMipmaps;
  return{wallMaterial,pavingMaterial,borderMaterial,memoryBytes,maps:{stone,paving},diagnostics:{mode:'authored-photo-reference-bank-v28',photoReferences:BANK_SURFACE_POLICY.photoReferences,measured:false,sourcePixelsUsed:false,routeGraphChanged:false,textureCount:2,mapGpuBytesIncludingMipmaps:memoryBytes,packedMapBumpReuse:true,tileMeters:BANK_SURFACE_POLICY.tileMeters,opticalParametersAssumed:true,materialDistribution:'single visual family across mapped walks; exact field transition positions unknown',wetBand:'visual relative to assumed water Y, not observed flooding'}};
}
function validateWalk(walk){
  if(!Number.isFinite(walk.width)||walk.width<.8||!Array.isArray(walk.points)||walk.points.length<2)throw new Error('Invalid mapped walk');
  const points=walk.points.map(p=>{if(!Array.isArray(p)||p.length<2||!p.slice(0,2).every(Number.isFinite))throw new Error('Nonfinite walk point');return[p[0],p[1]];});
  if(points[0][0]>points.at(-1)[0])points.reverse();
  for(let i=1;i<points.length;i++)if(Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1])<1e-7)throw new Error('Duplicate walk points');
  for(let i=1;i<points.length-1;i++){const a=points[i-1],b=points[i],c=points[i+1],u=[b[0]-a[0],b[1]-a[1]],v=[c[0]-b[0],c[1]-b[1]];if((u[0]*v[0]+u[1]*v[1])/(Math.hypot(...u)*Math.hypot(...v))<-.5)throw new Error('Acute reversing walk bend requires surveyed junction');}
  const normals=points.map((p,i)=>{const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],dx=next[0]-prev[0],dz=next[1]-prev[1],len=Math.hypot(dx,dz);if(len<1e-7)throw new Error('Reversing walk tangent');return[-dz/len,dx/len];});
  return{points,normals};
}
export function buildPavingBands({data,groups,material}){
  if(!Array.isArray(data?.walks)||!groups?.walks?.isGroup||!material?.isMaterial)throw new Error('Mapped walk group and border material required');
  const positions=[],uv=[],indices=[],records=[];let segments=0;
  for(const walk of data.walks){
    const{points,normals}=validateWalk(walk),half=walk.width/2,width=Math.min(BANK_SURFACE_POLICY.borderWidthM,walk.width/4);
    for(const side of [-1,1]){
      const start=positions.length/3;let along=0;
      for(let i=0;i<points.length;i++){
        if(i)along+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
        const p=points[i],n=normals[i],offsets=side===1?[half,half-width]:[-half+width,-half];
        for(const[d,j]of offsets.map((d,j)=>[d,j])){positions.push(p[0]+n[0]*d,BANK_SURFACE_POLICY.borderY,p[1]+n[1]*d);uv.push(along,j*width);}
        if(i){const a=start+(i-1)*2,b=start+i*2;indices.push(a,b,a+1,b,b+1,a+1);segments++;}
      }
      records.push({walkId:walk.id??null,side,widthM:width,outerOffsetM:half,innerOffsetM:half-width,sourcePointCount:points.length,lengthM:along,startVertex:start,vertexCount:points.length*2});
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,material);mesh.name='bank28-assumed-inset-light-border-bands';mesh.receiveShadow=true;mesh.castShadow=false;mesh.userData.bankSurface28={assumed:true,routeGraphChanged:false,withinOriginalRibbon:true};groups.walks.add(mesh);
  return{mode:'assumed-inset-borders-v28',meshCount:1,bandCount:records.length,segments,triangles:indices.length/3,vertices:positions.length/3,widthM:BANK_SURFACE_POLICY.borderWidthM,y:BANK_SURFACE_POLICY.borderY,riskOverlayClearanceM:BANK_SURFACE_POLICY.riskY-BANK_SURFACE_POLICY.borderY,records,routeGraphChanged:false,measured:false,exactOriginalRibbonInterpolation:true};
}
