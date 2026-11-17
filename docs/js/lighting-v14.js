import * as THREE from 'three';

// Presentation lighting only. Directions are not a solar ephemeris or a site daylight analysis.
export function createLightingLab({scene,camera,controls,renderer,post,sun,hemi,onReset}){
  const $=id=>document.getElementById(id);
  const presets={morning:{direction:[220,240,140],sun:'#fff0d7',ambient:'#e4edf4'},noon:{direction:[0,430,150],sun:'#fff7e8',ambient:'#ecf1f4'},afternoon:{direction:[-240,260,160],sun:'#ffe7c5',ambient:'#e5edf1'}};
  let evening=false,lastFollow=0,contrast=1,exposure=.86,shade=true;
  function apply(){
    const preset=presets[$('sunDirection').value];contrast=Number($('lightContrast').value);exposure=Number($('exposure').value);shade=$('showShadows').checked;
    const direction=new THREE.Vector3(...preset.direction);if(evening)direction.y*=.38;
    sun.color.set(evening?'#f6c590':preset.sun);sun.intensity=(evening?1.55:2.35)*contrast;
    hemi.color.set(preset.ambient);hemi.intensity=(evening?.65:.95)/contrast;
    renderer.toneMappingExposure=exposure;post.direction(direction);post.setShadows(shade);post.light(evening);
    $('exposureValue').textContent=exposure.toFixed(2);$('contrastValue').textContent=contrast.toFixed(2);
  }
  for(const id of ['sunDirection','lightContrast','exposure','showShadows'])$(id).addEventListener('input',apply);
  $('resetLighting').addEventListener('click',()=>{$('sunDirection').value='afternoon';$('lightContrast').value='1';$('exposure').value='.86';$('showShadows').checked=true;evening=false;onReset?.();$('lighting').textContent='해질녘';$('lighting').setAttribute('aria-pressed','false');apply()});
  apply();
  return {setEvening(value){evening=value;apply()},
    frame(now){if(now-lastFollow<220)return;lastFollow=now;post.follow(controls.target,camera.position.distanceTo(controls.target));const state=post.shadowState;$('shadowStatus').textContent=`${shade?'그림자 켜짐':'그림자 꺼짐'} · ${state.resolution}² · 가시 중심 반경 ${Math.round(state.span)}m`},
    get state(){let casters=0,receivers=0;scene.traverse(o=>{if(o.isMesh){if(o.castShadow)casters++;if(o.receiveShadow)receivers++}});return {enabled:shade,preset:$('sunDirection').value,contrast,exposure,evening,...post.shadowState,casters,receivers,meaning:'Artistic directional illumination; no surveyed geometry or astronomical sun validation.'}}
  };
}
