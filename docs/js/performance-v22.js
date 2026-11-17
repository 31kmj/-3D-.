// Optional bounded frame-stage instrumentation. No GPU readback or synchronous wait.
export function createFrameProfiler({renderer,scene,stage,query}){
  const enabled=query.get('profile')==='cpu';
  const allowed=['matrix-world','shadows','render-skip','graphics-sync','labels'];
  const ablation=enabled&&allowed.includes(query.get('ablation'))?query.get('ablation'):null;
  const out=document.createElement('output');out.id='performanceDiagnostics';out.hidden=true;stage.append(out);
  const frozen=document.createElement('output');frozen.id='performanceLastBenchmark';frozen.hidden=true;stage.append(frozen);
  if(ablation){const note=document.getElementById('runtimeNotice');note.hidden=false;note.textContent='진단 전용 기능 제외: '+ablation+' · 품질·성능 합격 결과로 사용하지 않습니다.';}
  if(!enabled){out.textContent=JSON.stringify({enabled:false,buildRevision:stage.dataset.buildRevision});return {enabled:false,ablation:null,begin(){},mark(){},render(fn){fn()},end(){}};}
  const gl=renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),bins={},pending=[];
  const counters={frames:0,rendererCalls:0,shadowPasses:0,shadowCalls:0,gpuDisjoint:0,gpuSkipped:0};
  let last=0,frameStart=0,lastPublish=0,currentQuery=null,renderCalls=0,matrixInitialized=false,previousBenchmark=false,lastBenchmark=null;
  const originalRender=renderer.render.bind(renderer),originalShadow=renderer.shadowMap.render.bind(renderer.shadowMap);
  renderer.render=(...args)=>{counters.rendererCalls++;renderCalls++;const t=performance.now();try{return originalRender(...args)}finally{push('renderer-call',performance.now()-t)}};
  renderer.shadowMap.render=(...args)=>{counters.shadowCalls++;const active=renderer.shadowMap.enabled&&(renderer.shadowMap.autoUpdate||renderer.shadowMap.needsUpdate);if(active)counters.shadowPasses++;const t=performance.now();try{return originalShadow(...args)}finally{if(active)push('shadow-pass',performance.now()-t)}};
  function push(key,value){const b=bins[key]||(bins[key]={values:new Float64Array(4096),count:0,total:0,max:0});b.values[b.count%4096]=value;b.count++;b.total+=value;b.max=Math.max(b.max,value);}
  function summary(){const result={};for(const [key,b] of Object.entries(bins)){const sorted=Array.from(b.values.slice(0,Math.min(b.count,4096))).sort((a,b)=>a-b);result[key]={count:b.count,mean:b.total/b.count,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))],max:b.max};}return result;}
  function snapshot(state){return {enabled:true,diagnosticOnly:!!ablation,ablation,buildRevision:stage.dataset.buildRevision,gpuTimer:ext?'nonblocking':'unsupported',distributionWindow:'most-recent-4096-stage-samples; means-and-counts-since-reset',...counters,stages:summary(),renderInfo:{...renderer.info.render},...state};}
  document.getElementById('benchmark').addEventListener('click',()=>{for(const key of Object.keys(bins))delete bins[key];for(const key of Object.keys(counters))counters[key]=0;for(const q of pending)gl.deleteQuery(q);pending.length=0;lastPublish=0;previousBenchmark=false;});
  function poll(){if(!ext)return;const disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT);if(disjoint){counters.gpuDisjoint++;for(const q of pending)gl.deleteQuery(q);pending.length=0;return;}while(pending.length&&gl.getQueryParameter(pending[0],gl.QUERY_RESULT_AVAILABLE)){const q=pending.shift();push('gpu-post-ms',gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}}
  return {enabled:true,ablation,
    begin(now){poll();last=frameStart=performance.now();renderCalls=0;counters.frames++;},
    mark(name){const now=performance.now();push(name,now-last);last=now;},
    render(fn){
      if(ablation==='render-skip')return;
      const oldWorld=scene.matrixWorldAutoUpdate,oldShadow=renderer.shadowMap.needsUpdate;
      if(ablation==='matrix-world'){if(!matrixInitialized){scene.updateMatrixWorld(true);matrixInitialized=true;}scene.matrixWorldAutoUpdate=false;}
      if(ablation==='shadows')renderer.shadowMap.needsUpdate=false;
      // Never begin a timer inside an existing query. Results are polled only on later frames.
      if(ext&&pending.length<6&&!gl.getParameter(ext.GPU_DISJOINT_EXT)&&!gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)){currentQuery=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,currentQuery);}else counters.gpuSkipped++;
      try{fn()}finally{if(currentQuery){gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(currentQuery);currentQuery=null;}scene.matrixWorldAutoUpdate=oldWorld;if(ablation==='shadows')renderer.shadowMap.needsUpdate=oldShadow;}
    },
    end(state){push('cpu-frame',performance.now()-frameStart);push('renderer-calls-per-frame',renderCalls);const ended=previousBenchmark&&!state.benchmarkRunning;previousBenchmark=state.benchmarkRunning;if(ended){lastBenchmark=snapshot(state);frozen.textContent=JSON.stringify(lastBenchmark);}const now=performance.now();if(!ended&&now-lastPublish<1000)return;lastPublish=now;out.textContent=JSON.stringify({...snapshot(state),lastBenchmark});},
  };
}
