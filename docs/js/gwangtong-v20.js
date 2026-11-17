import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {buildEvidenceBridge as buildPreviousBridge} from './bridges-v14.js';

// Original authored geometry. Photo observations support horizontal stone rails and
// layered caps only; member sizes, spacing, hidden faces and elevations are assumed.
function graniteMaps(){
  const size=128,colour=new Uint8Array(size*size*4),height=new Uint8Array(size*size*4),rough=new Uint8Array(size*size*4);
  let seed=200526;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const n=random(),fleck=random(),cloud=Math.sin(x*.11+Math.sin(y*.07))*2+Math.cos(y*.13)*2;
    const v=208+(n-.5)*22+cloud+(fleck<.045?-38:fleck>.95?15:0),i=(y*size+x)*4;
    colour.set([v+3,v+2,v-2,255],i);height.set([n*170+35,n*170+35,n*170+35,255],i);rough.set([218+n*27,218+n*27,218+n*27,255],i);
  }
  const make=(bytes,srgb=false)=>{const t=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;if(srgb)t.colorSpace=THREE.SRGBColorSpace;return t};
  return {map:make(colour,true),bumpMap:make(height),roughnessMap:make(rough)};
}

// Six faces, twelve bevel strips, eight corner triangles: 44 triangles per block.
// This keeps readable stone edges without a densely subdivided rounded-box grid.
export function stoneBlockGeometry(width,height,depth,bevel=.025){
  const h=[width/2,height/2,depth/2],b=Math.min(bevel,...h.map(v=>v*.3)),q=h.map(v=>v-b),positions=[],normals=[],uvs=[];
  function polygon(points){
    const normal=new THREE.Vector3().subVectors(new THREE.Vector3(...points[1]),new THREE.Vector3(...points[0])).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...points[2]),new THREE.Vector3(...points[0]))).normalize();
    const c=points.reduce((v,p)=>v.add(new THREE.Vector3(...p)),new THREE.Vector3()).multiplyScalar(1/points.length);
    if(normal.dot(c)<0){points.reverse();normal.negate()}
    for(let i=1;i<points.length-1;i++)for(const p of [points[0],points[i],points[i+1]]){
      positions.push(...p);normals.push(normal.x,normal.y,normal.z);
      const a=Math.abs(normal.x),v=Math.abs(normal.y),z=Math.abs(normal.z);uvs.push((a>v&&a>z?p[2]:p[0])/.8,(v>a&&v>z?p[2]:p[1])/.8);
    }
  }
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
    const other=[0,1,2].filter(a=>a!==axis);polygon([[-1,-1],[1,-1],[1,1],[-1,1]].map(s=>{const p=[0,0,0];p[axis]=sign*h[axis];p[other[0]]=s[0]*q[other[0]];p[other[1]]=s[1]*q[other[1]];return p}));
  }
  for(let axis=0;axis<3;axis++){
    const [u,v]=[0,1,2].filter(a=>a!==axis);
    for(const su of [-1,1])for(const sv of [-1,1])polygon([[-1,0],[1,0],[1,1],[-1,1]].map(([sa,side])=>{const p=[0,0,0];p[axis]=sa*q[axis];p[u]=su*(side?q[u]:h[u]);p[v]=sv*(side?h[v]:q[v]);return p}));
  }
  for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]){const s=[sx,sy,sz];polygon([0,1,2].map(axis=>s.map((sign,a)=>sign*(a===axis?h[a]:q[a]))))}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));return g;
}

export function gwangtongDetailCamera(bridge){
  const yaw=Math.atan2(bridge.points.at(-1)[0]-bridge.points[0][0],bridge.points.at(-1)[1]-bridge.points[0][1]);
  const point=(x,y,z)=>[bridge.center[0]+Math.cos(yaw)*x+Math.sin(yaw)*z,y,bridge.center[1]-Math.sin(yaw)*x+Math.cos(yaw)*z];
  return {position:point(9.5,3.5,-14.5),target:point(6.5,.7,-6),fov:42,localPosition:[9.5,3.5,-14.5],localTarget:[6.5,.7,-6],basis:'assumed presentation camera; no surveyed eye position'};
}

export function buildGwangtongBridge(bridge,group){
  const w=bridge.official_width_m,span=bridge.render_length_m,maps=graniteMaps();
  const stone=new THREE.MeshStandardMaterial({...maps,color:'#f0eee7',roughness:.96,bumpScale:.012,envMapIntensity:.55});
  const cap=stone.clone();cap.color.set('#e6e4dd');cap.bumpScale=.009;
  const floor=stone.clone();floor.color.set('#dedbd1');floor.bumpScale=.008;
  const materials=[stone,cap,floor],buckets=materials.map(()=>[]),parts=[];
  const yaw=Math.atan2(bridge.points.at(-1)[0]-bridge.points[0][0],bridge.points.at(-1)[1]-bridge.points[0][1]);
  const transform=new THREE.Matrix4().makeRotationY(yaw);transform.setPosition(bridge.center[0],0,bridge.center[1]);
  function addGeometry(geometry,x,y,z,material,kind,dimensions){
    geometry.translate(x,y,z);geometry.applyMatrix4(transform);buckets[material].push(geometry);
    parts.push({kind,localCenter:[x,y,z],dimensions,material});
  }
  const block=(kind,W,H,D,x,y,z,mat=0,bevel=.025)=>addGeometry(stoneBlockGeometry(W,H,D,bevel),x,y,z,mat,kind,[W,H,D]);
  block('deck',w,.72,span,0,-.43,0);
  block('deck-edge',w+.22,.15,span+.2,0,.015,0,1);
  for(const z of [-span/6,span/6]){
    block('pier-foot',w+.65,.55,2.15,0,-4.55,z,1);
    for(let row=0;row<5;row++)for(let i=0;i<6;i++)block('pier-block',w/6-.025,.72,1.65,-w/2+w/12+i*w/6,-4+row*.72,z);
    block('pier-head',w+.18,.32,2.03,0,-.76,z,1);
  }
  for(const z of [-span/2+.6,span/2-.6])block('abutment',w,3.8,1.25,0,-2.3,z);
  // Nine bays are a retained illustration choice, not a count inferred from pixels.
  const bays=9,spacing=span/bays;
  for(const x of [-w/2+.2,w/2-.2]){
    block('rail-plinth',.68,.16,span,x,.19,0,1);
    for(let i=0;i<=bays;i++){
      const z=-span/2+i*spacing;
      block('post-foot',.82,.15,.82,x,.335,z,1,.035);
      block('post-shaft',.56,.83,.56,x,.80,z,0,.035);
      block('post-cornice',.84,.15,.84,x,1.26,z,1,.035);
      // A plain rounded cap deliberately omits unverified animal sculptures.
      const profile=[[0,0],[.35,0],[.39,.065],[.36,.12],[.28,.15],[.26,.19],[.23,.26],[.14,.31],[0,.33]].map(p=>new THREE.Vector2(...p));
      const crown=new THREE.LatheGeometry(profile,12);const uv=crown.attributes.uv;for(let j=0;j<uv.count;j++)uv.setXY(j,uv.getX(j)*2,uv.getY(j)*.5);
      addGeometry(crown.toNonIndexed(),x,1.335,z,1,'post-rounded-cap',[.78,.33,.78]);crown.dispose();
      if(i<bays){
        const mid=z+spacing/2,length=spacing-.56;
        block('rail-lower',.36,.23,length,x,.59,mid,0,.035);
        block('rail-upper',.42,.27,length,x,1.055,mid,0,.035);
      }
    }
  }
  // Separate blocks retain shallow, actual joints rather than a painted grid.
  for(let row=0;row<12;row++)for(let col=0;col<6;col++)block('paving-block',(w-.9)/6-.012,.035,(span-.6)/12-.012,-(w-.9)/2+(col+.5)*(w-.9)/6,.11,-(span-.6)/2+(row+.5)*(span-.6)/12,2,.003);
  const metrics={meshes:0,triangles:0,materials:materials.length,finitePositions:true,bounds:null,mergeChecks:[]};
  const bounds=new THREE.Box3();
  buckets.forEach((geometries,i)=>{
    const geometry=mergeGeometries(geometries,false);geometry.computeBoundingBox();geometry.computeBoundingSphere();
    let equivalent=true;
    for(const key of Object.keys(geometry.attributes)){
      let cursor=0;const combined=geometry.attributes[key].array;
      for(const source of geometries)for(const value of source.attributes[key].array)if(combined[cursor++]!==value)equivalent=false;
      if(cursor!==combined.length)equivalent=false;
    }
    metrics.mergeChecks.push({material:i,sourceBlocks:geometries.length,expandedAttributesExactlyEqual:equivalent});
    for(const n of geometry.attributes.position.array)if(!Number.isFinite(n))metrics.finitePositions=false;
    const mesh=new THREE.Mesh(geometry,materials[i]);mesh.castShadow=mesh.receiveShadow=true;mesh.name='gwangtong-v20-'+['granite','caps','paving'][i];mesh.userData.gwangtongV20=true;group.add(mesh);
    bounds.union(geometry.boundingBox);metrics.meshes++;metrics.triangles+=(geometry.index?.count??geometry.attributes.position.count)/3;geometries.forEach(g=>g.dispose());
  });
  metrics.bounds={min:bounds.min.toArray(),max:bounds.max.toArray()};
  const partCounts=parts.reduce((out,p)=>(out[p.kind]=(out[p.kind]||0)+1,out),{});
  return {name:bridge.name,officialWidth:w,modeledSpan:span,lengthBasis:bridge.modeled_length_basis,mappedAxis:bridge.mapped_axis_length_m,piers:2,openings:3,center:bridge.center,yawRadians:yaw,
    detailBasis:'official photo4 horizontal stone rails / layered posts; original procedural material; no source pixels',elevations:'assumed',memberDimensions:'assumed',railingBayCount:'9 per side, illustrative / not surveyed',ornament:'plain rounded caps; unverified animal sculpture omitted',photoPixelsUsed:false,
    material:{type:'seeded original procedural pale granite',seed:200526,mapResolution:128,tileM:.8,bumpScaleM:.012,externalTexture:false},partCounts,parts,metrics,detailCamera:gwangtongDetailCamera(bridge)};
}

export function buildEvidenceBridge(bridge,group,visual,buildStoneBridge,{legacyComparison=false}={}){
  return bridge.name==='광통교'&&!legacyComparison?buildGwangtongBridge(bridge,group):buildPreviousBridge(bridge,group,visual,buildStoneBridge);
}
