// Presentation comparisons use completed map calculations, never invented samples.
export function presentationSnapshot(d){
 const r=d.result,a=d.inundationArea;
 if(d.mode!=='rainfall'||!r?.valid||r.provenance!=='manual-rainfall-prototype'||!a?.valid||
    !Number.isFinite(a.summary?.inundatedWalkwayAreaM2)||!Number.isFinite(a.stageM))return null;
 const key=JSON.stringify([r.graphId,r.boundaryContextKey,r.hazardPolicy?.key,
  d.facilityApplication?.contextKey,d.startId,[...(d.closedExitIds||[])].sort(),
  r.rainfall.durationMinutes,a.resolutionM,a.summary.walkwayAreaM2]);
 return {key,intensity:r.rainfall.intensityMmH,duration:r.rainfall.durationMinutes,
  area:a.summary.inundatedWalkwayAreaM2,stage:a.stageM,route:d.route?.status==='route'?{
   exit:d.route.exit.name,length:d.route.lengthM,edgeIds:[...d.route.edgeIds]}:null};
}

export function routeComparisonReason(reference,d){
 const current=presentationSnapshot(d);
 if(!current||!reference||current.key!==reference.key)return '';
 if(!current.route)return d.route?.reason||'현재 조건에서 통과 가능한 대피로가 없습니다.';
 if(!reference.route)return '기준 조건에서는 경로가 없었고, 현재 조건에서는 통과 가능한 경로가 계산됐습니다.';
 const changed=reference.route.exit!==current.route.exit;
 const hazards=d.hazardApplication?.edges||{};
 const excluded=reference.route.edgeIds.filter(id=>hazards[id]?.blocked).length;
 if(changed&&excluded)return `기준 경로의 보행 ${excluded}구간이 위험·미확인으로 제외되어 다른 출구로 우회합니다.`;
 const caution=reference.route.edgeIds.filter(id=>hazards[id]?.code==='wet').length;
 if(changed&&caution)return `현재 강우에서 기준 경로에 주의 ${caution}구간이 있습니다. 노랑×3의 위험가중거리와 출구 조건으로 출구를 다시 선택했습니다.`;
 if(changed)return '주의구간의 가중비용과 출구 조건을 다시 비교해 목적지가 변경됐습니다.';
 return '현재도 같은 출구가 선택됩니다. 빨강·미확인은 제외하고 초록×1·노랑×3의 위험가중거리를 비교합니다.';
}
