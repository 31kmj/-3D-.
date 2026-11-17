import * as THREE from 'three';

// Official dimensions + photo-informed structural appearance. Member sizes,
// foundation level and approaches are still assumptions, not engineering models.
export function buildEvidenceBridge(bridge,group,visual,buildStoneBridge){
  const width=bridge.official_width_m,span=bridge.render_length_m;
  if(bridge.name==='광통교'){
    const a=bridge.points[0],b=bridge.points.at(-1),length=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
    const copy={...bridge,points:[[bridge.center[0]-dx*span/2,bridge.center[1]-dz*span/2],[bridge.center[0]+dx*span/2,bridge.center[1]+dz*span/2]]};
    const detail=buildStoneBridge(copy,group,visual);return {...detail,modeledSpan:span,lengthBasis:bridge.modeled_length_basis,mappedAxis:bridge.mapped_axis_length_m};
  }
  const root=new THREE.Group();
  const stone=new THREE.MeshStandardMaterial({color:'#c8c9bd',roughness:.93,roughnessMap:visual.wall.roughnessMap});
  const metal=new THREE.MeshStandardMaterial({color:'#839c98',metalness:.7,roughness:.37});
  const orange=new THREE.MeshStandardMaterial({color:'#b54e25',metalness:.45,roughness:.58});
  const add=(w,h,d,x,y,z,material=stone)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;root.add(m);return m};
  const cylinder=(radius,height,x,y,z,mat=metal)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,10),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;root.add(m);return m};
  let form;
  if(bridge.name==='모전교'){
    form='single arch reference';
    const profile=new THREE.Shape();profile.moveTo(-span/2,-.45);profile.lineTo(span/2,-.45);profile.lineTo(span/2,-4.1);
    for(let i=0;i<=40;i++){const z=(span/2-1)*(1-i/20),y=-4.1+3.05*Math.sqrt(Math.max(0,1-(z/(span/2-1))**2));profile.lineTo(z,y)}
    profile.lineTo(-span/2,-4.1);profile.closePath();
    const geometry=new THREE.ExtrudeGeometry(profile,{depth:width,bevelEnabled:false,steps:1});geometry.rotateY(Math.PI/2);geometry.translate(-width/2,0,0);
    const arch=new THREE.Mesh(geometry,stone);arch.castShadow=arch.receiveShadow=true;root.add(arch);
    add(width,.22,span,0,-.23,0);
    for(const x of [-width/2+.2,width/2-.2]){
      add(.45,.23,span,x,.06,0);add(.35,.2,span,x,1.05,0);
      for(let z=-span/2;z<=span/2+.01;z+=span/12){add(.45,1.0,.42,x,.51,z);add(.6,.15,.6,x,1.19,z)}
    }
  }else{
    form=bridge.name==='광교'?'orange girder reference':bridge.name==='장통교'?'light deck and piers reference':'curved metal screen reference';
    add(width,.55,span,0,-.48,0);
    if(bridge.name==='광교')for(const x of [-width/2+.6,0,width/2-.6])add(.45,.75,span,x,-1.05,0,orange);
    if(bridge.name==='장통교'){
      for(const z of [-span/6,span/6])add(width*.72,3.35,.8,0,-2.35,z);
      for(const x of [-width/2+.25,width/2-.25]){
        add(.32,.25,span,x,.2,0);add(.3,.24,span,x,1.03,0);
        for(let z=-span/2;z<=span/2+.01;z+=span/9){add(.5,1,.5,x,.54,z);add(.65,.17,.65,x,1.15,z)}
      }
    }else if(bridge.name==='삼일교'){
      const screen=new THREE.MeshStandardMaterial({color:'#7bb4b4',metalness:.45,roughness:.45,transparent:true,opacity:.42,side:THREE.DoubleSide,depthWrite:false});
      for(const x of [-width/2+.25,width/2-.25]){
        add(.12,1.3,span,x,.65,0,screen);
        for(let z=-span/2;z<=span/2+.01;z+=span/11){
          const points=[];for(let i=0;i<=12;i++){const t=i/12;points.push(new THREE.Vector3(x+Math.sin(t*Math.PI/2)*.65*(x<0?-1:1),t*2.15,z))}
          const curve=new THREE.CatmullRomCurve3(points);const bar=new THREE.Mesh(new THREE.TubeGeometry(curve,12,.065,6,false),metal);bar.castShadow=true;root.add(bar);
        }
        for(let h=.28;h<1.7;h+=.28)add(.05,.035,span,x,h,0,metal);
      }
    }else{
      for(const x of [-width/2+.2,width/2-.2]){add(.1,.12,span,x,1.0,0,metal);for(let z=-span/2;z<=span/2+.01;z+=span/10)cylinder(.065,1.1,x,.48,z)}
    }
  }
  root.position.set(bridge.center[0],0,bridge.center[1]);root.rotation.y=Math.atan2(bridge.points.at(-1)[0]-bridge.points[0][0],bridge.points.at(-1)[1]-bridge.points[0][1]);root.updateMatrixWorld(true);
  for(const child of [...root.children]){child.geometry.applyMatrix4(child.matrixWorld);child.position.set(0,0,0);child.rotation.set(0,0,0);child.scale.set(1,1,1);root.remove(child);group.add(child)}
  return {name:bridge.name,officialWidth:width,modeledSpan:span,lengthBasis:bridge.modeled_length_basis,mappedAxis:bridge.mapped_axis_length_m,form,elevations:'assumed',memberDimensions:'assumed from reference appearance, not structural design'};
}
