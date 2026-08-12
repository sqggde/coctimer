// ========== 对战视图共享渲染模块 ==========
(function(g){'use strict';var C=g.CocTool;if(!C)return;
function byId(id){return document.getElementById(id)}
var DE={detailLoading:byId('detail-loading'),detailNotWar:byId('detail-notwar-view'),detailPrep:byId('detail-prep-view'),detailEmpty:byId('detail-empty-state'),detailContent:byId('detail-content'),
prepHomeBadge:byId('prep-home-badge'),prepHomeName:byId('prep-home-name'),prepAwayBadge:byId('prep-away-badge'),prepAwayName:byId('prep-away-name'),prepCountdown:byId('prep-countdown'),
prepHomeMembers:byId('prep-home-members'),prepAwayMembers:byId('prep-away-members'),
shs:byId('stat-home-stars'),sas:byId('stat-away-stars'),bhs:byId('stat-bar-home-stars'),bas:byId('stat-bar-away-stars'),
shd:byId('stat-home-destruction'),sad:byId('stat-away-destruction'),bhd:byId('stat-bar-home-destruction'),bad:byId('stat-bar-away-destruction'),
sha:byId('stat-home-attacks'),saa:byId('stat-away-attacks'),bha:byId('stat-bar-home-attacks'),baa:byId('stat-bar-away-attacks'),
prepTeamSize:byId('prep-team-size'),prepStateLabel:byId('prep-state-label'),prepCountdownBox:byId('prep-countdown-box')};
var _memberFilter='all',_lr={};

function parseCocTime(str){if(!str)return Date.now();return new Date(str.slice(0,4)+'-'+str.slice(4,6)+'-'+str.slice(6,8)+'T'+str.slice(9,11)+':'+str.slice(11,13)+':'+str.slice(13,15)+'.'+str.slice(16,19)+'Z').getTime()}
function hideAllDetailViews(){if(DE.detailLoading)DE.detailLoading.classList.add('hidden');if(DE.detailNotWar)DE.detailNotWar.classList.add('hidden');if(DE.detailPrep)DE.detailPrep.classList.add('hidden');if(DE.detailEmpty)DE.detailEmpty.classList.add('hidden');if(DE.detailContent)DE.detailContent.classList.add('hidden')}
function setStat(te,be,v,mx,ih,sf,sm){if(!te)return;sf=sf||'';if(sm===undefined)sm=true;var p=mx>0?Math.min(100,(v/mx)*100):0;te.textContent=sm?sf!==''?Number(v).toFixed(2)+sf+'/'+mx+sf:v+sf+'/'+mx+sf:Number(v).toFixed(2)+sf;if(be)be.style.width=Math.max(p,0.1)+'%'}
function renderWarStats(data){var ts=data.teamSize||1,apm=data.attacksPerMember||2,cl=data.clan||{},op=data.opponent||{};setStat(DE.shs,DE.bhs,cl.stars||0,ts*3,true);setStat(DE.sas,DE.bas,op.stars||0,ts*3,false);setStat(DE.shd,DE.bhd,(cl.destructionPercentage||0),100,true,'%',false);setStat(DE.sad,DE.bad,(op.destructionPercentage||0),100,false,'%',false);setStat(DE.sha,DE.bha,cl.attacks||0,ts*apm,true);setStat(DE.saa,DE.baa,op.attacks||0,ts*apm,false)}
function buildDefenderStarMap(members){var o={};for(var i=0;i<members.length;i++){var atks=members[i].attacks||[];for(var j=0;j<atks.length;j++){var a=atks[j],d=a.defenderTag;if(!d)continue;if(!o[d])o[d]=[];o[d].push({order:a.order||0,stars:a.stars||0,takenMask:0})}}for(var d in o){o[d].sort(function(a,b){return a.order-b.order});var m=0;for(var i=0;i<o[d].length;i++){var e=o[d][i];e.takenMask=m;for(var s=0;s<e.stars;s++)m|=(1<<s)}}return o}
function getTrackedTags(){try{var raw=localStorage.getItem('clash_upgrade_assistant_v3_fixed');if(!raw)return{};var d=JSON.parse(raw);var tags={},accts=d.accounts||{};for(var t in accts)if(accts[t].tag)tags[accts[t].tag]=true;return tags}catch(e){return{}}}

function renderMemberList(ct,members,reverse,apm,oppMems,defStarMap){if(!ct)return;ct.innerHTML='';var raw=members;if(_memberFilter!=='all'){var f=[];for(var fi=0;fi<members.length;fi++){var m=members[fi],mt=false;switch(_memberFilter){case'noattack':mt=!m.attacks||m.attacks.length<apm;break;case'attackable':mt=!m.bestOpponentAttack||m.bestOpponentAttack.stars<3;break;case'1star':if(m.attacks){for(var ai=0;ai<m.attacks.length;ai++){if(m.attacks[ai].stars===1){mt=true;break}}}break;case'2star':if(m.attacks){for(var ai=0;ai<m.attacks.length;ai++){if(m.attacks[ai].stars===2){mt=true;break}}}break;case'3star':if(m.attacks){for(var ai=0;ai<m.attacks.length;ai++){if(m.attacks[ai].stars===3){mt=true;break}}}break;case'black3':if(m.attacks){for(var ai=0;ai<m.attacks.length;ai++){if(m.attacks[ai].stars===0){mt=true;break}}}break}if(mt)f.push(m)}members=f}if(reverse){_lr.a={ct:ct,m:raw,r:reverse,a:apm,o:oppMems,dm:defStarMap}}else{_lr.h={ct:ct,m:raw,r:reverse,a:apm,o:oppMems,dm:defStarMap}}var sorted=members.slice().sort(function(a,b){return(a.mapPosition||0)-(b.mapPosition||0)});var tracked=getTrackedTags();
for(var i=0;i<sorted.length;i++){var m=sorted[i];var w=document.createElement('div');w.style.cssText='padding:4px 2px;height:76px;box-sizing:border-box;overflow:hidden;';
if(tracked.hasOwnProperty(m.tag)){var isDark=document.documentElement.classList.contains('dark');w.style.background=isDark?'rgba(96,165,250,0.12)':'rgba(59,130,246,0.08)';w.style.borderRadius='6px'}
var r1=document.createElement('div');r1.style.cssText='display:flex;align-items:center;gap:5px;';if(reverse)r1.style.justifyContent='flex-end';
var num=document.createElement('span');num.textContent=(m.mapPosition||'?')+'.';num.style.cssText='font-size:14px;color:#3b82f6;flex-shrink:0;font-weight:700;';
var name=document.createElement('span');name.textContent=m.name||'';name.className='prep-member-name';name.style.cssText='font-size:14px;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;';
if(reverse){var ns=document.createElement('span');ns.textContent=m.name||'';ns.className='prep-member-name';ns.style.cssText='font-size:14px;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;text-align:right;';var n2=document.createElement('span');n2.textContent='.'+(m.mapPosition||'?');n2.style.cssText='font-size:14px;color:#6366f1;flex-shrink:0;font-weight:700;';r1.appendChild(ns);r1.appendChild(n2)}else{r1.appendChild(num);r1.appendChild(name)}
var r2=document.createElement('div');r2.style.cssText='display:flex;align-items:center;gap:6px;';if(reverse)r2.style.justifyContent='flex-end';
var icon=document.createElement('img');var th=m.townhallLevel||1;icon.src='img/icons/buildings/1000001_'+th+'.webp';icon.style.cssText='width:34px;height:34px;object-fit:contain;flex-shrink:0;';icon.onerror=function(){this.style.visibility='hidden'};
var sc=document.createElement('div');sc.style.cssText='display:flex;flex-direction:column;gap:2px;';var mAtks=m.attacks||[];var isDarkNow=document.documentElement.classList.contains('dark');
for(var a=0;a<apm;a++){var atk=mAtks[a];var ar=document.createElement('div');ar.style.cssText='display:flex;align-items:center;gap:2px;min-height:15px;';if(reverse)ar.style.justifyContent='flex-end';
if(atk){var dPos='?';if(oppMems){for(var d=0;d<oppMems.length;d++){if(oppMems[d].tag===atk.defenderTag){dPos=oppMems[d].mapPosition;break}}}
var ps=document.createElement('span');ps.textContent=reverse?'.'+dPos:dPos+'.';ps.style.cssText='font-size:12px;color:'+(reverse?'#3b82f6':'#6366f1')+';flex-shrink:0;';
var stars=atk.stars||0,defTag=atk.defenderTag,order=atk.order||0,tm=0,dd=defStarMap&&defStarMap[defTag];
if(dd){for(var mi=0;mi<dd.length;mi++){if(dd[mi].order===order){tm=dd[mi].takenMask;break}}}
var si=[];for(var s=0;s<3;s++){var st=document.createElement('img');st.src='img/icons/star.webp';st.style.cssText='width:13px;height:13px;flex-shrink:0;';if(s<stars){if(tm&(1<<s)){if(isDarkNow){st.style.filter='brightness(0) saturate(100%) invert(74%) sepia(20%) saturate(653%) hue-rotate(186deg) brightness(96%) contrast(92%)';st.style.opacity='0.7'}else{st.style.filter='brightness(0)';st.style.opacity='0.25'}}}else{if(isDarkNow){st.style.filter='brightness(0) saturate(100%) invert(34%) sepia(62%) saturate(548%) hue-rotate(203deg) brightness(96%) contrast(95%)';st.style.opacity='0.85'}else{st.style.filter='brightness(0)';st.style.opacity='0.45'}}si.push(st)}
var pv=atk.destructionPercentage||0;var pct=document.createElement('span');pct.textContent=(Math.round(pv*100)/100)+'%';var pc=pv>=100?'#10b981':(isDarkNow?'#e5e7eb':'#374151');pct.style.cssText='font-size:12px;color:'+pc+';flex-shrink:0;';
if(reverse){ar.appendChild(pct);ar.appendChild(ps);for(var s=2;s>=0;s--)ar.appendChild(si[s])}else{ar.appendChild(ps);for(var s=0;s<3;s++)ar.appendChild(si[s]);ar.appendChild(pct)}}else{var st2=document.createElement('span');st2.textContent='未进攻';st2.style.cssText='font-size:12px;color:#9ca3af;line-height:13px;display:inline-block;';if(reverse)st2.style.textAlign='right';ar.appendChild(st2)}sc.appendChild(ar)}
if(reverse){r2.appendChild(sc);r2.appendChild(icon)}else{r2.appendChild(icon);r2.appendChild(sc)}
w.appendChild(r1);
var ba=m.bestOpponentAttack;var br=document.createElement('div');br.style.cssText='display:flex;align-items:center;gap:4px;font-size:12px;padding:1px 0;min-height:15px;';if(reverse)br.style.justifyContent='flex-end';
if(ba&&ba.stars>0){var bp='?';if(oppMems){for(var oi=0;oi<oppMems.length;oi++){if(oppMems[oi].tag===ba.attackerTag){bp=oppMems[oi].mapPosition;break}}}
var bps=document.createElement('span');bps.textContent=reverse?'.'+bp:bp+'.';bps.style.cssText='font-size:12px;color:'+(reverse?'#3b82f6':'#6366f1')+';flex-shrink:0;';
var bsi=[];for(var s=0;s<3;s++){var bst=document.createElement('img');bst.src='img/icons/star3.webp';bst.style.cssText='width:13px;height:13px;flex-shrink:0;';if(s>=ba.stars){if(isDarkNow){bst.style.filter='brightness(0) saturate(100%) invert(34%) sepia(62%) saturate(548%) hue-rotate(203deg) brightness(96%) contrast(95%)';bst.style.opacity='0.85'}else{bst.style.filter='brightness(0)';bst.style.opacity='0.45'}}bsi.push(bst)}
var bpv=ba.destructionPercentage||0;var bpct=document.createElement('span');bpct.textContent=(Math.round(bpv*100)/100)+'%';bpct.style.cssText='font-size:12px;color:#6b7280;flex-shrink:0;';
if(reverse){br.appendChild(bpct);br.appendChild(bps);for(var s=2;s>=0;s--)br.appendChild(bsi[s])}else{for(var s=0;s<3;s++)br.appendChild(bsi[s]);br.appendChild(bps);br.appendChild(bpct)}}else{var bt=document.createElement('span');bt.textContent=reverse?'可进攻':'未被进攻';bt.style.cssText='font-size:12px;color:'+(reverse?'#f59e0b':'#9ca3af')+';font-style:italic;line-height:13px;display:inline-block;';br.appendChild(bt)}
w.appendChild(br);w.appendChild(r2);ct.appendChild(w)}}

function smf(v){_memberFilter=v;if(_lr.h)_renderMemberList(_lr.h.ct,_lr.h.m,_lr.h.r,_lr.h.a,_lr.h.o,_lr.h.dm);if(_lr.a)_renderMemberList(_lr.a.ct,_lr.a.m,_lr.a.r,_lr.a.a,_lr.a.o,_lr.a.dm)}
var _fopts=[{v:'all',l:'全部'},{v:'noattack',l:'未进攻'},{v:'attackable',l:'可进攻'},{v:'1star',l:'一星'},{v:'2star',l:'二星'},{v:'3star',l:'三星'},{v:'black3',l:'黑三'}];
function gfl(v){for(var i=0;i<_fopts.length;i++){if(_fopts[i].v===v)return _fopts[i].l}return'全部'}
function createFilterBar(){
    var bar=document.createElement('div');bar.className='member-filter-bar';bar.style.cssText='display:flex;align-items:center;justify-content:center;padding:8px 0;position:relative;';
    var btn=document.createElement('button');
    btn.style.cssText='display:flex;align-items:center;gap:4px;font-size:13px;padding:4px 12px;background:#f3f4f6;border:none;border-radius:6px;color:#374151;cursor:pointer;';
    var lbl=document.createElement('span');lbl.className='filter-label';lbl.textContent=gfl(_memberFilter);
    var ico=document.createElement('i');ico.className='fa fa-chevron-down';ico.style.fontSize='10px';
    btn.appendChild(lbl);btn.appendChild(ico);
    var dd=document.createElement('div');dd.style.cssText='position:absolute;top:100%;left:50%;transform:translateX(-50%);background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);z-index:10;min-width:110px;overflow:hidden;';
    dd.className='filter-dropdown hidden';
    for(var i=0;i<_fopts.length;i++){(function(opt){
        var ob=document.createElement('button');ob.textContent=opt.l;ob.setAttribute('data-value',opt.v);
        ob.style.cssText='display:block;width:100%;padding:8px 16px;border:none;background:transparent;font-size:13px;color:#374151;cursor:pointer;text-align:center;';
        if(opt.v===_memberFilter){ob.className='active';ob.style.background='#eff6ff';ob.style.color='#3b82f6';ob.style.fontWeight='600'}
        ob.addEventListener('click',function(e){
            e.stopPropagation();smf(opt.v);lbl.textContent=opt.l;dd.classList.add('hidden');
            var bs=dd.querySelectorAll('button');
            for(var bi=0;bi<bs.length;bi++){bs[bi].className='';bs[bi].style.background='transparent';bs[bi].style.color='#374151';bs[bi].style.fontWeight='400'}
            ob.className='active';ob.style.background='#eff6ff';ob.style.color='#3b82f6';ob.style.fontWeight='600';
        });
        dd.appendChild(ob);
    })(_fopts[i])}
    btn.addEventListener('click',function(e){e.stopPropagation();dd.classList.toggle('hidden')});
    bar.appendChild(btn);bar.appendChild(dd);
    return bar;
}
function _renderMemberList(){return renderMemberList.apply(this,arguments)}
function renderDetailTo(ct,data){
  if(!ct)return;ct.innerHTML='';var cl=data.clan||{},op=data.opponent||{},rs=data.result||'';if(!rs){var cs=(cl.stars||0),os=(op.stars||0);if(cs>os)rs='win';else if(cs<os)rs='lose';else{var cd=(cl.destructionPercentage||0),od=(op.destructionPercentage||0);if(cd>od)rs='win';else if(cd<od)rs='lose';else rs='draw'}}var inf=function(r){if(r==='win')return{text:'胜利',color:'#10b981'};if(r==='lose')return{text:'失败',color:'#f59e0b'};return{text:'平局',color:'#3b82f6'}}(rs);
  var wrap=document.createElement('div');wrap.style.cssText='display:flex;flex-direction:column;align-items:center;padding:20px 5px;';
  // Badge row
  var br=document.createElement('div');br.style.cssText='display:flex;align-items:center;gap:20px;margin-bottom:8px;';
  var hDiv=document.createElement('div');hDiv.style.cssText='text-align:center;flex:1;min-width:0;';
  var hImg=document.createElement('img');hImg.src=(cl.badgeUrls&&cl.badgeUrls.large)||'';hImg.style.cssText='width:64px;height:64px;border-radius:12px;margin-bottom:6px;';hImg.onerror=function(){this.style.display='none'};
  var hNm=document.createElement('p');hNm.textContent=cl.name||'';hNm.style.cssText='font-size:14px;font-weight:600;color:#1f2937;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';hDiv.appendChild(hImg);hDiv.appendChild(hNm);
  var stDiv=document.createElement('div');stDiv.style.cssText='text-align:center;flex:1;min-width:0;';
  var et=data.endTime||'';var stY=document.createElement('p');stY.textContent=et.slice(0,4);stY.style.cssText='font-size:14px;font-weight:700;color:#000;margin-bottom:0;line-height:1.2;';
  var stD=document.createElement('p');stD.textContent=parseInt(et.slice(4,6),10)+'/'+parseInt(et.slice(6,8),10);stD.style.cssText='font-size:14px;font-weight:600;color:#000;margin-bottom:4px;';
  var rb=document.createElement('span');rb.textContent=inf.text;rb.style.cssText='font-size:12px;font-weight:700;color:#fff;background:'+inf.color+';padding:2px 12px;border-radius:10px;line-height:1.2;';
  var ts=document.createElement('p');ts.textContent=(data.teamSize||0)+' vs '+(data.teamSize||0);ts.style.cssText='font-size:14px;font-weight:600;color:#1f2937;margin-top:4px;';stDiv.appendChild(stY);stDiv.appendChild(stD);stDiv.appendChild(rb);stDiv.appendChild(ts);
  var aDiv=document.createElement('div');aDiv.style.cssText='text-align:center;flex:1;min-width:0;';
  var aImg=document.createElement('img');aImg.src=(op.badgeUrls&&op.badgeUrls.large)||'';aImg.style.cssText='width:64px;height:64px;border-radius:12px;margin-bottom:6px;';aImg.onerror=function(){this.style.display='none'};
  var aNm=document.createElement('p');aNm.textContent=op.name||'';aNm.style.cssText='font-size:14px;font-weight:600;color:#1f2937;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';aDiv.appendChild(aImg);aDiv.appendChild(aNm);
  br.appendChild(hDiv);br.appendChild(stDiv);br.appendChild(aDiv);wrap.appendChild(br);
  // Stats (三行：星数 | 摧毁率 | 出刀数)
  var sm=(data.teamSize||1)*3,am=(data.teamSize||1)*(data.attacksPerMember||2);
  var gw=function(p){return(Math.round((p||0)*100)/100)+'%'};
  function mkStatRow(hv,hp,av,ap,icon,color){
    var r=document.createElement('div');r.style.cssText='display:flex;align-items:center;gap:4px;margin-top:4px;width:100%;max-width:400px;';
    var hc=document.createElement('span');hc.textContent=hv;hc.style.cssText='font-size:13px;color:#374151;width:52px;text-align:right;flex-shrink:0;';
    var hb=document.createElement('div');hb.style.cssText='flex:1;height:8px;background:#e5e7eb;border-radius:4px 0 0 4px;overflow:hidden;';
    var hbf=document.createElement('div');hbf.style.cssText='height:100%;border-radius:4px 0 0 4px;float:right;background:'+color+';';hbf.style.width=Math.min(100,Math.max(0,(hp||0))*100)+'%';hb.appendChild(hbf);
    var ic=document.createElement('img');ic.src=icon;ic.style.cssText='width:13px;height:13px;flex-shrink:0;';
    var ab=document.createElement('div');ab.style.cssText='flex:1;height:8px;background:#e5e7eb;border-radius:0 4px 4px 0;overflow:hidden;';
    var abf=document.createElement('div');abf.style.cssText='height:100%;border-radius:0 4px 4px 0;background:'+color+';';abf.style.width=Math.min(100,Math.max(0,(ap||0))*100)+'%';ab.appendChild(abf);
    var ac=document.createElement('span');ac.textContent=av;ac.style.cssText='font-size:13px;color:#374151;width:52px;text-align:left;flex-shrink:0;';
    r.appendChild(hc);r.appendChild(hb);r.appendChild(ic);r.appendChild(ab);r.appendChild(ac);return r
  }
  wrap.appendChild(mkStatRow((cl.stars||0)+'/'+sm,(cl.stars||0)/sm,(op.stars||0)+'/'+sm,(op.stars||0)/sm,'img/icons/star.webp','#f59e0b'));
  wrap.appendChild(mkStatRow(gw(cl.destructionPercentage||0),(cl.destructionPercentage||0)/100,gw(op.destructionPercentage||0),(op.destructionPercentage||0)/100,'img/icons/cuihuilv.webp','#3b82f6'));
  wrap.appendChild(mkStatRow((cl.attacks||0)+'/'+am,(cl.attacks||0)/am,(op.attacks||0)+'/'+am,(op.attacks||0)/am,'img/icons/cishu.webp','#10b981'));
  wrap.appendChild(createFilterBar());
  // Member rows
  var hw=document.createElement('div');hw.style.cssText='display:flex;gap:12px;margin-top:16px;width:100%;';
  var hCol=document.createElement('div');hCol.style.cssText='flex:1;min-width:0;';
  var hMem=document.createElement('div');hMem.style.cssText='display:flex;flex-direction:column;gap:2px;';hCol.appendChild(hMem);
  var sep=document.createElement('div');sep.style.cssText='width:1px;background:#e5e7eb;flex-shrink:0;';
  var aCol=document.createElement('div');aCol.style.cssText='flex:1;min-width:0;';
  var aMem=document.createElement('div');aMem.style.cssText='display:flex;flex-direction:column;gap:2px;';aCol.appendChild(aMem);
  hw.appendChild(hCol);hw.appendChild(sep);hw.appendChild(aCol);wrap.appendChild(hw);
  ct.appendChild(wrap);
  renderMemberList(hMem,data.clan.members||[],!1,data.attacksPerMember||2,data.opponent.members||[],buildDefenderStarMap(data.clan.members||[]));
  renderMemberList(aMem,data.opponent.members||[],!0,data.attacksPerMember||2,data.clan.members||[],buildDefenderStarMap(data.opponent.members||[]));
}

C.warView={parseCocTime:parseCocTime,hideAllDetailViews:hideAllDetailViews,setStat:setStat,renderWarStats:renderWarStats,buildDefenderStarMap:buildDefenderStarMap,renderMemberList:renderMemberList,getTrackedTags:getTrackedTags,DE:DE,renderDetailTo:renderDetailTo,createFilterBar:createFilterBar,_memberFilter:_memberFilter,_fopts:_fopts,setFilter:smf}})(window);
