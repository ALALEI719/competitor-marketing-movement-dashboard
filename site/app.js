const market=document.querySelector('#market-filter');
const brand=document.querySelector('#brand-filter');
const channel=document.querySelector('#channel-filter');
let evidenceIndex={entries:{}};
let edmDetailIndex={items:[]};
let formalActionState=[];
let siteObservationState=[];
let monitorSummaryState=null;
let marketingEventState=[];
let moduleTimes={};
let currentView='overview';
const workflowRoot='https://github.com/ALALEI719/competitor-marketing-movement-tracking/actions/workflows/';
function displayTime(value){return value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'}):'尚无记录';}
function matchesScope(item,filters={market:market.value,brand:brand.value}){
  const countries=item.countries||[item.country];
  return (filters.market==='全部'||countries.includes(filters.market))&&(filters.brand==='全部'||item.brand===filters.brand);
}
function safePublicUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
function canonicalReviewUrl(value){const safe=safePublicUrl(value);if(!safe)return '';const u=new URL(safe);u.search='';u.hash='';return u.href.replace(/\/$/,'');}
function uniquePending(items){const seen=new Set();return (items||[]).filter(item=>{if(item.reviewStatus!=='pending'||!item.recordId||seen.has(item.recordId))return false;seen.add(item.recordId);return true;});}
function reviewGroups(summary){return [
  {channel:'官网',workflow:'review-site-record.yml',records:uniquePending(summary?.pendingRecords)},
  {channel:'Blog',workflow:'review-channel-record.yml',records:uniquePending(summary?.channelMonitoring?.pendingRecords)},
  {channel:'PR',workflow:'review-pr-record.yml',records:uniquePending(summary?.prMonitoring?.pendingRecords||summary?.prMonitoring?.recentRecords)}
];}
function edmDay(value){return value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date(value)):'';}
function selectEdmItems(items,filters){
  const query=(filters.query||'').trim().toLocaleLowerCase();
  return items.filter(item=>(filters.brand==='全部'||item.brand===filters.brand)&&(filters.market==='全部'||item.country===filters.market)
    &&(!filters.from||(edmDay(item.sentAt)&&edmDay(item.sentAt)>=filters.from))&&(!filters.to||(edmDay(item.sentAt)&&edmDay(item.sentAt)<=filters.to))
    &&(!query||[item.subject,item.summary,item.brand,item.country].join(' ').toLocaleLowerCase().includes(query)))
    .sort((a,b)=>(Date.parse(b.sentAt)||0)-(Date.parse(a.sentAt)||0)||String(a.recordId||a.actionId).localeCompare(String(b.recordId||b.actionId)));
}
function renderCurrentEdm(){
  const filters={brand:document.querySelector('#edm-brand-filter').value,market:document.querySelector('#edm-market-filter').value,from:document.querySelector('#edm-date-from').value,to:document.querySelector('#edm-date-to').value,query:document.querySelector('#edm-search').value};
  const items=edmDetailIndex.items||[];
  if(filters.from&&filters.to&&filters.from>filters.to){document.querySelector('#edm-content-list').innerHTML='<div class="timeline-empty">开始日期不能晚于结束日期。</div>';document.querySelector('#edm-result-count').textContent='日期范围需调整';return;}
  const selected=selectEdmItems(items,filters);document.querySelector('#edm-result-count').textContent=`${selected.length} / ${items.length} 封`;
  renderEdmLibrary(selected);
  if(!selected.length&&items.length)document.querySelector('#edm-content-list').innerHTML='<div class="timeline-empty">当前筛选下没有邮件，请调整品牌、国家、日期或搜索词。</div>';
}

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function brandKind(item){return item.brandRole==='own'||item.brand==='Navimow'?'自有品牌':'竞品';}

async function fetchDashboardJson(url){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(url,{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }finally{clearTimeout(timeout);}
}

async function loadEvidenceIndex(){
  try{
    return await fetchDashboardJson('./data/evidence/index.json');
  }catch{return {entries:{}};}
}

async function loadFormalActions(){
  try{
    return await fetchDashboardJson('./data/formal-actions.json');
  }catch(error){return {actions:[],loadError:error.message};}
}

async function loadMarketingEvents(){
  try{
    return await fetchDashboardJson('./data/marketing-events.json');
  }catch(error){return {events:[],loadError:error.message};}
}

async function loadEdmDetailIndex(){
  try{
    return await fetchDashboardJson('./data/edm-details/index.json');
  }catch(error){return {items:[],loadError:error.message};}
}

function renderEdmLibrary(items){
  const container=document.querySelector('#edm-content-list');
  container.innerHTML=items.length?items.map((item,index)=>`<button class="edm-content-card ${brandKind(item)==='自有品牌'?'own-brand':''}" data-edm-detail="${index}"><small>${escapeHtml(item.brand)} · ${brandKind(item)} · ${escapeHtml(item.country)} · ${item.sentAt?escapeHtml(new Date(item.sentAt).toLocaleDateString('zh-CN')):'日期待确认'}</small><strong>${escapeHtml(item.subject)}</strong><span>${escapeHtml(item.summary)}</span></button>`).join(''):'<div class="timeline-empty">尚无完成内容识别和人工复核的真实 EDM；待审及验收邮件不会提前展示在公开看板。</div>';
  container.querySelectorAll('[data-edm-detail]').forEach(button=>button.onclick=()=>showEdmDetail(items[Number(button.dataset.edmDetail)]));
}

async function loadEdmLibrary(){
  edmDetailIndex=await loadEdmDetailIndex();
  if(edmDetailIndex.loadError){
    document.querySelector('#edm-result-count').textContent='读取失败';
    document.querySelector('#edm-content-list').innerHTML='<div class="timeline-empty">邮件内容暂时读取失败。<button class="secondary compact" id="retry-edm-library">重新读取</button></div>';
    document.querySelector('#retry-edm-library').onclick=loadEdmLibrary;
    return;
  }
  renderCurrentEdm();
  moduleTimes.edm=edmDetailIndex.updatedAt;renderFreshness();
}

function safeEdmDetailRef(value){return /^\.\/data\/edm-details\/EDM-[A-Z0-9]+\.json$/.test(value||'')?value:'';}
function safeEdmAssetPath(value){return /^\.\/data\/edm-assets\/EDM-[A-Z0-9]+\/image-\d{2}\.(?:png|jpe?g|gif|webp|avif)$/.test(value||'')?value:'';}

async function edmMailMarkup(reference){
  const detailRef=safeEdmDetailRef(reference);
  if(!detailRef)return '<div class="evidence">邮件详情尚未通过安全复核。</div>';
  try{
    const detail=await fetchDashboardJson(detailRef);
    const images=(detail.images||[]).map(item=>{const src=safeEdmAssetPath(item.src);return src?`<figure><img loading="lazy" src="${escapeHtml(src)}" alt="${escapeHtml(item.description||'EDM 营销图片')}"><figcaption>${escapeHtml(item.description||'')}</figcaption></figure>`:'';}).join('');
    return `<article class="edm-mail"><div class="edm-mail-header"><small>${escapeHtml(detail.brand)} · ${brandKind(detail)} · ${escapeHtml(detail.country)} · ${detail.sentAt?escapeHtml(new Date(detail.sentAt).toLocaleDateString('zh-CN')):'日期待确认'}</small><h3>${escapeHtml(detail.subject)}</h3></div><div class="edm-mail-summary"><strong>营销动作概括：</strong>${escapeHtml(detail.contentSummary)}</div><div class="edm-mail-body">${(detail.bodyParagraphs||[]).map(paragraph=>`<p>${escapeHtml(paragraph)}</p>`).join('')}</div><div class="edm-mail-images">${images}</div><div class="edm-mail-note">邮件图片为留存副本；促销按钮不可点击，原始追踪链接与收件信息不展示。</div></article>`;
  }catch{return '<div class="evidence">邮件详情暂时无法读取，请稍后重试。</div>';}
}

async function showEdmDetail(item){
  if(!item)return;
  document.querySelector('#detail-title').textContent='EDM 邮件内容';
  document.querySelector('#dialog-content').innerHTML='<div class="timeline-empty">正在读取邮件内容…</div>';
  document.querySelector('#detail-dialog').showModal();
  document.querySelector('#dialog-content').innerHTML=await edmMailMarkup(item.detailRef);
}

function channelLabel(channel){return ({official_site:'官网',pr:'PR',blog:'Blog',social_ads:'社媒广告',video:'视频',edm:'EDM'})[channel]||channel;}
function stageLabel(stage){return ({not_launch_related:'非新品阶段',weak_signal:'弱信号',multi_source_candidate:'多源候选',confirmed_preheat:'确认预热',model_confirmed:'型号确认',teaser:'预热',announcement:'官宣',preorder:'预售',launched:'发布',on_sale:'开售',promotion:'促销',reputation:'口碑'})[stage]||stage;}

function reviewLabel(status){return ({pending:'待复核',approved:'已确认',rejected:'已驳回'})[status]||status;}
function newProductLabel(value){return ({related:'新品相关',not_related:'非新品',uncertain:'待判断'})[value]||'待判断';}
function themeLabel(value){return ({product_launch:'新品发布',product_education:'产品教育',promotion:'促销',event_or_partnership:'活动/合作',reputation_or_proof:'口碑/背书',brand_or_corporate:'品牌/企业',other:'其他',unclassified:'待分类'})[value]||'待分类';}
function renderChannelMonitoring(monitoring){
  const sources=(monitoring?.sources||[]).filter(item=>matchesScope(item.source));
  const healthy=sources.filter(item=>item.status==='ok').length;
  document.querySelector('#channel-source-status').textContent=sources.length?`${healthy}/${sources.length} 最近采集成功`:'当前筛选无已接入来源';
  document.querySelector('#channel-source-status').className=`badge ${sources.length&&healthy===sources.length?'green':'orange'}`;
  document.querySelector('#channel-source-list').innerHTML=sources.length?sources.map(item=>`<a class="channel-source-card ${item.status==='ok'?'healthy':'error'}" href="${escapeHtml(item.source.url)}" target="_blank" rel="noreferrer"><div><strong>${escapeHtml(item.source.country)} · ${escapeHtml(channelLabel(item.source.channel))}</strong><span>${item.status==='ok'?`${item.itemCount} 条基线内容`:`采集异常：${escapeHtml(item.error||'未知错误')}`}</span></div><em>${item.status==='ok'?'正常':'需排查'}</em></a>`).join(''):'<div class="coverage-loading">尚未建立渠道基线</div>';
  const records=(monitoring?.recentRecords||monitoring?.pendingRecords||[]).filter(item=>matchesScope(item)).sort((a,b)=>Date.parse(b.discoveredAt)-Date.parse(a.discoveredAt));
  document.querySelector('#channel-record-list').innerHTML=records.length?records.slice(0,12).map(item=>{const system=item.systemAssessment||{};const human=item.humanAssessment;const relation=human?.newProductRelation||system.newProductRelation||'uncertain';const priority=system.monitoringPriority===null||system.monitoringPriority===undefined?'':` · 优先级 ${Number(system.monitoringPriority).toFixed(1)}/4`;return `<article><a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.country)} · ${item.changeType==='content_updated'?'文章更新':'新文章'} · ${item.publishDate?new Date(item.publishDate).toLocaleDateString('zh-CN'):'发布日期待确认'}</span></a><div class="channel-tags"><em class="channel-tag ${escapeHtml(relation)}">${escapeHtml(newProductLabel(relation))}</em><em class="channel-tag">${escapeHtml(themeLabel(system.marketingTheme))}${escapeHtml(priority)}</em><em class="channel-tag ${escapeHtml(item.reviewStatus)}">${human?'已完成二次判断':'待二次判断'}</em></div><small><code>${escapeHtml(item.recordId)}</code> · <a href="https://github.com/ALALEI719/competitor-marketing-movement-tracking/actions/workflows/review-channel-record.yml" target="_blank" rel="noreferrer">${human?'查看复核入口':'进行二次判断'}</a></small></article>`;}).join(''):'<div class="timeline-empty">当前筛选下没有 Blog 变化记录。</div>';
}
function renderPrMonitoring(monitoring){
  const sources=(monitoring?.sources||[]).filter(item=>matchesScope(item.source));
  const healthy=sources.filter(item=>item.status==='ok').length;
  const prThemeLabels={product_launch:'新品发布',review:'评测',promotion:'促销',event:'活动',award:'获奖',partnership:'合作',other:'待归类'};
  document.querySelector('#pr-source-status').textContent=sources.length?`${healthy}/${sources.length} 最近采集成功`:'当前筛选无已接入来源';
  document.querySelector('#pr-source-status').className=`badge ${sources.length&&sources.length&&healthy===sources.length?'green':'orange'}`;
  document.querySelector('#pr-source-list').innerHTML=sources.length?sources.map(item=>`<a class="channel-source-card ${item.status==='ok'?'healthy':'error'}" href="${escapeHtml(item.source.url)}" target="_blank" rel="noreferrer"><div><strong>${escapeHtml(item.source.outlet||item.source.brand)} · ${escapeHtml(item.source.country)} · PR</strong><span>${item.status==='ok'?item.discoveredUrlCount?`${item.discoveredUrlCount} 个文章 URL · ${item.itemCount} 条相关内容`:`${item.itemCount} 条相关内容基线`:`采集异常：${escapeHtml(item.error||'未知错误')}`}</span></div><em>${item.status==='ok'?'正常':'需排查'}</em></a>`).join(''):'<div class="coverage-loading">媒体试点来源待核验；Newsroom 入口待确定。</div>';
  const records=(monitoring?.recentRecords||[]).filter(item=>matchesScope(item)).sort((a,b)=>Date.parse(b.discoveredAt)-Date.parse(a.discoveredAt));
  document.querySelector('#pr-record-list').innerHTML=records.length?records.slice(0,12).map(item=>`<article><a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.outlet||item.brand)} · ${escapeHtml(item.country)} · ${item.changeType==='content_updated'?'内容更新':item.changeType==='new_coverage'?'新媒体报道':'新新闻稿'} · ${item.publishDate?escapeHtml(item.publishDate.slice(0,10)):'发布日期待确认'}</span></a><div class="channel-tags"><em class="channel-tag ${escapeHtml(item.reviewStatus)}">${escapeHtml(reviewLabel(item.reviewStatus))}</em><em class="channel-tag">主题初筛：${escapeHtml((item.themeAssessment?.tags||['other']).map(tag=>prThemeLabels[tag]||'待归类').join('／'))}</em><em class="channel-tag">页面证据 ${escapeHtml(item.evidence?.contentHash?.slice(0,12)||'待补')}</em></div><small><code>${escapeHtml(item.recordId)}</code> · <a href="https://github.com/ALALEI719/competitor-marketing-movement-tracking/actions/workflows/review-pr-record.yml" target="_blank" rel="noreferrer">人工复核入口</a></small></article>`).join(''):'<div class="timeline-empty">当前筛选下暂无 PR 变化；来源首次采集只建基线。</div>';
}
function renderReviewQueue(candidates){
  candidates=candidates.filter(item=>matchesScope(item));
  document.querySelector('[data-review-candidates]').hidden=!['全部','官网'].includes(channel.value);
  const pending=candidates.filter(item=>item.reviewStatus==='pending').length;
  document.querySelector('#review-pending-count').textContent=`${pending} 个待复核`;
  document.querySelector('#review-queue-body').innerHTML=candidates.length?candidates.map(item=>`<tr><td><code>${escapeHtml(item.entityId)}</code></td><td>${escapeHtml(item.brand)} · ${escapeHtml((item.countries||[]).join(' / '))}</td><td>${escapeHtml(new Date(item.firstSeenAt).toLocaleString('zh-CN',{hour12:false}))}</td><td>${item.confidenceScore}</td><td><span class="review-status ${escapeHtml(item.reviewStatus)}">${reviewLabel(item.reviewStatus)}</span></td><td><button class="secondary compact" data-review-candidate="${escapeHtml(item.entityId)}">查看证据</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty-cell">当前没有新品候选</td></tr>';
  document.querySelectorAll('[data-review-candidate]').forEach(button=>button.onclick=()=>showCandidate(candidates.find(item=>item.entityId===button.dataset.reviewCandidate)));
}

function renderFormalActions(actions){
  document.querySelector('#formal-action-count').textContent=`${actions.length} 条`;
  document.querySelector('#formal-action-table').innerHTML=actions.length?actions.map((action,index)=>`<tr data-formal-action="${index}"><td>${escapeHtml(new Date(action.discoveredAt).toLocaleString('zh-CN',{hour12:false}))}</td><td><span class="pill ${brandKind(action)==='自有品牌'?'own-brand':''}">${escapeHtml(action.brand)}${brandKind(action)==='自有品牌'?' · 自有品牌':''}</span>　${escapeHtml(action.country)}</td><td>${escapeHtml(channelLabel(action.channel))}</td><td>${escapeHtml(action.title)}</td><td>${escapeHtml(stageLabel(action.stage))}</td><td><span class="review-status approved">已复核</span></td></tr>`).join(''):'<tr><td colspan="6" class="empty-cell">当前筛选下没有已确认动作</td></tr>';
  document.querySelectorAll('[data-formal-action]').forEach(row=>row.onclick=()=>showFormalAction(actions[Number(row.dataset.formalAction)]));
}

function safeObservationUrl(value){
  try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='www.ecovacs.com'&&url.pathname.startsWith('/us/')?url.href:'';}catch{return '';}
}
function observationFieldLabel(field){return ({title:'标题',description:'描述',headings:'页面标题',cta:'按钮文案',offer:'优惠文字',price:'价格',currency:'币种',availability:'库存状态',product_name:'商品名称',body:'正文'})[field]||field;}
function observationValue(value){const text=Array.isArray(value)?value.join('、'):String(value??'');return escapeHtml(text.length>180?`${text.slice(0,180)}…`:text||'无');}
function observationChangeMarkup(record){
  if(record.type==='page_added')return '<span class="observation-type">来源清单新增链接</span>';
  if(record.type==='page_missing_from_sources')return '<span class="observation-type">来源清单暂未发现该链接</span>';
  const fields=Object.entries(record.fields||{});
  return fields.length?fields.map(([field,pair])=>field==='body'
    ?'<span class="observation-change"><b>正文</b> 内容有变化</span>'
    :`<span class="observation-change"><b>${escapeHtml(observationFieldLabel(field))}</b> ${observationValue(pair.before)} <span aria-label="变为">→</span> ${observationValue(pair.after)}${field==='price'?' USD':''}</span>`).join('')
    :'<span class="observation-type">页面字段有变化</span>';
}
function renderCurrentSiteObservations(){
  const filtered=siteObservationState.filter(item=>(market.value==='全部'||item.country===market.value)
    &&(brand.value==='全部'||item.brand===brand.value)
    &&(channel.value==='全部'||channel.value==='官网'));
  document.querySelector('#site-observation-count').textContent=`${filtered.length} 条变化`;
  document.querySelector('#site-observation-table').innerHTML=filtered.length?filtered.slice(0,100).map(item=>{
    const url=safeObservationUrl(item.url);
    return `<tr><td>${escapeHtml(new Date(item.observedAt).toLocaleString('zh-CN',{hour12:false}))}</td><td>${escapeHtml(item.brand)} · ${escapeHtml(item.country)}</td><td>${escapeHtml(item.title||item.url||'未知页面')}</td><td><div class="observation-changes">${observationChangeMarkup(item)}</div></td><td>${url?`<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">查看官网</a>`:'来源不可用'}</td></tr>`;
  }).join(''):'<tr><td colspan="5" class="empty-cell">当前筛选下暂无网页变化记录。</td></tr>';
}
async function loadSiteObservations(){
  try{const data=await fetchDashboardJson('./data/site-observations.json');siteObservationState=data.observations||[];moduleTimes.observations=data.generatedAt;document.querySelector('#site-observation-checked-at').textContent=`最近检查：${displayTime(data.generatedAt)}`;renderCurrentSiteObservations();renderFreshness();}
  catch{document.querySelector('#site-observation-count').textContent='暂不可用';document.querySelector('#site-observation-checked-at').textContent='最近检查时间不可用';document.querySelector('#site-observation-table').innerHTML='<tr><td colspan="5" class="empty-cell">网页变化记录暂时无法读取。</td></tr>';}
}

function renderFormalTimeline(actions){
  const container=document.querySelector('#formal-timeline');
  const axis=document.querySelector('#formal-timeline-axis');
  if(!actions.length){axis.innerHTML='';container.innerHTML='<div class="timeline-empty">当前筛选下没有已确认动作。</div>';return;}
  const times=actions.map(action=>new Date(action.discoveredAt).getTime());
  const min=Math.min(...times),max=Math.max(...times),span=Math.max(max-min,24*60*60*1000);
  const format=value=>new Date(value).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'});
  axis.innerHTML=`<span>${format(min)}</span><span>${format(min+span/2)}</span><span>${format(max)}</span>`;
  container.innerHTML=actions.map((action,index)=>{const time=new Date(action.discoveredAt).getTime();const position=((time-min)/span)*100;const own=brandKind(action)==='自有品牌';return `<div class="lane formal-action-lane ${own?'own-brand':''}" data-action-id="${escapeHtml(action.actionId)}"><div class="lane-label"><strong>${escapeHtml(action.brand)} · ${escapeHtml(action.country)}${own?' · 自有':''}</strong><span title="${escapeHtml(action.title)}">${escapeHtml(action.title)}</span></div><div class="track"><button class="formal-event ${escapeHtml(action.channel)}" data-formal-timeline="${index}" style="--point-position:${position}%" title="${escapeHtml(action.title)}"><span class="formal-event-date">${escapeHtml(format(time))}</span><span>${escapeHtml(stageLabel(action.stage))} · ${escapeHtml(channelLabel(action.channel))}</span></button></div></div>`;}).join('');
  document.querySelectorAll('[data-formal-timeline]').forEach(button=>button.onclick=()=>showFormalAction(actions[Number(button.dataset.formalTimeline)]));
}

function filteredFormalActions(){
  return formalActionState.filter(action=>(market.value==='全部'||action.country===market.value)
    &&(brand.value==='全部'||action.brand===brand.value)
    &&(channel.value==='全部'||channelLabel(action.channel)===channel.value));
}

function renderCurrentFormalActions(){
  const actions=filteredFormalActions();
  renderFormalActions(actions);
  renderFormalTimeline(actions);
}

function scopedEvents(events,actions,filters={market:market.value,brand:brand.value,channel:channel.value}){
  const byId=new Map(actions.map(a=>[a.actionId,a]));
  return events.map(event=>{
    const visible=(event.actionIds||[]).map(id=>byId.get(id)).filter(a=>a&&matchesScope(a,filters)&&(filters.channel==='全部'||channelLabel(a.channel)===filters.channel));
    return {...event,actionCount:visible.length,totalActionCount:event.actionCount,countries:[...new Set(visible.map(a=>a.country))],channels:[...new Set(visible.map(a=>a.channel))],stages:[...new Set(visible.map(a=>a.stage).filter(Boolean))]};
  }).filter(event=>event.actionCount>0);
}
function renderEventClusters(events){
  events=scopedEvents(events,formalActionState);
  document.querySelector('#event-cluster-list').innerHTML=events.length?events.map(event=>`<article class="event-card"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.countries.join(' / '))}</span><p>${event.actionCount} 个筛选内动作${event.actionCount!==event.totalActionCount?`（事件共 ${event.totalActionCount} 个）`:""} · ${escapeHtml(event.channels.map(channelLabel).join(' + '))}</p><em>${escapeHtml(event.stages.map(stageLabel).join(' → '))}</em></article>`).join(''):'<div class="timeline-empty">当前没有可聚合的营销事件；独立 Blog 动作仍会显示在正式时间线中。</div>';
}

async function loadActionData(){
  const formalActions=await loadFormalActions();
  if(formalActions.loadError){
    document.querySelector('#formal-action-count').textContent='读取失败';
    document.querySelector('#formal-timeline-axis').innerHTML='';
    document.querySelector('#formal-timeline').innerHTML='<div class="timeline-empty">正式动作暂时读取失败。<button class="secondary compact retry-actions">重新读取</button></div>';
    document.querySelector('#formal-action-table').innerHTML='<tr><td colspan="6">正式动作暂时读取失败。<button class="secondary compact retry-actions">重新读取</button></td></tr>';
    document.querySelectorAll('.retry-actions').forEach(button=>button.onclick=loadActionData);
  }else{
    formalActionState=formalActions.actions||[];moduleTimes.actions=formalActions.updatedAt;
    renderCurrentFormalActions();renderEventClusters(marketingEventState);renderFreshness();
  }
}

async function loadEventData(){
  const marketingEvents=await loadMarketingEvents();
  if(marketingEvents.loadError){
    document.querySelector('#event-cluster-list').innerHTML='<div class="timeline-empty">跨渠道事件暂时读取失败。<button class="secondary compact" id="retry-actions-events">重新读取</button></div>';
    document.querySelector('#retry-actions-events').onclick=loadEventData;
  }else {marketingEventState=marketingEvents.events||[];renderEventClusters(marketingEventState);}
}

async function loadMonitorSummary(){
  try{
    const [summary,evidence]=await Promise.all([fetchDashboardJson('./data/monitor-summary.json'),loadEvidenceIndex()]);
    evidenceIndex=evidence;
    monitorSummaryState=summary;
    renderScopedDashboard();
  }catch(error){
    document.querySelector('#baseline-status').textContent='数据不可用';
    document.querySelector('#coverage-grid').innerHTML=`<div class="coverage-loading">真实基线暂时无法读取：${error.message}</div>`;
    document.querySelector('#data-updated-at').textContent='真实数据尚未加载';
    document.querySelector('#radar-count').textContent='数据不可用';
    document.querySelector('#radar-list').innerHTML='<div class="coverage-loading">新品雷达数据暂时无法读取</div>';
    document.querySelector('#review-total-count').textContent='队列读取失败';
    document.querySelector('#review-record-groups').textContent='复核数据暂不可用，请刷新重试。';
    renderChannelMonitoring(null);renderPrMonitoring(null);
  }
}

function renderFreshness(){
  const summary=monitorSummaryState;
  const sourceNote=(sources)=>{const scoped=(sources||[]).filter(i=>matchesScope(i.source||i.site));const ok=scoped.filter(i=>i.status==='ok').length;return scoped.length?`${ok}/${scoped.length} 最近采集成功`:'当前筛选无已接入来源';};
  const entries=[
    {name:'官网',time:summary?.generatedAt,note:sourceNote(summary?.sites),channel:'官网'},
    {name:'网页观察',time:moduleTimes.observations,note:'客观变化与正式动作分开',channel:'官网'},
    {name:'Blog',time:summary?.channelMonitoring?.checkedAt,note:sourceNote(summary?.channelMonitoring?.sources),channel:'Blog'},
    {name:'PR',time:summary?.prMonitoring?.checkedAt,note:sourceNote(summary?.prMonitoring?.sources),channel:'PR'},
    {name:'正式动作',time:moduleTimes.actions,note:'最近复核数据更新；不是重新采集全部来源'},
    {name:'EDM',time:moduleTimes.edm||moduleTimes.actions,note:`${(edmDetailIndex.items||[]).filter(item=>matchesScope(item)).length} 封已收录；发信时间见邮件卡片`,channel:'EDM'},
    {name:'广告',note:'仅认证内部试运行，公开页无采集状态',channel:'社媒广告'}
  ];
  document.querySelector('#module-freshness').innerHTML=entries.filter(e=>!e.channel||channel.value==='全部'||e.channel===channel.value).map(e=>`<div class="freshness-card"><strong>${escapeHtml(e.name)}</strong><time>${escapeHtml(e.name==='广告'?'内部页面独立展示':displayTime(e.time))}</time><span>${escapeHtml(e.note)}</span></div>`).join('');
  const times=[summary?.generatedAt,summary?.channelMonitoring?.checkedAt,summary?.prMonitoring?.checkedAt,...Object.values(moduleTimes)].map(v=>Date.parse(v)).filter(Number.isFinite);
  if(times.length)document.querySelector('#data-updated-at').textContent=`最近数据更新 ${displayTime(new Date(Math.max(...times)).toISOString())}（北京时间）`;
}
function renderReviewInbox(){
  const all=reviewGroups(monitorSummaryState),groups=all.filter(g=>channel.value==='全部'||channel.value===g.channel).map(g=>({...g,records:g.records.filter(item=>matchesScope(item))}));
  const candidates=(monitorSummaryState?.productRadar?.candidates||[]).filter(c=>c.reviewStatus==='pending'&&matchesScope(c)&&['全部','官网'].includes(channel.value));
  const total=groups.reduce((n,g)=>n+g.records.length,0)+candidates.length;
  document.querySelector('#review-total-count').textContent=`${total} 条待审记录`;
  document.querySelector('#review-module-counts').textContent=[...groups.map(g=>`${g.channel} ${g.records.length}`),...(['全部','官网'].includes(channel.value)?[`新品候选 ${candidates.length}`]:[])].join(' · ')+'；同页多次观察分别计数';
  const related=new Map();for(const g of all)for(const item of g.records){const key=[item.brand,item.country,canonicalReviewUrl(item.url||item.sourceUrl)].join('|');related.set(key,(related.get(key)||0)+1);}
  document.querySelector('#review-record-groups').innerHTML=groups.length?groups.map(g=>`<section class="review-group"><h3>${escapeHtml(g.channel)} · ${g.records.length} 条待审</h3>${g.records.length?`<div class="table-wrap"><table><thead><tr><th>编号 / 关联</th><th>品牌 / 国家</th><th>发现时间</th><th>记录</th><th>复核入口</th></tr></thead><tbody>${g.records.map((item,index)=>{
    const key=[item.brand,item.country,canonicalReviewUrl(item.url||item.sourceUrl)].join('|'),count=related.get(key)||1;
    return `<tr><td><code>${escapeHtml(item.recordId)}</code>${count>1?`<small>同页 ${count} 条观察</small>`:''}</td><td>${escapeHtml(item.brand)} · ${escapeHtml(item.country)}</td><td>${escapeHtml(displayTime(item.discoveredAt))}</td><td><button class="review-record-button" data-review-channel="${g.channel}" data-review-index="${index}">${escapeHtml(item.title||item.url||item.summary||'查看记录')}</button></td><td><button class="secondary compact" data-copy-record="${escapeHtml(item.recordId)}">复制编号</button> <a href="${workflowRoot+g.workflow}" target="_blank" rel="noreferrer">进入复核</a></td></tr>`;
  }).join('')}</tbody></table></div>`:'<p class="timeline-empty">当前筛选下没有待审记录。</p>'}</section>`).join(''):'<div class="timeline-empty">该渠道没有公开待审队列。广告待核验线索请在认证内部看板查看。</div>';
  document.querySelectorAll('[data-review-channel]').forEach(button=>button.onclick=()=>{const group=groups.find(g=>g.channel===button.dataset.reviewChannel);showReviewRecord(group.records[Number(button.dataset.reviewIndex)],group.channel);});
  document.querySelectorAll('[data-copy-record]').forEach(button=>button.onclick=async()=>{try{await navigator.clipboard.writeText(button.dataset.copyRecord);button.textContent='已复制';}catch{button.textContent='请选中编号复制';}});
}
function showReviewRecord(record,channelName){
  const source=safePublicUrl(record.url||record.sourceUrl),evidence=record.contentEvidence||{};
  document.querySelector('#detail-title').textContent=`${channelName} 待审记录`;
  document.querySelector('#dialog-content').innerHTML=`<dl><dt>编号</dt><dd><code>${escapeHtml(record.recordId)}</code></dd><dt>品牌 / 国家</dt><dd>${escapeHtml(record.brand)} · ${escapeHtml(record.country)}</dd><dt>发现时间</dt><dd>${escapeHtml(displayTime(record.discoveredAt))}</dd><dt>发布日期</dt><dd>${escapeHtml(displayTime(record.publishDate))}</dd><dt>变化类型</dt><dd>${escapeHtml(record.changeType||record.type||'待核对')}</dd><dt>摘要</dt><dd>${escapeHtml(record.summary||'请核读原始证据')}</dd><dt>证据状态</dt><dd>${escapeHtml(evidence.status||'见现有复核流程')}${evidence.changedFields?.length?' · '+escapeHtml(evidence.changedFields.map(observationFieldLabel).join('、')):''}</dd></dl>${source?`<p><a href="${escapeHtml(source)}" target="_blank" rel="noreferrer">查看原页面</a></p>`:''}<p class="evidence">系统初判与复核结论分别保存；查看本记录不会批准、驳回或合并其他观察。</p>`;
  document.querySelector('#detail-dialog').showModal();
}
function renderScopedDashboard(){
  const summary=monitorSummaryState;if(!summary)return;
  document.querySelectorAll('[data-dashboard-channel]').forEach(panel=>panel.hidden=channel.value!=='全部'&&panel.dataset.dashboardChannel!==channel.value);
  document.querySelector('#overview-filter-empty').hidden=['全部','官网','Blog','PR'].includes(channel.value);
  document.querySelector('#filter-scope').textContent=`当前范围：${brand.value}品牌 · ${market.value}国家 · ${channel.value}渠道。来源、记录和统计采用同一筛选；正式动作与待审记录分别计数。`;
  const sites=summary.sites.filter(item=>matchesScope(item.site));
  document.querySelector('#real-healthy').textContent=sites.length?`${sites.filter(s=>s.status==='ok').length}/${sites.length}`:'0 个来源';
  document.querySelector('#real-pages').textContent=sites.reduce((n,s)=>n+s.pageCount,0).toLocaleString('zh-CN');
  document.querySelector('#real-pending').textContent=uniquePending(summary.pendingRecords).filter(item=>matchesScope(item)).length;
  document.querySelector('#baseline-status').textContent=sites.length?(sites.every(s=>s.status==='ok')?'最近采集成功':'部分来源异常'):'当前筛选无已接入来源';
  document.querySelector('#baseline-status').className=`badge ${sites.length&&sites.every(s=>s.status==='ok')?'green':'orange'}`;
  document.querySelector('#coverage-grid').innerHTML=sites.length?sites.map(site=>`<a class="coverage-card" href="${escapeHtml(site.site.siteUrl)}" target="_blank" rel="noreferrer"><span><b>${escapeHtml(site.site.country)}</b><small>${escapeHtml(site.site.countryCode)} · ${escapeHtml(site.site.priority)}</small></span><strong>${site.pageCount}</strong><p>产品 ${site.breakdown.product||0} · Blog ${site.breakdown.blog||0} · 集合页 ${site.breakdown.collection||0}</p><em>${site.status==='ok'?'最近采集成功':'采集异常'} · ${escapeHtml(displayTime(site.checkedAt))}</em></a>`).join(''):'<div class="timeline-empty">当前筛选没有已接入的官网来源；其他品牌的隔离验收不计入正式覆盖。</div>';
  renderChannelMonitoring(summary.channelMonitoring);renderPrMonitoring(summary.prMonitoring);
  const candidates=summary.productRadar?.candidates||[],pending=candidates.filter(c=>c.reviewStatus==='pending'&&matchesScope(c));
  renderReviewQueue(candidates);renderReviewInbox();
  document.querySelector('#radar-count').textContent=pending.length?`${pending.length} 个待核实`:'当前筛选无待核实候选';
  document.querySelector('#radar-list').innerHTML=pending.length?pending.slice(0,6).map((item,index)=>`<button class="radar-item" data-candidate="${index}"><strong>${escapeHtml(item.temporaryName)}</strong><span>${escapeHtml(item.entityId)} · ${escapeHtml((item.countries||[]).join(' / '))}</span></button>`).join(''):'<div class="radar-empty"><strong>当前筛选没有待核实的新品候选</strong><span>客观网页观察与新品营销结论分别处理。</span></div>';
  document.querySelectorAll('[data-candidate]').forEach(button=>button.onclick=()=>showCandidate(pending[Number(button.dataset.candidate)]));
  renderFreshness();renderCurrentFormalActions();renderCurrentSiteObservations();renderEventClusters(marketingEventState);
}
function adoptInternalAds(){
  const panel=document.querySelector('#social-ads-monitor'),slot=document.querySelector('#ads-private-slot');
  if(!panel||!slot)return false;
  if(panel.parentElement!==slot)slot.append(panel);
  document.querySelector('#ads-access-note').hidden=true;
  if(!panel.querySelector('[data-ads-scope-note]')){const note=document.createElement('p');note.dataset.adsScopeNote='true';note.className='filter-scope';note.textContent='运行状态、存量总数和补证进度是试点整体状态；下方广告列表按所选品牌与国家筛选。';panel.querySelector('h2')?.after(note);}
  return true;
}

function evidenceForUrl(url){return Object.values(evidenceIndex.entries||{}).find(entry=>entry.url===url);}
function evidenceFigure(path,label){return path?`<figure><img src="./${escapeHtml(path)}" alt="${escapeHtml(label)}"><figcaption>${escapeHtml(label)}</figcaption></figure>`:`<div class="evidence-missing">${escapeHtml(label)}：暂无截图</div>`;}
function showCandidate(candidate){
  if(!candidate)return;
  document.querySelector('#detail-title').textContent='新品候选详情';
  const references=candidate.evidenceRefs||[];
  const evidence=references.map(reference=>evidenceForUrl(reference.url)).find(Boolean);
  const latest=evidence?.captures?.at(-1);
  const signals=[...new Set(references.flatMap(reference=>Object.values(reference.matchedSignals||{}).flat()))];
  document.querySelector('#dialog-content').innerHTML=`<dl><dt>临时编号</dt><dd><code>${escapeHtml(candidate.entityId)}</code></dd><dt>正式型号</dt><dd>${escapeHtml(candidate.canonicalName||'尚未确认')}</dd><dt>国家站点</dt><dd>${escapeHtml((candidate.countries||[]).join(' / '))}</dd><dt>首次发现</dt><dd>${escapeHtml(new Date(candidate.firstSeenAt).toLocaleString('zh-CN',{hour12:false}))}</dd><dt>当前阶段</dt><dd>${candidate.launchStage==='multi_source_candidate'?'多源候选':'弱信号'}</dd><dt>命中信号</dt><dd>${escapeHtml(signals.join('、')||'结构化商品信息')}</dd><dt>复核状态</dt><dd>${escapeHtml(reviewLabel(candidate.reviewStatus))}</dd></dl><div class="source-links">${references.map(reference=>`<a href="${escapeHtml(reference.url)}" target="_blank" rel="noreferrer">查看 ${escapeHtml(reference.siteId)} 原页面</a>`).join('')}</div><div class="evidence-compare">${evidenceFigure(latest?.previousViewportScreenshot,'变化前')}${evidenceFigure(latest?.keyRegionScreenshot||latest?.viewportScreenshot,'变化后 / 当前证据')}</div><div class="evidence">HTML 负责判断标题、正文、价格、Offer、CTA 和结构化商品数据是否变化；截图只用于视觉补充与证据留档。候选完成复核前不会进入正式营销动作时间轴。</div>${candidate.reviewStatus==='pending'?'<div class="evidence">若需确认新品营销结论，请由项目管理员登录私有仓库并在 Actions 中运行 Review Product Candidate。已接入的网页变化记录不受此流程影响。</div>':''}`;
  document.querySelector('#detail-dialog').showModal();
}

async function showFormalAction(action){
  if(!action)return;
  document.querySelector('#detail-title').textContent='正式营销动作';
  const evidence=(action.sourceUrls||[]).map(evidenceForUrl).find(Boolean);
  const latest=evidence?.captures?.at(-1);
  const evidenceDetail=action.channel==='edm'&&action.detailRef
    ? '<div id="edm-formal-detail" class="timeline-empty">正在读取邮件内容…</div>'
    : action.channel==='edm'&&action.evidenceRefs?.some(ref=>ref.access==='private')
    ? '<div class="evidence">该 EDM 的完整内容尚未通过复核，暂不展示原件。</div>'
    : `<div class="source-links">${(action.sourceUrls||[]).map(url=>`<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">查看原始页面</a>`).join('')}</div><div class="evidence-compare">${evidenceFigure(latest?.previousViewportScreenshot,'变化前')}${evidenceFigure(latest?.keyRegionScreenshot||latest?.viewportScreenshot,'确认时证据')}</div>`;
  document.querySelector('#dialog-content').innerHTML=`<dl><dt>动作编号</dt><dd><code>${escapeHtml(action.actionId)}</code></dd><dt>品牌 / 国家</dt><dd>${escapeHtml(action.brand)} · ${escapeHtml(action.country)}（${brandKind(action)}）</dd><dt>渠道</dt><dd>${escapeHtml(channelLabel(action.channel))}</dd><dt>发现时间</dt><dd>${escapeHtml(new Date(action.discoveredAt).toLocaleString('zh-CN',{hour12:false}))}</dd><dt>营销阶段</dt><dd>${escapeHtml(stageLabel(action.stage))}</dd><dt>动作摘要</dt><dd>${escapeHtml(action.summary)}</dd><dt>状态</dt><dd>已复核</dd></dl>${evidenceDetail}`;
  document.querySelector('#detail-dialog').showModal();
  if(action.channel==='edm'&&action.detailRef){
    const target=document.querySelector('#edm-formal-detail');
    if(target)target.innerHTML=await edmMailMarkup(action.detailRef);
  }
}

// Dashboard startup.
[market,brand,channel].forEach(control=>control.addEventListener('change',()=>{renderScopedDashboard();window.dispatchEvent(new Event('dashboard:filters-changed'));}));
document.querySelector('#reset-filters').onclick=()=>{market.value=brand.value=channel.value='全部';for(const control of [market,brand,channel])control.dispatchEvent(new Event('change'));};
function activateView(view){
  const aliases={'social-ads-monitor':'ads','ads-evidence-followups':'ads'};
  const target=aliases[view]||(['overview','review','schedule','edm','ads'].includes(view)?view:'overview');currentView=target;
  document.querySelectorAll('.nav-item').forEach(item=>{const active=item.dataset.view===target;item.classList.toggle('active',active);item.setAttribute('aria-current',active?'page':'false');});
  document.querySelectorAll('.view').forEach(item=>item.classList.toggle('active',item.id===target));
  document.querySelector('#global-filters').hidden=['schedule','edm'].includes(target);
  if(target==='ads'&&!['全部','社媒广告'].includes(channel.value)){channel.value='社媒广告';channel.dispatchEvent(new Event('change'));}
  adoptInternalAds();
  window.scrollTo(0,0);
}
document.querySelectorAll('.nav-item').forEach(button=>button.onclick=()=>{window.location.hash=button.dataset.view;activateView(button.dataset.view);});
window.addEventListener('hashchange',()=>activateView(window.location.hash.slice(1)));
activateView(window.location.hash.slice(1));
const adsObserver=new MutationObserver(()=>{if(adoptInternalAds())adsObserver.disconnect();});
if(!adoptInternalAds())adsObserver.observe(document.querySelector('main'),{childList:true,subtree:true});
document.querySelector('#detail-dialog .dialog-head button').onclick=()=>document.querySelector('#detail-dialog').close();
document.querySelector('#detail-dialog').onclick=event=>{if(event.target===event.currentTarget)event.currentTarget.close();};
for(const id of ['edm-brand-filter','edm-market-filter','edm-date-from','edm-date-to','edm-search'])document.getElementById(id).addEventListener('input',renderCurrentEdm);
document.querySelector('#reset-edm-filters').onclick=()=>{document.querySelector('#edm-brand-filter').value=document.querySelector('#edm-market-filter').value='全部';for(const id of ['edm-date-from','edm-date-to','edm-search'])document.getElementById(id).value='';renderCurrentEdm();};
async function refreshDashboard(){const button=document.querySelector('#refresh-dashboard');button.disabled=true;button.textContent='刷新中…';try{await Promise.allSettled([loadMonitorSummary(),loadSiteObservations(),loadActionData(),loadEventData(),loadEdmLibrary()]);}finally{button.disabled=false;button.textContent='刷新数据';}}
document.querySelector('#refresh-dashboard').onclick=refreshDashboard;
refreshDashboard();
