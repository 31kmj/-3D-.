// Existing modeled river line only: camera heights and target Y are illustrative assumptions.
// The line's negative/positive direction is not an independently verified flow direction.
export function bridgeCameraCandidates(centerline,bridge){
 const point2=point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite);
 if(!Array.isArray(centerline)||centerline.length<2||!point2(bridge?.center)||!centerline.every(point2))return [];
 const segments=[];let total=0,best=null;
 for(let i=1;i<centerline.length;i++){
  const a=centerline[i-1],b=centerline[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
  if(!Number.isFinite(length))return [];
  if(length<1e-6)continue;
  const rawT=((bridge.center[0]-a[0])*dx+(bridge.center[1]-a[1])*dz)/(length*length);
  if(!Number.isFinite(rawT))return [];
  const t=Math.max(0,Math.min(1,rawT));
  const projected=[a[0]+dx*t,a[1]+dz*t],distance=Math.hypot(projected[0]-bridge.center[0],projected[1]-bridge.center[1]);
  if(!Number.isFinite(distance)||!Number.isFinite(distance*distance))return [];
  if(!best||distance<best.distance)best={distance,along:total+t*length};
  segments.push({a,b,length,start:total,end:total+length});total+=length;
 }
 if(!best||!Number.isFinite(total)||total<25)return [];
 function at(distance){
  const segment=segments.find(segment=>distance<segment.end)||segments.at(-1);
  const t=Math.max(0,Math.min(1,(distance-segment.start)/segment.length));
  return [segment.a[0]+(segment.b[0]-segment.a[0])*t,segment.a[1]+(segment.b[1]-segment.a[1])*t];
 }
 // Prefer the side with more available modeled line. Equal distances retain negative-first order.
 const offsets=[-110,110].map(requestedOffsetM=>{
  const along=Math.max(0,Math.min(total,best.along+requestedOffsetM));
  return {requestedOffsetM,along,actualOffsetM:along-best.along};
 }).filter(offset=>Math.abs(offset.actualOffsetM)>=20)
   .sort((a,b)=>Math.abs(b.actualOffsetM)-Math.abs(a.actualOffsetM));
 const candidates=[];
 // Lower presentation height first; a higher candidate is used only after both lower views.
 for(const height of [65,100])for(const offset of offsets){
  const point=at(offset.along);
  candidates.push({position:[point[0],height,point[1]],target:[bridge.center[0],0,bridge.center[1]],
   lineDirection:offset.requestedOffsetM<0?'negative':'positive',requestedOffsetM:offset.requestedOffsetM,
   actualOffsetM:offset.actualOffsetM,clampedAtEndpoint:Math.abs(offset.actualOffsetM-offset.requestedOffsetM)>1e-6,
   centerlineDistanceM:offset.along,modeledLineLengthM:total,bridgeProjectionDistanceM:best.along,bridgeOffsetFromLineM:best.distance,
   source:'scene_precision_v5.json / centerline',heightBasis:'표현용 가정',targetHeightBasis:'표현용 가정 Y=0',
   scope:'모델 평면선 카메라 후보, 실측/통행/충돌 검증 아님'});
 }
 return candidates;
}
