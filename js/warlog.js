(function(g){'use strict';var C=g.CocTool;if(!C)return;
var B=C.apiBase,T=C.appToken,P='warlog_cache_',D='warlog_detail_',H='clash_league_hist_',N=0,L=localStorage,LT='war';
function lc(t){try{var r=L.getItem(P+t);return r?JSON.parse(r):0}catch(e){return null}}
function sc(t,e,lt,lc){try{L.setItem(P+t,JSON.stringify({lastEndTime:lt,lastChecked:lc||Date.now(),entries:e}))}catch(e){}}
function ldc(t,et){try{var r=L.getItem(D+t+'_'+et);return r?JSON.parse(r):0}catch(e){return null}}
function sdc(t,et,f,d){try{L.setItem(D+t+'_'+et,JSON.stringify({found:f,data:d||0}))}catch(e){}}
function lhc(t,m){try{var r=L.getItem(H+t+'_'+m);return r?JSON.parse(r):0}catch(e){return null}}
function shc(t,m,d){try{L.setItem(H+t+'_'+m,JSON.stringify(d))}catch(e){}}
function fx(p,cb){var x=new XMLHttpRequest();x.open('GET',B+p,true);x.setRequestHeader('X-App-Token',T);x.onload=function(){if(x.status===200){try{cb(null,JSON.parse(x.responseText))}catch(e){cb(e)}}else{var e=new Error('HTTP '+x.status);try{var b=JSON.parse(x.responseText);if(b&&b.reason==='accessDenied')e.accessDenied=true}catch(e2){}cb(e)}};x.onerror=function(){cb(new Error('Network error'))};x.send()}
function fl(t,li,cb){var p='/api/coc/warlog/'+encodeURIComponent(t.replace(/^#/,''));if(li)p+='?limit='+li;fx(p,cb)}
function fw(t,et,cb){fx('/api/coc/war-history/'+encodeURIComponent(t.replace(/^#/,''))+'/'+encodeURIComponent(et),cb)}
function fd(et){if(!et)return'';return et.slice(0,4)+'/'+parseInt(et.slice(4,6),10)+'/'+parseInt(et.slice(6,8),10)}
function gi(r){if(r==='win')return{text:'胜利',color:'#10b981'};if(r==='lose')return{text:'失败',color:'#f59e0b'};return{text:'平局',color:'#3b82f6'}}
function gp(p){return(Math.round((p||0)*10)/10)+'%'}

function rcs(ct,en){ct.innerHTML='';if(!en||!en.length){var em=document.createElement('div');em.className='empty-state';em.innerHTML='<i class="fa fa-inbox"></i><p>暂无对战记录</p>';ct.appendChild(em);return}
for(var i=0;i<en.length;i++){var it=en[i];if(it.attacksPerMember!==2||!it.result)continue;var cl=it.clan||{},op=it.opponent||{},inf=gi(it.result);
var cd=document.createElement('div');cd.className='war-log-card';cd.setAttribute('data-end-time',it.endTime);cd.style.cssText='display:flex;align-items:center;padding:10px 12px;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);gap:10px;cursor:pointer;';
var le=document.createElement('div');le.style.cssText='display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;width:56px;';
var li=document.createElement('img');li.src=(cl.badgeUrls&&cl.badgeUrls.medium)||'';li.style.cssText='width:36px;height:36px;border-radius:8px;';li.onerror=function(){this.style.display='none'};
var ln=document.createElement('span');ln.textContent=cl.name||'';ln.style.cssText='font-size:14px;color:#000;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:56px;';le.appendChild(li);le.appendChild(ln);
var md=document.createElement('div');md.style.cssText='display:flex;flex-direction:column;align-items:center;gap:2px;flex:1;min-width:0;';
var mp=document.createElement('span');mp.textContent=gp(cl.destructionPercentage)+' - '+gp(op.destructionPercentage);mp.style.cssText='font-size:11px;color:#374151;';
var ms=document.createElement('span');ms.textContent=(cl.stars||0)+' \u2B50 '+(op.stars||0);ms.style.cssText='font-size:16px;font-weight:700;color:'+inf.color+';';
var mr=document.createElement('span');mr.textContent=inf.text;mr.style.cssText='font-size:12px;font-weight:700;color:#fff;background:'+inf.color+';padding:2px 10px;border-radius:10px;line-height:1.2;';
var mdt=document.createElement('span');mdt.textContent=fd(it.endTime);mdt.style.cssText='font-size:11px;color:#9ca3af;';md.appendChild(mp);md.appendChild(ms);md.appendChild(mr);md.appendChild(mdt);
var ri=document.createElement('div');ri.style.cssText='display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;width:56px;';
var rimg=document.createElement('img');rimg.src=(op.badgeUrls&&op.badgeUrls.medium)||'';rimg.style.cssText='width:36px;height:36px;border-radius:8px;';rimg.onerror=function(){this.style.display='none'};
var rn=document.createElement('span');rn.textContent=op.name||'';rn.style.cssText='font-size:14px;color:#000;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:56px;';ri.appendChild(rimg);ri.appendChild(rn);
cd.appendChild(le);cd.appendChild(md);cd.appendChild(ri);ct.appendChild(cd)}}

// ====== 联赛记录卡片（点击查看该月联赛历史：8部落总表 + 本部详情表） ======
function rcsLeague(ct,en){ct.innerHTML='';if(!en||!en.length){var em=document.createElement('div');em.className='empty-state';em.innerHTML='<i class="fa fa-inbox"></i><p>暂无联赛记录</p>';ct.appendChild(em);return}
var seen={};for(var i=0;i<en.length;i++){var it=en[i];if(it.attacksPerMember===2)continue;if(seen[it.endTime])continue;seen[it.endTime]=1;var cl=it.clan||{};
var icon=it.result===null?'null':(it.result==='win'?'up':'down');
var cd=document.createElement('div');cd.className='war-log-card';cd.setAttribute('data-league-month',it.endTime.slice(0,6));cd.style.cssText='display:flex;align-items:center;padding:10px 12px;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);gap:10px;cursor:pointer;';
var le=document.createElement('div');le.style.cssText='display:flex;align-items:center;gap:10px;flex:1;min-width:0;';
var li=document.createElement('img');li.src=(cl.badgeUrls&&cl.badgeUrls.medium)||'';li.style.cssText='width:40px;height:40px;border-radius:8px;';li.onerror=function(){this.style.display='none'};
var ln=document.createElement('span');ln.textContent=cl.name||'';ln.style.cssText='font-size:14px;color:#000;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
var ri=document.createElement('img');ri.src='img/icons/'+icon+'.webp';ri.style.cssText='width:12px;height:12px;flex-shrink:0;object-fit:contain;margin-left:2px;';
le.appendChild(li);le.appendChild(ln);le.appendChild(ri);
var md=document.createElement('div');md.style.cssText='display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0;';
var mn=document.createElement('span');mn.textContent=parseInt(it.endTime.slice(4,6),10)+'月联赛';mn.style.cssText='font-size:12px;color:#000;';
md.appendChild(mn);cd.appendChild(le);cd.appendChild(md);ct.appendChild(cd)}}

// 按当前 tab 过滤并渲染（部落战 = attacksPerMember===2 且有结果；联赛 = 其余）
function renderLog(en){var ct=document.getElementById('log-card-container'),tl=document.getElementById('log-title');
var list=en||[];var f=LT==='war'?list.filter(function(e){return e.attacksPerMember===2&&e.result}):list.filter(function(e){return e.attacksPerMember!==2});
if(tl)tl.textContent=LT==='war'?'过去的 '+f.length+' 场部落对战':'过去的 '+f.length+' 次联赛';
if(LT==='war')rcs(ct,f);else rcsLeague(ct,f)}

function setLogTab(mode){LT=mode;var w=document.getElementById('log-tab-war'),l=document.getElementById('log-tab-league'),ind=document.getElementById('log-tab-indicator');
if(w)w.classList.toggle('active',mode==='war');if(l)l.classList.toggle('active',mode==='league');if(ind)ind.style.transform=mode==='war'?'translateX(0)':'translateX(100%)';
var t=N;if(!t)return;var cc=lc(t);if(cc&&cc.entries)renderLog(cc.entries)}

// ====== 层叠管理 ======
function showLayer(id,style){var el=document.getElementById(id);if(!el)return;el.style.display=style||'flex';el.classList.remove('hidden')}
function hideLayer(id){var el=document.getElementById(id);if(!el)return;el.style.display='none';el.classList.add('hidden')}

function showLog(){showLayer('clan-log-view');var t=N,ct=document.getElementById('log-card-container'),tl=document.getElementById('log-title'),cc=lc(t),nw=Date.now();
if(cc&&cc.entries&&cc.entries.length>0){renderLog(cc.entries);var nc=false;
try{var wr=L.getItem('clash_war_'+t);if(wr){var wd=JSON.parse(wr);if(wd&&wd.data&&wd.data.endTime&&wd.data.endTime>cc.lastEndTime)nc=true}}catch(e){}
if(!nc&&nw-(cc.lastChecked||0)>43200000)nc=true;
if(nc&&nw-(cc.lastChecked||0)>3600000){fl(t,50,function(err,data){if(err){sc(t,cc.entries,cc.lastEndTime,nw);return}var ne=(data&&data.items)?data.items:[];var ets={};for(var i=0;i<cc.entries.length;i++)ets[cc.entries[i].endTime]=true;var mg=cc.entries.slice();for(var i=0;i<ne.length;i++){if(!ets[ne[i].endTime])mg.push(ne[i])}mg.sort(function(a,b){return a.endTime<b.endTime?1:-1});var lt=mg.length>0?mg[0].endTime:cc.lastEndTime;sc(t,mg,lt,nw);if(mg.length!==cc.entries.length){renderLog(mg)}})}return}
if(tl)tl.textContent='加载中...';if(ct)ct.innerHTML='<div class="empty-state"><div style="width:24px;height:24px;border:3px solid #e5e7eb;border-top:3px solid #3b82f6;border-radius:50%;animation:clan-spin 0.8s linear infinite;margin-bottom:8px;"></div><p>加载中...</p></div>';
  fl(t,0,function(err,data){if(err){if(tl)tl.textContent=err.accessDenied?'此部落对战日志未公开':'加载失败';if(ct)ct.innerHTML='<p style="text-align:center;color:#9ca3af;padding:20px;">'+(err.accessDenied?'此部落对战日志未公开':'加载失败，请重试')+'</p>';return}var en=(data&&data.items)?data.items:[];en.sort(function(a,b){return a.endTime<b.endTime?1:-1});var lt=en.length>0?en[0].endTime:'';sc(t,en,lt,nw);renderLog(en)})}

function hideLog(){hideLayer('clan-log-view')}

function rl(){if(!N)return;var t=N,ct=document.getElementById('log-card-container'),cc=lc(t),nw=Date.now();fl(t,50,function(err,data){if(err)return;var ne=(data&&data.items)?data.items:[];if(cc&&cc.entries){var ets={};for(var i=0;i<cc.entries.length;i++)ets[cc.entries[i].endTime]=true;var mg=cc.entries.slice();for(var i=0;i<ne.length;i++){if(!ets[ne[i].endTime])mg.push(ne[i])}mg.sort(function(a,b){return a.endTime<b.endTime?1:-1});var lt=mg.length>0?mg[0].endTime:cc.lastEndTime;sc(t,mg,lt,nw);renderLog(mg)}else{var en=ne;en.sort(function(a,b){return a.endTime<b.endTime?1:-1});var lt=en.length>0?en[0].endTime:'';sc(t,en,lt,nw);renderLog(en)}})}

// 全量刷新（长按刷新键触发）：不带 limit 参数，官方返回全部记录并替换缓存
function rlFull(){if(!N)return;var t=N,ct=document.getElementById('log-card-container'),tl=document.getElementById('log-title'),nw=Date.now();
if(tl)tl.textContent='加载中...';if(ct)ct.innerHTML='<div class="empty-state"><div style="width:24px;height:24px;border:3px solid #e5e7eb;border-top:3px solid #3b82f6;border-radius:50%;animation:clan-spin 0.8s linear infinite;margin-bottom:8px;"></div><p>加载中...</p></div>';
fl(t,0,function(err,data){if(err){if(tl)tl.textContent=err.accessDenied?'此部落对战日志未公开':'刷新失败';if(ct)ct.innerHTML='<p style="text-align:center;color:#9ca3af;padding:20px;">'+(err.accessDenied?'此部落对战日志未公开':'刷新失败，请重试')+'</p>';return}var en=(data&&data.items)?data.items:[];en.sort(function(a,b){return a.endTime<b.endTime?1:-1});var lt=en.length>0?en[0].endTime:'';sc(t,en,lt,nw);renderLog(en)})}

// ====== 历史对战详情渲染 ======
function renderHistoryDetail(ct,d){var VV=CocTool.warView;if(VV.renderDetailTo)VV.renderDetailTo(ct,d)}
function showWarDetail(et){
  var t=N;if(!t||!et)return;
  showLayer('war-history-detail');hideLayer('clan-log-view');
  var ct=document.getElementById('history-content'),tl=document.getElementById('history-title');
  if(!ct)return;
  ct.innerHTML='<div class="empty-state"><div style="width:24px;height:24px;border:3px solid #e5e7eb;border-top:3px solid #3b82f6;border-radius:50%;animation:clan-spin 0.8s linear infinite;margin-bottom:8px;"></div><p>加载中...</p></div>';
  if(tl)tl.textContent='对战详情';
  var cc=ldc(t,et);
  if(cc){if(cc.found&&cc.data){if(tl)tl.textContent='';var VV=CocTool.warView;if(VV.renderDetailTo)VV.renderDetailTo(ct,cc.data);else ct.innerHTML='<p style="text-align:center;color:#9ca3af;padding:40px;">渲染模块不可用</p>';return}if(!cc.found){ct.innerHTML='<p style="text-align:center;color:#9ca3af;padding:40px;">该场对战数据暂未存档</p>';if(tl)tl.textContent='未存档';return}}
  fw(t,et,function(err,data){
    ct.innerHTML='';
    if(err||!data){sdc(t,et,!1,0);ct.innerHTML='<p style="text-align:center;color:#9ca3af;padding:40px;">该场对战数据暂未存档</p>';if(tl)tl.textContent='未存档';return}
    sdc(t,et,!0,data);if(tl)tl.textContent='';var VV=CocTool.warView;if(VV.renderDetailTo)VV.renderDetailTo(ct,data)
  })
}

function showWarDetail(et){
  var t=N;if(!t||!et)return;
  showLayer('war-history-detail');hideLayer('clan-log-view');
  var ct=document.getElementById('history-content'),tl=document.getElementById('history-title');
  if(!ct)return;
  ct.innerHTML='<div class="empty-state"><div style="width:24px;height:24px;border:3px solid #e5e7eb;border-top:3px solid #3b82f6;border-radius:50%;animation:clan-spin 0.8s linear infinite;margin-bottom:8px;"></div><p>加载中...</p></div>';
  if(tl)tl.textContent='对战详情';
  var cc=ldc(t,et);
  if(cc){if(cc.found&&cc.data){if(tl)tl.textContent='';renderHistoryDetail(ct,cc.data);return}if(!cc.found){ct.innerHTML='<p style="text-align:center;color:#9ca3af;padding:40px;">该场对战数据暂未存档</p>';if(tl)tl.textContent='未存档';return}}
  fw(t,et,function(err,data){
    ct.innerHTML='';
    if(err||!data){sdc(t,et,!1,0);ct.innerHTML='<p style="text-align:center;color:#9ca3af;padding:40px;">该场对战数据暂未存档</p>';if(tl)tl.textContent='未存档';return}
    sdc(t,et,!0,data);if(tl)tl.textContent='';renderHistoryDetail(ct,data)
  })
}

// ====== 联赛历史查看（部落总表 + 统计/进攻/防御 三 tab；数据来自服务器联赛存档聚合） ======
// 表格样式对齐对战统计（ws-atk-box 色块方格矩阵 + ws-table 排行表；CSS Grid，避开真机 table 列塌缩）
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function lgLegend(items){var h='<div class="ws-legend">';for(var i=0;i<items.length;i++)h+='<span class="ws-lg"><i class="ws-lg-box '+items[i][0]+'"></i>'+items[i][1]+'</span>';return h+'</div>'}
// fixedCols = 前段固定 px 列；baseW = 固定列 + 7×46 的最小总宽。
// 场次列 minmax(46px,1fr)：窄屏每列不低于 46px 照常横滑；宽屏均摊多余宽度（不留右侧死白）
function lgMatrix(fixedCols,baseW,headCells,rows){
  var tpl='';for(var i=0;i<fixedCols.length;i++)tpl+=fixedCols[i]+'px ';
  var h='<div class="ws-scroll"><div class="ws-matrix" style="grid-template-columns:'+tpl+'repeat(7, minmax(46px, 1fr)); min-width:'+baseW+'px">';
  h+=headCells;h+=rows;return h+'</div></div>'}
function lgResultCls(r){return r==='win'?'lg-w':(r==='lose'?'lg-l':'lg-t')}
// 进攻/防御表排序状态（0=默认序；打开某月或重渲染前重置）
var LGD=0,LSA=0,LSD=0;
function lgSortHead(k,label,sort){var ico=(sort&&sort.k===k)?'<i class="fa fa-chevron-down ws-sort-caret'+(sort.d===1?' ws-asc':'')+'"></i>':'<i class="fa fa-sort ws-sort-hint"></i>';return '<th data-lsk="'+k+'">'+label+ico+'</th>'}
function lgSortRows(arr,sort,val){if(!sort)return arr;return arr.slice().sort(function(a,b){var va=val(a),vb=val(b);if(typeof va==='string')return sort.d*String(va).localeCompare(String(vb));return sort.d*(va-vb)})}
function lgCount(m,st){var n=0,rr=m.rounds||[];for(var i=0;i<7;i++){var r=rr[i];if(r&&r.stars===st)n++}return n}
function lgAtkVal(m){if(!LSA)return 0;if(LSA.k==='name')return m.name||'';if(LSA.k==='three')return lgCount(m,3);if(LSA.k==='zero')return lgCount(m,0);if(LSA.k==='avgDest')return m.played>0?Math.round((m.totalDest||0)/m.played*10)/10:0;return m[LSA.k]||0}
function lgDefVal(m){if(!LSD)return 0;if(LSD.k==='name')return m.name||'';if(LSD.k==='defRate')return m.defended>0?Math.round(m.defBestSum/m.defended/3*100):0;if(LSD.k==='eff')return m.defended>0?Math.round((1-m.defBestSum/(m.defended*3))*100):100;return m[LSD.k]||0}

function lgClanSection(cs){
  var heads1='<div class="ws-mhead">#</div><div class="ws-mhead left">部落</div><div class="ws-mhead">汇总</div>';
  for(var i=1;i<=7;i++)heads1+='<div class="ws-mhead">第'+i+'场</div>';
  var rows1='';
  for(var i=0;i<cs.length;i++){var c=cs[i],mine=c.tag==='#'+N||c.tag===N,mc=mine?' lg-mine':'';
    rows1+='<div class="ws-mcell'+mc+'">'+(c.rank||i+1)+'</div>';
    rows1+='<div class="ws-mcell name'+mc+'"><img class="lg-badge" src="'+((c.badgeUrls&&c.badgeUrls.medium)||'')+'" onerror="this.style.display=\'none\'"><span>'+esc(c.name)+'</span></div>';
    rows1+='<div class="ws-mcell'+mc+'"><div class="lg-main">'+c.totalStars+'</div><div class="lg-sub">'+c.totalDest+'%</div></div>';
    var rr=c.rounds||[];
    for(var j=0;j<7;j++){var r=rr[j];
      rows1+='<div class="ws-atk-cell'+mc+'">'+(r?'<div class="ws-atk-box '+lgResultCls(r.result)+'"><span class="ws-atk-stars">'+r.stars+'</span><span class="ws-atk-dest">'+r.dest+'%</span></div>':'<div class="ws-atk-box none"></div>')+'</div>'}
  }
  var h='<div class="ws-section"><div class="ws-section-title"><i class="fa fa-trophy"></i>部落总表</div>';
  h+=lgLegend([['lg-w','胜利'],['lg-l','失败'],['lg-t','平局'],['none','未存档']]);
  h+=lgMatrix([26,92,60],26+92+60+46*7,heads1,rows1);
  return h+'</div>'}

// 统计 tab：本部详情矩阵（成员 × 7 场进攻色块，口径见追加十二：分母=上场场数）
function lgStatsSection(ms){
  var heads2='<div class="ws-mhead">#</div><div class="ws-mhead left">成员</div><div class="ws-mhead">总星数</div><div class="ws-mhead">总摧毁</div><div class="ws-mhead">参战</div>';
  for(var i=1;i<=7;i++)heads2+='<div class="ws-mhead">第'+i+'场</div>';
  var rows2='';
  for(i=0;i<ms.length;i++){var m=ms[i],rr=m.rounds||[];
    rows2+='<div class="ws-mcell">'+(i+1)+'</div>';
    rows2+='<div class="ws-mcell name"><span>'+esc(m.name)+'</span></div>';
    rows2+='<div class="ws-mcell"><div class="lg-main">'+m.totalStars+'</div></div>';
    rows2+='<div class="ws-mcell"><div class="lg-main">'+m.totalDest+'%</div></div>';
    rows2+='<div class="ws-mcell"><div class="lg-main">'+(m.played||0)+'/'+(m.rostered||0)+'</div></div>';
    for(var j=0;j<7;j++){var r=rr[j];
      // 在册未出刀 = 红色 na 块（统计页「未进攻」同款）；未在册 = 灰色 none 块（未上场）
      rows2+='<div class="ws-atk-cell">'+(r?(r.stars<0?'<div class="ws-atk-box na"></div>':'<div class="ws-atk-box s'+r.stars+'"><span class="ws-atk-stars">'+r.stars+'</span><span class="ws-atk-dest">'+r.dest+'%</span></div>'):'<div class="ws-atk-box none"></div>')+'</div>'}
  }
  var h='<div class="ws-section"><div class="ws-section-title"><i class="fa fa-table"></i>本部详情表<button class="ws-share-btn" title="分享表格"><i class="fa fa-share-image"></i></button></div>';
  h+=lgLegend([['s3','三星'],['s2','两星'],['s1','一星'],['s0','零星'],['na','未出刀'],['none','未上场']]);
  h+=lgMatrix([26,90,52,56,44],26+90+52+56+44+46*7,heads2,rows2);
  return h+'</div>'}

// 进攻 tab：成员进攻排行（联赛口径：每场上限 1 刀；被三星率/防守效率公式同 war-stats）
function lgAttackSection(ms){
  var arr=lgSortRows(ms,LSA,lgAtkVal);
  var h='<div class="ws-section"><div class="ws-section-title"><i class="fa fa-users"></i>进攻数据<button class="ws-share-btn" title="分享表格"><i class="fa fa-share-image"></i></button></div>';
  h+='<div class="ws-scroll"><table class="ws-table"><thead><tr><th>#</th>'+lgSortHead('name','成员',LSA)+lgSortHead('th','TH',LSA)+lgSortHead('rostered','上场',LSA)+lgSortHead('played','出刀',LSA)+lgSortHead('totalStars','总星',LSA)+lgSortHead('three','三星',LSA)+lgSortHead('zero','零星',LSA)+lgSortHead('avgDest','均摧毁',LSA)+'</tr></thead><tbody>';
  for(var i=0;i<arr.length;i++){var m=arr[i],ad=m.played>0?Math.round((m.totalDest||0)/m.played*10)/10:0;
    h+='<tr><td>'+(i+1)+'</td><td class="ws-name">'+esc(m.name)+'</td><td>'+(m.townhallLevel||'')+'</td><td>'+(m.rostered||0)+'</td><td>'+(m.played||0)+'</td><td class="num" style="color:var(--ws-accent)">'+(m.totalStars||0)+'</td><td class="num" style="color:var(--ws-green)">'+lgCount(m,3)+'</td><td class="num">'+lgCount(m,0)+'</td><td class="num">'+(m.played>0?ad+'%':'-')+'</td></tr>'}
  return h+'</tbody></table></div></div>'}

// 防御 tab：成员防守排行（只列被攻过的成员；公式同 war-stats）
function lgDefenseSection(ms){
  var h='<div class="ws-section"><div class="ws-section-title"><i class="fa fa-shield"></i>防守数据<button class="ws-share-btn" title="分享表格"><i class="fa fa-share-image"></i></button></div>';
  var has=0;for(var i=0;i<ms.length;i++)if((ms[i].defended||0)>0)has++;
  h+='<div class="ws-scroll"><table class="ws-table"><thead><tr><th>#</th>'+lgSortHead('name','成员',LSD)+lgSortHead('rostered','上场',LSD)+lgSortHead('defended','被攻次数',LSD)+lgSortHead('defBestSum','被拿星',LSD)+lgSortHead('defRate','被三星率',LSD)+lgSortHead('eff','防守效率',LSD)+'</tr></thead><tbody>';
  if(!has){h+='<tr><td colspan="7" style="text-align:center;color:var(--ws-sub)">无防守数据（该月未被攻击）</td></tr>'}else{
    var arr=lgSortRows(ms.filter(function(m){return (m.defended||0)>0}),LSD,lgDefVal);
    for(i=0;i<arr.length;i++){var m=arr[i],dr=m.defended>0?Math.round(m.defBestSum/m.defended/3*100):0,ef=m.defended>0?Math.round((1-m.defBestSum/(m.defended*3))*100):100;
      h+='<tr><td>'+(i+1)+'</td><td class="ws-name">'+esc(m.name)+'</td><td>'+(m.rostered||0)+'</td><td>'+(m.defended||0)+'</td><td class="num" style="color:var(--ws-red)">'+(m.defBestSum||0)+'</td><td class="num" style="color:var(--ws-red)">'+dr+'%</td><td class="num" style="color:var(--ws-green)">'+ef+'%</td></tr>'}}
  return h+'</tbody></table></div></div>'}

function renderLeagueHistory(ct,d){
  LGD=d;LSA=0;LSD=0;
  var cs=d.clans||[],ms=d.members||[];
  if(!cs.length&&!ms.length){ct.innerHTML='<p style="text-align:center;color:#9ca3af;padding:40px;">该月联赛数据暂未存档</p>';return}
  ct.innerHTML=lgClanSection(cs)
    +'<div class="ws-tab-bar"><button class="ws-tab-btn active" data-lt="stats">统计</button><button class="ws-tab-btn" data-lt="attack">进攻</button><button class="ws-tab-btn" data-lt="defense">防御</button></div>'
    +'<div data-lg-pane="stats">'+lgStatsSection(ms)+'</div>'
    +'<div data-lg-pane="attack" class="hidden">'+lgAttackSection(ms)+'</div>'
    +'<div data-lg-pane="defense" class="hidden">'+lgDefenseSection(ms)+'</div>'}

// 联赛历史层内点击：tab 切换 + 表格分享 + 进攻/防御表头排序（委托在 #history-content 上，一次绑定全程有效）
function lgPaneClick(e){
  var sb=e.target.closest?e.target.closest('.ws-share-btn'):null;
  if(sb){var WS=C.features.warStats,sec=sb.closest('.ws-section');
    if(WS&&WS.shareSection&&sec){var root=sec.querySelector('.ws-matrix')||sec.querySelector('.ws-table');if(root)WS.shareSection(root,sec)}
    return}
  var tb=e.target.closest?e.target.closest('[data-lt]'):null;
  if(tb){var k=tb.getAttribute('data-lt');
    tb.parentNode.querySelectorAll('[data-lt]').forEach(function(b){b.classList.toggle('active',b===tb)});
    var ct=document.getElementById('history-content');
    ct.querySelectorAll('[data-lg-pane]').forEach(function(p){p.classList.toggle('hidden',p.getAttribute('data-lg-pane')!==k)});
    return}
  var th=e.target.closest?e.target.closest('th[data-lsk]'):null;
  if(th&&LGD){var pane=th.closest('[data-lg-pane]');if(!pane)return;
    var isAtk=pane.getAttribute('data-lg-pane')==='attack';
    var k2=th.getAttribute('data-lsk'),cur=isAtk?LSA:LSD;
    var dir=(cur&&cur.k===k2)?-cur.d:(k2==='name'?1:-1);
    if(isAtk)LSA={k:k2,d:dir};else LSD={k:k2,d:dir};
    // 重渲染归零滚动——先记后还（同 war-stats 表头排序的修法）
    var wrap=pane.querySelector('.ws-scroll');var sl=wrap?wrap.scrollLeft:0,st=wrap?wrap.scrollTop:0;
    pane.innerHTML=isAtk?lgAttackSection(LGD.members||[]):lgDefenseSection(LGD.members||[]);
    wrap=pane.querySelector('.ws-scroll');if(wrap){wrap.scrollLeft=sl;wrap.scrollTop=st}}
}

function showLeagueHistory(mk){
  var t=N;if(!t||!mk)return;
  showLayer('war-history-detail');hideLayer('clan-log-view');
  var ct=document.getElementById('history-content'),tl=document.getElementById('history-title');
  if(!ct)return;
  if(tl)tl.textContent=parseInt(mk.slice(4,6),10)+'月联赛';
  ct.innerHTML='<div class="empty-state"><div style="width:24px;height:24px;border:3px solid #e5e7eb;border-top:3px solid #3b82f6;border-radius:50%;animation:clan-spin 0.8s linear infinite;margin-bottom:8px;"></div><p>加载中...</p></div>';
  var cc=lhc(t,mk);
  if(cc){ct.innerHTML='';renderLeagueHistory(ct,cc);return}
  fx('/api/coc/league-history/'+encodeURIComponent(t.replace(/^#/,''))+'/'+encodeURIComponent(mk),function(err,data){
    ct.innerHTML='';
    if(err||!data||!data.clans){ct.innerHTML='<p style="text-align:center;color:#9ca3af;padding:40px;">该月联赛数据暂未存档</p>';if(tl)tl.textContent='未存档';return}
    shc(t,mk,data);renderLeagueHistory(ct,data);
  })
}

function init(){
  var cc=document.getElementById('clan-cards');
  if(cc)cc.addEventListener('click',function(e){var cd=e.target.closest('[data-war-tag]')||e.target.closest('[data-war-china-id]');if(cd){N=cd.getAttribute('data-war-tag')||cd.getAttribute('data-war-china-id');if(N&&N.startsWith('#'))N=N.slice(1)}},true);  var bk=document.getElementById('log-back-btn');if(bk)bk.addEventListener('click',function(){hideLog()});
  var lr=document.getElementById('log-refresh-btn');if(lr){
    var lpTimer=null,lp=false;
    var lpStart=function(){lp=false;if(lpTimer)clearTimeout(lpTimer);lpTimer=setTimeout(function(){lpTimer=null;lp=true;rlFull()},500)};
    var lpEnd=function(){if(lpTimer){clearTimeout(lpTimer);lpTimer=null}if(lp){lp=false;return}rl()};
    var lpCancel=function(){if(lpTimer){clearTimeout(lpTimer);lpTimer=null}};
    lr.addEventListener('pointerdown',lpStart);
    lr.addEventListener('pointerup',lpEnd);
    lr.addEventListener('pointercancel',lpCancel);
    lr.addEventListener('pointerleave',lpCancel);
  }
  var tw=document.getElementById('log-tab-war');if(tw)tw.addEventListener('click',function(){setLogTab('war')});
  var tl2=document.getElementById('log-tab-league');if(tl2)tl2.addEventListener('click',function(){setLogTab('league')});
  var lct=document.getElementById('log-card-container');if(lct)lct.addEventListener('click',function(e){var lm=e.target.closest('[data-league-month]');if(lm){var mk=lm.getAttribute('data-league-month');if(mk)showLeagueHistory(mk);return}var cd=e.target.closest('[data-end-time]');if(cd){var et=cd.getAttribute('data-end-time');if(et)showWarDetail(et)}});
  var hc=document.getElementById('history-content');if(hc)hc.addEventListener('click',lgPaneClick);   // 联赛历史 tab 切换 + 表头排序（委托，重渲染不丢）
  var hb=document.getElementById('history-back-btn');if(hb)hb.addEventListener('click',function(){hideLayer('war-history-detail');showLog()});
  var hr=document.getElementById('history-refresh-btn');if(hr)hr.addEventListener('click',function(){if(!N)return;var et=document.getElementById('history-content').getAttribute('data-current-et');if(et){L.removeItem(D+N+'_'+et);showWarDetail(et)}})
}
C.features.warlog={init:init,show:showLog,hide:hideLog}})(window);
