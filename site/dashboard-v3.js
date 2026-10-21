import { actionDateInfo, actionDateOrder, actionDateLabel, calendarDay, matchesActionPeriod } from './action-date.js';

const DAY=86400000;
export const channelNames={official_site:'官网',blog:'Blog',pr:'PR',social_ads:'广告',edm:'EDM',video:'视频'};
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
export const headline=action=>headlines[action.actionId]||action.title||action.summary||'查看营销动作';

export function selectDashboardActions(actions,{brand='全部',market='全部',channel='全部',...period}={}){
  const labels={...channelNames,social_ads:'社媒广告'};
  return actions.filter(a=>a.reviewStatus==='approved'&&(brand==='全部'||a.brand===brand)
    &&(market==='全部'||a.country===market)&&(channel==='全部'||labels[a.channel]===channel)
    &&matchesActionPeriod(a,period)).sort(actionDateOrder);
}

export function dateRange(preset,actions,today=todayDay()){
  if(preset==='30'||preset==='90')return {from:shiftDay(today,1-Number(preset)),to:today};
  const dates=actions.map(a=>actionDateInfo(a).day).filter(Boolean).sort();
  return {from:dates[0]||today,to:dates.at(-1)||today};
}
export function timelineGeometry(actions,period={}){
  const range=dateRange('all',actions);
  const from=period.from||range.from,to=period.to||range.to;
  if(!calendarDay(from)||!calendarDay(to)||from>to)throw new Error('开始日期不能晚于结束日期');
  const days=Math.round((Date.parse(to)-Date.parse(from))/DAY)+1;
  if(days>731)throw new Error('请选择两年以内的时间范围');
  const unit=24;
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
  let g;try{g=timelineGeometry(dated,period);}catch(error){container.innerHTML=`<p class="timeline-empty">${escape(error.message)}</p>`;return;}
  const today=todayDay();
  const track=records=>{
    const packed=packTimeline(records,g),visible=packed.filter(p=>p.lane<3),hidden=packed.filter(p=>p.lane>=3);
    const height=records.length?Math.max(76,(Math.min(3,Math.max(...packed.map(p=>p.lane))+1))*60+16+(hidden.length?44:0)):76;
    return `<div class="gantt-track" style="height:${height}px">${bands(calendar,g,today)}${visible.map(({action:a,x,lane})=>`<button class="gantt-event ${escape(a.channel)}" data-v3-action="${escape(a.actionId)}" style="left:${x}px;top:${lane*60+9}px" title="${escape(actionDateLabel(a)+' · '+a.summary)}" aria-label="${escape(actionDateInfo(a).day+' '+a.brand+' '+channelNames[a.channel]+' '+a.country+'：'+headline(a))}"><span>${escape(cut(`${channelNames[a.channel]} ${a.country}：${headline(a)}`,34))}</span><small>${escape(actionDateInfo(a).day.slice(5).replace('-','/'))} · ${a.dateBasis==='manual_record'?'人工台账':'已确认'}</small></button>`).join('')}${hidden.length?`<button class="gantt-more" style="left:${Math.min(...hidden.map(p=>p.x))}px;top:190px" data-v3-group="${escape(hidden.map(p=>p.action.actionId).join(','))}">＋${hidden.length} 条密集动作 · 查看全部</button>`:''}${!records.length?'<span class="gantt-empty">该范围暂无已确认动作</span>':''}</div>`;
  };
  let rows='';
  for(const group of timelineGroups(dated,brand)){
    const opened=state.expanded.has(group.brand);
    rows+=`<tr><th scope="row" class="gantt-sticky"><button data-v3-expand="${escape(group.brand)}" aria-expanded="${opened}"><span>${opened?'⌄':'›'}</span>${escape(group.brand)}</button><small>${group.actions.length} 条已确认</small></th><td>${opened?`<div class="gantt-track" style="height:48px">${bands(calendar,g,today)}</div>`:track(group.actions)}</td></tr>`;
    if(opened)for(const country of group.countries)rows+=`<tr><th scope="row" class="gantt-sticky country-row">${escape(country)}</th><td>${track(group.actions.filter(a=>a.country===country))}</td></tr>`;
  }
  let ticks='';for(let i=0;i<g.days;i+=7)ticks+=`<span class="gantt-tick" style="left:${i*g.unit+12}px">${shiftDay(g.from,i).replaceAll('-','/')}</span>`;
  container.style.setProperty('--gantt-width',`${g.width}px`);
  container.innerHTML=`<table aria-label="竞品与日期动作矩阵"><thead><tr><th scope="col" class="gantt-sticky">竞品 / 国家</th><th scope="col"><div class="gantt-calendar">${bands(calendar,g,today,true)}${ticks}</div></th></tr></thead><tbody>${rows||`<tr><th class="gantt-sticky">当前范围</th><td>${track([])}</td></tr>`}</tbody></table>`;
  container.scrollLeft=state.scroll;
  const updateRange=()=>{state.scroll=container.scrollLeft;const sticky=container.querySelector('.gantt-sticky')?.offsetWidth||154;const first=Math.min(g.days-1,Math.max(0,Math.floor(container.scrollLeft/g.unit)));const last=Math.max(first,Math.min(g.days-1,Math.ceil((container.scrollLeft+container.clientWidth-sticky)/g.unit)));document.querySelector('#visible-range').textContent=`${shiftDay(g.from,first)} — ${shiftDay(g.from,last)} · 左右滑动查看`};
  container.onscroll=updateRange;updateRange();
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
    const records=[...group.records].sort(actionDateOrder);
    const featured=all?records:records.slice(0,1);
    return featured.map(a=>{const image=safeArtwork(artworks.get(a.actionId));return `<article class="feature-card ${escape(a.channel)}"><div class="feature-kicker">${escape(channelNames[a.channel])} <span>${all?'已确认内容':`${records.length} 条已确认`}</span></div><button class="feature-visual ${image?'has-image':'no-image'}" data-card-action="${escape(a.actionId)}" aria-label="查看 ${escape(headline(a))}">${image?`<img src="${escape(image)}" alt="${escape(a.brand+' 已留存的营销素材')}" loading="lazy">`:`<span class="cover-word">${escape(a.brand.toUpperCase())}</span><span class="cover-note">${escape(channelNames[a.channel])} · 暂无留存封面</span>`}<span class="feature-overlay"><small>${escape(a.brand+' · '+a.country+' · '+(actionDateInfo(a).day||'日期待确认'))}</small><strong>${escape(headline(a))}</strong></span></button><div class="feature-body"><p>${escape(a.summary)}</p>${a.dateBasis==='manual_record'?`<span class="manual-note">人工历史记录${/404/.test(a.summary||'')?' · 原址本次直连404':''} · 日期依据人工台账</span>`:''}${!all?records.slice(1,3).map(actionButton).join(''):''}<button class="card-footer" ${all?`data-card-action="${escape(a.actionId)}"`:`data-card-channel="${escape(a.channel)}"`}>${all?'查看内容与证据':'查看该渠道全部'} <span>↗</span></button></div></article>`;}).join('');
  }).join(''):'<div class="timeline-empty">当前筛选下没有已确认内容。尚未收录不代表没有营销活动。</div>';
  container.querySelectorAll('[data-card-action]').forEach(b=>b.onclick=()=>onAction(actions.find(a=>a.actionId===b.dataset.cardAction)));
  container.querySelectorAll('[data-card-channel]').forEach(b=>b.onclick=()=>onChannel(b.dataset.cardChannel));
  container.querySelectorAll('.feature-visual img').forEach(img=>img.onerror=()=>{img.hidden=true;const note=document.createElement('span');note.className='cover-note';note.textContent='留存图片暂时无法读取';img.after(note);});
}
