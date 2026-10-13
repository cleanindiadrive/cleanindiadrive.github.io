// SVG charts follow the indigo/peach cards and semicircle gauges in the design references.
// All series come from the authenticated snapshot; no decorative or invented trend data.
const COLORS = { recurring:"#6262ae", once:"#efa583", pending:"#f2c572", failed:"#cd7782", refunded:"#75afa8", other:"#c9c9dc" };
const escape = value => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const el = id => document.getElementById(id);
const monthParts = value => {
  const parts = new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kolkata",year:"numeric",month:"numeric"}).formatToParts(new Date(value));
  return {year:Number(parts.find(p=>p.type==="year").value),month:Number(parts.find(p=>p.type==="month").value)-1};
};
const monthKey = (year,month) => year*12+month;
const moneyShort = value => "₹"+new Intl.NumberFormat("en-IN",{notation:"compact",maximumFractionDigits:1}).format(value);
const recurring = record => /month|subscription|recurr|gift/i.test(String(record.type || record.membershipType || "")) || Boolean(record.subscriptionId || record.subscription_id || record.isGift || record.is_gift);
const percent = (value,total) => total ? Math.round(value/total*100) : 0;
const IST_OFFSET = 19800000, DAY = 86400000, HOUR = 3600000;
const dateLabel = timestamp => new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",day:"numeric",month:"short",year:"numeric"}).format(timestamp);
let lastRender;

export function buildDashboardModel(data,helpers,range="6m",now=Date.now()) {
  const {people,payments,subscriptions} = data;
  const {recordTimestamp,isConfirmed,normalizeStatus,statusGroup,recordUserId} = helpers;
  range = typeof range === "number" ? range+"m" : range;
  if(!["today","7d","15d","30d","6m","12m"].includes(range)) range="6m";
  const hourly=range==="today", daily=range.endsWith("d"), granularity=hourly?"hour":daily?"day":"month";
  const current=monthParts(now);
  const keyFor=timestamp=>hourly ? Math.floor((timestamp+IST_OFFSET)/HOUR) : daily ? Math.floor((timestamp+IST_OFFSET)/DAY) : (()=>{const p=monthParts(timestamp);return monthKey(p.year,p.month);})();
  const lastKey=keyFor(now), count=hourly ? Math.floor(((now+IST_OFFSET)%DAY)/HOUR)+1 : parseInt(range,10), firstKey=lastKey-count+1;
  const buckets=Array.from({length:count},(_,i)=>{
    const key=firstKey+i, year=hourly||daily?current.year:Math.floor(key/12), month=key%12;
    const timestamp=hourly ? key*HOUR-IST_OFFSET : daily ? key*DAY-IST_OFFSET : Date.UTC(year,month,15);
    const label=hourly ? String((key%24+24)%24).padStart(2,"0")+":00" : new Intl.DateTimeFormat("en-IN",{month:"short",...(daily?{day:"numeric"}:{}),timeZone:"Asia/Kolkata"}).format(timestamp);
    return {key,label,year,tooltipLabel:hourly?dateLabel(timestamp)+" · "+label+" IST":daily?dateLabel(timestamp):label+" "+year,recurring:0,once:0,recurringCount:0,onceCount:0};
  });
  const byKey=new Map(buckets.map(b=>[b.key,b]));
  const inPeriod=payments.filter(record=>{
    const timestamp=recordTimestamp(record);
    if(!timestamp || timestamp>now) return false;
    return byKey.has(keyFor(timestamp));
  });
  const dated=inPeriod.filter(r=>!helpers.isLifecycleRecord?.(r));
  const confirmed=dated.filter(isConfirmed);
  const rankTotals=new Map();
  for(const record of confirmed) {
    const bucket=byKey.get(keyFor(recordTimestamp(record)));
    const type=recurring(record)?"recurring":"once", amount=Math.max(0,Number(record.amount)||0);
    bucket[type]+=amount;
    bucket[type+"Count"]++;
    const person=people.get(record.__personKey);
    if(person) rankTotals.set(person.key,{name:person.name,total:(rankTotals.get(person.key)?.total||0)+amount});
  }
  const statusDefinitions=[
    {key:"paid",label:"Successful",color:COLORS.recurring},
    {key:"pending",label:"Pending",color:COLORS.once},
    {key:"failed",label:"Failed",color:COLORS.failed},
    {key:"cancelled",label:"Cancelled",color:COLORS.pending},
    {key:"refunded",label:"Refunded",color:COLORS.refunded},
    {key:"other",label:"Other",color:COLORS.other}
  ];
  const counts=new Map();
  dated.forEach(record=>{ const group=statusGroup(normalizeStatus(record)); counts.set(group,(counts.get(group)||0)+1); });
  return {
    buckets, granularity, lifecycleCount:inPeriod.length-dated.length, total:confirmed.reduce((sum,r)=>sum+Math.max(0,Number(r.amount)||0),0),
    confirmedCount:confirmed.length, recordCount:dated.length,
    peopleCount:people.size, verified:[...people.values()].filter(p=>p.profileCompleted).length,
    active:subscriptions.filter(r=>(helpers.subscriptionStatus||normalizeStatus)(r)==="active").length,
    paused:subscriptions.filter(r=>(helpers.subscriptionStatus||normalizeStatus)(r)==="paused").length,
    review:payments.filter(r=>statusGroup(normalizeStatus(r))==="pending" || !recordUserId(r)).length,
    undated:payments.filter(r=>!recordTimestamp(r)).length,
    statuses:statusDefinitions.map(s=>({...s,count:counts.get(s.key)||0})).filter(s=>s.count),
    ranking:[...rankTotals.values()].sort((a,b)=>b.total-a.total).slice(0,5),
    rangeLabel:hourly ? "Today · "+dateLabel(now) : daily ? dateLabel(firstKey*DAY-IST_OFFSET)+" – "+dateLabel(now) : buckets[0].tooltipLabel+" – "+buckets.at(-1).tooltipLabel
  };
}

const icon = path => '<span class="metric-icon" aria-hidden="true"><svg viewBox="0 0 24 24">'+path+'</svg></span>';
const icons=[
  '<path d="M5 7h14M5 12h14M12 3v18M8 17l4 4 4-4"/>',
  '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
  '<circle cx="10" cy="8" r="3"/><path d="M4 21v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
  '<path d="M20 7a9 9 0 0 0-15-2L2 8M2 3v5h5M4 17a9 9 0 0 0 15 2l3-3M22 21v-5h-5"/>'
];
function renderMetrics(model,formatAmount) {
  const cards=[
    ["Contributions",formatAmount(model.total),"Selected period"],
    ["Successful payments",model.confirmedCount,model.recordCount+" records in period"],
    ["Supporters",model.peopleCount,model.verified+" verified · all time"],
    ["Active plans",model.active,model.paused+" paused · current"]
  ];
  el("dashboard-metrics").innerHTML=cards.map(([label,value,meta],i)=>'<article class="metric-card"><div class="metric-top"><span>'+label+'</span>'+icon(icons[i])+'</div><strong class="metric-value">'+escape(value)+'</strong><small>'+escape(meta)+'</small></article>').join("");
}

function curvedPath(points) {
  // Horizontal control points keep the curve inside each segment's observed value range.
  return points.map((p,i)=>{
    if(!i) return "M "+p.x+" "+p.y;
    const prev=points[i-1], mid=(prev.x+p.x)/2;
    return "C "+mid+" "+prev.y+" "+mid+" "+p.y+" "+p.x+" "+p.y;
  }).join(" ");
}
const svg = (width,height,label,content) => '<svg class="chart-svg" viewBox="0 0 '+width+' '+height+'" role="group" aria-label="'+escape(label)+'">'+content+'</svg>';
const tooltipAttr = text => ' tabindex="0" class="chart-hit" data-chart-tip="'+escape(text)+'" aria-label="'+escape(text.replaceAll("\n",", "))+'"';

function renderTrend(model,formatAmount) {
  const host=el("contribution-trend"), width=Math.max(230,Math.round(host.getBoundingClientRect().width)), height=210;
  const left=44,right=12,top=15,bottom=27, innerWidth=width-left-right, innerHeight=height-top-bottom;
  const peak=Math.max(...model.buckets.flatMap(b=>[b.recurring,b.once]),1);
  const magnitude=10**Math.floor(Math.log10(peak)), ceiling=Math.ceil(peak/magnitude)*magnitude;
  const x=i=>left+(model.buckets.length===1?.5:i/(model.buckets.length-1))*innerWidth, y=value=>top+innerHeight-value/ceiling*innerHeight;
  const bottomY=height-bottom;
  let content='<defs><linearGradient id="trend-indigo-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#6262ae" stop-opacity=".15"/><stop offset="1" stop-color="#6262ae" stop-opacity=".01"/></linearGradient><linearGradient id="trend-peach-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#efa583" stop-opacity=".17"/><stop offset="1" stop-color="#efa583" stop-opacity=".02"/></linearGradient></defs>';
  for(const ratio of [0,.25,.5,.75,1]) {
    const yy=y(ceiling*ratio);
    content+='<line class="chart-gridline" x1="'+left+'" x2="'+(width-right)+'" y1="'+yy+'" y2="'+yy+'"/><text class="axis-label" x="'+(left-9)+'" y="'+(yy+3)+'" text-anchor="end">'+moneyShort(ceiling*ratio)+'</text>';
  }
  for(const [key,fill] of [["once","peach"],["recurring","indigo"]]) {
    const points=model.buckets.map((b,i)=>({x:x(i),y:y(b[key])}));
    const path=curvedPath(points);
    content+='<path d="'+path+' L '+x(points.length-1)+' '+bottomY+' L '+x(0)+' '+bottomY+' Z" fill="url(#trend-'+fill+'-fill)"/><path d="'+path+'" fill="none" stroke="'+COLORS[key]+'" stroke-width="2.2" stroke-linecap="round"/>';
  }
  const step=Math.max(1,Math.ceil(model.buckets.length/Math.max(2,Math.floor(innerWidth/48))));
  model.buckets.forEach((b,i)=>{
    if(i%step===0) content+='<text class="axis-label" x="'+x(i)+'" y="'+(height-5)+'" text-anchor="middle">'+b.label+'</text>';
    const tip=b.tooltipLabel+"\nRecurring & gifts: "+formatAmount(b.recurring)+"\nOne-time: "+formatAmount(b.once);
    content+='<g'+tooltipAttr(tip)+'><line class="hover-line" x1="'+x(i)+'" x2="'+x(i)+'" y1="'+top+'" y2="'+bottomY+'" stroke="transparent"/><circle cx="'+x(i)+'" cy="'+y(b.recurring)+'" r="3" fill="#fff" stroke="'+COLORS.recurring+'" stroke-width="1.5"/><circle cx="'+x(i)+'" cy="'+y(b.once)+'" r="3" fill="#fff" stroke="'+COLORS.once+'" stroke-width="1.5"/><rect class="hit-target" x="'+(x(i)-11)+'" y="'+top+'" width="22" height="'+innerHeight+'" fill="transparent"/></g>';
  });
  host.innerHTML=svg(width,height,"Confirmed contribution amounts by "+model.granularity+". Focus a point for its values.",content);
  if(!model.confirmedCount) host.innerHTML='<div class="chart-empty">No confirmed contributions in this period.</div>';
}

function renderVolume(model) {
  const host=el("payment-volume"), width=Math.max(230,Math.round(host.getBoundingClientRect().width)), height=228;
  const left=26,right=6,top=20,bottom=28, innerHeight=height-top-bottom, base=height-bottom;
  const max=Math.max(...model.buckets.flatMap(b=>[b.onceCount,b.recurringCount]),1), ceiling=Math.max(2,Math.ceil(max/2)*2);
  const slot=(width-left-right)/model.buckets.length, gap=Math.min(3,slot*.12), bar=Math.min(12,(slot*.8-gap)/2), y=n=>base-n/ceiling*innerHeight;
  let content="";
  [0,ceiling/2,ceiling].forEach(n=>{
    content+='<line class="chart-gridline" x1="'+left+'" x2="'+(width-right)+'" y1="'+y(n)+'" y2="'+y(n)+'"/><text class="axis-label" x="'+(left-7)+'" y="'+(y(n)+3)+'" text-anchor="end">'+n+'</text>';
  });
  const labelStep=Math.max(1,Math.ceil(model.buckets.length/Math.max(2,Math.floor((width-left-right)/48))));
  model.buckets.forEach((b,i)=>{
    const center=left+slot*(i+.5), tip=b.tooltipLabel+"\nRecurring & gifts: "+b.recurringCount+" payments\nOne-time: "+b.onceCount+" payments";
    content+='<g'+tooltipAttr(tip)+'>';
    for(const [key,xx] of [["recurring",center-bar-gap/2],["once",center+gap/2]]) {
      const value=b[key+"Count"], barHeight=value/ceiling*innerHeight;
      content+='<rect x="'+xx+'" y="'+y(value)+'" width="'+bar+'" height="'+barHeight+'" rx="2" fill="'+COLORS[key]+'"/>';
    }
    content+='<rect class="hit-target" x="'+(center-slot/2)+'" y="'+top+'" width="'+slot+'" height="'+innerHeight+'" fill="transparent"/></g>';
    if(i%labelStep===0) content+='<text class="axis-label" x="'+center+'" y="'+(height-7)+'" text-anchor="middle">'+b.label+'</text>';
  });
  host.innerHTML=model.confirmedCount ? svg(width,height,"Number of confirmed payments by "+model.granularity+" and contribution type",content) : '<div class="chart-empty">Payment activity will appear here.</div>';
}

function renderGauge(model) {
  const completion=percent(model.verified,model.peopleCount);
  const path="M 30 115 A 90 90 0 0 1 210 115";
  el("verification-gauge").innerHTML='<svg class="gauge-svg" viewBox="0 0 240 155" role="img" aria-label="'+completion+' percent of supporter profiles complete"><path d="'+path+'" fill="none" stroke="#eeeef8" stroke-width="9" stroke-linecap="round"/><path d="'+path+'" fill="none" stroke="#6262ae" stroke-width="9" stroke-linecap="'+(completion?"round":"butt")+'" pathLength="100" stroke-dasharray="'+completion+' 100"/><text class="gauge-number" x="120" y="94" text-anchor="middle">'+(model.peopleCount?completion+"%":"—")+'</text><text class="gauge-description" x="120" y="115" text-anchor="middle">profiles complete</text><text class="axis-label" x="30" y="140" text-anchor="middle">0%</text><text class="axis-label" x="210" y="140" text-anchor="middle">100%</text></svg>';
  el("verification-key").innerHTML='<div><i class="swatch recurring"></i><span>Verified profiles</span><strong>'+model.verified+'</strong></div><div><i class="swatch" style="background:#dcdced"></i><span>Awaiting verification</span><strong>'+(model.peopleCount-model.verified)+'</strong></div>';
}

function renderRanking(model,formatAmount) {
  const max=model.ranking[0]?.total||1;
  el("supporter-ranking").innerHTML=model.ranking.length ? model.ranking.map((r,i)=>'<div class="ranking-row"><div class="ranking-label"><small>0'+(i+1)+'</small><span title="'+escape(r.name)+'">'+escape(r.name)+'</span><strong>'+escape(formatAmount(r.total))+'</strong></div><div class="ranking-track"><i style="width:'+(r.total/max*100)+'%"></i></div></div>').join("") : '<div class="chart-empty">No supporter contributions in this period.</div>';
}

function renderOutcomes(model) {
  const size=170,center=85,radius=64,circumference=2*Math.PI*radius;
  let offset=0,content='<circle cx="85" cy="85" r="64" fill="none" stroke="#eeeef6" stroke-width="17"/>';
  for(const s of model.statuses) {
    const length=s.count/model.recordCount*circumference, gap=model.statuses.length>1 ? Math.min(3,length*.15):0;
    const label=s.label+": "+s.count+" ("+percent(s.count,model.recordCount)+"%)";
    content+='<circle'+tooltipAttr(label)+' cx="85" cy="85" r="64" fill="none" stroke="'+s.color+'" stroke-width="17" stroke-dasharray="'+Math.max(0,length-gap)+' '+(circumference-Math.max(0,length-gap))+'" stroke-dashoffset="'+(-offset)+'" transform="rotate(-90 85 85)"/>';
    offset+=length;
  }
  content+='<text class="donut-number" x="'+center+'" y="84" text-anchor="middle">'+(model.recordCount?percent(model.confirmedCount,model.recordCount)+"%":"—")+'</text><text class="donut-caption" x="85" y="101" text-anchor="middle">successful</text>';
  el("payment-outcomes").innerHTML='<svg class="donut-svg" viewBox="0 0 '+size+' '+size+'" role="group" aria-label="Payment outcomes in the selected period">'+content+'</svg>';
  el("outcome-key").innerHTML=model.recordCount ? model.statuses.map(s=>'<div><i class="swatch" style="background:'+s.color+'"></i><span>'+s.label+'</span><strong>'+s.count+'</strong></div>').join("") : '<div>No payments in this period.</div>';
}

export function renderDashboardCharts(data,helpers,range) {
  lastRender={data,helpers,range};
  const model=buildDashboardModel(data,helpers,range);
  renderMetrics(model,helpers.formatAmount);
  el("chart-period").textContent=model.rangeLabel;
  el("period-raised").textContent=helpers.formatAmount(model.total);
  el("period-payment-count").textContent=model.confirmedCount+" confirmed payments";
  el("volume-title").textContent=({hour:"Hourly",day:"Daily",month:"Monthly"})[model.granularity]+" breakdown";
  renderTrend(model,helpers.formatAmount);
  renderGauge(model);
  renderRanking(model,helpers.formatAmount);
  renderVolume(model);
  renderOutcomes(model);
  el("analytics-footnote").textContent=(model.granularity==="month"?"Selected calendar months through now":"Today and past-day ranges include today through now")+" (IST). Profiles and active plans are all-time/current totals. Cancellation / lifecycle receipts are not payments and are excluded."+ (model.undated?" "+model.undated+" undated payment records excluded from trends.":"");
}

export function observeDashboardCharts() {
  const board=el("ui-board"), tooltip=el("chart-tooltip");
  const hide=()=>{ tooltip.hidden=true; };
  const show=(target,event)=>{
    const mark=target.closest("[data-chart-tip]");
    if(!mark) { hide(); return; }
    tooltip.textContent=mark.dataset.chartTip;
    tooltip.hidden=false;
    const box=mark.getBoundingClientRect();
    const xx=event?.clientX ?? box.left+box.width/2, yy=event?.clientY ?? box.top;
    const bounds=tooltip.getBoundingClientRect();
    tooltip.style.left=Math.max(8,Math.min(xx+12,window.innerWidth-bounds.width-8))+"px";
    tooltip.style.top=Math.max(8,Math.min(yy-bounds.height-12,window.innerHeight-bounds.height-8))+"px";
  };
  board.addEventListener("pointermove",event=>show(event.target,event));
  board.addEventListener("pointerleave",hide);
  board.addEventListener("focusin",event=>show(event.target));
  board.addEventListener("focusout",hide);
  board.addEventListener("click",event=>show(event.target,event));
  document.addEventListener("keydown",event=>{ if(event.key==="Escape") hide(); });
  window.addEventListener("scroll",hide,{passive:true});
  let previousWidth=0,frame;
  new ResizeObserver(entries=>{
    const width=Math.round(entries[0].contentRect.width);
    if(width===previousWidth || !width) return;
    previousWidth=width;
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      if(lastRender) renderDashboardCharts(lastRender.data,lastRender.helpers,lastRender.range);
    });
  }).observe(board);
}
