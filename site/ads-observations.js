// Public contract shared by the exporter, build and browser. Never accept a private snapshot.
const ROOT_KEYS=['schemaVersion','targetId','generatedAt','lastSuccessAt','lastAttemptAt','status','records'];
const ROW_KEYS=['sourceRecordId','brand','platform','countryCode','copy','offer','cta','landingUrl','libraryUrl','publishDate','firstSeenAt','lastCapturedAt','mediaStatus'];
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))throw Error('Unexpected public ADS fields');}
function stamp(value,empty=false){if(empty&&value==='')return;if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||new Date(value).toISOString()!==value)throw Error('Invalid ADS timestamp');}
function text(value,max){if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)||/(?:\.ads-private|captures\/|\/Users\/|[A-Z]:\\|ou_[a-z0-9]{15}|oc_[a-z0-9]{15}|bearer\s|access[_-]?token|api[_-]?key|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i.test(value))throw Error('Unsafe public ADS text');}
export function publicAdLanding(value){
  if(typeof value!=='string')throw Error('Invalid landing');
  const u=new URL(value);
  if(u.protocol!=='https:'||u.hostname!=='us.mammotion.com'||u.port||u.username||u.password||u.hash||!/^\/(?:products\/[a-z0-9-]+|collections\/[a-z0-9-]+)?\/?$/.test(u.pathname))throw Error('Landing outside US scope');
  // Tracking, referral and signed query values are never exported.
  u.search='';return u.href;
}
export function validatePublicAdObservations(data){
  exact(data,ROOT_KEYS);
  if(data.schemaVersion!=='1.0'||data.targetId!=='meta-mammotion-us'||!['success','failed','needs_attention','unavailable'].includes(data.status))throw Error('Invalid public ADS scope/status');
  stamp(data.generatedAt);stamp(data.lastSuccessAt,true);stamp(data.lastAttemptAt,true);
  if(!Array.isArray(data.records)||data.records.length>200)throw Error('Invalid ADS inventory');
  if((data.records.length&&!data.lastSuccessAt)||Date.parse(data.lastAttemptAt)>Date.parse(data.generatedAt)||Date.parse(data.lastSuccessAt)>Date.parse(data.generatedAt))throw Error('Invalid public observation dates');
  const seen=new Set();
  for(const r of data.records){
    exact(r,ROW_KEYS);
    if(typeof r.sourceRecordId!=='string'||!/^\d{5,30}$/.test(r.sourceRecordId)||seen.has(r.sourceRecordId)||r.brand!=='Mammotion'||r.platform!=='meta'||r.countryCode!=='US'||r.mediaStatus!=='source_only')throw Error('Invalid or duplicate ADS observation');
    seen.add(r.sourceRecordId);
    text(r.copy,12000);text(r.offer,3000);text(r.cta,200);
    if(r.libraryUrl!==`https://www.facebook.com/ads/library/?id=${r.sourceRecordId}`||publicAdLanding(r.landingUrl)!==r.landingUrl)throw Error('Unsafe ADS URL');
    if(r.publishDate!==''&&(!/^\d{4}-\d\d-\d\d$/.test(r.publishDate)||new Date(r.publishDate).toISOString().slice(0,10)!==r.publishDate))throw Error('Invalid platform date');
    stamp(r.firstSeenAt,true);stamp(r.lastCapturedAt);
    if(Date.parse(r.firstSeenAt)>Date.parse(r.lastCapturedAt)||Date.parse(r.lastCapturedAt)>Date.parse(data.lastSuccessAt)||Date.parse(data.lastSuccessAt)>Date.parse(data.generatedAt))throw Error('Out-of-order ADS dates');
  }
  return data;
}
export function adObservationFreshness(data,now=Date.now()){
  if(!data?.lastSuccessAt)return '尚无成功采集记录';
  if(data.status==='failed'||data.status==='needs_attention')return '最近检查未完成，保留上次成功观察';
  return now-Date.parse(data.lastSuccessAt)>30*60000?'最近成功采集已超过 30 分钟，观察可能过期':'最近检查成功';
}
