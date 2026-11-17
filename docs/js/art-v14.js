import * as THREE from 'three';

function canvasTexture(draw,size=512){const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d'),size);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t}
function rng(seed){return()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296}}

export function createArtMaterials(renderer){
  const anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const asphalt=canvasTexture((ctx,n)=>{const image=ctx.createImageData(n,n),random=rng(41);for(let i=0;i<n*n;i++){const c=63+random()*23;image.data.set([c*.92,c*.98,c,255],i*4)}ctx.putImageData(image,0,0)});
  asphalt.colorSpace=THREE.SRGBColorSpace;asphalt.anisotropy=anisotropy;
  const paving=canvasTexture((ctx,n)=>{ctx.fillStyle='#7e8884';ctx.fillRect(0,0,n,n);const random=rng(63);for(let y=0;y<8;y++)for(let x=0;x<8;x++){const c=164+random()*20;ctx.fillStyle=`rgb(${c},${c+3},${c-1})`;ctx.fillRect(x*64+1,y*64+1,62,62)}});
  paving.colorSpace=THREE.SRGBColorSpace;paving.anisotropy=anisotropy;
  const colors=['#c4bbae','#939fa6','#a9a398','#d1c6b7','#8999a1','#b5b2a9','#a4acaa'];
  const sides=colors.map((color,index)=>{
    const variant=index%3,random=rng(index+188);
    const map=canvasTexture((ctx,n)=>{
      ctx.fillStyle=color;ctx.fillRect(0,0,n,n);
      const cols=variant===1?8:6,rows=8,cw=n/cols,rh=n/rows;
      for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
        const gap=variant===1?2:variant===2?12:8,wx=x*cw+gap,wy=y*rh+6,ww=cw-gap*2,wh=rh-(variant===2?23:12);
        ctx.fillStyle='#7a8787';ctx.fillRect(wx-2,wy-2,ww+4,wh+5);
        const grad=ctx.createLinearGradient(wx,wy,wx+ww,wy+wh);grad.addColorStop(0,'#3a4b51');grad.addColorStop(.45,'#6e7c80');grad.addColorStop(.5,'#53646c');grad.addColorStop(1,'#344951');ctx.fillStyle=grad;ctx.fillRect(wx,wy,ww,wh);
        if(random()<.025){ctx.fillStyle='#b6b4a7';ctx.fillRect(wx+1,wy+1,ww-2,wh-2)}
        ctx.fillStyle='#b3bfc0';ctx.fillRect(wx+ww/2,wy,1.6,wh);
        ctx.fillStyle='#596a6a';ctx.fillRect(wx-2,wy+wh+1,ww+4,3);
      }
      if(variant===2){ctx.fillStyle='#7c8079';for(let y=0;y<rows;y++)ctx.fillRect(0,y*rh+rh-7,n,5)}
    });map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=anisotropy;
    const roughness=canvasTexture((ctx,n)=>{ctx.fillStyle='#d4d4d4';ctx.fillRect(0,0,n,n);const cols=variant===1?8:6,cw=n/cols,rh=n/8,gap=variant===1?2:variant===2?12:8;ctx.fillStyle='#4d4d4d';for(let y=0;y<8;y++)for(let x=0;x<cols;x++)ctx.fillRect(x*cw+gap,y*rh+6,cw-gap*2,rh-(variant===2?23:12))});
    return new THREE.MeshPhysicalMaterial({color:'#ffffff',map,roughnessMap:roughness,roughness:1,metalness:.08,clearcoat:.15,clearcoatRoughness:.24,envMapIntensity:.9});
  });
  return {sides,roofs:colors.map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.9})),road:new THREE.MeshStandardMaterial({color:'#929c9d',map:asphalt,roughness:.92}),urban:new THREE.MeshStandardMaterial({map:paving,roughness:.95}),paving,asphalt};
}

export function addMappedDetails({context,data,scene,groups,box,mesh,standard,samples}){
  const landscape=new THREE.Group();scene.add(landscape);groups.landscape=landscape;
  const random=rng(20261019),trees=[];
  for(const t of context.trees)trees.push({point:t.position,source:'node',id:t.osm_id});
  for(const row of context.tree_rows)for(const sample of samples(row.points,7))if(trees.every(t=>Math.hypot(t.point[0]-sample.point[0],t.point[1]-sample.point[1])>3))trees.push({point:sample.point,source:'row_interpolation',id:row.osm_id});
  const bark=standard('#514b3c',{roughness:1}),leafMaterials=['#405c43','#54704c','#617750'].map(c=>standard(c,{roughness:.95}));
  const stems=new THREE.InstancedMesh(new THREE.CylinderGeometry(.16,.27,3.7,9),bark,trees.length);
  stems.castShadow=stems.receiveShadow=true;landscape.add(stems);
  const crowns=leafMaterials.map(mat=>{const m=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,2),mat,trees.length*3);m.castShadow=m.receiveShadow=true;landscape.add(m);return m});
  const dummy=new THREE.Object3D();
  trees.forEach((tree,i)=>{
    const h=5+random()*2.2;dummy.position.set(tree.point[0],1.95,tree.point[1]);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();stems.setMatrixAt(i,dummy.matrix);
    crowns.forEach((c,j)=>{for(let k=0;k<3;k++){const angle=(j*3+k)/9*Math.PI*2;dummy.position.set(tree.point[0]+Math.cos(angle)*1.05,h-.7+random()*.8,tree.point[1]+Math.sin(angle)*1.05);dummy.scale.set(1.3+random()*.55,1.45+random()*.75,1.3+random()*.55);dummy.rotation.set(random(),random()*3,random());dummy.updateMatrix();c.setMatrixAt(i*3+k,dummy.matrix)}});
  });
  const benchWood=standard('#79624a',{roughness:.78}),metal=standard('#445455',{metalness:.65,roughness:.5});
  for(const b of context.benches){const [x,z]=b.position;for(let i=0;i<5;i++)box(1.65,.07,.09,x,.48,z-.25+i*.115,benchWood,landscape);for(const end of [-.65,.65])box(.07,.45,.45,x+end,.23,z,metal,landscape);if(b.tags.backrest==='yes')for(let i=0;i<3;i++)box(1.65,.1,.07,x,.7+i*.12,z+.28,benchWood,landscape)}
  // Crossing nodes are mapped; road width and crossing orientation are inferred.
  let crossings=0;const paint=standard('#d9d8c8',{roughness:.9});
  for(const c of context.crossings){
    let best={distance:Infinity};
    for(const r of data.roads)for(let i=1;i<r.points.length;i++){
      const a=r.points[i-1],b=r.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<.1)continue;
      const t=THREE.MathUtils.clamp(((c.position[0]-a[0])*dx+(c.position[1]-a[1])*dz)/(len*len),0,1),d=Math.hypot(c.position[0]-a[0]-dx*t,c.position[1]-a[1]-dz*t);
      if(d<best.distance)best={distance:d,direction:[dx/len,dz/len],width:r.width};
    }
    if(best.distance>6)continue;crossings++;
    for(let i=-2;i<=2;i++){const stripe=box(.55,.018,Math.min(18,best.width),c.position[0]+best.direction[0]*i*.95,.115,c.position[1]+best.direction[1]*i*.95,paint,groups.roads);stripe.rotation.y=-Math.atan2(best.direction[1],best.direction[0]);stripe.castShadow=false}
  }
  return {mappedTrees:context.trees.length,mappedTreeRows:context.tree_rows.length,renderedTrees:trees.length,mappedBenches:context.benches.length,renderedCrossings:crossings,forms:'generic procedural; sizes, row spacing, directions and Y assumed'};
}
