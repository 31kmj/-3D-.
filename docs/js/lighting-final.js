import * as THREE from 'three';

// Presentation lighting only. Directions are not a solar ephemeris or a site daylight analysis.
export function createLightingLab({scene,camera,controls,renderer,post,sun,hemi,onReset}){
  const $=id=>document.getElementById(id);
  // Neutral daylight and a higher sun keep pale stone readable and shorten coarse overview shadows.
  const presets={morning:{direction:[220,350,140],sun:'#fff0da',ambient:'#d9e6ec'},noon:{direction:[0,430,150],sun:'#fff5e6',ambient:'#e0ebef'},afternoon:{direction:[-260,390,210],sun:'#ffe9cc',ambient:'#d3e1e9'}};
  let evening=false,lastFollow=0,contrast=1,exposure=.86,shade=true;
  function apply(){
    const preset=presets[$('sunDirection').value];contrast=Number($('lightContrast').value);exposure=Number($('exposure').value);shade=$('showShadows').checked;
    const direction=new THREE.Vector3(...preset.direction);if(evening)direction.y*=.38;
    sun.color.set(evening?'#ffe4c7':preset.sun);sun.intensity=(evening?1.65:2.0)*contrast;
    hemi.color.set(evening?'#b2c8dc':preset.ambient);hemi.groundColor.set(evening?'#58636d':'#8b908a');
    // Basic/light mode has no HDR environment; replace that missing diffuse fill.
    hemi.intensity=((evening?1.1:1.4)+(scene.environment?0:1.0))/contrast;
    // Artistic presets coordinate the background, diffuse fill and environment
    // response; no real date/time solar position is implied.
    scene.environmentIntensity=evening?.65:.8;
    scene.background.set(evening?'#82949f':'#dce8f0');scene.fog.color.copy(scene.background);
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
