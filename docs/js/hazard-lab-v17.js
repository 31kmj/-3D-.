import {HAZARD_METHOD,classifyLiteratureHazard} from './hazard-rules-v17.js';
export function createHazardLab(){
 const $=id=>document.getElementById(id),method=HAZARD_METHOD;
 $('hazardMethodSummary').innerHTML='<strong>AIDR 일반 취약성 분류 연구</strong><code>D×V · D · V의 세 상한 모두 비교</code>수심 D(m)와 유속 V(m/s)의 곱(m²/s), 각 수심·유속 상한을 모두 비교합니다. 사람 보행 안정성 전용 기준이 아닙니다.';
 $('hazardAdditionalInput').remove();
 const table=document.createElement('table');table.className='hazard-classes';table.innerHTML='<caption>Table 2 상한 재현 · 세 조건 모두 충족</caption><thead><tr><th scope="col">범주</th><th scope="col">D×V<br>m²/s</th><th scope="col">D<br>m</th><th scope="col">V<br>m/s</th></tr></thead>';
 const tbody=document.createElement('tbody');for(const c of method.classes){const row=document.createElement('tr');for(const text of [c.id,'≤ '+c.maxDepthVelocity,'≤ '+c.maxDepth,'≤ '+c.maxVelocity]){const cell=document.createElement('td');cell.textContent=text;row.append(cell)}tbody.append(row)}const final=document.createElement('tr');final.innerHTML='<td>H6</td><td colspan="3">H5의 세 상한 중 하나라도 초과</td>';tbody.append(final);table.append(tbody);$('hazardClassTable').append(table);
 const convention=document.createElement('p');convention.textContent=method.boundaryConvention;$('hazardClassTable').append(convention);
 const link=document.createElement('a');link.href=method.source;link.target='_blank';link.rel='noreferrer';link.textContent='AIDR Guideline 7-3 · '+method.sourceLocation+' ↗';$('hazardSources').append(link);
 const sourceNote=document.createElement('p');sourceNote.textContent='권장 인용: AIDR (2014), Guideline 7-3. 이용조건: CC BY-NC 4.0. 원본 PDF 이미지·그림을 복사하지 않고 표 수치의 계산방법을 재현했습니다. 청계천 현지 적용은 미검증입니다. PDF 인쇄 15쪽의 별도 사람 안정성 논의도 대피 적용 전 검토해야 합니다.';$('hazardSources').append(sourceNote);
 const licenseLink=document.createElement('a');licenseLink.href='https://creativecommons.org/licenses/by-nc/4.0/';licenseLink.target='_blank';licenseLink.rel='noreferrer';licenseLink.textContent='CC BY-NC 4.0 이용조건 ↗';$('hazardSources').append(licenseLink);
 const diagnostic=document.createElement('output');diagnostic.id='hazardLabDiagnostics';diagnostic.hidden=true;$('panel-hazard').append(diagnostic);
 let state=null;
 const read=id=>{if($(id).validity.badInput)return NaN;const text=$(id).value.trim();return text===''?null:Number(text)};
 function update(){
  const depthM=read('hazardDepth'),velocityMps=read('hazardVelocity');state=classifyLiteratureHazard({depthM,velocityMps});
  $('hazardLabResult').dataset.state=state.status;
  $('hazardLabRating').textContent=state.classId||'—';
  $('hazardLabState').textContent=state.message;
  $('hazardLabClass').textContent=state.classId?'일반 취약성 문헌 범주 · 현지 적용 미검증':'분류를 실제 건조·통행 가능 판단으로 해석하지 마세요.';
  $('hazardLabCalculation').textContent=state.status==='classified'?`D×V = ${depthM} × ${velocityMps} = ${String(state.depthVelocity)} m²/s. `+(state.limits?`곱 ≤ ${state.limits.maxDepthVelocity}, D ≤ ${state.limits.maxDepth}m, V ≤ ${state.limits.maxVelocity}m/s 조건을 모두 충족하는 첫 범주입니다.`:'H5의 곱·수심·유속 상한 중 하나 이상을 넘습니다.'):'수심·유속 입력과 단위를 확인하세요. 지도·경로에 이 계산을 적용하지 않습니다.';
  diagnostic.textContent=JSON.stringify({version:'1.6',method,inputs:{depthM,velocityMps},result:state,syntheticMapUnchanged:true,rainfallToFloodCalculated:false});
 }
 $('hazardLabForm').addEventListener('submit',event=>{event.preventDefault();update()});
 for(const id of ['hazardDepth','hazardVelocity'])$(id).addEventListener('input',update);
 update();return {get state(){return state}};
}
