import { renderTimelineV3, renderCardsV3, headline, channelSelection, dateRange, shiftDay, todayDay, timelineGeometry, selectDashboardActions, summaryText, stageText, dateBuckets, sortedActions, cut } from './dashboard-v3.js';
import { websiteReviewQueue } from './website-review.js';
import { actionDateInfo, actionDateLabel, actionDateOrder, matchesActionPeriod } from './action-date.js';
import {validatePublicAdObservations,adObservationFreshness} from './ads-observations.js';
const market=document.querySelector('#market-filter');
const brand=document.querySelector('#brand-filter');
const channel=document.querySelector('#channel-filter');
const actionFrom=document.querySelector('#action-date-from');
const actionTo=document.querySelector('#action-date-to');
const campaignFilter=document.querySelector('#campaign-filter');
let campaignCalendar=[];
let activePeriod={from:'',to:''};
let datePreset='30';
let queryText='',actionSort='newest',contentDensity='cards',timelineView='timeline';
let requestedCampaign='',restoringRoute=false,detailSequence=[],detailActionId='',detailRequest=0;
let contentCategory='web';
let initialCampaignApplied=false;
const timelineState={expanded:new Set(),scroll:0,focus:false,grain:'week',autoposition:true};
const artworks=new Map();
function actionPeriod(){return {...activePeriod,campaign:campaignFilter.value};}
async function loadCampaignCalendar(){
  try{
    const data=await fetchDashboardJson('./data/campaign-calendar.json');campaignCalendar=data.events||[];
    const selected=campaignFilter.value;
    campaignFilter.innerHTML='<option value="">营销节点</option>'+campaignCalendar.map(event=>`<option value="${escapeHtml(event.id)}">${escapeHtml(event.title)}</option>`).join('');
    campaignFilter.value=selected;
    if(!initialCampaignApplied){initialCampaignApplied=true;const requested=requestedCampaign||new URL(window.location.href).searchParams.get('campaign');if(campaignCalendar.some(e=>e.id===requested)){restoringRoute=true;selectCampaign(requested);restoringRoute=false;}}
    renderCurrentFormalActions();
  }catch{requestedCampaign='';document.querySelector('#action-period-note').textContent='节点日历暂不可用，仍可直接选择动作日期。';}
}

let evidenceIndex={entries:{}};
let edmDetailIndex={items:[]};
let formalActionState=[];
let actionLoadStatus='loading';
let siteObservationState=[];
let monitorSummaryState=null;
let marketingEventState=[];
let moduleTimes={};
let publicAds=null;
let publicAdsError=false;
let currentView='overview';
const workflowRoot='https://github.com/ALALEI719/competitor-marketing-movement-tracking/actions/workflows/';
function displayTime(value){return value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'}):'尚无记录';}
function matchesScope(item,filters={market:market.value,brand:brand.value}){
  const countries=item.countries||[item.country];
  return (filters.market==='全部'||countries.includes(filters.market))&&(filters.brand==='全部'||item.brand===filters.brand);
}
function safePublicUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
async function loadPublicAds(){
  try {publicAds=validatePublicAdObservations(await fetchDashboardJson('./data/ads-observations.json'));publicAdsError=false;moduleTimes.ads=publicAds.lastSuccessAt;}
  catch {publicAdsError=true;}
  renderPublicAds();renderFreshness();
}
function renderPublicAds(){
  const info=document.querySelector('#ads-observation-status'),list=document.querySelector('#ads-observation-list');if(!info||!list)return;
  info.textContent=(publicAdsError?'公开数据读取失败，保留已加载观察；可点击“刷新数据”重试。':adObservationFreshness(publicAds))+' · '+(publicAds?.records.length||0)+' 条观察库存 · 最近成功采集：'+displayTime(publicAds?.lastSuccessAt)+' · 最近尝试：'+displayTime(publicAds?.lastAttemptAt)+' · 公开导出：'+displayTime(publicAds?.generatedAt)+'（北京时间）';
  const rows=(publicAds?.records||[]).filter(r=>matchesScope({...r,country:'美国'}));
  list.innerHTML=rows.length?rows.map(r=>`<article class="panel ads-observation"><small>观察库存 · Mammotion · 美国 · Meta · 编号 ${escapeHtml(r.sourceRecordId)}</small><h3>广告库当前展示版本</h3><p class="ads-copy">${escapeHtml(r.copy)}</p><dl><dt>公开优惠原文</dt><dd>${escapeHtml(r.offer||'未显示')}</dd><dt>CTA</dt><dd>${escapeHtml(r.cta||'未显示')}</dd><dt>落地页</dt><dd><a href="${escapeHtml(r.landingUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.landingUrl)}</a></dd><dt>平台显示开始日期</dt><dd>${escapeHtml(r.publishDate||'未知')}</dd><dt>首次留存观察</dt><dd>${escapeHtml(displayTime(r.firstSeenAt))}</dd><dt>最近采集</dt><dd>${escapeHtml(displayTime(r.lastCapturedAt))}</dd></dl><p>素材见原始广告库。本站未公开素材文件，完整视频未验收；多版本只取得当前展示版本。</p><a href="${escapeHtml(r.libraryUrl)}" target="_blank" rel="noopener noreferrer">查看原始广告库</a></article>`).join(''):'<p class="timeline-empty">当前范围暂无公开广告观察。没有记录不代表没有投放。</p>';
}
function canonicalReviewUrl(value){const safe=safePublicUrl(value);if(!safe)return '';const u=new URL(safe);u.search='';u.hash='';return u.href.replace(/\/$/,'');}
function uniquePending(items){const seen=new Set();return (items||[]).filter(item=>{if(item.reviewStatus!=='pending'||!item.recordId||seen.has(item.recordId))return false;seen.add(item.recordId);return true;});}
function reviewGroups(summary){
  const blog=[...new Map([...(summary?.channelMonitoring?.recentRecords||[]),...(summary?.channelMonitoring?.pendingRecords||[])].map(record=>[record.recordId,record])).values()];
  const queue=websiteReviewQueue(uniquePending(summary?.pendingRecords),blog);
  return [
    {channel:'官网',title:'官网与 Blog',channels:['官网','Blog'],workflow:'review-website-record.yml',linked:queue.linked,
      records:[...queue.site.map(record=>({...record,reviewType:'官网'})),...queue.blog.map(record=>({...record,reviewType:'Blog'}))].sort((a,b)=>Date.parse(b.discoveredAt)-Date.parse(a.discoveredAt))},
    {channel:'PR',workflow:'review-pr-record.yml',records:uniquePending(summary?.prMonitoring?.pendingRecords||summary?.prMonitoring?.recentRecords)}
  ];
}
function edmDay(value){return value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date(value)):'';}
function selectEdmItems(items,filters){
  const query=(filters.query||'').trim().toLocaleLowerCase();
  return items.filter(item=>(filters.brand==='全部'||item.brand===filters.brand)&&(filters.market==='全部'||item.country===filters.market)
    &&(!filters.from||(edmDay(item.sentAt)&&edmDay(item.sentAt)>=filters.from))&&(!filters.to||(edmDay(item.sentAt)&&edmDay(item.sentAt)<=filters.to))
    &&(!query||[item.subject,item.summary,item.brand,item.country].join(' ').toLocaleLowerCase().includes(query)))
    .sort((a,b)=>(Date.parse(b.sentAt)||0)-(Date.parse(a.sentAt)||0)||String(a.recordId||a.actionId).localeCompare(String(b.recordId||b.actionId)));
}
function renderCurrentEdm(){
  if(edmDetailIndex.loadError){document.querySelector('#edm-result-count').textContent='读取失败';document.querySelector('#edm-content-list').innerHTML='<div class="timeline-empty">邮件索引暂不可用。<button id="retry-edm-library">重试</button></div>';document.querySelector('#retry-edm-library').onclick=loadEdmLibrary;return;}
  if(actionLoadStatus!=='ready'){document.querySelector('#edm-result-count').textContent=actionLoadStatus==='error'?'读取失败':'读取中';document.querySelector('#edm-content-list').innerHTML='<div class="timeline-empty">'+(actionLoadStatus==='error'?'正式动作读取失败，请在总览重试。':'正在读取已确认邮件…')+'</div>';return;}
  const filters={brand:brand.value,market:market.value,...activePeriod,query:''};
  const allowed=new Set(filteredFormalActions().filter(a=>a.channel==='edm').map(a=>a.actionId));
  const items=(edmDetailIndex.items||[]).filter(item=>allowed.has(item.actionId));
  const selected=selectEdmItems(items,filters);
  document.querySelector('#edm-result-count').textContent=`${selected.length} / ${(edmDetailIndex.items||[]).length} 封`;
  renderEdmLibrary(selected);
  if(!selected.length)document.querySelector('#edm-content-list').innerHTML='<div class="timeline-empty">当前筛选暂无已确认邮件；未收录不代表没有发送。<button data-empty-clear="date">扩大日期范围</button><button data-empty-clear="all">查看全部</button></div>';
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
  const actions=items.map(item=>formalActionState.find(a=>a.actionId===item.actionId)).filter(Boolean);
  renderCardsV3({container:document.querySelector('#edm-content-list'),actions,artworks,onAction:showFormalAction,onChannel:openContentChannel,all:true});
}
async function loadCardArtworks(){
  for(const action of formalActionState){
    const evidence=(action.sourceUrls||[]).map(evidenceForUrl).find(Boolean);
    const capture=evidence?.captures?.at(-1);
    const image=capture?.keyRegionScreenshot||capture?.viewportScreenshot;
    if(image)artworks.set(action.actionId,'./'+image.replace(/^\.\//,''));
  }
  await Promise.allSettled((edmDetailIndex.items||[]).map(async item=>{
    const ref=safeEdmDetailRef(item.detailRef);if(!ref)return;
    const detail=await fetchDashboardJson(ref);
    const image=(detail.images||[]).find(i=>i.index>0&&!/品牌标识|logo/i.test(i.description||''))||detail.images?.[0];
    if(image&&safeEdmAssetPath(image.src))artworks.set(item.actionId,image.src);
  }));
  renderCurrentFormalActions();
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
  moduleTimes.edm=edmDetailIndex.updatedAt;renderFreshness();await loadCardArtworks();
}

function safeEdmDetailRef(value){return /^\.\/data\/edm-details\/EDM-[A-Z0-9]+\.json$/.test(value||'')?value:'';}
function safeEdmAssetPath(value){return /^\.\/data\/edm-assets\/EDM-[A-Z0-9]+\/image-\d{2}\.(?:png|jpe?g|gif|webp|avif)$/.test(value||'')?value:'';}

async function edmMailMarkup(reference,action){
  const detailRef=safeEdmDetailRef(reference);
  if(!detailRef)return '<div class="evidence">邮件详情尚未通过安全复核。</div>';
  try{
    const detail=await fetchDashboardJson(detailRef);
    const images=(detail.images||[]).map(item=>{const src=safeEdmAssetPath(item.src);return src?`<figure><img loading="lazy" src="${escapeHtml(src)}" alt="${escapeHtml(item.description||'EDM 营销图片')}"><figcaption>${escapeHtml(item.description||'')}</figcaption></figure>`:'';}).join('');
    const paragraphs=(detail.bodyParagraphs||[]).filter(p=>p.trim()!==detail.contentSummary?.trim()&&p.trim()!==action?.summary?.trim());
    return `<article class="edm-mail">${!action?`<h3>${escapeHtml(detail.subject)}</h3><p>${escapeHtml(detail.contentSummary)}</p>`:''}<section class="mail-reading"><h3>邮件内容解读</h3>${paragraphs.map((paragraph,i)=>`<section><h4>${i===0?'活动与产品':/期限|参与期|截止|条件/.test(paragraph)?'时间与参与条件':'优惠与补充事实'}</h4><p>${escapeHtml(paragraph)}</p></section>`).join('')}</section><section><h3>留存素材 <small>点击图片放大 · 按邮件原顺序</small></h3><div class="edm-mail-images">${images||'<p class="evidence">尚未留存公开素材。</p>'}</div></section><details class="record-info"><summary>原邮件主题</summary><p>${escapeHtml(detail.subject)}</p></details><div class="edm-mail-note">邮件图片为留存副本；促销按钮不可点击，原始追踪链接与收件信息不展示。</div></article>`;
  }catch{return '<div class="evidence">邮件详情暂时无法读取。<button data-retry-detail>重新读取详情</button></div>';}
}

async function showEdmDetail(item){
  if(!item)return;
  document.querySelector('#detail-title').textContent='EDM 邮件内容';
  document.querySelector('#dialog-content').innerHTML='<div class="timeline-empty">正在读取邮件内容…</div>';
  openDetail();
  document.querySelector('#dialog-content').innerHTML=await edmMailMarkup(item.detailRef);
}

function channelLabel(channel){return ({official_site:'官网',pr:'PR',blog:'Blog',social_ads:'社媒广告',video:'视频',edm:'EDM'})[channel]||channel;}
function stageLabel(stage){return stageText(stage);}

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
  document.querySelector('#channel-record-list').innerHTML=records.length?records.slice(0,12).map(item=>{const system=item.systemAssessment||{};const human=item.humanAssessment;const relation=human?.newProductRelation||system.newProductRelation||'uncertain';const priority=system.monitoringPriority===null||system.monitoringPriority===undefined?'':` · 优先级 ${Number(system.monitoringPriority).toFixed(1)}/4`;return `<article><a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.country)} · ${item.changeType==='historical_publication'?'历史文章补录':item.changeType==='content_updated'?'文章更新':'新文章'} · ${item.publishDate?escapeHtml(item.publishDate.slice(0,10)):'发布日期待确认'}</span></a><div class="channel-tags"><em class="channel-tag ${escapeHtml(relation)}">${escapeHtml(newProductLabel(relation))}</em><em class="channel-tag">${escapeHtml(themeLabel(human?.marketingTheme||system.marketingTheme))}${escapeHtml(priority)}</em><em class="channel-tag ${escapeHtml(item.reviewStatus)}">${human?'已完成二次判断':'待二次判断'}</em></div><small><code>${escapeHtml(item.recordId)}</code> · <a href="https://github.com/ALALEI719/competitor-marketing-movement-tracking/actions/workflows/review-website-record.yml" target="_blank" rel="noreferrer">${human?'查看复核入口':'进行二次判断'}</a></small></article>`;}).join(''):'<div class="timeline-empty">当前筛选下没有 Blog 变化记录。</div>';
}
function renderPrMonitoring(monitoring){
  const sources=(monitoring?.sources||[]).filter(item=>matchesScope(item.source));
  const healthy=sources.filter(item=>item.status==='ok').length;
  const prThemeLabels={product_launch:'新品发布',review:'评测',promotion:'促销',event:'活动',award:'获奖',partnership:'合作',other:'待归类'};
  document.querySelector('#pr-source-status').textContent=sources.length?`${healthy}/${sources.length} 最近采集成功`:'当前筛选无已接入来源';
  document.querySelector('#pr-source-status').className=`badge ${sources.length&&sources.length&&healthy===sources.length?'green':'orange'}`;
  document.querySelector('#pr-source-list').innerHTML=sources.length?sources.map(item=>`<a class="channel-source-card ${item.status==='ok'?'healthy':'error'}" href="${escapeHtml(item.source.url)}" target="_blank" rel="noreferrer"><div><strong>${escapeHtml(item.source.outlet||item.source.brand)} · ${escapeHtml(item.source.country)} · PR</strong><span>${item.status==='ok'?item.discoveredUrlCount?`${item.discoveredUrlCount} 个文章 URL · ${item.itemCount} 条相关内容`:`${item.itemCount} 条相关内容基线`:`采集异常：${escapeHtml(item.error||'未知错误')}`}</span></div><em>${item.status==='ok'?'正常':'需排查'}</em></a>`).join(''):'<div class="coverage-loading">媒体试点来源待核验；Newsroom 入口待确定。</div>';
  const records=(monitoring?.recentRecords||[]).filter(item=>matchesScope(item)).sort((a,b)=>Date.parse(b.discoveredAt)-Date.parse(a.discoveredAt));
  document.querySelector('#pr-record-list').innerHTML=records.length?records.slice(0,12).map(item=>`<article><a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.outlet||item.brand)} · ${escapeHtml(item.country)} · ${item.changeType==='historical_publication'?'历史媒体报道补录':item.changeType==='content_updated'?'内容更新':item.changeType==='new_coverage'?'新媒体报道':'新新闻稿'} · ${item.publishDate?escapeHtml(item.publishDate.slice(0,10)):'发布日期待确认'}</span></a><div class="channel-tags"><em class="channel-tag ${escapeHtml(item.reviewStatus)}">${escapeHtml(reviewLabel(item.reviewStatus))}</em><em class="channel-tag">主题初筛：${escapeHtml((item.themeAssessment?.tags||['other']).map(tag=>prThemeLabels[tag]||'待归类').join('／'))}</em><em class="channel-tag">页面证据 ${escapeHtml(item.evidence?.contentHash?.slice(0,12)||'待补')}</em></div><small><code>${escapeHtml(item.recordId)}</code> · <a href="https://github.com/ALALEI719/competitor-marketing-movement-tracking/actions/workflows/review-pr-record.yml" target="_blank" rel="noreferrer">人工复核入口</a></small></article>`).join(''):'<div class="timeline-empty">当前筛选下暂无 PR 变化；来源首次采集只建基线。</div>';
}
function renderReviewQueue(candidates){
  candidates=candidates.filter(item=>matchesScope(item));
  document.querySelector('[data-review-candidates]').hidden=!['全部','官网'].includes(channel.value);
  const pending=candidates.filter(item=>item.reviewStatus==='pending').length;
  document.querySelector('#review-pending-count').textContent=`${pending} 个待复核`;
  document.querySelector('#review-queue-body').innerHTML=candidates.length?candidates.map(item=>`<tr><td><code>${escapeHtml(item.entityId)}</code></td><td>${escapeHtml(item.brand)} · ${escapeHtml((item.countries||[]).join(' / '))}</td><td>${escapeHtml(new Date(item.firstSeenAt).toLocaleString('zh-CN',{hour12:false}))}</td><td>${item.confidenceScore}</td><td><span class="review-status ${escapeHtml(item.reviewStatus)}">${reviewLabel(item.reviewStatus)}</span></td><td><button class="secondary compact" data-review-candidate="${escapeHtml(item.entityId)}">查看证据</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty-cell">当前没有新品候选</td></tr>';
  document.querySelectorAll('[data-review-candidate]').forEach(button=>button.onclick=()=>showCandidate(candidates.find(item=>item.entityId===button.dataset.reviewCandidate)));
}

function actionListMarkup(actions){
  return actions.map(a=>`<button class="readable-action" data-readable-action="${escapeHtml(a.actionId)}"><strong>${escapeHtml(headline(a))}</strong><span>${escapeHtml(a.brand+' · '+a.country+' · '+channelLabel(a.channel)+' · '+actionDateLabel(a))}</span><p>${escapeHtml(cut(summaryText(a),90))}</p><small>${escapeHtml(stageLabel(a.stage))} · ${a.dateBasis==='manual_record'?'人工台账':'已复核'} · 查看详情 →</small></button>`).join('');
}
function bindReadableActions(container,actions){container.querySelectorAll('[data-readable-action]').forEach(b=>b.onclick=()=>{detailSequence=actions;showFormalAction(actions.find(a=>a.actionId===b.dataset.readableAction));});}
function emptyMarkup(){
  const scoped=selectDashboardActions(formalActionState,{brand:brand.value,market:market.value,channel:channel.value});
  const title=scoped.length?'筛选后无结果':'当前品牌 / 国家 / 渠道尚未收录已确认动作';
  const note=scoped.length?`该范围历史已收录 ${scoped.length} 条，可移除关键词或扩大日期范围。`:'来源是否接入请查看数据覆盖；未收录不代表没有营销活动。';
  return `<div class="timeline-empty"><strong>${title}</strong><p>${note}</p>${queryText?'<button data-empty-clear="query">清除关键词</button>':''}<button data-empty-clear="date">扩大日期范围</button><button data-empty-clear="all">清除筛选，查看全部</button></div>`;
}
function renderFormalActions(actions){
  const ordered=sortedActions(actions,actionSort);
  document.querySelector('#formal-action-count').textContent=`${actions.length} 条`;
  document.querySelector('#formal-action-table').innerHTML=ordered.length?ordered.map((a,index)=>`<tr><td>${escapeHtml(actionDateLabel(a))}</td><td>${escapeHtml(a.brand+' · '+a.country)}</td><td>${escapeHtml(channelLabel(a.channel))}</td><td><button class="table-action-title" data-formal-action="${index}">${escapeHtml(headline(a))}</button></td><td>${escapeHtml(stageLabel(a.stage))}</td><td>${a.dateBasis==='manual_record'?'人工台账':'已复核'}</td></tr>`).join(''):`<tr><td colspan="6">${emptyMarkup()}</td></tr>`;
  document.querySelectorAll('[data-formal-action]').forEach(b=>b.onclick=()=>{detailSequence=ordered;showFormalAction(ordered[Number(b.dataset.formalAction)]);});
  const mobile=document.querySelector('#library-mobile-list');mobile.innerHTML=ordered.length?actionListMarkup(ordered):emptyMarkup();bindReadableActions(mobile,ordered);
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
  renderTimelineV3({container:document.querySelector('#formal-timeline'),actions,calendar:campaignCalendar,period:activePeriod,brand:brand.value,state:timelineState,onAction:showFormalAction,onGroup:showActionGroup,onExpand:name=>{timelineState.expanded.has(name)?timelineState.expanded.delete(name):timelineState.expanded.add(name);renderCurrentFormalActions();}});
}
function showActionGroup(actions){
  detailSequence=sortedActions(actions);detailActionId='';
  const days=actions.map(a=>actionDateInfo(a).day).filter(Boolean).sort();
  document.querySelector('#detail-title').textContent=`${days[0]||'日期待确认'}${days.at(-1)!==days[0]?' — '+days.at(-1):''} · ${actions.length} 条动作`;
  const content=document.querySelector('#dialog-content');content.innerHTML=`<p class="detail-intro">当前筛选内的已确认动作 · 日期、标题、品牌、国家及渠道</p>${actionListMarkup(detailSequence)}`;bindReadableActions(content,detailSequence);openDetail();
}

function openContentChannel(code){
  channel.value=channelLabel(code);contentCategory=code==='edm'?'edm':code==='pr'?'pr':['social_ads','video'].includes(code)?'ads':'web';
  activateView('content');renderScopedDashboard();renderContentView();window.dispatchEvent(new Event('dashboard:filters-changed'));
}
function renderContentView(){
  renderPublicAds();
  document.querySelector('#content').classList.toggle('compact-content',contentDensity==='compact');
  document.querySelectorAll('[data-content-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.contentTab===contentCategory)));
  document.querySelector('#channel-web').hidden=['edm','ads'].includes(contentCategory);
  document.querySelector('#channel-edm').hidden=contentCategory!=='edm';
  document.querySelector('#channel-ads').hidden=contentCategory!=='ads';
  if(actionLoadStatus!=='ready'){document.querySelector('#channel-content-list').innerHTML='<div class="timeline-empty">'+(actionLoadStatus==='error'?'正式动作读取失败，请在总览重试。':'正在读取已确认内容…')+'</div>';renderCurrentEdm();return;}
  renderCardsV3({container:document.querySelector('#channel-content-list'),actions:channelSelection(filteredFormalActions(),contentCategory).filter(action=>contentCategory!=='web'||!document.querySelector('#website-content-type')?.value||document.querySelector('#website-content-type').value===action.channel),artworks,onAction:showFormalAction,onChannel:openContentChannel,all:true});
  renderCardsV3({container:document.querySelector('#ads-formal-list'),actions:channelSelection(filteredFormalActions(),'ads'),artworks,onAction:showFormalAction,onChannel:openContentChannel,all:true});
  renderCurrentEdm();
}
function syncDateUI(){
  const range=activePeriod.from&&activePeriod.to?activePeriod:dateRange('all',formalActionState.filter(a=>matchesScope(a)&&(channel.value==='全部'||channelLabel(a.channel)===channel.value)));
  document.querySelector('#date-preset-label').textContent=({'30':'近30天','90':'近90天',all:'全部动作',season:'营销季',campaign:'节点窗口',custom:'自定义'})[datePreset];
  document.querySelector('#date-range-brief').textContent=`${range.from.slice(5).replace('-','/')} — ${range.to.slice(5).replace('-','/')}`;
  document.querySelectorAll('[data-date-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.datePreset===datePreset)));
  const selected=campaignCalendar.find(e=>e.id===campaignFilter.value);
  const operational=['review','status'].includes(currentView);
  document.querySelector('#filter-scope').textContent=operational?`来源范围：${[brand.value,market.value,channel.value].filter(v=>v!=='全部').join(' · ')||'全部'}；待审与运行状态不按动作日期或关键词过滤。`:`${filteredFormalActions().length} 条结果 · ${range.from} — ${range.to}${selected?' · '+selected.title:''}`;
  if(currentView==='content'&&contentCategory==='ads')document.querySelector('#filter-scope').textContent+=' · 以上统计仅为正式动作；下方广告观察库存单列，不按动作日期或搜索过滤。';
  renderFilterChips(operational);persistRoute();

}
function updateCampaignUrl(id){const url=new URL(window.location.href);if(id)url.searchParams.set('campaign',id);else url.searchParams.delete('campaign');window.history.replaceState(null,'',url);}
function selectCampaign(id){
  requestedCampaign='';
  const event=campaignCalendar.find(e=>e.id===id);
  campaignFilter.value=event?.id||'';updateCampaignUrl(campaignFilter.value);activePeriod=event?{from:event.monitoringWindow.start,to:event.monitoringWindow.end}:{from:'',to:''};
  datePreset=event?'campaign':'all';actionFrom.value=activePeriod.from;actionTo.value=activePeriod.to;timelineState.scroll=0;timelineState.autoposition=true;
  renderCurrentFormalActions();renderEventClusters(marketingEventState);
}
function setDateRange(preset){
  requestedCampaign='';
  if(preset==='all')activePeriod={from:'',to:''};
  else if(preset==='season'){const year=todayDay().slice(0,4);activePeriod={from:`${year}-08-28`,to:`${Number(year)+1}-01-20`};}
  else activePeriod=dateRange(preset,formalActionState);
  datePreset=preset;campaignFilter.value='';updateCampaignUrl('');actionFrom.value=activePeriod.from;actionTo.value=activePeriod.to;timelineState.scroll=0;timelineState.autoposition=true;
  renderCurrentFormalActions();renderEventClusters(marketingEventState);
}
function setTimelineFocus(focus){
  const wasOpen=timelineState.focus;
  timelineState.focus=focus;document.querySelector('#timeline-panel').classList.toggle('timeline-expanded',focus);document.body.classList.toggle('timeline-open',focus);
  document.querySelector('#expand-timeline').textContent=focus?'⤡ 收起':'⤢ 展开';document.querySelector('#expand-timeline').setAttribute('aria-expanded',String(focus));if(wasOpen&&!focus)document.querySelector('#expand-timeline').focus({preventScroll:true});
}

function filteredFormalActions(){
  return selectDashboardActions(formalActionState,{brand:brand.value,market:market.value,channel:channel.value,...actionPeriod(),query:queryText});
}

function renderCurrentFormalActions(){
  if(actionLoadStatus!=='ready'){
    const message=actionLoadStatus==='error'?'正式动作暂时读取失败，请重试。':'正在读取真实动作…';
    document.querySelector('#timeline-action-count').textContent=actionLoadStatus==='error'?'读取失败':'读取中';
    document.querySelector('#formal-action-count').textContent=actionLoadStatus==='error'?'读取失败':'读取中';
    const markup=`<div class="timeline-empty">${message}${actionLoadStatus==='error'?'<button class="secondary compact retry-actions">重新读取</button>':''}</div>`;
    document.querySelector('#formal-timeline').innerHTML=markup;document.querySelector('#channel-highlights').innerHTML=markup;
    document.querySelector('#formal-action-table').innerHTML=`<tr><td colspan="6">${markup}</td></tr>`;
    document.querySelector('#recent-summary').innerHTML=markup;document.querySelector('#library-mobile-list').innerHTML=markup;document.querySelector('#timeline-date-list').innerHTML=markup;document.querySelectorAll('.retry-actions').forEach(button=>button.onclick=loadActionData);return;
  }
  const actions=filteredFormalActions();
  const context=document.querySelector('#campaign-context'),selected=campaignCalendar.find(event=>event.id===campaignFilter.value);
  context.hidden=!selected;
  if(selected){const all=formalActionState.filter(action=>action.campaignId===selected.id);const manual=all.filter(action=>action.dateBasis==='manual_record').length;context.innerHTML=`<strong>${escapeHtml(selected.title)} · 正式日期 ${escapeHtml(selected.start)} — ${escapeHtml(selected.end)}</strong><span>回溯窗口 ${escapeHtml(selected.monitoringWindow.start)} — ${escapeHtml(selected.monitoringWindow.end)} · 当前筛选 ${actions.length} 条 / 节点共 ${all.length} 条${manual?`（${manual} 条人工台账）`:''}</span><p>${escapeHtml(selected.coverageNote||'此节点尚未完成历史补齐；营销日历不代表竞品已参加。')}</p>`;}
  const ifa=campaignCalendar.find(e=>e.id==='ifa-2026'),allIfa=formalActionState.filter(a=>a.campaignId==='ifa-2026');
  const entry=document.querySelector('#ifa-entry');entry.hidden=!ifa;
  if(ifa){entry.innerHTML=`<div><strong>全站专题 · IFA 2026 · ${allIfa.length} 条已收录</strong><small>${allIfa.filter(a=>a.dateBasis!=='manual_record').length} 条来源证据＋${allIfa.filter(a=>a.dateBasis==='manual_record').length} 条人工台账 · 独立于当前筛选，进入时查看全站专题 · 其他竞品、广告及 EDM 历史待补齐</small></div><button id="open-ifa">${selected?.id==='ifa-2026'?'正在查看 IFA':'查看 IFA →'}</button>`;document.querySelector('#open-ifa').onclick=()=>{market.value=brand.value=channel.value='全部';queryText='';document.querySelector('#action-search').value='';selectCampaign('ifa-2026');renderScopedDashboard();};}
  document.querySelector('#timeline-action-count').textContent=`${actions.length} 条已确认动作`;
  renderFormalActions(actions);renderFormalTimeline(actions);renderRecentSummary(actions);renderTimelineList(actions);renderCoverage(actions);
  renderCardsV3({container:document.querySelector('#channel-highlights'),actions,artworks,onAction:showFormalAction,onChannel:openContentChannel});
  renderContentView();syncDateUI();syncTimelineView();
}

function scopedEvents(events,actions,filters={market:market.value,brand:brand.value,channel:channel.value,...actionPeriod()}){
  const byId=new Map(actions.map(a=>[a.actionId,a]));
  return events.map(event=>{
    const visible=(event.actionIds||[]).map(id=>byId.get(id)).filter(a=>a&&matchesScope(a,filters)&&(filters.channel==='全部'||channelLabel(a.channel)===filters.channel)&&matchesActionPeriod(a,filters));
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
    actionLoadStatus='error';renderCurrentFormalActions();
    document.querySelector('#formal-action-count').textContent='读取失败';
    document.querySelector('#formal-timeline-axis').innerHTML='';
    document.querySelector('#formal-timeline').innerHTML='<div class="timeline-empty">正式动作暂时读取失败。<button class="secondary compact retry-actions">重新读取</button></div>';
    document.querySelector('#formal-action-table').innerHTML='<tr><td colspan="6">正式动作暂时读取失败。<button class="secondary compact retry-actions">重新读取</button></td></tr>';
    document.querySelectorAll('.retry-actions').forEach(button=>button.onclick=loadActionData);
  }else{
    actionLoadStatus='ready';formalActionState=(formalActions.actions||[]).filter(a=>a.reviewStatus==='approved');moduleTimes.actions=formalActions.updatedAt;
    renderCurrentFormalActions();renderEventClusters(marketingEventState);renderFreshness();await loadCardArtworks();
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

function latestEdmReviewTime(actions){return actions.filter(action=>action.channel==='edm'&&action.reviewStatus==='approved').map(action=>action.reviewedAt).filter(value=>Number.isFinite(Date.parse(value))).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)||'';}
function renderFreshness(){
  const summary=monitorSummaryState;
  const sourceNote=(sources)=>{const scoped=(sources||[]).filter(i=>matchesScope(i.source||i.site));const ok=scoped.filter(i=>i.status==='ok').length;return scoped.length?`${ok}/${scoped.length} 最近采集成功`:'当前筛选无已接入来源';};
  const entries=[
    {name:'官网',time:summary?.generatedAt,note:sourceNote(summary?.sites),channel:'官网'},
    {name:'网页观察',time:moduleTimes.observations,note:'客观变化与正式动作分开',channel:'官网'},
    {name:'Blog',time:summary?.channelMonitoring?.checkedAt,note:sourceNote(summary?.channelMonitoring?.sources),channel:'Blog'},
    {name:'PR',time:summary?.prMonitoring?.checkedAt,note:sourceNote(summary?.prMonitoring?.sources),channel:'PR'},
    {name:'正式动作',time:moduleTimes.actions,note:'最近复核数据更新；不是重新采集全部来源'},
    {name:'EDM',time:moduleTimes.edm||latestEdmReviewTime(formalActionState),note:`${(edmDetailIndex.items||[]).filter(item=>matchesScope(item)).length} 封已收录；此处为内容复核时间，发信时间见邮件卡片`,channel:'EDM'},
    {name:'广告观察',time:publicAds?.lastSuccessAt,note:publicAdsError?'公开数据读取失败；查看广告观察中的最近成功时间':adObservationFreshness(publicAds)+' · 仅 Mammotion US Meta，本机浏览器试运行',channel:'社媒广告'}
  ];
  document.querySelector('#module-freshness').innerHTML=entries.filter(e=>!e.channel||channel.value==='全部'||e.channel===channel.value).map(e=>`<div class="freshness-card"><strong>${escapeHtml(e.name)}</strong><time>${escapeHtml(e.name==='广告'?'内部页面独立展示':displayTime(e.time))}</time><span>${escapeHtml(e.note)}</span></div>`).join('');
  const times=[summary?.generatedAt,summary?.channelMonitoring?.checkedAt,summary?.prMonitoring?.checkedAt,...Object.values(moduleTimes)].map(v=>Date.parse(v)).filter(Number.isFinite);
  if(times.length)document.querySelector('#data-updated-at').textContent=`最近数据更新 ${displayTime(new Date(Math.max(...times)).toISOString())}（北京时间）`;
  document.querySelector('#overview-updated-at').textContent=moduleTimes.actions?`动作更新 ${displayTime(moduleTimes.actions)}（北京时间）`:'动作更新时间待确认';
  renderCoverage(filteredFormalActions());
}
function renderReviewInbox(){
  const candidateScope=['全部','官网'].includes(channel.value);document.querySelector('#review [data-review-candidates]').hidden=!candidateScope;document.querySelector('#review .footnote').hidden=!candidateScope;
  document.querySelector('#review > .section-intro p').textContent=channel.value==='EDM'?'EDM 当前没有公开待审队列；这不代表没有收信或所有邮件都已完成复核。已确认邮件与留存素材请在渠道内容中查看。':channel.value==='社媒广告'?'广告观察库存与已复核正式动作分别展示；当前公开观察的覆盖和最近采集状态见渠道内容，待核验线索不自动进入正式动作。':channel.value==='PR'?'当前仅查看 PR 待审记录；原始报道、来源日期及人工复核结论分别保存。':'官网、Blog、PR 与新品候选按所选渠道列出。每次发现和后续更新分别保留，关联记录不会自动合并或批准。';
  const all=reviewGroups(monitorSummaryState),type=document.querySelector('#website-review-type').value,groups=all.filter(g=>channel.value==='全部'||(g.channels||[g.channel]).includes(channel.value)).map(g=>({...g,linked:(g.linked||[]).filter(item=>matchesScope(item)),records:g.records.filter(item=>matchesScope(item)&&(channel.value==='全部'||(item.reviewType||g.channel)===channel.value)&&(!item.reviewType||!type||item.reviewType===type))}));
  const candidates=(monitorSummaryState?.productRadar?.candidates||[]).filter(c=>c.reviewStatus==='pending'&&matchesScope(c)&&['全部','官网'].includes(channel.value));
  const total=groups.reduce((n,g)=>n+g.records.length,0)+candidates.length;
  document.querySelector('#review-total-count').textContent=groups.length||candidateScope?`${total} 条待审记录`:'暂无公开队列';
  document.querySelector('#review-module-counts').textContent=[...groups.map(g=>`${g.title||g.channel} ${g.records.length}`),...(['全部','官网'].includes(channel.value)?[`新品候选 ${candidates.length}`]:[])].join(' · ')+(groups.length?'；已核对的同次发现共用一条复核，后续更新分别保留':'该渠道暂无公开待审队列；未收录不代表没有营销活动。');
  const related=new Map();for(const g of all)for(const item of g.records){const key=[item.brand,item.country,canonicalReviewUrl(item.url||item.sourceUrl)].join('|');related.set(key,(related.get(key)||0)+1);}
  document.querySelector('#review-record-groups').innerHTML=groups.length?groups.map(g=>`<section class="review-group"><h3>${escapeHtml(g.title||g.channel)} · ${g.records.length} 条待审</h3>${g.linked?.length?`<p>另有 ${g.linked.length} 条官网发现已关联到同次 Blog 记录，原始编号保留。</p>`:''}${g.records.length?`<div class="table-wrap"><table><thead><tr><th>编号 / 关联</th><th>品牌 / 国家</th><th>发现时间</th><th>记录</th><th>复核入口</th></tr></thead><tbody>${g.records.map((item,index)=>{
    const key=[item.brand,item.country,canonicalReviewUrl(item.url||item.sourceUrl)].join('|'),count=related.get(key)||1;
    return `<tr><td><code>${escapeHtml(item.recordId)}</code><small>${escapeHtml(item.reviewType||g.channel)}</small>${item.discoveryRecordIds?.length?`<small>同次官网发现：${item.discoveryRecordIds.map(escapeHtml).join('、')}</small>`:''}${count>1?`<small>同页 ${count} 次变化，分别复核</small>`:''}</td><td>${escapeHtml(item.brand)} · ${escapeHtml(item.country)}</td><td>${escapeHtml(displayTime(item.discoveredAt))}</td><td><button class="review-record-button" data-review-channel="${g.channel}" data-review-index="${index}">${escapeHtml(item.title||item.url||item.summary||'查看记录')}</button></td><td><button class="secondary compact" data-copy-record="${escapeHtml(item.recordId)}">复制编号</button> <a href="${workflowRoot+g.workflow}" target="_blank" rel="noreferrer">进入复核</a></td></tr>`;
  }).join('')}</tbody></table></div>`:'<p class="timeline-empty">当前筛选下没有待审记录。</p>'}</section>`).join(''):`<div class="timeline-empty">该渠道没有公开待审队列。${channel.value==='EDM'?'此处不代表邮件是否收取，已确认邮件请查看渠道内容。':channel.value==='社媒广告'?'广告观察及其来源状态请在渠道内容查看，观察库存不计入正式动作。':'未收录不代表没有营销活动。'}</div>`;
  document.querySelectorAll('[data-review-channel]').forEach(button=>button.onclick=()=>{const group=groups.find(g=>g.channel===button.dataset.reviewChannel);showReviewRecord(group.records[Number(button.dataset.reviewIndex)],group.channel);});
  document.querySelectorAll('[data-copy-record]').forEach(button=>button.onclick=async()=>{try{await navigator.clipboard.writeText(button.dataset.copyRecord);button.textContent='已复制';}catch{button.textContent='请选中编号复制';}});
}
function showReviewRecord(record,channelName){
  const source=safePublicUrl(record.url||record.sourceUrl),evidence=record.contentEvidence||{},system=record.systemAssessment,human=record.humanAssessment;
  const evidenceStatus=evidence.reason==='extraction_migration'?'正文提取升级，旧快照不可直接比较':({changed_content:'已存变化证据，需核对正文范围',unchanged_content:'正文未变，仅来源信息变化',missing_previous:'缺少可比前文',new_content:'新文章正文',fetch_error:'正文读取失败'})[evidence.status]||'见现有复核流程';
  document.querySelector('#detail-title').textContent=`${record.reviewType||channelName} 待审记录`;
  document.querySelector('#dialog-content').innerHTML=`<dl><dt>编号</dt><dd><code>${escapeHtml(record.recordId)}</code></dd><dt>品牌 / 国家</dt><dd>${escapeHtml(record.brand)} · ${escapeHtml(record.country)}</dd><dt>发现时间</dt><dd>${escapeHtml(displayTime(record.discoveredAt))}</dd><dt>发布日期</dt><dd>${escapeHtml(displayTime(record.publishDate))}</dd><dt>变化类型</dt><dd>${escapeHtml(({new_content:'新文章',historical_publication:'历史文章补录',content_updated:'文章更新',new_page:'新页面',removed_page:'页面移除',content_change:'页面内容变化'})[record.changeType||record.type]||'待核对')}</dd><dt>摘要</dt><dd>${escapeHtml((record.summary||'请核读原始证据').replace(/&apos;/g,"'").replace(/\s*(?:More|Plus|Mehr)\s*\]\]>\s*$/i,''))}</dd><dt>证据状态</dt><dd>${escapeHtml(evidenceStatus)}${evidence.changedFields?.length?' · '+escapeHtml(evidence.changedFields.map(observationFieldLabel).join('、')):''}</dd>${system?`<dt>系统初判</dt><dd>${escapeHtml(themeLabel(system.marketingTheme))} · ${escapeHtml(newProductLabel(system.newProductRelation))}</dd>`:''}<dt>人工判断</dt><dd>${human?escapeHtml(themeLabel(human.marketingTheme)+' · '+newProductLabel(human.newProductRelation)):'待二次确认'}</dd>${record.discoveryRecordIds?.length?`<dt>同次官网发现</dt><dd>${record.discoveryRecordIds.map(escapeHtml).join('、')}</dd>`:''}</dl>${evidence.beforeExcerpt||evidence.afterExcerpt?`<div class="evidence-compare"><section><strong>变化前片段</strong><p>${escapeHtml(evidence.beforeExcerpt||'无可比片段')}</p></section><section><strong>变化后片段</strong><p>${escapeHtml(evidence.afterExcerpt||'无可比片段')}</p></section></div>`:''}${record.productExposure?.length?`<p class="evidence">文章产品露出：${record.productExposure.map(item=>escapeHtml(item.name)).join('、')}</p>`:''}${source?`<p><a href="${escapeHtml(source)}" target="_blank" rel="noreferrer">查看原页面</a></p>`:''}<p class="evidence">系统初判与复核结论分别保存；查看本记录不会批准、驳回或合并其他观察。</p>`;
  openDetail();
}
function renderScopedDashboard(){
  const summary=monitorSummaryState;if(!summary)return;
  document.querySelectorAll('[data-dashboard-channel]').forEach(panel=>panel.hidden=channel.value!=='全部'&&panel.dataset.dashboardChannel!==channel.value);
  document.querySelector('#overview-filter-empty').hidden=['全部','官网','Blog','PR'].includes(channel.value);document.querySelector('#overview-filter-empty').textContent=channel.value==='EDM'?'EDM 此处展示内容复核状态；收录数量不代表完整收信覆盖。':channel.value==='社媒广告'?'广告渠道提供 Mammotion 美国 Meta 公开观察；观察库存与正式动作分开展示。':'所选渠道尚无公开来源状态；未收录不代表没有营销活动。';
  syncDateUI();
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
  openDetail();
}

function openDetail(){
  const dialog=document.querySelector('#detail-dialog');
  if(!dialog.open)dialog.showModal();
  dialog.scrollTop=0;document.querySelector('#detail-title').focus({preventScroll:true});
}
async function showFormalAction(action){
  if(!action)return;
  if(!document.querySelector('#detail-dialog').open||!detailSequence.some(a=>a.actionId===action.actionId))detailSequence=sortedActions(filteredFormalActions(),actionSort);
  detailActionId=action.actionId;const request=++detailRequest;
  document.querySelector('#detail-title').textContent=headline(action);
  const evidence=(action.sourceUrls||[]).map(evidenceForUrl).find(Boolean),latest=evidence?.captures?.at(-1);
  const summary=summaryText(action),sentences=summary.match(/[^。！？]+[。！？]?/g)||[summary];
  const index=detailSequence.findIndex(a=>a.actionId===action.actionId);
  const urls=(action.sourceUrls||[]).map(safePublicUrl).filter(Boolean);
  const evidenceDetail=action.channel==='edm'&&action.detailRef?'<div id="edm-formal-detail" aria-live="polite">正在读取邮件内容…</div>':`<section><h3>证据与素材</h3>${urls.length?`<div class="source-links">${urls.map((url,i)=>`<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">原始页面${urls.length>1?' '+(i+1):''} ↗</a>`).join('')}</div>`:'<p class="evidence">尚无可公开展示的原始页面；不补造链接或素材。</p>'}${latest?`<div class="evidence-compare">${evidenceFigure(latest.previousViewportScreenshot,'变化前')}${evidenceFigure(latest.keyRegionScreenshot||latest.viewportScreenshot,'确认时留存证据')}</div>`:'<p class="evidence">暂无公开留存截图；请结合来源或人工记录核读，当前页面不能替代历史证据。</p>'}</section>`;
  document.querySelector('#dialog-content').innerHTML=`<div class="detail-meta"><span>${escapeHtml(action.brand+' · '+action.country+' · '+channelLabel(action.channel))}</span><span>${escapeHtml(actionDateLabel(action))}</span><span>${escapeHtml(stageLabel(action.stage))} · ${action.dateBasis==='manual_record'?'人工台账 · ':''}已复核</span></div><section class="detail-summary"><h3>动作摘要</h3><p>${escapeHtml(sentences[0])}</p></section>${sentences.length>1?`<section class="detail-facts"><h3>关键事实与边界</h3><ul>${sentences.slice(1).map(sentence=>`<li>${escapeHtml(sentence)}</li>`).join('')}</ul></section>`:''}${evidenceDetail}<details class="record-info"><summary>记录信息 · 编号与日期依据</summary><dl><dt>动作编号</dt><dd>${escapeHtml(action.actionId)}</dd><dt>发现时间</dt><dd>${escapeHtml(displayTime(action.discoveredAt))}</dd><dt>来源发布日期</dt><dd>${escapeHtml(action.publishDate||'尚未确认')}</dd>${action.adStartDate||action.adStartedAt?`<dt>广告开始日期</dt><dd>${escapeHtml(action.adStartDate||action.adStartedAt)}</dd>`:''}${action.firstCapturedAt?`<dt>素材首次留存</dt><dd>${escapeHtml(displayTime(action.firstCapturedAt))}</dd>`:''}<dt>复核时间</dt><dd>${escapeHtml(displayTime(action.reviewedAt))}</dd>${action.historicalBackfill?`<dt>历史补录时间</dt><dd>${escapeHtml(displayTime(action.importedAt))}</dd><dt>证据留档时间</dt><dd>${escapeHtml(displayTime(action.capturedAt))}；当前留存内容不代表当日页面的完整历史版本。</dd>`:''}</dl></details>${action.title!==headline(action)||action.summary!==summary?`<details class="record-info"><summary>原文标题与摘要</summary><h3>${escapeHtml(action.title)}</h3><p>${escapeHtml(action.summary)}</p></details>`:''}<div class="detail-navigation"><button data-detail-step="-1" ${index<=0?'disabled':''}>← 上一条</button><span>${index+1} / ${detailSequence.length} · 当前结果</span><button data-detail-step="1" ${index<0||index>=detailSequence.length-1?'disabled':''}>下一条 →</button></div>`;
  document.querySelectorAll('[data-detail-step]').forEach(b=>b.onclick=()=>showFormalAction(detailSequence[index+Number(b.dataset.detailStep)]));
  openDetail();
  if(action.channel==='edm'&&action.detailRef){const markup=await edmMailMarkup(action.detailRef,action);if(request!==detailRequest||!document.querySelector('#detail-dialog').open)return;const target=document.querySelector('#edm-formal-detail');if(target)target.innerHTML=markup;document.querySelector('[data-retry-detail]')?.addEventListener('click',()=>showFormalAction(action));}
}

function renderRecentSummary(actions){
  const brands=new Set(actions.map(a=>a.brand)),recent=[];
  for(const a of actions){if(recent.length===3)break;if(!recent.some(b=>b.brand===a.brand&&b.channel===a.channel))recent.push(a);}
  for(const a of actions){if(recent.length===3)break;if(!recent.includes(a))recent.push(a);}
  const box=document.querySelector('#recent-summary');
  box.innerHTML=`<div class="summary-heading"><div><span class="eyebrow">所选期间 · 已确认内容</span><h2>最近发生了什么</h2></div><div class="summary-counts"><button id="summary-actions"><strong>${actions.length}</strong> 条动作 →</button><button id="summary-brands"><strong>${brands.size}</strong> 个品牌 →</button></div></div><p class="summary-data">动作更新 ${escapeHtml(displayTime(moduleTimes.actions))}（北京时间） · 覆盖不完整 <button id="summary-coverage">查看覆盖</button></p>${actions.length?`<div class="recent-actions">${recent.map(a=>`<button data-recent-action="${escapeHtml(a.actionId)}"><span>${escapeHtml(actionDateInfo(a).day+' · '+a.brand+' · '+a.country+' · '+channelLabel(a.channel))}</span><strong>${escapeHtml(headline(a))}</strong><small>${escapeHtml(cut(summaryText(a),74))}</small><em>查看证据 →</em></button>`).join('')}</div><p class="summary-note">按动作日期选取近期内容，兼顾不同品牌与渠道；仅描述已收录记录，不作活跃度或效果排名。</p>`:emptyMarkup()}`;
  box.querySelectorAll('[data-recent-action]').forEach(b=>b.onclick=()=>showFormalAction(actions.find(a=>a.actionId===b.dataset.recentAction)));
  box.querySelector('#summary-coverage').onclick=()=>{const coverage=document.querySelector('#coverage-overview');coverage.open=true;coverage.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});coverage.querySelector('summary').focus({preventScroll:true});};
  box.querySelector('#summary-actions').onclick=()=>navigateView('library');box.querySelector('#summary-brands').onclick=()=>showActionGroup(actions);
}
function renderTimelineList(actions){
  const box=document.querySelector('#timeline-date-list'),buckets=dateBuckets(actions).reverse();
  box.innerHTML=buckets.length?buckets.map((b,i)=>`<details class="date-action-group" ${i<2?'open':''}><summary><time>${escapeHtml(b.day)}</time><span>${b.records.length} 条动作</span></summary>${actionListMarkup(b.records)}</details>`).join(''):emptyMarkup();bindReadableActions(box,actions);
}
function syncTimelineView(){
  const list=timelineView==='list';document.querySelector('#formal-timeline').hidden=list;document.querySelector('#timeline-date-list').hidden=!list;
  document.querySelector('#timeline-grain').hidden=list;document.querySelector('.timeline-footer').hidden=list;document.querySelector('.timeline-legend').hidden=list;
  document.querySelectorAll('[data-timeline-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.timelineView===timelineView)));
  if(!list){if(timelineState.autoposition){const scroller=document.querySelector('#formal-timeline');scroller.scrollLeft=Math.max(0,timelineState.latestX-(scroller.clientWidth-(scroller.querySelector('.gantt-sticky')?.offsetWidth||154))*.55);timelineState.autoposition=false;}timelineState.updateRange?.();}
}
function renderCoverage(actions){
  const codes=channel.value==='全部'?['official_site','blog','pr','edm','social_ads','video']:Object.keys({official_site:1,blog:1,pr:1,edm:1,social_ads:1,video:1}).filter(c=>channelLabel(c)===channel.value);
  const names=brand.value==='全部'?['Mammotion','Mova','Dreame','Ecovacs','Eufy','Navimow']:[brand.value];
  const rows=names.map(name=>`<tr><th scope="row">${escapeHtml(name)}</th>${codes.map(code=>{
    const count=actions.filter(a=>a.brand===name&&a.channel===code).length;
    const sources=code==='official_site'?monitorSummaryState?.sites:code==='blog'?monitorSummaryState?.channelMonitoring?.sources:code==='pr'?monitorSummaryState?.prMonitoring?.sources:null;
    const n=(sources||[]).filter(s=>matchesScope(s.site||s.source,{brand:name,market:market.value})).length;
    const archived=formalActionState.filter(a=>a.brand===name&&a.channel===code&&matchesScope(a,{brand:name,market:market.value})).length;
    const note=sources?n?`接入 ${n} 个来源`:'暂无已接入来源':!monitorSummaryState&&['official_site','blog','pr'].includes(code)?'来源状态未加载':code==='social_ads'?'美国 Meta 已有公开观察（库存不计动作）':code==='edm'?archived?'已有内容收录，覆盖不完整':'尚未收录公开内容':'尚未覆盖公开来源';
    return `<td><strong>${count} 条</strong><small>${escapeHtml(note)}</small></td>`;
  }).join('')}</tr>`).join('');
  document.querySelector('#coverage-matrix').innerHTML=`<div class="table-wrap"><table><thead><tr><th>品牌 / 所选国家</th>${codes.map(c=>`<th>${channelLabel(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderFilterChips(operational){
  const chips=[];for(const [key,control] of [['brand',brand],['market',market],['channel',channel]])if(control.value!=='全部')chips.push([key,control.value]);
  if(!operational){if(campaignFilter.value)chips.push(['campaign',campaignCalendar.find(e=>e.id===campaignFilter.value)?.title||'营销节点']);if(datePreset!=='all')chips.push(['date',document.querySelector('#date-preset-label').textContent]);if(queryText)chips.push(['query','搜索：'+queryText]);}
  const box=document.querySelector('#filter-chips');box.innerHTML=chips.map(([key,label])=>`<button data-remove-filter="${key}" aria-label="移除${escapeHtml(label)}">${escapeHtml(label)} <span>×</span></button>`).join('');
  document.querySelector('#selected-filter-count').textContent=chips.length;
  document.querySelector('#mobile-filter-brief').textContent=chips.map(c=>c[1]).join(' · ')||'全部已确认动作';
  document.querySelector('.global-search').hidden=operational;
  box.querySelectorAll('[data-remove-filter]').forEach(b=>b.onclick=()=>{const key=b.dataset.removeFilter;if(key==='date'||key==='campaign')setDateRange('all');else if(key==='query'){queryText='';document.querySelector('#action-search').value='';}else{({brand,market,channel})[key].value='全部';if(key==='channel'){document.querySelector('#website-content-type').value='';}}filtersChanged();});
}
function persistRoute(){
  if(restoringRoute)return;const url=new URL(location.href);
  const state={brand:brand.value==='全部'?'':brand.value,market:market.value==='全部'?'':market.value,channel:channel.value==='全部'?'':channel.value,q:queryText,preset:datePreset,from:activePeriod.from,to:activePeriod.to,campaign:campaignFilter.value||(!initialCampaignApplied?requestedCampaign:''),category:contentCategory,sort:actionSort,density:contentDensity,grain:timelineState.grain,mode:timelineView,type:document.querySelector('#website-content-type').value};
  for(const [key,value] of Object.entries(state)){if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);}
  url.hash=currentView;history.replaceState(history.state,'',url);
}
function restoreRoute(){
  restoringRoute=true;const params=new URL(location.href).searchParams;requestedCampaign=params.get('campaign')||'';
  for(const [key,control] of [['brand',brand],['market',market],['channel',channel]])control.value=[...control.options].some(o=>o.value===params.get(key))?params.get(key):'全部';
  queryText=(params.get('q')||'').slice(0,300);document.querySelector('#action-search').value=queryText;
  datePreset=['30','90','all','season','custom','campaign'].includes(params.get('preset'))?params.get('preset'):params.has('campaign')?'campaign':'30';
  activePeriod=datePreset==='all'?{from:'',to:''}:dateRange(datePreset,formalActionState);
  if(datePreset==='season'){const year=todayDay().slice(0,4);activePeriod={from:`${year}-08-28`,to:`${Number(year)+1}-01-20`};}
  if(params.has('from')||params.has('to')||['custom','campaign'].includes(datePreset)){try{const from=params.get('from'),to=params.get('to');if(!from||!to)throw Error();timelineGeometry([],{from,to});activePeriod={from,to};}catch{activePeriod=dateRange('30',formalActionState);datePreset='30';}}
  const selected=campaignCalendar.find(e=>e.id===params.get('campaign'));campaignFilter.value=selected?.id||'';if(selected){campaignFilter.value=selected.id;activePeriod={from:selected.monitoringWindow.start,to:selected.monitoringWindow.end};datePreset='campaign';}
  contentCategory=['web','pr','edm','ads'].includes(params.get('category'))?params.get('category'):channel.value==='EDM'?'edm':channel.value==='PR'?'pr':['社媒广告','视频'].includes(channel.value)?'ads':'web';
  actionSort=['oldest','brand'].includes(params.get('sort'))?params.get('sort'):'newest';document.querySelector('#action-sort').value=actionSort;
  contentDensity=params.get('density')==='compact'?'compact':'cards';timelineState.grain=params.get('grain')==='day'?'day':'week';document.querySelector('#timeline-grain').value=timelineState.grain;
  timelineView=['list','timeline'].includes(params.get('mode'))?params.get('mode'):matchMedia('(max-width:680px)').matches?'list':'timeline';
  document.querySelector('#website-content-type').value=['official_site','blog'].includes(params.get('type'))?params.get('type'):'';
  timelineState.autoposition=true;activateView(location.hash.slice(1));restoringRoute=false;renderScopedDashboard();renderCurrentFormalActions();syncDateUI();syncTimelineView();
  document.querySelectorAll('[data-density]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.density===contentDensity)));
}
function filtersChanged(){
  timelineState.autoposition=true;
  if(currentView==='content'){contentCategory=channel.value==='EDM'?'edm':channel.value==='PR'?'pr':['社媒广告','视频'].includes(channel.value)?'ads':'web';}
  document.querySelector('#website-content-type').value=channel.value==='Blog'?'blog':channel.value==='官网'?'official_site':'';
  renderScopedDashboard();renderCurrentFormalActions();window.dispatchEvent(new Event('dashboard:filters-changed'));
}
function navigateView(view){history.pushState(null,'','#'+view);activateView(view);persistRoute();}

// Dashboard startup.
history.scrollRestoration='manual';
// Normalize the browser's initial fragment positioning after the first load.
window.addEventListener('load',()=>requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'instant'})),{once:true});
document.querySelector('#website-content-type').onchange=()=>{const value=document.querySelector('#website-content-type').value;channel.value=value?channelLabel(value):'全部';filtersChanged();};
document.querySelector('#website-review-type').onchange=renderReviewInbox;
[market,brand,channel].forEach(control=>control.addEventListener('change',filtersChanged));
campaignFilter.onchange=()=>selectCampaign(campaignFilter.value);
document.querySelector('#reset-filters').onclick=()=>{market.value=brand.value=channel.value='全部';queryText='';document.querySelector('#action-search').value='';document.querySelector('#website-content-type').value='';setDateRange('all');renderScopedDashboard();window.dispatchEvent(new Event('dashboard:filters-changed'));};
function activateView(view){
  const aliases={'social-ads-monitor':'content','ads-evidence-followups':'content',ads:'content',edm:'content',schedule:'status'};
  const target=aliases[view]||(['overview','library','content','review','status'].includes(view)?view:'overview');currentView=target;
  if(['ads','social-ads-monitor','ads-evidence-followups'].includes(view))contentCategory='ads';
  if(view==='edm')contentCategory='edm';
  document.querySelectorAll('.nav-item').forEach(item=>{const active=item.dataset.view===target;item.classList.toggle('active',active);item.setAttribute('aria-current',active?'page':'false');});
  document.querySelectorAll('.view').forEach(item=>item.classList.toggle('active',item.id===target));
  const titles={overview:['竞品营销节奏','营销动作 · 已确认内容'],library:['动作库','完整记录 · 内容与证据'],content:['渠道内容','官网与 Blog / PR / EDM / 广告'],review:['复核中心','待处理线索 · 原始证据'],status:['运行状态','来源覆盖 · 实际采集结果']};
  document.querySelector('#page-title').textContent=titles[target][0];document.querySelector('#page-subtitle').textContent=titles[target][1];
  document.querySelector('.date-control').hidden=['review','status'].includes(target);document.querySelector('#global-filters').classList.toggle('operational-scope',['review','status'].includes(target));
  if(target!=='overview')setTimelineFocus(false);
  if(view==='edm'){channel.value='EDM';renderCurrentFormalActions();}
  if(['ads','social-ads-monitor','ads-evidence-followups'].includes(view)){channel.value='社媒广告';renderCurrentFormalActions();}
  if(target==='content'){contentCategory=channel.value==='EDM'?'edm':channel.value==='PR'?'pr':['社媒广告','视频'].includes(channel.value)?'ads':'web';renderContentView();}
  syncDateUI();adoptInternalAds();window.scrollTo(0,0);
}
document.querySelectorAll('.nav-item').forEach(button=>button.onclick=()=>{navigateView(button.dataset.view);});
window.addEventListener('popstate',restoreRoute);
window.addEventListener('hashchange',()=>{const view=location.hash.slice(1);if(view!==currentView){activateView(view);persistRoute();}});
document.querySelectorAll('[data-content-tab]').forEach(button=>button.onclick=()=>{
  document.querySelector('#website-content-type').value='';contentCategory=button.dataset.contentTab;channel.value=contentCategory==='edm'?'EDM':contentCategory==='pr'?'PR':contentCategory==='ads'?'社媒广告':['官网','Blog'].includes(channel.value)?channel.value:'全部';
  renderScopedDashboard();renderCurrentFormalActions();renderContentView();window.dispatchEvent(new Event('dashboard:filters-changed'));
});
function closeDates(){const wasOpen=!document.querySelector('#date-panel').hidden;document.querySelector('#date-panel').hidden=true;document.querySelector('#date-toggle').setAttribute('aria-expanded','false');if(wasOpen&&document.querySelector('#date-panel').contains(document.activeElement))document.querySelector('#date-toggle').focus({preventScroll:true});}
document.querySelector('#date-toggle').onclick=()=>{const panel=document.querySelector('#date-panel');panel.hidden=!panel.hidden;document.querySelector('#date-toggle').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){actionFrom.value=activePeriod.from;actionTo.value=activePeriod.to;document.querySelector('#date-error').textContent='';}};
document.querySelector('#date-close').onclick=closeDates;
document.querySelectorAll('[data-date-preset]').forEach(button=>button.onclick=()=>{setDateRange(button.dataset.datePreset);closeDates();});
document.querySelector('#apply-dates').onclick=()=>{
  const from=actionFrom.value,to=actionTo.value;
  try{timelineGeometry(formalActionState,{from,to});if(!from||!to)throw new Error('请选择开始和结束日期');}
  catch(error){document.querySelector('#date-error').textContent=error.message;return;}
  activePeriod={from,to};datePreset='custom';campaignFilter.value='';updateCampaignUrl('');timelineState.scroll=0;timelineState.autoposition=true;closeDates();renderCurrentFormalActions();renderEventClusters(marketingEventState);
};
document.addEventListener('click',event=>{if(!event.target.closest('.date-control'))closeDates();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('#detail-dialog').open&&!document.querySelector('#image-dialog').open){closeDates();setTimelineFocus(false);if(document.querySelector('#global-filters').classList.contains('filters-open')){document.querySelector('#global-filters').classList.remove('filters-open');document.querySelector('#mobile-filter-toggle').setAttribute('aria-expanded','false');document.querySelector('#mobile-filter-toggle').focus({preventScroll:true});}}});
document.querySelector('#expand-timeline').onclick=()=>setTimelineFocus(!timelineState.focus);
document.querySelectorAll('[data-pan]').forEach(button=>button.onclick=()=>{const scroller=document.querySelector('#formal-timeline');scroller.scrollBy({left:Number(button.dataset.pan)*scroller.clientWidth*.8,behavior:'smooth'});});
document.querySelector('#latest-action').onclick=()=>{const scroller=document.querySelector('#formal-timeline');scroller.scrollTo({left:Math.max(0,timelineState.latestX-(scroller.clientWidth-154)*.55),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});};
restoreRoute();
const adsObserver=new MutationObserver(()=>{if(adoptInternalAds())adsObserver.disconnect();});
if(!adoptInternalAds())adsObserver.observe(document.querySelector('main'),{childList:true,subtree:true});
document.querySelector('#detail-dialog .dialog-head button').onclick=()=>document.querySelector('#detail-dialog').close();
document.querySelector('#detail-dialog').onclick=event=>{if(event.target===event.currentTarget)event.currentTarget.close();};

document.querySelector('#reset-edm-filters').onclick=()=>{document.querySelector('#edm-search').value='';setDateRange('all');market.value=brand.value='全部';channel.value='EDM';renderCurrentFormalActions();};
document.querySelector('#mobile-filter-toggle').onclick=()=>{const box=document.querySelector('#global-filters'),opened=box.classList.toggle('filters-open');document.querySelector('#mobile-filter-toggle').setAttribute('aria-expanded',String(opened));};
document.querySelector('#action-sort').onchange=event=>{actionSort=event.target.value;renderFormalActions(filteredFormalActions());persistRoute();};
document.querySelector('#timeline-grain').onchange=event=>{timelineState.grain=event.target.value;timelineState.autoposition=true;renderCurrentFormalActions();};
document.querySelectorAll('[data-timeline-view]').forEach(b=>b.onclick=()=>{timelineView=b.dataset.timelineView;renderFormalTimeline(filteredFormalActions());syncTimelineView();persistRoute();});
document.querySelectorAll('[data-density]').forEach(b=>b.onclick=()=>{contentDensity=b.dataset.density;document.querySelectorAll('[data-density]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.density===contentDensity)));renderContentView();persistRoute();});
let searchTimer;document.querySelector('#action-search').addEventListener('input',event=>{queryText=event.target.value.trim();clearTimeout(searchTimer);searchTimer=setTimeout(filtersChanged,160);});
document.addEventListener('click',event=>{const button=event.target.closest('[data-empty-clear]');if(!button)return;if(button.dataset.emptyClear==='all')document.querySelector('#reset-filters').click();else if(button.dataset.emptyClear==='query'){queryText='';document.querySelector('#action-search').value='';filtersChanged();}else setDateRange('all');});
const detailDialog=document.querySelector('#detail-dialog');let returnFocus=null,returnFocusSelector='',returnScroll=0;
const nativeShowModal=detailDialog.showModal.bind(detailDialog);detailDialog.showModal=()=>{returnFocus=document.activeElement;returnFocusSelector='';const attr=[...returnFocus.attributes].find(a=>a.name.startsWith('data-'));if(returnFocus.id)returnFocusSelector='#'+CSS.escape(returnFocus.id);else if(attr){const parent=returnFocus.parentElement.closest('[id]');returnFocusSelector=(parent?'#'+CSS.escape(parent.id)+' ':'')+'['+attr.name+'="'+CSS.escape(attr.value)+'"]';}returnScroll=window.scrollY;document.body.classList.add('detail-open');nativeShowModal();};
detailDialog.addEventListener('close',()=>{detailRequest++;document.body.classList.remove('detail-open');const target=returnFocus?.isConnected?returnFocus:returnFocusSelector?document.querySelector(returnFocusSelector):null;if(target)target.focus({preventScroll:true});else document.querySelector('.nav-item.active').focus({preventScroll:true});window.scrollTo({top:returnScroll,behavior:'instant'});});
const imageDialog=document.querySelector('#image-dialog');let imageTrigger=null;
detailDialog.addEventListener('click',event=>{const img=event.target.closest('#dialog-content img');if(!img)return;imageTrigger=img;document.querySelector('#zoom-image').src=img.src;document.querySelector('#zoom-image').alt=img.alt;document.querySelector('#zoom-caption').textContent=img.alt;imageDialog.showModal();});
new MutationObserver(()=>{document.querySelectorAll('#dialog-content img:not([tabindex])').forEach(img=>{img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','放大：'+img.alt);img.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();img.click();}};});}).observe(document.querySelector('#dialog-content'),{childList:true,subtree:true});
document.querySelector('#image-close').onclick=()=>imageDialog.close();imageDialog.addEventListener('click',e=>{if(e.target===imageDialog)imageDialog.close();});imageDialog.addEventListener('close',()=>imageTrigger?.focus({preventScroll:true}));
window.addEventListener('resize',()=>timelineState.updateRange?.());
async function refreshDashboard(){const button=document.querySelector('#refresh-dashboard');button.disabled=true;button.textContent='刷新中…';try{await Promise.allSettled([loadMonitorSummary(),loadSiteObservations(),loadActionData(),loadEventData(),loadEdmLibrary(),loadCampaignCalendar(),loadPublicAds()]);}finally{button.disabled=false;button.textContent='刷新数据';}}

// Reads the deployed export only; this never launches a collector or a browser.
setInterval(()=>{loadPublicAds();},60000);
document.querySelector('#refresh-dashboard').onclick=refreshDashboard;
refreshDashboard();
