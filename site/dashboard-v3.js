import { actionDateInfo, actionDateOrder, actionDateLabel, calendarDay, matchesActionPeriod } from './action-date.js';

const DAY=86400000;
export const channelNames={official_site:'官网',blog:'Blog',pr:'PR',social_ads:'社媒广告',edm:'EDM',video:'视频'};
export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const shiftDay=(day,n)=>new Date(Date.parse(`${day}T00:00:00Z`)+n*DAY).toISOString().slice(0,10);
export const todayDay=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
export const cut=(text,max=32)=>Array.from(text||'').slice(0,max).join('')+(Array.from(text||'').length>max?'…':'');

// Display copy only. Original titles, evidence and review decisions stay intact.
const headlines={
  'ACT-F9A3A5963E13':'小庭院割草机器人选型指南',
  'ACT-8DEF0D8444AE':'半阴半阳草坪的割草频率与高度',
  'ACT-D9CB8B003CFD':'潮湿草坪的选机、防滑与维护',
  'ACT-997EEE05342B':'夏季草坪养护指南',
  'ACT-EDM-D183E8E1E284':'黑五预热：四款割草机优惠与车库赠购',
  'ACT-EDM-D178991A0A2C':'割草机器人最高减 600 欧元',
  'ACT-EDM-F0D6FB102756':'黑五预热，割草机进入跨品类主视觉',
  'ACT-EDM-7DBDD554AC85':'三款 LiDAX 优惠与 1 欧元车库',
  'ACT-EDM-FF18822D96A1':'Fall Prime Day 优惠限时返场',
  'ACT-F5847AA27C57':'CHIP IFA 亮点：LUBA 4 AWD 系列',
  'ACT-AF381A45496B':'LUBA 4 AWD 新品专题页（人工台账）',
  'ACT-6F7BCD48738D':'IFA 新品 LUBA 4 AWD：功能与上市信息',
  'ACT-A2C9BC1E1380':'IFA 新品 LUBA 4 AWD：功能与上市信息',
};
export const headline=action=>(/[\u3400-\u9fff]/.test(action.title||'')?action.title:headlines[action.actionId])||action.title||action.summary||'查看营销动作';

const translatedSummaries={
  'ACT-F9A3A5963E13':'介绍小型城市庭院的割草机器人选型，涵盖狭窄通道、坡地以及儿童和宠物安全。',
  'ACT-8DEF0D8444AE':'介绍半阴半阳庭院的割草高度、频率，以及避免苔藓和过度割草的养护建议。',
  'ACT-D9CB8B003CFD':'介绍潮湿或排水不良草坪的割草机器人使用时机、防滑、草坪保护与设备维护。',
  'ACT-997EEE05342B':'夏季草坪养护建议，涵盖割草、浇水、防暑抗旱，以及施肥、除草和补播的时机。',
};
export const summaryText=a=>translatedSummaries[a.actionId]||a.summary||'暂无摘要，请查看已留存证据。';
export const stageText=value=>({not_launch_related:'非新品阶段',weak_signal:'弱信号',multi_source_candidate:'多源候选',confirmed_preheat:'确认预热',model_confirmed:'型号确认',teaser:'预热',announcement:'官宣',preorder:'预售',launched:'发布',on_sale:'开售',promotion:'促销',reputation:'口碑 / 背书',content_followup:'内容跟进'})[value]||'阶段待分类';
export function matchesQuery(a,query=''){
  const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text=[a.title,headline(a),a.summary,summaryText(a),a.brand,a.country,a.productModel,a.productModels,a.model,a.modelName,a.products,JSON.stringify(a.productExposure||[])].join(' ').toLocaleLowerCase();
  return words.every(word=>text.includes(word));
}
export function dateBuckets(actions,grain='day'){
  const grouped=new Map();
  for(const a of actions){const day=actionDateInfo(a).day;if(!day)continue;
    const offset=grain==='week'?(new Date(day+'T00:00:00Z').getUTCDay()+6)%7:0;
    const key=shiftDay(day,-offset);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(a);
  }
  return [...grouped].sort(([a],[b])=>a.localeCompare(b)).map(([day,records])=>({day,to:grain==='week'?shiftDay(day,6):day,records:records.sort(actionDateOrder)}));
}
export function sortedActions(actions,sort='newest'){
  return [...actions].sort(sort==='brand'?(a,b)=>a.brand.localeCompare(b.brand)||actionDateOrder(a,b):sort==='oldest'?(a,b)=>-actionDateOrder(a,b):actionDateOrder);
}

export function selectDashboardActions(actions,{brand='全部',market='全部',channel='全部',query='',...period}={}){
  const labels={...channelNames,social_ads:'社媒广告'};
  return actions.filter(a=>a.reviewStatus==='approved'&&(brand==='全部'||a.brand===brand)
    &&(market==='全部'||a.country===market)&&(channel==='全部'||labels[a.channel]===channel)
    &&matchesActionPeriod(a,period)&&matchesQuery(a,query)).sort(actionDateOrder);
}

export function describeCampaign(event, actions) {
  if (!event) return null;
  const isBlackFriday = /^bfcm-\d{4}$/.test(event.id);
  const year = event.start.slice(0, 4);
  const related = actions.filter(action => {
    if (action.reviewStatus !== 'approved') return false;
    if (action.campaignId === event.id) return true;
    const day = actionDateInfo(action).day;
    return isBlackFriday && day.startsWith(year + '-')
      && /black[\s-]*(?:friday|week)|cyber[\s-]*monday|黑五|网一/i.test(action.title || '');
  });
  const days = related.map(action => actionDateInfo(action).day).filter(Boolean).sort();
  const observedWindow = isBlackFriday && days.length
    ? { start: days[0], end: days.at(-1) } : null;
  const monitoringWindow = { ...event.monitoringWindow };
  if (observedWindow && observedWindow.start < monitoringWindow.start) {
    monitoringWindow.start = observedWindow.start;
  }
  return { ...event, monitoringWindow, observedWindow,
    actionIds: related.map(action => action.actionId) };
}

export function dateRange(preset,actions,today=todayDay()){
  if(preset==='30'||preset==='90')return {from:shiftDay(today,1-Number(preset)),to:today};
  const dates=actions.map(a=>actionDateInfo(a).day).filter(Boolean).sort();
  return {from:dates[0]||today,to:dates.at(-1)||today};
}
export function timelineGeometry(actions,period={},grain='week'){
  const range=dateRange('all',actions);
  const from=period.from||range.from,to=period.to||range.to;
  if(!calendarDay(from)||!calendarDay(to)||from>to)throw new Error('开始日期不能晚于结束日期');
  const days=Math.round((Date.parse(to)-Date.parse(from))/DAY)+1;
  if(days>731)throw new Error('请选择两年以内的时间范围');
  const unit=grain==='day'?64:24;
  return {from,to,days,unit,width:Math.max(660,days*unit+280),x:day=>Math.round((Date.parse(day)-Date.parse(from))/DAY)*unit+12};
}
export function packTimeline(actions,g){
  const ends=[];
  return actions.filter(a=>actionDateInfo(a).day).sort((a,b)=>actionDateInfo(a).day.localeCompare(actionDateInfo(b).day)||a.actionId.localeCompare(b.actionId)).map(action=>{
    const x=g.x(actionDateInfo(action).day);let lane=ends.findIndex(end=>end+12<=x);
    if(lane<0)lane=ends.length;ends[lane]=x+216;
    return {action,x,lane};
  });
}
export function timelineGroups(actions,brand='全部'){
  const names=brand==='全部'?[...new Set(actions.map(a=>a.brand))]:[brand];
  const order=['Mammotion','Mova','Dreame','Ecovacs','Eufy','Navimow'];
  return names.sort((a,b)=>order.indexOf(a)-order.indexOf(b)||a.localeCompare(b)).map(name=>({brand:name,actions:actions.filter(a=>a.brand===name),countries:[...new Set(actions.filter(a=>a.brand===name).map(a=>a.country))]}));
}
export function safeArtwork(value){
  return /^\.\/data\/(?:edm-assets\/EDM-[A-Z0-9]+\/image-\d{2}|evidence\/screenshots\/[A-Za-z0-9_.-]+)\.(?:png|jpe?g|webp|avif|gif)$/.test(value||'')?value:'';
}
export function channelSelection(actions,category){
  const codes={web:['official_site','blog'],pr:['pr'],edm:['edm'],ads:['social_ads','video']};
  return actions.filter(a=>(codes[category]||[]).includes(a.channel)).sort(actionDateOrder);
}

function bands(calendar,g,today,labels=false){
  const periods = calendar.flatMap(event => {
    const reference = { ...event, phase: 'reference' };
    return event.observedWindow ? [reference, { ...event.observedWindow,
      title: '黑五相关传播（已收录）', phase: 'observed' }] : [reference];
  });
  let html=periods.filter(e=>e.end>=g.from&&e.start<=g.to).map(e=>{
    const start=Math.max(0,g.x(e.start)-12),end=Math.min(g.width,g.x(shiftDay(e.end,1))-12);
    return `<span class="gantt-band ${e.phase}" data-campaign-phase="${e.phase}" style="left:${start}px;width:${Math.max(4,end-start)}px"></span>${labels?`<span class="gantt-node ${e.phase}" style="left:${Math.max(10,start+5)}px">${escape(e.title)} · ${escape(e.start.slice(5))}${e.end!==e.start?'–'+escape(e.end.slice(5)):''}</span>`:''}`;
  }).join('');
  if(today>=g.from&&today<=g.to)html+=`<span class="gantt-today" style="left:${g.x(today)}px"></span>${labels?`<span class="gantt-today-label" style="left:${g.x(today)+5}px">今天</span>`:''}`;
  return html;
}
export const timelineActionTypes = [
  { key: 'promotion', label: '促销优惠' },
  { key: 'product', label: '产品内容' },
  { key: 'launch', label: '新品节点' },
  { key: 'media', label: '媒体口碑' },
  { key: 'page', label: '页面变化' },
  { key: 'content', label: '内容传播' },
  { key: 'event', label: '活动邀请' },
  { key: 'other', label: '待分类' },
];

const timelineTypeIconPaths = {
  all: '<rect x="3" y="3" width="5" height="5" rx="1"/><rect x="12" y="3" width="5" height="5" rx="1"/><rect x="3" y="12" width="5" height="5" rx="1"/><rect x="12" y="12" width="5" height="5" rx="1"/>',
  promotion: '<path d="M3 4h7l7 7-6 6-8-8V4Z"/><circle cx="6.5" cy="7.5" r="1"/>',
  product: '<path d="M10 5C8 3 5 3 2 4v12c3-1 6-1 8 1 2-2 5-2 8-1V4c-3-1-6-1-8 1Zm0 0v12"/>',
  launch: '<path d="M8 12c0-5 4-9 9-9 0 5-4 9-9 9Zm0 0-3 3m3-6H4l-2 4 6-1m3 0v4l-4 2 1-6"/><circle cx="13" cy="7" r="1.5"/>',
  media: '<circle cx="10" cy="7" r="4"/><path d="m7 10-2 7 5-2 5 2-2-7"/>',
  page: '<path d="M11 2H4v16h12V7l-5-5Zm0 0v5h5M7 11h6m-6 3h4"/>',
  content: '<path d="m3 8 13-5v14L3 12V8Zm0 0H1v4h2m3 1 1 5h3l-1-4m10-7v6"/>',
  event: '<rect x="3" y="4" width="14" height="14" rx="2"/><path d="M6 2v4m8-4v4M3 9h14m-10 4h2m3 0h2"/>',
  other: '<circle cx="10" cy="10" r="7"/><path d="M7 10h0m3 0h0m3 0h0" stroke-width="2.5"/>',
};

export function timelineTypeIcon(key) {
  const paths = timelineTypeIconPaths[key] || timelineTypeIconPaths.other;
  return `<svg class="type-icon" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}

// Presentation groups use audited fields only. A generic teaser stage does not establish a product launch.
export function timelineActionType(action) {
  let key = 'other';
  if (action.actionType === 'product_launch') key = 'launch';
  else if (action.actionType === 'promotion' || action.marketingTheme === 'promotion' || action.stage === 'promotion') key = 'promotion';
  else if (action.actionType === 'award_or_media') key = 'media';
  else if (action.actionType === 'product_education' || action.marketingTheme === 'product_education') key = 'product';
  else if (action.actionType === 'page_change') key = 'page';
  else if (action.actionType === 'event_invitation') key = 'event';
  else if (['content_publication', 'advertising', 'email_campaign'].includes(action.actionType)) key = 'content';
  return timelineActionTypes.find(type => type.key === key);
}

export function typedDateBuckets(actions, grain = 'day') {
  return dateBuckets(actions, grain).flatMap(bucket => {
    const types = new Map();
    for (const action of bucket.records) {
      const type = timelineActionType(action);
      if (!types.has(type.key)) types.set(type.key, { ...bucket, type, records: [] });
      types.get(type.key).records.push(action);
    }
    return [...types.values()];
  });
}

export function renderTimelineV3({container,actions,calendar,period,brand,state,onAction,onGroup,onExpand,onType=()=>{}}){
  const dated=actions.filter(a=>actionDateInfo(a).day),unknown=actions.filter(a=>!actionDateInfo(a).day);
  let g;try{g=timelineGeometry(dated,period,state.grain);}catch(error){container.innerHTML=`<p class="timeline-empty">${escape(error.message)}</p>`;return;}
  const today=todayDay(),grain=state.grain||'week';
  const rowHeight = 140;
  const cardWidth = 248;
  const track = records => {
    const ends = [];
    const packed = typedDateBuckets(records, grain).map(bucket => {
      const x = Math.max(12, g.x(bucket.day));
      const available = ends.findIndex(end => end + 12 <= x);
      const lane = available < 0 ? ends.length : available;
      ends[lane] = x + cardWidth;
      return { ...bucket, x, lane };
    });
    const visible = packed.filter(bucket => bucket.lane < 3);
    const hidden = packed.filter(bucket => bucket.lane >= 3);
    const overflow = hidden.flatMap(bucket => bucket.records);
    const height = Math.max(144, Math.min(3, ends.length) * rowHeight + 16 + (overflow.length ? 56 : 0));
    const cards = visible.map(bucket => {
      const grouped = bucket.records.length > 1;
      const selected = bucket.records.some(action => action.actionId === state.selectedId);
      const muted = Boolean(state.typeFocus && state.typeFocus !== bucket.type.key);
      const ids = bucket.records.map(action => action.actionId).join(',');
      const attribute = grouped ? `data-v3-group="${escape(ids)}"` : `data-v3-action="${escape(ids)}"`;
      const title = grouped ? bucket.records.map(action => headline(action)).join('；') : headline(bucket.records[0]);
      const date = (bucket.day < g.from ? g.from : bucket.day).slice(5);
      const dateLabel = grain === 'week' ? `${date} — ${(bucket.to > g.to ? g.to : bucket.to).slice(5)}` : date;
      const context = grouped ? `${dateLabel} · ${bucket.records.length} 条同类动作` : `${actionDateInfo(bucket.records[0]).day.slice(5)} · ${bucket.records[0].country} · ${channelNames[bucket.records[0].channel]}`;
      return `<div class="gantt-event ${grouped ? 'gantt-cluster' : ''} ${selected ? 'is-selected' : ''} action-type-${bucket.type.key} ${muted ? 'is-type-muted' : ''}" ${attribute} data-action-type="${bucket.type.key}" style="left:${bucket.x}px;top:${bucket.lane * rowHeight + 8}px">
        <button class="gantt-type-label" data-timeline-type="${bucket.type.key}" aria-pressed="${state.typeFocus === bucket.type.key}" aria-label="高亮所有${bucket.type.label}动作"><span class="type-label-name">${timelineTypeIcon(bucket.type.key)}${bucket.type.label}</span><span>${grouped ? bucket.records.length + ' 条' : '高亮同类'}</span></button>
        <button class="gantt-action-open" aria-label="${escape(grouped ? '展开同类动作：' + title : title)}"><strong>${escape(title)}</strong><small>${escape(context)}</small></button>
      </div>`;
    }).join('');
    const matching = overflow.filter(action => timelineActionType(action).key === state.typeFocus).length;
    const overflowMuted = Boolean(state.typeFocus && !matching);
    const more = overflow.length ? `<button class="gantt-more ${overflowMuted ? 'is-type-muted' : ''}" style="left:${Math.min(...hidden.map(bucket => bucket.x))}px;top:${3 * rowHeight + 8}px" data-v3-group="${escape(overflow.map(action => action.actionId).join(','))}">展开其余 ${overflow.length} 条动作${state.typeFocus ? ` · 同类 ${matching} 条` : ''}</button>` : '';
    return `<div class="gantt-track" style="height:${height}px">${bands(calendar,g,today)}${cards}${more}${records.length ? '' : '<span class="gantt-empty">该范围暂无已确认动作</span>'}</div>`;
  };
  let rows='';
  for(const group of timelineGroups(dated,brand)){
    const opened=state.expanded.has(group.brand);
    rows+=`<tr><th scope="row" class="gantt-sticky"><button data-v3-expand="${escape(group.brand)}" aria-expanded="${opened}"><span>${opened?'⌄':'›'}</span>${escape(group.brand)}</button><small>${group.actions.length} 条已确认</small></th><td>${opened?`<div class="gantt-track" style="height:48px">${bands(calendar,g,today)}</div>`:track(group.actions)}</td></tr>`;
    if(opened)for(const country of group.countries)rows+=`<tr><th scope="row" class="gantt-sticky country-row">${escape(group.brand+' · '+country)}</th><td>${track(group.actions.filter(a=>a.country===country))}</td></tr>`;
  }
  let ticks='';for(let i=0;i<g.days;i+=grain==='day'?1:7)ticks+=`<span class="gantt-tick" style="left:${i*g.unit+12}px">${escape(shiftDay(g.from,i).slice(5))}</span>`;
  container.style.setProperty('--gantt-width',`${g.width}px`);
  container.innerHTML=`<table aria-label="竞品与日期动作矩阵"><thead><tr><th scope="col" class="gantt-sticky">竞品 / 国家</th><th scope="col"><div class="gantt-calendar">${bands(calendar,g,today,true)}${ticks}</div></th></tr></thead><tbody>${rows||`<tr><th class="gantt-sticky">当前范围</th><td>${track([])}</td></tr>`}</tbody></table>`;
  state.latestX=dated.length?g.x(actionDateInfo([...dated].sort(actionDateOrder)[0]).day):0;
  const sticky=()=>container.querySelector('.gantt-sticky')?.offsetWidth||154;
  if(state.autoposition&&container.clientWidth){state.scroll=Math.max(0,state.latestX-(container.clientWidth-sticky())*.55);state.autoposition=false;}
  container.scrollLeft=state.scroll;
  const updateRange=()=>{if(!container.clientWidth)return;if(state.autoposition){container.scrollLeft=Math.max(0,state.latestX-(container.clientWidth-sticky())*.55);state.autoposition=false;}state.scroll=container.scrollLeft;const first=Math.min(g.days-1,Math.max(0,Math.floor(container.scrollLeft/g.unit)));const last=Math.max(first,Math.min(g.days-1,Math.floor((container.scrollLeft+container.clientWidth-sticky()-1)/g.unit)));document.querySelector('#visible-range').textContent=`可见日期 ${shiftDay(g.from,first)} — ${shiftDay(g.from,last)}`;};
  container.onscroll=updateRange;updateRange();state.updateRange=updateRange;
  state.geometry=g;
  if(typeof ResizeObserver!=='undefined'){state.resizeObserver?.disconnect();state.resizeObserver=new ResizeObserver(updateRange);state.resizeObserver.observe(container);}
  container.querySelectorAll('[data-v3-action]').forEach(b=>b.onclick=()=>onAction(actions.find(a=>a.actionId===b.dataset.v3Action)));
  container.querySelectorAll('[data-v3-group]').forEach(b=>b.onclick=()=>onGroup(b.dataset.v3Group.split(',').map(id=>actions.find(a=>a.actionId===id)).filter(Boolean)));
  container.querySelectorAll('[data-timeline-type]').forEach(button => button.onclick = event => { event.stopPropagation(); onType(button.dataset.timelineType); });
  container.querySelectorAll('[data-v3-expand]').forEach(b=>b.onclick=()=>onExpand(b.dataset.v3Expand));
  const unknownBox=document.querySelector('#undated-actions');unknownBox.hidden=!unknown.length;
  const scopes=[...new Set(unknown.map(a=>[a.brand,a.country].filter(Boolean).join(' · ')))];
  const scope=scopes.length===1?scopes[0]+' · ':'';
  const historyLabel=unknown.every(a=>a.historicalBackfill&&a.channel==='official_site')?'历史官网文案变更':'日期待确认记录';
  unknownBox.innerHTML=unknown.length?`<details class="undated-history"><summary>${escape(scope+historyLabel)} · ${unknown.length} 条</summary><p>以下记录已复核，动作发生日期待确认。留存时间与证据可在详情中查看。</p><div class="undated-history-list">${unknown.map(a=>`<button data-undated="${escape(a.actionId)}">${escape(a.brand+' · '+headline(a))}</button>`).join('')}</div></details>`:'';
  unknownBox.querySelectorAll('[data-undated]').forEach(b=>b.onclick=()=>onAction(unknown.find(a=>a.actionId===b.dataset.undated)));
}

function actionButton(a){return `<button class="brief-action" data-card-action="${escape(a.actionId)}"><time>${escape(actionDateInfo(a).day.slice(5)||'日期待确认')}</time><span>${escape(headline(a))}<small>${escape(a.brand+' · '+a.country)}</small></span></button>`;}
export function renderCardsV3({container,actions,artworks,onAction,onChannel,all=false}){
  const groups=all?[{code:'all',records:actions}]:['edm','blog','pr','official_site','social_ads','video'].map(code=>({code,records:actions.filter(a=>a.channel===code)})).filter(g=>g.records.length);
  container.innerHTML=groups.length?groups.map(group=>{
    const records=[...group.records].sort(actionDateOrder),featured=all?records:records.slice(0,1);
    return featured.map(a=>{const image=safeArtwork(artworks.get(a.actionId));return `<article class="feature-card ${escape(a.channel)} ${image?'with-cover':'text-only'}"><div class="feature-kicker">${escape(a.brand+' · '+a.country)}<time>${escape(actionDateInfo(a).day||'日期待确认')}</time></div><h3><button data-card-action="${escape(a.actionId)}">${escape(headline(a))}</button></h3><div class="feature-body"><p>${escape(actionReading(a).lead)}</p><div class="action-tags"><span>${escape(channelNames[a.channel])}</span>${a.stage&&a.stage!=='not_launch_related'?`<span>${escape(stageText(a.stage))}</span>`:''}${a.dateBasis==='manual_record'?'<span class="manual-note">人工台账</span>':''}</div>${image?`<button class="feature-visual has-image" data-card-action="${escape(a.actionId)}" aria-label="查看 ${escape(headline(a))}"><img src="${escape(image)}" alt="${escape(a.brand+' 已留存的营销素材')}" loading="lazy"></button>`:''}${!all?records.slice(1,3).map(actionButton).join(''):''}<button class="card-footer" ${all?`data-card-action="${escape(a.actionId)}"`:`data-card-channel="${escape(a.channel)}"`}>${all?'查看详情与证据':`查看该渠道 ${records.length} 条动作`} <span>→</span></button></div></article>`;}).join('');
  }).join(''):'<div class="timeline-empty">筛选后无已确认内容。尚未收录不代表没有营销活动。<button data-empty-clear="all">清除筛选，查看全部</button></div>';
  container.querySelectorAll('[data-card-action]').forEach(b=>b.onclick=()=>onAction(actions.find(a=>a.actionId===b.dataset.cardAction)));
  container.querySelectorAll('[data-card-channel]').forEach(b=>b.onclick=()=>onChannel(b.dataset.cardChannel));
  container.querySelectorAll('.feature-visual img').forEach(img=>{const compact=()=>{img.parentElement.hidden=true;img.closest('.feature-card').classList.add('text-only');};img.onerror=compact;img.onload=()=>{if(img.naturalWidth/img.naturalHeight>3.2)compact();};if(img.complete&&img.naturalWidth/img.naturalHeight>3.2)compact();});
}

// Coverage is a per-brand, per-market view of sources and records, never a global status.
export function coverageCell({brand,market='全部',channel,actions=[],allActions=[],summary,ads}) {
  const scope=r=>matchesDashboardScope(r,{brand,market});
  const approved=allActions.filter(a=>a.reviewStatus==='approved'&&a.channel===channel&&scope(a));
  const selected=actions.filter(a=>a.channel===channel&&scope(a));
  const sourceList=channel==='official_site'?summary?.sites:channel==='blog'?summary?.channelMonitoring?.sources:channel==='pr'?summary?.prMonitoring?.sources:undefined;
  const sources=scopedSources(sourceList,{brand,market});
  const observations=channel==='social_ads'?(ads?.records||[]).filter(scope):[];
  const unknown=approved.filter(a=>!actionDateInfo(a).day).length;
  return {count:selected.length,archived:approved.length,unknown,observations:observations.length,
    source:sourceList?sources.length?`已接入 ${sources.length} 个来源`:'尚未接入来源':
      ['official_site','blog','pr'].includes(channel)&&!summary?'来源状态未加载':
      observations.length?`美国 Meta · ${observations.length} 条观察库存`:
      channel==='edm'?(approved.length?'已有邮件收录 · 覆盖不完整':'尚未收录邮件'):'尚未接入公开来源'};
}
export function selectAdInventory(records,{brand='全部',market='全部',query='',from='',to=''}={}) {
  const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return records.filter(r=>matchesDashboardScope(r,{brand,market})
    &&(!from||(r.publishDate&&r.publishDate>=from))&&(!to||(r.publishDate&&r.publishDate<=to))
    &&words.every(word=>[r.copy,r.offer,r.cta,r.brand,r.sourceRecordId,r.landingUrl].join(' ').toLocaleLowerCase().includes(word)));
}

// Reorder only audited text; keep the original summary available in record details.
export function actionReading(action){
  const parts=(summaryText(action).match(/[^。！？]+[。！？]?/g)||[]).map(t=>t.replace(/^[\s·•]+/,'').trim()).filter(Boolean)
    .map(t=>t.replace(/^Offer\s*[:：]/i,'优惠说明：').replace(/^CTA\s*[:：]/i,'行动按钮：'));
  const evidence=[],conditions=[],facts=[];
  for(const text of parts){
    if(/^(同编号|平台显示|旧编号|本项目|当前版本|本条完整文案)/.test(text))evidence.push(text);
    else if(/未核|不确认|不能|不认定|不等于|尚未|待确认|资格|条件|未注明|不代表|仅记录|受.*限制/.test(text))conditions.push(text);
    else facts.push(text);
  }
  const lead=facts.shift()||conditions.shift()||evidence.shift()||'暂无摘要，请查看已留存证据。';
  return {lead,facts,conditions,evidence};
}
export function recordLink(href,actionId){const url=new URL(href);url.searchParams.set('action',actionId);return url.href;}
export function timelineModeForWidth(width,explicitMode=''){return ['list','timeline'].includes(explicitMode)?explicitMode:width<=768?'list':'timeline';}

export function matchesDashboardScope(item,{brand='全部',market='全部'}={}){
  const brands=[item.brand,...(Array.isArray(item.brands)?item.brands:[])],countries=item.countries||[item.country];
  const code=({'美国':'US','德国':'DE','法国':'FR','英国':'UK'})[market];
  return (brand==='全部'||brands.includes(brand))&&(market==='全部'||countries.includes(market)||Boolean(code&&item.countryCode===code));
}
export function scopedSources(sources=[],filters={}){
  const unique=new Map();
  for(const item of sources||[]){const source=item.site||item.source||item;if(!matchesDashboardScope(source,filters))continue;
    const key=[source.countryCode||source.country,source.id||source.url||source.siteUrl||JSON.stringify(source)].join('|');
    if(!unique.has(key)||(Date.parse(item.checkedAt)||0)>(Date.parse(unique.get(key).checkedAt)||0))unique.set(key,item);
  }
  return [...unique.values()];
}
export function freshnessEntries({summary,actions=[],edmItems=[],ads,filters={}}){
  const latest=values=>values.filter(v=>Number.isFinite(Date.parse(v))).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)||'';
  const records=actions.filter(a=>a.reviewStatus==='approved'&&matchesDashboardScope(a,filters));
  const sources=[['官网',summary?.sites,'官网 · 计划每周全量'],['Blog',summary?.channelMonitoring?.sources,'Blog'],['PR',summary?.prMonitoring?.sources,'PR']].map(([name,list,note])=>{
    const scoped=scopedSources(list,filters),ok=scoped.filter(i=>i.status==='ok').length;
    return {name,channel:name,label:'最近采集检查',time:latest(scoped.map(i=>i.checkedAt)),note:scoped.length?`${ok}/${scoped.length} 来源上次采集成功 · ${note}；不代表持续实时`:'当前筛选尚无已接入来源'};
  });
  const edm=records.filter(a=>a.channel==='edm'),ids=new Set(edm.map(a=>a.actionId));
  const adScope=Boolean(ads&&matchesDashboardScope({brand:'Mammotion',country:'美国',countryCode:'US'},filters));
  return [...sources,{name:'已确认动作',label:'最近复核',time:latest(records.filter(a=>!filters.channel||filters.channel==='全部'||channelNames[a.channel]===filters.channel).map(a=>a.reviewedAt)),note:'当前品牌 / 国家 / 渠道的复核记录；不代表来源重新采集'},
    {name:'EDM',channel:'EDM',label:'最近内容复核',time:latest(edm.map(a=>a.reviewedAt)),note:`${edmItems.filter(i=>ids.has(i.actionId)&&matchesDashboardScope(i,filters)).length} 封已收录；发信时间见邮件，收信运行状态未在此导出`},
    {name:'广告观察',channel:'社媒广告',label:'最近成功采集',time:adScope?ads.lastSuccessAt:'',note:adScope?(ads.status==='failed'||ads.status==='needs_attention'?'Mammotion 美国 Meta · 最近检查未完成，保留上次成功观察':'Mammotion 美国 Meta · 上次采集结果，不代表当前实时'):'当前品牌 / 国家尚无已接入广告观察'}];
}
