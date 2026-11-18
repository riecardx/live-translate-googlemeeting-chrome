// Meet captions and matching translated rows share stable entry IDs.
const $=id=>document.getElementById(id);
const TRANSLATE_INTERVAL_MS=1000, MAX=150, MAX_QUEUE_AGE_MS=12000, MAX_PENDING_JOBS=6;
let meetTab=null,entries=[],nextId=0,generation=0;
const pending=new Map();
let syncLock=false, syncRelease=0, manualBrowsing=false;
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
function followLatest(){
  if(!$('follow').checked||manualBrowsing)return;
  syncLock=true;
  for(const el of panes())el.scrollTop=el.scrollHeight;
  clearTimeout(syncRelease);syncRelease=setTimeout(()=>{syncLock=false;},0);
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
  manualBrowsing=!bottom(source);
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
        (field==='translated'&&e.translated&&e.translatedKey!==translationKey(e)?' updating':'');
      if(hoveredEntryId===String(e.id))p.classList.add('paired-hover');
      p.tabIndex=0;
      p.setAttribute('role','button');
      p.setAttribute('aria-label',(e.speaker||'未知发言人')+'，点击定位对应'+(field==='text'?'译文':'原文'));
      const meta=document.createElement('div');meta.className='entry-meta';
      const who=document.createElement('span');who.className='speaker';
      who.textContent=e.speaker||'未知发言人';
      const time=document.createElement('time');time.textContent=new Date(e.at).toLocaleTimeString();
      meta.append(who,time);
      if(field==='translated'&&e.translated&&e.translatedKey!==translationKey(e)){
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
  if(shouldFollow){for(const root of panes())root.scrollTop=root.scrollHeight;}
  else panes().forEach((root,i)=>{root.scrollTop=oldPositions[i];});
  clearTimeout(syncRelease);syncRelease=setTimeout(()=>{syncLock=false;},0);
}
function cancelPending(){
  clearTimeout(queueTimer);queueTimer=null;batchGraceUntil=0;
  for(const e of entries){e.pendingKey=null;e.readyAt=0;}
}
function reset(){generation++;cancelPending();entries=[];manualBrowsing=false;hoveredEntryId=null;draw();}
function updateStatus(s){$('status').textContent=s;}
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
// One global worker: at most one HTTP request, newest ready caption first.
// A caption version is (text revision + language pair); only that version is translated.
let translationBusy=false, queueTimer=null, updateOrder=0, batchGraceUntil=0;
function translationKey(e){
  return JSON.stringify([e.text,$('source').value,$('target').value]);
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
  if(translationBusy)return;
  clearTimeout(queueTimer);queueTimer=null;
  const all=entries.filter(e=>e.pendingKey&&e.pendingKey!==e.translatedKey);
  // Real-time mode: never work through a growing backlog of outdated captions.
  all.sort((a,b)=>b.order-a.order);
  const now=Date.now();
  const queue=[];
  for(const e of all){
    if(queue.length>=MAX_PENDING_JOBS || now-(e.queuedAt||now)>MAX_QUEUE_AGE_MS){
      // Preserve the previous translation; do not replace readable text with a skip marker.
      e.skipped=true;
      e.pendingKey=null;e.readyAt=0;
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
  e.pendingKey=null;e.readyAt=0;
  if(source===target){
    if(entries.includes(e)&&g===generation&&translationKey(e)===key){
      e.translated=text;e.translatedKey=key;e.error=false;draw();
    }
    pumpTranslations();return;
  }
  translationBusy=true;
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
        $('bridge').textContent='● 本机 Qwen MT 已连接';draw();
      }
    }catch(err){
      if(g===generation&&entries.includes(e)&&e.version===version&&translationKey(e)===key){
        // Keep the last successful translation visible if a revision fails.
        if(!e.translated)e.translated='翻译失败：'+err.message;
        e.error=true;e.skipped=true;
        $('bridge').textContent='● 本机服务未就绪';draw();
      }
    }finally{
      translationBusy=false;
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
    entries.push(e);scheduleTranslation(e);
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
    if(!r.ok)throw Error();$('bridge').textContent='● 本机 Qwen MT 已连接';
  }catch{$('bridge').textContent='○ 请启动 start-bridge.bat';}
}
locate();draw();health();setInterval(health,15000);
