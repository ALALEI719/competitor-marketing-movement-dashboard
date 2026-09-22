const actions=[
  {id:1,date:'12/18',brand:'Mova',market:'德国',channel:'EDM',title:'CES 神秘新品预告首次发送',stage:'预热',confidence:'高',left:2,width:18},
  {id:2,date:'12/23',brand:'Mammotion',market:'美国',channel:'社媒广告',title:'“边界突破”主题短视频素材上线',stage:'预热',confidence:'待复核',left:17,width:22},
  {id:3,date:'12/28',brand:'Eufy',market:'德国',channel:'PR',title:'Newsroom 发布 CES 参展预告',stage:'官宣',confidence:'高',left:30,width:19},
  {id:4,date:'01/02',brand:'Mova',market:'美国',channel:'官网',title:'首页上线 CES 倒计时与新品入口',stage:'引流',confidence:'高',left:42,width:20},
  {id:5,date:'01/06',brand:'Dreame',market:'德国',channel:'官网',title:'新品 PDP、售价与购买 CTA 同步上线',stage:'发布',confidence:'高',left:53,width:21},
  {id:6,date:'01/06',brand:'Dreame',market:'美国',channel:'PR',title:'发布旗舰新品与核心卖点新闻稿',stage:'发布',confidence:'高',left:53,width:21},
  {id:7,date:'01/07',brand:'Mammotion',market:'英国',channel:'视频',title:'发布展台演示与功能讲解视频',stage:'发布',confidence:'高',left:57,width:18},
  {id:8,date:'01/09',brand:'Ecovacs',market:'美国',channel:'EDM',title:'高意向用户收到首发优惠码',stage:'转化',confidence:'中',left:65,width:18},
  {id:9,date:'01/12',brand:'Mova',market:'法国',channel:'社媒广告',title:'素材切换为媒体奖项与测评背书',stage:'口碑',confidence:'高',left:76,width:20}
];

const personas=[
  ['○','零行为对照组','不打开、不点击，不加载追踪像素','9 封'],
  ['◐','只打开组','允许加载完整邮件，不点击链接','10 封'],
  ['✦','新品兴趣组','只点击新品与发布会内容','12 封'],
  ['A','产品线 A','仅浏览产品 A 页面','11 封'],
  ['B','产品线 B','仅浏览产品 B 页面','10 封'],
  ['%','促销敏感组','只点击折扣、Offer 与优惠码','13 封'],
  ['↑','高意向组','浏览产品并模拟加购但不购买','14 封'],
  ['—','长期沉默组','持续不打开，观察唤醒邮件','8 封']
];

const market=document.querySelector('#market-filter');
const brand=document.querySelector('#brand-filter');
const channel=document.querySelector('#channel-filter');
let evidenceIndex={entries:{}};

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}

async function loadEvidenceIndex(){
  try{
    const response=await fetch('./data/evidence/index.json',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }catch{return {entries:{}};}
}

async function loadFormalActions(){
  try{
    const response=await fetch('./data/formal-actions.json',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }catch{return {actions:[]};}
}

async function loadMarketingEvents(){
  try{
    const response=await fetch('./data/marketing-events.json',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }catch{return {events:[]};}
}

function channelLabel(channel){return ({official_site:'官网',pr:'PR',blog:'Blog',social_ads:'社媒广告',video:'视频',edm:'EDM'})[channel]||channel;}

function reviewLabel(status){return ({pending:'待复核',approved:'已确认',rejected:'已驳回'})[status]||status;}
function renderChannelMonitoring(monitoring){
  const sources=monitoring?.sources||[];
  const healthy=sources.filter(item=>item.status==='ok').length;
  document.querySelector('#channel-source-status').textContent=sources.length?`${healthy}/${sources.length} 正常`:'暂无数据';
  document.querySelector('#channel-source-status').className=`badge ${healthy===sources.length?'green':'orange'}`;
  document.querySelector('#channel-source-list').innerHTML=sources.length?sources.map(item=>`<a class="channel-source-card ${item.status==='ok'?'healthy':'error'}" href="${escapeHtml(item.source.url)}" target="_blank" rel="noreferrer"><div><strong>${escapeHtml(item.source.country)} · ${escapeHtml(channelLabel(item.source.channel))}</strong><span>${item.status==='ok'?`${item.itemCount} 条基线内容`:`采集异常：${escapeHtml(item.error||'未知错误')}`}</span></div><em>${item.status==='ok'?'正常':'需排查'}</em></a>`).join(''):'<div class="coverage-loading">尚未建立渠道基线</div>';
  const records=monitoring?.pendingRecords||[];
  document.querySelector('#channel-record-list').innerHTML=records.length?records.slice(0,8).map(item=>`<article><a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.country)} · ${escapeHtml(channelLabel(item.channel))} · ${item.publishDate?new Date(item.publishDate).toLocaleDateString('zh-CN'):'发布日期待确认'}</span></a><small><code>${escapeHtml(item.recordId)}</code> · <a href="https://github.com/ALALEI719/competitor-marketing-movement-tracking/actions/workflows/review-channel-record.yml" target="_blank" rel="noreferrer">前往复核</a></small></article>`).join(''):'<div class="timeline-empty">当前没有新增或更新的 PR / Blog 内容。</div>';
}
function renderReviewQueue(candidates){
  const pending=candidates.filter(item=>item.reviewStatus==='pending').length;
  document.querySelector('#review-pending-count').textContent=`${pending} 个待复核`;
  document.querySelector('#review-queue-body').innerHTML=candidates.length?candidates.map(item=>`<tr><td><code>${escapeHtml(item.entityId)}</code></td><td>${escapeHtml(item.brand)} · ${escapeHtml((item.countries||[]).join(' / '))}</td><td>${escapeHtml(new Date(item.firstSeenAt).toLocaleString('zh-CN',{hour12:false}))}</td><td>${item.confidenceScore}</td><td><span class="review-status ${escapeHtml(item.reviewStatus)}">${reviewLabel(item.reviewStatus)}</span></td><td><button class="secondary compact" data-review-candidate="${escapeHtml(item.entityId)}">查看证据</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty-cell">当前没有新品候选</td></tr>';
  document.querySelectorAll('[data-review-candidate]').forEach(button=>button.onclick=()=>showCandidate(candidates.find(item=>item.entityId===button.dataset.reviewCandidate)));
}

function renderFormalActions(actions){
  document.querySelector('#formal-action-count').textContent=`${actions.length} 条`;
  document.querySelector('#formal-action-table').innerHTML=actions.length?actions.map((action,index)=>`<tr data-formal-action="${index}"><td>${escapeHtml(new Date(action.discoveredAt).toLocaleString('zh-CN',{hour12:false}))}</td><td><span class="pill">${escapeHtml(action.brand)}</span>　${escapeHtml(action.country)}</td><td>${escapeHtml(channelLabel(action.channel))}</td><td>${escapeHtml(action.title)}</td><td>${escapeHtml(action.stage)}</td><td><span class="review-status approved">已复核</span></td></tr>`).join(''):'<tr><td colspan="6" class="empty-cell">目前没有通过复核的真实营销动作</td></tr>';
  document.querySelectorAll('[data-formal-action]').forEach(row=>row.onclick=()=>showFormalAction(actions[Number(row.dataset.formalAction)]));
}

function renderFormalTimeline(actions){
  const container=document.querySelector('#formal-timeline');
  const axis=document.querySelector('#formal-timeline-axis');
  if(!actions.length){axis.innerHTML='';container.innerHTML='<div class="timeline-empty">尚无已确认动作；候选通过复核后会自动出现在这里。</div>';return;}
  const times=actions.map(action=>new Date(action.discoveredAt).getTime());
  const min=Math.min(...times),max=Math.max(...times),span=Math.max(max-min,24*60*60*1000);
  const format=value=>new Date(value).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'});
  axis.innerHTML=`<span>${format(min)}</span><span>${format(min+span/2)}</span><span>${format(max)}</span>`;
  const groups=[...new Set(actions.map(action=>`${action.brand}|${action.country}`))];
  container.innerHTML=groups.map(group=>{const [brandName,country]=group.split('|');const groupActions=actions.filter(action=>action.brand===brandName&&action.country===country);return `<div class="lane"><div class="lane-label"><strong>${escapeHtml(brandName)}</strong><span>${escapeHtml(country)}</span></div><div class="track">${groupActions.map(action=>{const index=actions.indexOf(action);const left=2+((new Date(action.discoveredAt).getTime()-min)/span)*82;return `<button class="event ${escapeHtml(channelLabel(action.channel))}" data-formal-timeline="${index}" style="left:${left}%;width:${Math.min(18,96-left)}%">${escapeHtml(action.stage)} · ${escapeHtml(channelLabel(action.channel))}</button>`;}).join('')}</div></div>`;}).join('');
  document.querySelectorAll('[data-formal-timeline]').forEach(button=>button.onclick=()=>showFormalAction(actions[Number(button.dataset.formalTimeline)]));
}

function renderEventClusters(events){
  document.querySelector('#event-cluster-list').innerHTML=events.length?events.map(event=>`<article class="event-card"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.countries.join(' / '))}</span><p>${event.actionCount} 个动作 · ${escapeHtml(event.channels.map(channelLabel).join(' + '))}</p><em>${escapeHtml(event.stages.join(' → '))}</em></article>`).join(''):'<div class="timeline-empty">正式动作出现后，将按产品实体、渠道和国家聚合为发布事件。</div>';
}

async function loadMonitorSummary(){
  try{
    const [response,evidence,formalActions,marketingEvents]=await Promise.all([fetch('./data/monitor-summary.json',{cache:'no-store'}),loadEvidenceIndex(),loadFormalActions(),loadMarketingEvents()]);
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const summary=await response.json();
    evidenceIndex=evidence;
    renderChannelMonitoring(summary.channelMonitoring);
    document.querySelector('#real-healthy').textContent=`${summary.totals.healthySites}/${summary.totals.sites}`;
    document.querySelector('#real-pages').textContent=summary.totals.pages.toLocaleString('zh-CN');
    document.querySelector('#real-pending').textContent=summary.totals.pendingChanges;
    const candidates=summary.productRadar?.candidates||[];
    renderReviewQueue(candidates);
    renderFormalActions(formalActions.actions||[]);
    renderFormalTimeline(formalActions.actions||[]);
    renderEventClusters(marketingEvents.events||[]);
    document.querySelector('#radar-count').textContent=candidates.length?`${candidates.length} 个待复核`:'暂无候选';
    document.querySelector('#radar-list').innerHTML=candidates.length?candidates.slice(0,6).map((item,index)=>`<button class="radar-item" data-candidate="${index}"><div><strong>${escapeHtml(item.temporaryName)}</strong><span>${escapeHtml(item.entityId)} · ${escapeHtml(item.countries.join(' / '))}</span></div><p>${escapeHtml(item.observedNames?.[0]||'官方型号尚未确认')}</p><em>${item.launchStage==='multi_source_candidate'?'多源候选':'弱信号'} · ${item.confidenceScore} 分</em></button>`).join(''):`<div class="radar-empty"><strong>当前没有达到阈值的新品候选</strong><span>已建立 ${Object.keys(evidenceIndex.entries||{}).length} 个关键页面截图基线；系统继续通过 HTML 检查新增 URL、预热词、价格、Offer、CTA 与结构化商品信息，仅在出现候选时再次截图。</span></div>`;
    document.querySelectorAll('[data-candidate]').forEach(button=>button.onclick=()=>showCandidate(candidates[Number(button.dataset.candidate)]));
    document.querySelector('#baseline-status').textContent=summary.sites.every(site=>site.status==='ok')?'基线正常':'部分异常';
    document.querySelector('#data-updated-at').textContent=`真实数据更新 ${new Date(summary.generatedAt).toLocaleString('zh-CN',{hour12:false})}`;
    document.querySelector('#coverage-grid').innerHTML=summary.sites.map(site=>`<a class="coverage-card" href="${site.site.siteUrl}" target="_blank" rel="noreferrer"><span><b>${site.site.country}</b><small>${site.site.countryCode} · ${site.site.priority}</small></span><strong>${site.pageCount}</strong><p>产品 ${site.breakdown.product||0} · Blog ${site.breakdown.blog||0} · 集合页 ${site.breakdown.collection||0}</p><em>${site.status==='ok'?'基线已建立':'采集异常'}</em></a>`).join('');
  }catch(error){
    document.querySelector('#baseline-status').textContent='数据不可用';
    document.querySelector('#coverage-grid').innerHTML=`<div class="coverage-loading">真实基线暂时无法读取：${error.message}</div>`;
    document.querySelector('#data-updated-at').textContent='真实数据尚未加载';
    document.querySelector('#radar-count').textContent='数据不可用';
    document.querySelector('#radar-list').innerHTML='<div class="coverage-loading">新品雷达数据暂时无法读取</div>';
    renderChannelMonitoring(null);
  }
}

function currentActions(){return actions.filter(a=>(market.value==='全部'||a.market===market.value)&&(brand.value==='全部'||a.brand===brand.value)&&(channel.value==='全部'||a.channel===channel.value));}

function renderActions(){
  const data=currentActions();
  document.querySelector('#action-count').textContent=data.length===actions.length?'42':data.length;
  document.querySelector('#action-table').innerHTML=data.length?data.map(a=>`<tr data-action="${a.id}"><td>${a.date} · 09:${String(a.id*7).padStart(2,'0')}</td><td><span class="pill">${a.brand}</span>　${a.market}</td><td>${a.channel}</td><td>${a.title}</td><td>${a.stage}</td><td>${a.confidence}</td></tr>`).join(''):'<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">当前筛选没有模拟记录</td></tr>';
  const groups=[...new Map(data.map(a=>[`${a.brand}-${a.market}`,a])).values()];
  document.querySelector('#timeline-rows').innerHTML=groups.map(g=>`<div class="lane"><div class="lane-label"><strong>${g.brand}</strong><span>${g.market}</span></div><div class="track">${data.filter(a=>a.brand===g.brand&&a.market===g.market).map(a=>`<button class="event ${a.channel}" data-action="${a.id}" style="left:${a.left}%;width:${Math.min(a.width,98-a.left)}%">${a.stage} · ${a.channel}</button>`).join('')}</div></div>`).join('');
  bindActionClicks();
}

function bindActionClicks(){document.querySelectorAll('[data-action]').forEach(el=>el.onclick=()=>showAction(Number(el.dataset.action)));}
function showAction(id){
  const a=actions.find(item=>item.id===id);if(!a)return;
  document.querySelector('#detail-title').textContent='动作详情';
  document.querySelector('#dialog-content').innerHTML=`<dl><dt>品牌 / 市场</dt><dd>${a.brand} · ${a.market}</dd><dt>发现时间</dt><dd>2026/${a.date}</dd><dt>渠道</dt><dd>${a.channel}</dd><dt>营销阶段</dt><dd>${a.stage}</dd><dt>AI判断</dt><dd>该动作与 CES 新品发布事件高度相关，建议关联至统一事件链。</dd><dt>可信度</dt><dd>${a.confidence}</dd></dl><div class="evidence">证据包：计划保存原始 URL、页面截图、内容指纹、首次发现时间和关键字段。当前为模拟记录。</div>`;
  document.querySelector('#detail-dialog').showModal();
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
  document.querySelector('#dialog-content').innerHTML=`<dl><dt>临时编号</dt><dd><code>${escapeHtml(candidate.entityId)}</code></dd><dt>正式型号</dt><dd>${escapeHtml(candidate.canonicalName||'尚未确认')}</dd><dt>国家站点</dt><dd>${escapeHtml((candidate.countries||[]).join(' / '))}</dd><dt>首次发现</dt><dd>${escapeHtml(new Date(candidate.firstSeenAt).toLocaleString('zh-CN',{hour12:false}))}</dd><dt>当前阶段</dt><dd>${candidate.launchStage==='multi_source_candidate'?'多源候选':'弱信号'}</dd><dt>命中信号</dt><dd>${escapeHtml(signals.join('、')||'结构化商品信息')}</dd><dt>复核状态</dt><dd>${escapeHtml(reviewLabel(candidate.reviewStatus))}</dd></dl><div class="source-links">${references.map(reference=>`<a href="${escapeHtml(reference.url)}" target="_blank" rel="noreferrer">查看 ${escapeHtml(reference.siteId)} 原页面</a>`).join('')}</div><div class="evidence-compare">${evidenceFigure(latest?.previousViewportScreenshot,'变化前')}${evidenceFigure(latest?.keyRegionScreenshot||latest?.viewportScreenshot,'变化后 / 当前证据')}</div><div class="evidence">HTML 负责判断标题、正文、价格、Offer、CTA 和结构化商品数据是否变化；截图只用于视觉补充与证据留档。候选完成复核前不会进入正式营销动作时间轴。</div>${candidate.reviewStatus==='pending'?'<a class="primary dialog-review-link" href="https://github.com/ALALEI719/competitor-marketing-movement-tracking/actions/workflows/review-product-candidate.yml" target="_blank" rel="noreferrer">前往私有复核入口</a>':''}`;
  document.querySelector('#detail-dialog').showModal();
}

function showFormalAction(action){
  if(!action)return;
  document.querySelector('#detail-title').textContent='正式营销动作';
  const evidence=(action.sourceUrls||[]).map(evidenceForUrl).find(Boolean);
  const latest=evidence?.captures?.at(-1);
  document.querySelector('#dialog-content').innerHTML=`<dl><dt>动作编号</dt><dd><code>${escapeHtml(action.actionId)}</code></dd><dt>品牌 / 国家</dt><dd>${escapeHtml(action.brand)} · ${escapeHtml(action.country)}</dd><dt>渠道</dt><dd>${escapeHtml(channelLabel(action.channel))}</dd><dt>发现时间</dt><dd>${escapeHtml(new Date(action.discoveredAt).toLocaleString('zh-CN',{hour12:false}))}</dd><dt>营销阶段</dt><dd>${escapeHtml(action.stage)}</dd><dt>动作摘要</dt><dd>${escapeHtml(action.summary)}</dd><dt>状态</dt><dd>已复核</dd></dl><div class="source-links">${(action.sourceUrls||[]).map(url=>`<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">查看原始页面</a>`).join('')}</div><div class="evidence-compare">${evidenceFigure(latest?.previousViewportScreenshot,'变化前')}${evidenceFigure(latest?.keyRegionScreenshot||latest?.viewportScreenshot,'确认时证据')}</div>`;
  document.querySelector('#detail-dialog').showModal();
}

[market,brand,channel].forEach(control=>control.addEventListener('change',renderActions));
document.querySelector('#reset-filters').onclick=()=>{market.value=brand.value=channel.value='全部';renderActions();};
document.querySelectorAll('.nav-item').forEach(button=>button.onclick=()=>{document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item===button));document.querySelectorAll('.view').forEach(view=>view.classList.toggle('active',view.id===button.dataset.view));});
document.querySelector('#detail-dialog .dialog-head button').onclick=()=>document.querySelector('#detail-dialog').close();
document.querySelector('#detail-dialog').onclick=event=>{if(event.target===event.currentTarget)event.currentTarget.close();};
document.querySelector('#persona-grid').innerHTML=personas.map((p,index)=>`<article class="persona ${index===2?'selected':''}"><span class="persona-icon">${p[0]}</span><strong>${p[1]}</strong><p>${p[2]}</p><small>${p[3]}</small></article>`).join('');
document.querySelectorAll('.persona').forEach(card=>card.onclick=()=>{document.querySelectorAll('.persona').forEach(item=>item.classList.remove('selected'));card.classList.add('selected');});
document.querySelector('#simulate-mode').onclick=event=>{document.querySelectorAll('.mode').forEach((mode,index)=>mode.classList.toggle('active-mode',index===1));event.currentTarget.textContent='已切换：活动监控';document.querySelector('.run-state').innerHTML='<i></i>活动监控中';};
renderActions();
loadMonitorSummary();
