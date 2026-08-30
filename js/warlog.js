(function(g){'use strict';var C=g.CocTool;if(!C)return;
var B=C.apiBase,T=C.appToken,P='warlog_cache_',D='warlog_detail_',N=0,L=localStorage,LT='war';
function lc(t){try{var r=L.getItem(P+t);return r?JSON.parse(r):0}catch(e){return null}}
function sc(t,e,lt,lc){try{L.setItem(P+t,JSON.stringify({lastEndTime:lt,lastChecked:lc||Date.now(),entries:e}))}catch(e){}}
function ldc(t,et){try{var r=L.getItem(D+t+'_'+et);return r?JSON.parse(r):0}catch(e){return null}}
function sdc(t,et,f,d){try{L.setItem(D+t+'_'+et,JSON.stringify({found:f,data:d||0}))}catch(e){}}
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

// ====== 联赛记录卡片（仅展示，点击行为暂不做） ======
function rcsLeague(ct,en){ct.innerHTML='';if(!en||!en.length){var em=document.createElement('div');em.className='empty-state';em.innerHTML='<i class="fa fa-inbox"></i><p>暂无联赛记录</p>';ct.appendChild(em);return}
var seen={};for(var i=0;i<en.length;i++){var it=en[i];if(it.attacksPerMember===2)continue;if(seen[it.endTime])continue;seen[it.endTime]=1;var cl=it.clan||{};
var icon=it.result===null?'null':(it.result==='win'?'up':'down');
var cd=document.createElement('div');cd.className='war-log-card';cd.style.cssText='display:flex;align-items:center;padding:10px 12px;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);gap:10px;';
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
if(nc&&nw-(cc.lastChecked||0)>3600000){fl(t,5,function(err,data){if(err){sc(t,cc.entries,cc.lastEndTime,nw);return}var ne=(data&&data.items)?data.items:[];var ets={};for(var i=0;i<cc.entries.length;i++)ets[cc.entries[i].endTime]=true;var mg=cc.entries.slice();for(var i=0;i<ne.length;i++){if(!ets[ne[i].endTime])mg.push(ne[i])}mg.sort(function(a,b){return a.endTime<b.endTime?1:-1});var lt=mg.length>0?mg[0].endTime:cc.lastEndTime;sc(t,mg,lt,nw);if(mg.length!==cc.entries.length){renderLog(mg)}})}return}
if(tl)tl.textContent='加载中...';if(ct)ct.innerHTML='<div class="empty-state"><div style="width:24px;height:24px;border:3px solid #e5e7eb;border-top:3px solid #3b82f6;border-radius:50%;animation:clan-spin 0.8s linear infinite;margin-bottom:8px;"></div><p>加载中...</p></div>';
  fl(t,0,function(err,data){if(err){if(tl)tl.textContent=err.accessDenied?'此部落对战日志未公开':'加载失败';if(ct)ct.innerHTML='<p style="text-align:center;color:#9ca3af;padding:20px;">'+(err.accessDenied?'此部落对战日志未公开':'加载失败，请重试')+'</p>';return}var en=(data&&data.items)?data.items:[];en.sort(function(a,b){return a.endTime<b.endTime?1:-1});var lt=en.length>0?en[0].endTime:'';sc(t,en,lt,nw);renderLog(en)})}

function hideLog(){hideLayer('clan-log-view')}

function rl(){if(!N)return;var t=N,ct=document.getElementById('log-card-container'),cc=lc(t),nw=Date.now();fl(t,5,function(err,data){if(err)return;var ne=(data&&data.items)?data.items:[];if(cc&&cc.entries){var ets={};for(var i=0;i<cc.entries.length;i++)ets[cc.entries[i].endTime]=true;var mg=cc.entries.slice();for(var i=0;i<ne.length;i++){if(!ets[ne[i].endTime])mg.push(ne[i])}mg.sort(function(a,b){return a.endTime<b.endTime?1:-1});var lt=mg.length>0?mg[0].endTime:cc.lastEndTime;sc(t,mg,lt,nw);renderLog(mg)}else{var en=ne;en.sort(function(a,b){return a.endTime<b.endTime?1:-1});var lt=en.length>0?en[0].endTime:'';sc(t,en,lt,nw);renderLog(en)}})}

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

function init(){
  var cc=document.getElementById('clan-cards');
  if(cc)cc.addEventListener('click',function(e){var cd=e.target.closest('[data-war-tag]')||e.target.closest('[data-war-china-id]');if(cd){N=cd.getAttribute('data-war-tag')||cd.getAttribute('data-war-china-id');if(N&&N.startsWith('#'))N=N.slice(1)}},true);
  var bk=document.getElementById('log-back-btn');if(bk)bk.addEventListener('click',function(){hideLog()});
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
  var lct=document.getElementById('log-card-container');if(lct)lct.addEventListener('click',function(e){var cd=e.target.closest('[data-end-time]');if(cd){var et=cd.getAttribute('data-end-time');if(et)showWarDetail(et)}});
  var hb=document.getElementById('history-back-btn');if(hb)hb.addEventListener('click',function(){hideLayer('war-history-detail');showLog()});
  var hr=document.getElementById('history-refresh-btn');if(hr)hr.addEventListener('click',function(){if(!N)return;var et=document.getElementById('history-content').getAttribute('data-current-et');if(et){L.removeItem(D+N+'_'+et);showWarDetail(et)}})
}
C.features.warlog={init:init,show:showLog,hide:hideLog}})(window);
