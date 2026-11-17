// Amounts are mm per completed ten-minute interval, not minute rainfall or mm/h.
export function rollingAmount(values,index,bins){
  if(!Number.isInteger(index)||!Number.isInteger(bins)||bins<1||index<bins-1||index>=values.length)return null;
  let sum=0;for(let i=index-bins+1;i<=index;i++){const value=values[i];if(typeof value!=='number'||!Number.isFinite(value)||value<0)return null;sum+=value}
  return Math.round(sum*1000)/1000;
}
export function assessFloodReadiness(input={}){
  const required=['stage','stageDatum','walkwayElevation','walkwayDatum','surveyVerified','officialControlThreshold','currentClosureVerified'];
  const missing=required.filter(k=>input[k]===null||input[k]===undefined||input[k]===false);
  if(input.stageDatum&&input.walkwayDatum&&input.stageDatum!==input.walkwayDatum)missing.push('commonVerticalDatum');
  return {status:'not_operational',readyForOperationalRisk:false,missing,depthEstimate:null,reason:missing.length?'필수 현장·운영자료 미확보':'필수값만으로 검증된 수리모형·운영 승인까지 확보된 것은 아님'};
}
export function initRainfallUI(data){
  const $=id=>document.getElementById(id),select=$('rainStation'),cursor=$('rainCursor');let current=data.series[0];
  for(const station of data.series){const option=document.createElement('option');option.value=station.station_id;option.textContent=`${station.name} · ${station.district}`;select.append(option)}
  const format=v=>v===null?'자료 부족':`${v.toFixed(1)} mm`;
  function render(){
    const index=Number(cursor.value),time=new Date(Date.parse(current.start_kst)+index*600000);
    const stamp=time.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
    $('rainTimestamp').textContent=`${stamp} KST · 과거 관측`;
    $('rain10').textContent=format(current.values_mm[index]);
    for(const [id,bins] of [['rain1h',6],['rain3h',18],['rain12h',72]])$(id).textContent=format(rollingAmount(current.values_mm,index,bins));
    $('rainQuality').textContent=`${current.name} · 월 ${current.values_mm.length}개 구간 / 결측 ${current.missing_slots}개. 공급자 품질 플래그 미제공·현장 보정 미검증.`;
    const start=Math.max(0,index-143),window=current.values_mm.slice(start,index+1),max=Math.max(1,...window.filter(v=>v!==null));
    const svg=$('rainChart'),NS='http://www.w3.org/2000/svg';svg.replaceChildren();
    const base=document.createElementNS(NS,'path');base.setAttribute('d','M0 82H260');base.setAttribute('stroke','#c6d6dd');svg.append(base);
    window.forEach((v,i)=>{const bar=document.createElementNS(NS,'rect'),h=v===null?78:Math.max(v?1:0,v/max*72);bar.setAttribute('x',String(i/window.length*260));bar.setAttribute('y',String(81-h));bar.setAttribute('width',String(Math.max(.6,260/window.length-.3)));bar.setAttribute('height',String(h));bar.setAttribute('fill',v===null?'#b87f3e':'#387c98');const title=document.createElementNS(NS,'title');title.textContent=v===null?'결측':`${v}mm / 10분`;bar.append(title);svg.append(bar)});
    $('rainChartMax').textContent=`최근 최대24h · 10분 구간량, 위쪽 눈금 ${max.toFixed(1)}mm`;
    $('rainFacts').textContent=`원본 ${data.metadata.rows.all_rows.toLocaleString()}행·48개 코드. 설명문47개소와 불일치하여 원인을 확인 중입니다. 화면의 두 지점은 유역 평균이 아닙니다.`;
  }
  function pick(station){current=station;cursor.max=String(current.values_mm.length-1);cursor.value=String(current.peaks['3'].index);select.value=station.station_id;render()}
  select.addEventListener('change',()=>pick(data.series.find(s=>s.station_id===select.value)));
  cursor.addEventListener('input',render);$('rainPeak').addEventListener('click',()=>{cursor.value=String(current.peaks['3'].index);render()});
  pick(current);
  return {get state(){const index=Number(cursor.value);return {station:current.station_id,index,tenMinuteMm:current.values_mm[index],oneHourMm:rollingAmount(current.values_mm,index,6),threeHourMm:rollingAmount(current.values_mm,index,18),twelveHourMm:rollingAmount(current.values_mm,index,72),period:data.metadata.period,live:false,risk:assessFloodReadiness()}}};
}
