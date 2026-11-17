import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

function triangleCount(geometry){return (geometry.index?.count??geometry.getAttribute('position').count)/3}
function layout(geometry){return Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([name,a])=>[name,a.itemSize,a.normalized,a.array.constructor.name])}
function materialSignature(material){const value=material.toJSON();delete value.uuid;delete value.metadata;return JSON.stringify(value)}
function flags(object){return JSON.stringify({castShadow:object.castShadow,receiveShadow:object.receiveShadow,visible:object.visible,layers:object.layers.mask,renderOrder:object.renderOrder,frustumCulled:object.frustumCulled})}
function metrics(objects){return {meshCount:objects.length,materialCount:new Set(objects.map(o=>o.material)).size,triangleCount:objects.reduce((sum,o)=>sum+triangleCount(o.geometry),0)}}

// 인덱스를 삼각형 순서대로 펼쳐 모든 정점 속성을 비교한다.
// 병합 전후에 변환을 반영한 위치·법선·UV 데이터가 같은지 확인한다.
async function geometryHash(geometries){
  const names=Object.keys(geometries[0].attributes).sort(),stride=names.reduce((sum,name)=>sum+geometries[0].attributes[name].itemSize,0);
  const vertices=geometries.reduce((sum,g)=>sum+(g.index?.count??g.attributes.position.count),0),values=new Float32Array(vertices*stride);
  let at=0;
  for(const geometry of geometries){
    const count=geometry.index?.count??geometry.attributes.position.count;
    for(let n=0;n<count;n++){
      const index=geometry.index?geometry.index.getX(n):n;
      for(const name of names){const attribute=geometry.attributes[name];for(let c=0;c<attribute.itemSize;c++)values[at++]=attribute.array[index*attribute.itemSize+c]}
    }
  }
  const bytes=new Uint8Array(values.buffer);
  if(globalThis.crypto?.subtle){const hash=await crypto.subtle.digest('SHA-256',bytes);return {algorithm:'sha256-expanded-triangle-attributes-float32',value:[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('')}}
  let hash=2166136261;for(const byte of bytes)hash=Math.imul(hash^byte,16777619)>>>0;
  return {algorithm:'fnv1a32-expanded-triangle-attributes-float32',value:hash.toString(16).padStart(8,'0')};
}

export function sceneMeshMetrics(scene){
  const meshes=[],materials=new Set();
  scene.traverse(object=>{if(!object.isMesh||object.isInstancedMesh)return;meshes.push(object);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material)});
  return {scope:'non-instanced scene mesh objects, independent of frustum and visibility; excludes instanced trees',meshCount:meshes.length,materialCount:materials.size,triangleCount:meshes.reduce((sum,o)=>sum+triangleCount(o.geometry),0)};
}

export async function batchEquivalentMeshes({objects,group,label,shareEquivalentMaterial=false}){
  const before=metrics(objects),result={label,applied:false,before,after:before,geometryEquivalent:false};
  if(objects.length<2)return {...result,reason:'fewer than two candidate objects'};
  const first=objects[0],signature=materialSignature(first.material),expectedLayout=JSON.stringify(layout(first.geometry)),expectedFlags=flags(first),copies=[];
  let merged;
  try{
    for(const object of objects){
      if(object.parent!==group||!object.isMesh||object.isInstancedMesh||Array.isArray(object.material)||object.userData.building)throw Error('candidate is not an unselectable direct static mesh');
      if(flags(object)!==expectedFlags||JSON.stringify(layout(object.geometry))!==expectedLayout)throw Error('candidate flags or vertex layouts differ');
      if(shareEquivalentMaterial?materialSignature(object.material)!==signature:object.material!==first.material)throw Error('candidate materials differ');
      if(object.customDepthMaterial||object.customDistanceMaterial||object.morphTargetInfluences||Object.keys(object.geometry.morphAttributes).length)throw Error('custom depth or morph data is unsupported');
      object.updateMatrix();if(object.matrix.determinant()<=0)throw Error('non-positive transform determinant');
      copies.push(object.geometry.clone().applyMatrix4(object.matrix));
    }
    const hashBefore=await geometryHash(copies);merged=mergeGeometries(copies,false);if(!merged)throw Error('mergeGeometries rejected layouts');
    const hashAfter=await geometryHash([merged]);
    if(hashBefore.algorithm!==hashAfter.algorithm||hashBefore.value!==hashAfter.value)throw Error('expanded triangle attribute hashes differ');
    if(objects.some(object=>object.parent!==group||flags(object)!==expectedFlags))throw Error('candidates changed while verifying geometry');
    const combined=new THREE.Mesh(merged,first.material);combined.name=label;
    combined.castShadow=first.castShadow;combined.receiveShadow=first.receiveShadow;combined.visible=first.visible;combined.layers.mask=first.layers.mask;combined.renderOrder=first.renderOrder;combined.frustumCulled=first.frustumCulled;
    combined.userData.staticBatch=label;merged.computeBoundingBox();merged.computeBoundingSphere();
    const after=metrics([combined]);if(after.triangleCount!==before.triangleCount)throw Error('triangle count changed');
    group.add(combined);for(const object of objects){group.remove(object);object.geometry.dispose()}
    if(shareEquivalentMaterial)for(const material of new Set(objects.map(o=>o.material)))if(material!==first.material)material.dispose();
    return {...result,applied:true,after,geometryEquivalent:true,materialsEquivalent:true,hashBefore,hashAfter,attributeLayout:layout(merged),preservedFlags:JSON.parse(expectedFlags),bounds:{min:merged.boundingBox.min.toArray(),max:merged.boundingBox.max.toArray()},frustumNote:'one union bounding volume replaces individual volumes; extra offscreen triangles may be submitted'};
  }catch(error){merged?.dispose();console.warn('1.1 static batch retained original meshes:',label,error.message);return {...result,reason:error.message}}
  finally{for(const copy of copies)copy.dispose()}
}
