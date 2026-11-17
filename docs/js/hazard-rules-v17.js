// Reproduction of AIDR Guideline 7-3, Table 2, printed p14 / PDF p20.
// General vulnerability classes; not a locally validated pedestrian safety rule.
export const HAZARD_METHOD={
 id:'aidr-guideline-7-3-table-2',version:'1.6-reproduction-1',
 title:'AIDR 일반 취약성 분류 연구',
 source:'https://knowledge.aidr.org.au/media/1891/guideline-7-3-technical-flood-risk-management.pdf',
 sourceLocation:'Table 2 · 인쇄 14쪽 / PDF 20쪽',
 localApplicabilityValidated:false,pedestrianSafetyValidated:false,
 boundaryConvention:'세 상한을 모두 충족하는 첫 범주. 경계값은 포함하며 부동소수점 비교 오차에만 8×Number.EPSILON 허용.',
 units:{depth:'m',velocity:'m/s',depthVelocity:'m²/s'},
 classes:[
  {id:'H1',maxDepthVelocity:.3,maxDepth:.3,maxVelocity:2},
  {id:'H2',maxDepthVelocity:.6,maxDepth:.5,maxVelocity:2},
  {id:'H3',maxDepthVelocity:.6,maxDepth:1.2,maxVelocity:2},
  {id:'H4',maxDepthVelocity:1,maxDepth:2,maxVelocity:2},
  {id:'H5',maxDepthVelocity:4,maxDepth:4,maxVelocity:4},
 ],
};
const within=(value,limit)=>value<=limit+8*Number.EPSILON*Math.max(1,Math.abs(value),Math.abs(limit));
export function classifyLiteratureHazard(input={}){
 const basis={methodId:HAZARD_METHOD.id,methodVersion:HAZARD_METHOD.version,localApplicabilityValidated:false,pedestrianSafetyValidated:false,mapApplied:false};
 if(!input||typeof input!=='object'||Array.isArray(input))return {...basis,status:'invalid',classId:null,depthVelocity:null,message:'수심·유속 입력 객체가 필요합니다.'};
 const {depthM,velocityMps}=input;
 if(depthM===null||depthM===undefined||velocityMps===null||velocityMps===undefined)return {...basis,status:'missing',classId:null,depthVelocity:null,message:'수심 또는 유속이 없습니다. 결측을 0으로 처리하지 않습니다.'};
 if(typeof depthM!=='number'||typeof velocityMps!=='number'||!Number.isFinite(depthM)||!Number.isFinite(velocityMps)||depthM<0||velocityMps<0)return {...basis,status:'invalid',classId:null,depthVelocity:null,message:'수심과 유속은 0 이상의 유한한 숫자여야 합니다.'};
 const depthVelocity=depthM*velocityMps;if(!Number.isFinite(depthVelocity))return {...basis,status:'invalid',classId:null,depthVelocity:null,message:'입력 곱이 계산 범위를 넘습니다.'};
 if(depthM===0)return {...basis,status:'dry-input',classId:null,depthM,velocityMps,depthVelocity,message:velocityMps>0?'수심 0 입력 · 등급 산정 제외. 양의 유속과 수심의 입력 정합을 확인하세요.':'수심 0 입력 · 침수 등급 산정과 분리합니다. 실제 건조 관측을 뜻하지 않습니다.'};
 const matched=HAZARD_METHOD.classes.find(c=>within(depthVelocity,c.maxDepthVelocity)&&within(depthM,c.maxDepth)&&within(velocityMps,c.maxVelocity));
 const classId=matched?.id||'H6';
 return {...basis,status:'classified',classId,depthM,velocityMps,depthVelocity,limits:matched||null,message:classId+' 문헌 계산 범주 · 실제 청계천 위험·보행 허용 판정 아님',tests:HAZARD_METHOD.classes.map(c=>({classId:c.id,depthVelocityWithin:within(depthVelocity,c.maxDepthVelocity),depthWithin:within(depthM,c.maxDepth),velocityWithin:within(velocityMps,c.maxVelocity)}))};
}
