// A received rainfall observation is not a calibrated flood prediction.
export const LIVE_SCHEMA='cheonggye-live-rainfall/1';
export const KMA_SOURCE_URL='https://apihub.kma.go.kr/apiList.do?seqApi=2&seqApiSub=239';
const zonedTime=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
export function validateLiveSnapshot(snapshot,{nowMs=Date.now(),maxAgeMinutes=15}={}){
 const reject=reason=>({valid:false,reason});
 if(!Number.isFinite(nowMs)||!Number.isFinite(maxAgeMinutes)||maxAgeMinutes<=0)return reject('invalid-clock');
 if(!snapshot||snapshot.schema!==LIVE_SCHEMA||snapshot.provider!=='kma-aws-minute')return reject('unsupported-source');
 if(snapshot.status!=='ok')return reject(typeof snapshot.reason==='string'?snapshot.reason:'unavailable');
 if(snapshot.provenance!=='official-observation'||snapshot.authenticatedCallVerified!==true||snapshot.unit!=='mm'||snapshot.accumulationWindowMinutes!==60)return reject('invalid-observation-contract');
 if(typeof snapshot.stationId!=='string'||!/^\d{1,5}$/.test(snapshot.stationId)||Number(snapshot.stationId)===0)return reject('invalid-station');
 if(snapshot.requestedStationId!==snapshot.stationId)return reject('station-mismatch');
 if(!zonedTime(snapshot.observedAt)||!zonedTime(snapshot.fetchedAt))return reject('invalid-timestamp');
 const observed=Date.parse(snapshot.observedAt),fetched=Date.parse(snapshot.fetchedAt),ageMinutes=(nowMs-observed)/60000;
 if(observed>nowMs||fetched>nowMs||observed>fetched)return reject('future-timestamp');
 if(ageMinutes>maxAgeMinutes)return {valid:false,reason:'stale-observation',ageMinutes};
 if(typeof snapshot.rainfall60mMm!=='number'||!Number.isFinite(snapshot.rainfall60mMm)||snapshot.rainfall60mMm<0)return reject('invalid-rainfall');
 if(snapshot.rainfall60mMm>500)return reject('outside-prototype-range');
 if(snapshot.sourceURL!==KMA_SOURCE_URL)return reject('source-mismatch');
 return {valid:true,reason:null,ageMinutes,observation:{rainfall60mMm:snapshot.rainfall60mMm,observedAt:snapshot.observedAt,fetchedAt:snapshot.fetchedAt,stationId:snapshot.stationId,stationName:typeof snapshot.stationName==='string'?snapshot.stationName:'관측지점 '+snapshot.stationId,sourceURL:snapshot.sourceURL,stationSelectionVerified:snapshot.stationSelectionVerified===true}};
}
