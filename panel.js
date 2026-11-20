// Meet captions and matching translated rows share stable entry IDs.
const $=id=>document.getElementById(id);
const TRANSLATE_INTERVAL_MS=1000, MAX=150, MAX_QUEUE_AGE_MS=12000, MAX_PENDING_JOBS=6;
let meetTab=null,entries=[],sessionEntries=[],nextId=0,generation=0;
const pending=new Map();
let syncLock=false, syncRelease=0, manualBrowsing=false, followFrame=0;
let hoveredEntryId=null;
// Update just the matching row classes, without redrawing or touching scrolling.
function setHoveredEntry(id){
  if(hoveredEntryId===id)return;
  hoveredEntryId=id;
  for(const pane of panes()){
    for(const row of pane.querySelectorAll('.entry')){
      row.classList.toggle('paired-hover',id!==null && row.dataset.entryId===String(id));
    }
  }
}
for(const paneId of ['original','translated']){
  const pane=$(paneId);
  pane.addEventListener('pointerover',event=>{
    const row=event.target.closest?.('.entry');
    if(row&&pane.contains(row))setHoveredEntry(row.dataset.entryId);
  });
  pane.addEventListener('pointermove',event=>{
    const row=event.target.closest?.('.entry');
    setHoveredEntry(row&&pane.contains(row)?row.dataset.entryId:null);
  },{passive:true});
  pane.addEventListener('pointerleave',()=>setHoveredEntry(null));
}
const panes=()=>[$('original'),$('translated')];
function bottom(el){return el.scrollHeight-el.clientHeight-el.scrollTop<=28;}
function scrollToLatest(){
  if(!$('follow').checked||manualBrowsing)return;
  syncLock=true;
  for(const el of panes())el.scrollTop=Math.max(0,el.scrollHeight-el.clientHeight);
  clearTimeout(syncRelease);
  syncRelease=setTimeout(()=>{syncLock=false;},0);
}
function followLatest(){
  if(!$('follow').checked||manualBrowsing)return;
  scrollToLatest();
  cancelAnimationFrame(followFrame);
  // Layout/font changes after a redraw can increase either pane's scroll height.
  followFrame=requestAnimationFrame(()=>{
    scrollToLatest();
    followFrame=requestAnimationFrame(scrollToLatest);
  });
}
function markManualBrowsing(){
  if($('follow').checked)manualBrowsing=true;
}
for(const el of panes()){
  el.addEventListener('wheel',markManualBrowsing,{passive:true});
  el.addEventListener('touchstart',markManualBrowsing,{passive:true});
  el.addEventListener('pointerdown',event=>{
    // A scrollbar drag is deliberate browsing; row clicks keep their own behavior.
    if(event.target===el)markManualBrowsing();
  });
  el.addEventListener('keydown',event=>{
    if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))
      markManualBrowsing();
  });
}
function matchingRow(root,id){return [...root.querySelectorAll('.entry')].find(n=>n.dataset.entryId===String(id));}
function syncScroll(source,target){
  const sourceRows=[...source.querySelectorAll('.entry')];
  if(!sourceRows.length)return;
  const viewTop=source.scrollTop;
  let anchor=sourceRows[0];
  for(const row of sourceRows){if(row.offsetTop-source.offsetTop<=viewTop+1)anchor=row;else break;}
  const offsetInRow=Math.max(0,viewTop-(anchor.offsetTop-source.offsetTop));
  const fraction=Math.min(1,offsetInRow/Math.max(1,anchor.offsetHeight));
  const counterpart=matchingRow(target,anchor.dataset.entryId);
  if(counterpart){
    const y=counterpart.offsetTop-target.offsetTop+fraction*counterpart.offsetHeight;
    target.scrollTop=Math.max(0,Math.min(target.scrollHeight-target.clientHeight,y));
  }
}
function onPaneScroll(source,target){
  if(syncLock)return;
  // Do not mistake layout changes or our own follow-to-bottom for user scrolling.
  if($('follow').checked&&!manualBrowsing)return;
  if(manualBrowsing&&bottom(source)&&bottom(target))manualBrowsing=false;
  syncLock=true;
  syncScroll(source,target);
  clearTimeout(syncRelease);syncRelease=setTimeout(()=>{syncLock=false;},0);
}
function flashCounterpart(e,from){
  const target=$(from==='original'?'translated':'original');
  const row=matchingRow(target,e.id);
  if(!row)return;
  manualBrowsing=true;
  syncLock=true;
  row.scrollIntoView({behavior:'auto',block:'center'});
  // scrollIntoView can move an ancestor other than the target; restore only the target's scroll.
  clearTimeout(syncRelease);syncRelease=setTimeout(()=>{syncLock=false;},0);
  row.classList.remove('counterpart-flash');void row.offsetWidth;
  row.classList.add('counterpart-flash');
}
for(const [from,to] of [['original','translated'],['translated','original']]){
  $(from).addEventListener('scroll',()=>onPaneScroll($(from),$(to)),{passive:true});
}
function draw(){
  const oldPositions=panes().map(el=>el.scrollTop);
  const shouldFollow=$('follow').checked&&!manualBrowsing;
  syncLock=true;
  for(const [container,field] of [['original','text'],['translated','translated']]){
    const root=$(container);root.replaceChildren();
    if(!entries.length){
      const p=document.createElement('p');p.className='empty';
      p.textContent=field==='text'?'请在 Google Meet 打开 CC 字幕':'等待字幕与翻译…';root.append(p);continue;
    }
    for(const e of entries){
      const p=document.createElement('div');
      p.dataset.entryId=String(e.id);
      p.className='entry'+(field==='translated'?' translation':'')+
        (!e.translated&&field==='translated'?' pending':'')+(e.error&&field==='translated'?' error':'')+
        (field==='translated'&&e.translated&&(e.translatedKey!==translationKey(e)||e.forceRetranslate||activeEntries.has(e))?' updating':'');
      if(hoveredEntryId===String(e.id))p.classList.add('paired-hover');
      p.tabIndex=0;
      p.setAttribute('role','button');
      p.setAttribute('aria-label',(e.speaker||'未知发言人')+'，点击定位对应'+(field==='text'?'译文':'原文'));
      const meta=document.createElement('div');meta.className='entry-meta';
      const who=document.createElement('span');who.className='speaker';
      who.textContent=e.speaker||'未知发言人';
      const time=document.createElement('time');time.textContent=new Date(e.at).toLocaleTimeString();
      meta.append(who,time);
      if(container==='original'){
        const retry=document.createElement('button');
        retry.type='button';retry.className='retry-translation';
        retry.textContent='翻译';retry.title='重新翻译此条字幕';
        retry.setAttribute('aria-label','重新翻译此条字幕');
        retry.addEventListener('click',event=>{
          event.stopPropagation();
          retryTranslation(e);
        });
        meta.append(retry);
      }
      if(field==='translated'&&e.translated&&(e.translatedKey!==translationKey(e)||e.forceRetranslate||activeEntries.has(e))){
        const state=document.createElement('span');state.className='update-state';
        state.textContent=e.error?'更新失败':(e.skipped?'已跳过更新':'更新中…');
        meta.append(state);
      }
      const txt=document.createElement('div');txt.className='entry-body';
      txt.textContent=field==='text'?e.text:(e.translated||'翻译中…');
      p.append(meta,txt);
      p.addEventListener('click',()=>flashCounterpart(e,container));
      p.addEventListener('keydown',evt=>{
        if(evt.key==='Enter'||evt.key===' '){evt.preventDefault();flashCounterpart(e,container);}
      });
      root.append(p);
    }
  }
  if(shouldFollow)followLatest();
  else panes().forEach((root,i)=>{root.scrollTop=oldPositions[i];});
  clearTimeout(syncRelease);syncRelease=setTimeout(()=>{syncLock=false;},0);
}
function cancelPending(){
  clearTimeout(queueTimer);queueTimer=null;batchGraceUntil=0;
  for(const e of entries){e.pendingKey=null;e.readyAt=0;e.forceRetranslate=false;}
}
function reset(){
  generation++;cancelPending();cancelAnimationFrame(followFrame);
  entries=[];sessionEntries=[];manualBrowsing=false;hoveredEntryId=null;updateSaveButton();draw();
}
function updateStatus(s){$('status').textContent=s;}
function updateSaveButton(){
  $('save-txt').disabled=sessionEntries.length===0;
}
function formatExportTime(ms){
  const d=new Date(ms);
  return Number.isNaN(d.getTime())?'时间未知':d.toLocaleString('zh-CN',{hour12:false});
}
function fileTimestamp(d){
  const pad=n=>String(n).padStart(2,'0');
  return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'_'
    +pad(d.getHours())+pad(d.getMinutes())+pad(d.getSeconds());
}
function buildTranscriptText(){
  const lines=[
    'Google Meet 双语会议字幕记录',
    '会议：'+$('meeting').textContent,
    '保存时间：'+formatExportTime(Date.now()),
    '原文语言：'+$('source').selectedOptions[0].textContent,
    '目标语言：'+$('target').selectedOptions[0].textContent,
    '记录条数：'+sessionEntries.length,
    '说明：按字幕首次出现的顺序输出；字幕内容为最后一次修订结果。',
    '==================================================',
    ''
  ];
  for(const [index,e] of sessionEntries.entries()){
    const translation=e.translatedKey===translationKey(e) && !e.error
      ? e.translated
      : (e.error?'[翻译失败或尚未更新]':e.translated?'[译文待更新] '+e.translated:'[未翻译]');
    lines.push('['+(index+1)+'] '+formatExportTime(e.at)+'  '+(e.speaker||'未知发言人'));
    lines.push('原文：'+e.text);
    lines.push('译文：'+translation);
    lines.push('');
  }
  return lines.join('\r\n');
}
function saveTranscript(){
  if(!sessionEntries.length)return;
  const content='\uFEFF'+buildTranscriptText();
  const blob=new Blob([content],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download='Meet_双语字幕_'+fileTimestamp(new Date())+'.txt';
  document.body.append(link);
  try{link.click();}
  finally{
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
}
async function locate(){
  const tabs=await chrome.tabs.query({url:'https://meet.google.com/*'});
  const tab=tabs.find(t=>t.active)||tabs[0];
  if(tab){
    if(meetTab!==tab.id){meetTab=tab.id;reset();}
    $('meeting').textContent=tab.title||'Google Meet';
    updateStatus('连接 Meet 中');
    try{
      const result=await chrome.runtime.sendMessage({type:'ENSURE_CONTENT',tabId:tab.id});
      if(tab.id!==meetTab)return;
      updateStatus(result?.ok?'捕获器已连接':'注入失败');
      if(!result?.ok)$('bridge').textContent='Meet 注入失败：'+(result?.error||'未知原因');
    }catch(err){updateStatus('连接失败');$('bridge').textContent=String(err.message||err);}
  }else{
    if(meetTab!==null){meetTab=null;reset();}
    updateStatus('等待会议');$('meeting').textContent='未找到 Meet 标签页';
  }
}
// BytePlus: up to three in-flight requests and three starts per rolling second. Qwen: one.
// A caption version is (text revision + language pair); only that version is translated.
let translationBusy=0, maxTranslationConcurrency=1, queueTimer=null, updateOrder=0, batchGraceUntil=0;
const activeEntries=new Set(), requestStarts=[];
function translationKey(e){
  return JSON.stringify([e.text,$('source').value,$('target').value]);
}
function retryTranslation(e){
  if(!entries.includes(e))return;
  // A retry of unchanged text must bypass the normal translatedKey deduplication.
  // Bump the version so an earlier in-flight response cannot overwrite the retry.
  e.version++;e.error=false;e.skipped=false;
  e.forceRetranslate=true;e.readyAt=Date.now();
  e.pendingKey=translationKey(e);
  e.order=++updateOrder;e.queuedAt=Date.now();
  draw();pumpTranslations();
}
function scheduleTranslation(e){
  e.pendingKey=translationKey(e);
  // Hold a 1-second stabilization window for successive revisions of this caption.
  if(!e.readyAt)e.readyAt=Date.now()+TRANSLATE_INTERVAL_MS;
  e.order=++updateOrder;
  e.queuedAt=Date.now();
  pumpTranslations();
}
function pumpTranslations(){
  if(translationBusy>=maxTranslationConcurrency)return;
  clearTimeout(queueTimer);queueTimer=null;
  const tick=Date.now();
  while(requestStarts.length&&tick-requestStarts[0]>=1000)requestStarts.shift();
  if(maxTranslationConcurrency===3&&requestStarts.length>=3){
    queueTimer=setTimeout(pumpTranslations,Math.max(1,1000-(tick-requestStarts[0])));return;
  }
  const all=entries.filter(e=>e.pendingKey&&(e.forceRetranslate||e.pendingKey!==e.translatedKey)&&!activeEntries.has(e));
  // Real-time mode: never work through a growing backlog of outdated captions.
  all.sort((a,b)=>b.order-a.order);
  const now=Date.now();
  const queue=[];
  for(const e of all){
    if(queue.length>=MAX_PENDING_JOBS || now-(e.queuedAt||now)>MAX_QUEUE_AGE_MS){
      // Preserve the previous translation; do not replace readable text with a skip marker.
      e.skipped=true;
      e.pendingKey=null;e.readyAt=0;e.forceRetranslate=false;
    }else queue.push(e);
  }
  if(!queue.length)return;
  const ready=queue.filter(e=>(e.readyAt||0)<=now);
  if(!ready.length){
    batchGraceUntil=0;
    const nearest=Math.min(...queue.map(e=>e.readyAt));
    queueTimer=setTimeout(pumpTranslations,Math.max(1,nearest-now));
    return;
  }
  // A small coalescing window groups captions whose 1s deadlines nearly coincide.
  // Without it, the oldest entry can start milliseconds before newer entries are ready.
  if(!batchGraceUntil)batchGraceUntil=now+90;
  if(now<batchGraceUntil){
    queueTimer=setTimeout(pumpTranslations,Math.max(1,batchGraceUntil-now));return;
  }
  batchGraceUntil=0;
  ready.sort((a,b)=>b.order-a.order);
  const e=ready[0],key=e.pendingKey,g=generation,version=e.version;
  const source=$('source').value,target=$('target').value,text=e.text;
  e.pendingKey=null;e.readyAt=0;e.forceRetranslate=false;
  if(source===target){
    if(entries.includes(e)&&g===generation&&translationKey(e)===key){
      e.translated=text;e.translatedKey=key;e.error=false;draw();
    }
    pumpTranslations();return;
  }
  translationBusy++;
  activeEntries.add(e);
  if(maxTranslationConcurrency===3)requestStarts.push(Date.now());
  // Fill other free slots without waiting for the first request to complete.
  if(translationBusy<maxTranslationConcurrency)queueMicrotask(pumpTranslations);
  (async()=>{
    try{
      const res=await fetch('http://127.0.0.1:18765/translate',{
        method:'POST',headers:{'Content-Type':'application/json','X-Meet-Translate':'chrome-extension'},
        body:JSON.stringify({text,source_lang:source,target_lang:target}),
        signal:AbortSignal.timeout(25000)
      });
      const j=await res.json();if(!res.ok)throw Error(j.error||'HTTP '+res.status);
      if(g===generation&&entries.includes(e)&&e.version===version&&translationKey(e)===key){
        e.translated=j.translation;e.translatedKey=key;e.error=false;e.skipped=false;
        $('bridge').textContent=maxTranslationConcurrency===3?'● 本机 BytePlus 已连接':'● 本机 Qwen MT 已连接';draw();
      }
    }catch(err){
      if(g===generation&&entries.includes(e)&&e.version===version&&translationKey(e)===key){
        // Keep the last successful translation visible if a revision fails.
        if(!e.translated)e.translated='翻译失败：'+err.message;
        e.error=true;e.skipped=true;
        $('bridge').textContent='● 本机服务未就绪';draw();
      }
    }finally{
      translationBusy--;
      activeEntries.delete(e);
      // A stale response is discarded, then the most recent waiting caption wins.
      pumpTranslations();
    }
  })();
}
function accept(m){
  if(m.tabId!==meetTab||typeof m.text!=='string'||!m.text.trim())return;
  let e=entries.find(x=>x.key===m.id);
  const speaker=typeof m.speaker==='string'?m.speaker.trim():'';
  if(e&&e.text===m.text&&(!speaker||e.speaker===speaker))return;
  if(e){
    if(e.text!==m.text){
      e.text=m.text;e.error=false;e.skipped=false;e.version++;
      // The old translated text stays visible until a valid newer response arrives.
      if(e.translatedKey!==translationKey(e))scheduleTranslation(e);
      else{e.pendingKey=null;e.readyAt=0;}
    }
    e.speaker=speaker||e.speaker;e.at=m.at||Date.now();
  }else{
    e={id:++nextId,key:m.id,text:m.text,speaker,translated:'',version:1,at:m.at||Date.now(),error:false};
    entries.push(e);sessionEntries.push(e);updateSaveButton();scheduleTranslation(e);
    if(entries.length>MAX){entries.shift();}
  }
  draw();
}
chrome.runtime.onMessage.addListener(m=>{
  if(m?.type==='CAPTION_EVENT')accept(m);
  if(m?.type==='CAPTURE_STATUS_EVENT'&&m.tabId===meetTab){
    if(m.lastCaptionAt)updateStatus('正在接收字幕');
    else if(m.containers>0)updateStatus('已发现字幕区域');
    else updateStatus('未发现字幕区域');
  }
});
function changeLanguage(which){
  chrome.storage.local.set({[which]:$(which).value});
  generation++;cancelPending();
  for(const e of entries){
    // The chosen language pair is part of the translation version.
    if(e.translatedKey===translationKey(e))continue;
    e.version++;e.translated='';e.error=false;e.readyAt=0;scheduleTranslation(e);
  }
  draw();
}
$('source').addEventListener('change',()=>changeLanguage('source'));
$('target').addEventListener('change',()=>changeLanguage('target'));
$('follow').addEventListener('change',()=>{
  chrome.storage.local.set({follow:$('follow').checked});
  if($('follow').checked){manualBrowsing=false;followLatest();}
});
$('clear').addEventListener('click',reset);
$('save-txt').addEventListener('click',saveTranscript);
updateSaveButton();
chrome.tabs.onActivated.addListener(locate);
chrome.tabs.onUpdated.addListener((id,info)=>{
  if(id===meetTab&&info.status==='loading')reset();
  if(info.status==='complete')locate();
});
chrome.tabs.onRemoved.addListener(id=>{if(id===meetTab)locate();});
chrome.storage.local.get({source:'auto',target:'Chinese',follow:true}).then(s=>{
  $('source').value=s.source;$('target').value=s.target;$('follow').checked=s.follow;
});
async function health(){
  try{
    const r=await fetch('http://127.0.0.1:18765/health',{signal:AbortSignal.timeout(1800)});
    if(!r.ok)throw Error();
    const info=await r.json();
    maxTranslationConcurrency=info.model==='seed-translation-250915'?3:1;
    $('bridge').textContent=maxTranslationConcurrency===3?'● 本机 BytePlus 已连接 (3 并发)':'● 本机 Qwen MT 已连接';
    pumpTranslations();
  }catch{$('bridge').textContent='○ 请启动 start-bridge.bat';}
}
locate();draw();health();setInterval(health,15000);
