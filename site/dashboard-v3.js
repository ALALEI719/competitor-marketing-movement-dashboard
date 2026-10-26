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
  return {from,to,days,unit,width:Math.max(660,days*unit+240),x:day=>Math.round((Date.parse(day)-Date.parse(from))/DAY)*unit+12};
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
  let html=calendar.filter(e=>e.end>=g.from&&e.start<=g.to).map(e=>{
    const start=Math.max(0,g.x(e.start)-12),end=Math.min(g.width,g.x(shiftDay(e.end,1))-12);
    return `<span class="gantt-band" style="left:${start}px;width:${Math.max(4,end-start)}px"></span>${labels?`<span class="gantt-node" style="left:${Math.max(10,start+5)}px">${escape(e.title)} · ${escape(e.start.slice(5))}${e.end!==e.start?'–'+escape(e.end.slice(5)):''}</span>`:''}`;
  }).join('');
  if(today>=g.from&&today<=g.to)html+=`<span class="gantt-today" style="left:${g.x(today)}px"></span>${labels?`<span class="gantt-today-label" style="left:${g.x(today)+5}px">今天</span>`:''}`;
  return html;
}
export function renderTimelineV3({container,actions,calendar,period,brand,state,onAction,onGroup,onExpand}){
  const dated=actions.filter(a=>actionDateInfo(a).day),unknown=actions.filter(a=>!actionDateInfo(a).day);
  let g;try{g=timelineGeometry(dated,period,state.grain);}catch(error){container.innerHTML=`<p class="timeline-empty">${escape(error.message)}</p>`;return;}
  const today=todayDay(),grain=state.grain||'week';
  const track=records=>{
    const ends=[],packed=dateBuckets(records,grain).map(bucket=>{
      const x=Math.max(12,g.x(bucket.day)),lane=ends.findIndex(end=>end+12<=x),row=lane<0?ends.length:lane;ends[row]=x+216;
      return {...bucket,x,lane:row};
    });
    const visible=packed.filter(p=>p.lane<3),hidden=packed.filter(p=>p.lane>=3);
    const height=Math.max(90,Math.min(3,ends.length)*76+16+(hidden.length?50:0));
    const overflow=hidden.flatMap(b=>b.records),overflowDays=overflow.map(a=>actionDateInfo(a).day).sort();
    return `<div class="gantt-track" style="height:${height}px">${bands(calendar,g,today)}${visible.map(b=>b.records.length>1?`<button class="gantt-event gantt-cluster" data-v3-group="${escape(b.records.map(a=>a.actionId).join(','))}" style="left:${b.x}px;top:${b.lane*76+9}px"><span>${escape((b.day<g.from?g.from:b.day).slice(5))}${grain==='week'?' — '+escape((b.to>g.to?g.to:b.to).slice(5)):''} · ${b.records.length} 条动作</span><small>${escape(cut(b.records.map(a=>headline(a)).join('；'),50))}</small><em>展开日期、国家与渠道 →</em></button>`:`<button class="gantt-event ${escape(b.records[0].channel)}" data-v3-action="${escape(b.records[0].actionId)}" style="left:${b.x}px;top:${b.lane*76+9}px" aria-label="${escape(headline(b.records[0]))}"><span>${escape(headline(b.records[0]))}</span><small>${escape(actionDateInfo(b.records[0]).day.slice(5)+' · '+b.records[0].country+' · '+channelNames[b.records[0].channel])}</small></button>`).join('')}${overflow.length?`<button class="gantt-more" style="left:${Math.min(...hidden.map(p=>p.x))}px;top:244px" data-v3-group="${escape(overflow.map(a=>a.actionId).join(','))}">${escape(overflowDays[0])} — ${escape(overflowDays.at(-1))} · ＋${overflow.length} 条密集动作</button>`:''}${!records.length?'<span class="gantt-empty">该范围暂无已确认动作</span>':''}</div>`;
  };
  let rows='';
  for(const group of timelineGroups(dated,brand)){
    const opened=state.expanded.has(group.brand);
    rows+=`<tr><th scope="row" class="gantt-sticky"><button data-v3-expand="${escape(group.brand)}" aria-expanded="${opened}"><span>${opened?'⌄':'›'}</span>${escape(group.brand)}</button><small>${group.actions.length} 条已确认</small></th><td>${opened?`<div class="gantt-track" style="height:48px">${bands(calendar,g,today)}</div>`:track(group.actions)}</td></tr>`;
    if(opened)for(const country of group.countries)rows+=`<tr><th scope="row" class="gantt-sticky country-row">${escape(country)}</th><td>${track(group.actions.filter(a=>a.country===country))}</td></tr>`;
  }
  let ticks='';for(let i=0;i<g.days;i+=grain==='day'?1:7)ticks+=`<span class="gantt-tick" style="left:${i*g.unit+12}px">${escape(shiftDay(g.from,i).slice(5))}</span>`;
  container.style.setProperty('--gantt-width',`${g.width}px`);
  container.innerHTML=`<table aria-label="竞品与日期动作矩阵"><thead><tr><th scope="col" class="gantt-sticky">竞品 / 国家</th><th scope="col"><div class="gantt-calendar">${bands(calendar,g,today,true)}${ticks}</div></th></tr></thead><tbody>${rows||`<tr><th class="gantt-sticky">当前范围</th><td>${track([])}</td></tr>`}</tbody></table>`;
  state.latestX=dated.length?g.x(actionDateInfo([...dated].sort(actionDateOrder)[0]).day):0;
  const sticky=()=>container.querySelector('.gantt-sticky')?.offsetWidth||154;
  if(state.autoposition&&container.clientWidth){state.scroll=Math.max(0,state.latestX-(container.clientWidth-sticky())*.55);state.autoposition=false;}
  container.scrollLeft=state.scroll;
  const updateRange=()=>{if(!container.clientWidth)return;state.scroll=container.scrollLeft;const first=Math.min(g.days-1,Math.max(0,Math.floor(container.scrollLeft/g.unit)));const last=Math.max(first,Math.min(g.days-1,Math.floor((container.scrollLeft+container.clientWidth-sticky()-1)/g.unit)));document.querySelector('#visible-range').textContent=`可见日期 ${shiftDay(g.from,first)} — ${shiftDay(g.from,last)}`;};
  container.onscroll=updateRange;updateRange();state.updateRange=updateRange;
  container.querySelectorAll('[data-v3-action]').forEach(b=>b.onclick=()=>onAction(actions.find(a=>a.actionId===b.dataset.v3Action)));
  container.querySelectorAll('[data-v3-group]').forEach(b=>b.onclick=()=>onGroup(b.dataset.v3Group.split(',').map(id=>actions.find(a=>a.actionId===id)).filter(Boolean)));
  container.querySelectorAll('[data-v3-expand]').forEach(b=>b.onclick=()=>onExpand(b.dataset.v3Expand));
  const unknownBox=document.querySelector('#undated-actions');unknownBox.hidden=!unknown.length;
  unknownBox.innerHTML=unknown.length?`<strong>${unknown.length} 条动作日期待确认</strong>${unknown.map(a=>`<button data-undated="${escape(a.actionId)}">${escape(a.brand+' · '+headline(a))}</button>`).join('')}`:'';
  unknownBox.querySelectorAll('[data-undated]').forEach(b=>b.onclick=()=>onAction(unknown.find(a=>a.actionId===b.dataset.undated)));
}

function actionButton(a){return `<button class="brief-action" data-card-action="${escape(a.actionId)}"><time>${escape(actionDateInfo(a).day.slice(5)||'日期待确认')}</time><span>${escape(headline(a))}<small>${escape(a.brand+' · '+a.country)}</small></span></button>`;}
export function renderCardsV3({container,actions,artworks,onAction,onChannel,all=false}){
  const groups=all?[{code:'all',records:actions}]:['edm','blog','pr','official_site','social_ads','video'].map(code=>({code,records:actions.filter(a=>a.channel===code)})).filter(g=>g.records.length);
  container.innerHTML=groups.length?groups.map(group=>{
    const records=[...group.records].sort(actionDateOrder),featured=all?records:records.slice(0,1);
    return featured.map(a=>{const image=safeArtwork(artworks.get(a.actionId));return `<article class="feature-card ${escape(a.channel)} ${image?'with-cover':'text-only'}"><div class="feature-kicker">${escape(a.brand+' · '+a.country)}<time>${escape(actionDateInfo(a).day||'日期待确认')}</time></div><h3><button data-card-action="${escape(a.actionId)}">${escape(headline(a))}</button></h3><div class="feature-body"><p>${escape(cut(summaryText(a),110))}</p><div class="action-tags"><span>${escape(channelNames[a.channel])}</span><span>${escape(stageText(a.stage))}</span>${a.dateBasis==='manual_record'?'<span class="manual-note">人工台账</span>':'<span>已复核</span>'}</div>${image?`<button class="feature-visual has-image" data-card-action="${escape(a.actionId)}" aria-label="查看 ${escape(headline(a))}"><img src="${escape(image)}" alt="${escape(a.brand+' 已留存的营销素材')}" loading="lazy"></button>`:''}${!all?records.slice(1,3).map(actionButton).join(''):''}<button class="card-footer" ${all?`data-card-action="${escape(a.actionId)}"`:`data-card-channel="${escape(a.channel)}"`}>${all?'查看详情与证据':`查看该渠道 ${records.length} 条动作`} <span>→</span></button></div></article>`;}).join('');
  }).join(''):'<div class="timeline-empty">筛选后无已确认内容。尚未收录不代表没有营销活动。<button data-empty-clear="all">清除筛选，查看全部</button></div>';
  container.querySelectorAll('[data-card-action]').forEach(b=>b.onclick=()=>onAction(actions.find(a=>a.actionId===b.dataset.cardAction)));
  container.querySelectorAll('[data-card-channel]').forEach(b=>b.onclick=()=>onChannel(b.dataset.cardChannel));
  container.querySelectorAll('.feature-visual img').forEach(img=>{const compact=()=>{img.parentElement.hidden=true;img.closest('.feature-card').classList.add('text-only');};img.onerror=compact;img.onload=()=>{if(img.naturalWidth/img.naturalHeight>3.2)compact();};if(img.complete&&img.naturalWidth/img.naturalHeight>3.2)compact();});
}
