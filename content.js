(() => {
  if (globalThis.__meetLiveTranslateInstalled) return;
  globalThis.__meetLiveTranslateInstalled = true;
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const CAPTION_LABEL = /caption|subtitle|字幕|キャプション|자막|sous.titre|untertitel|subtítulo|legenda/i;
  const ROW_SELECTOR = '[data-caption-id],[data-message-id],.iOzk7';
  const BODY_SELECTOR = '.iTTPOb,[jsname="tgaKEf"],[data-caption-text]';
  const SPEAKER_SELECTOR = '.zs7s8d,.CNusmb,[data-sender-name],[data-speaker-name]';
  const SKIP_SELECTOR = 'button,[role="button"],[role="combobox"],input,select,textarea,svg,script,style,[aria-hidden="true"]';
  // Meet's "go to bottom" overlay is UI, not speech. Treat icon and localized
  // action text as one control even if its elements lack a button role.
  const UI_ACTION = /(?:arrow[_-]?downward|keyboard[_-]?arrow[_-]?down|south|vertical[_-]?align[_-]?bottom|一番下に移動|一番下へ移動|最下部に移動|最下部へ移動|一番下|最下部|jump to (?:the )?bottom|scroll to (?:the )?bottom|go to (?:the )?bottom|移到最底部|滚动到底部|맨 아래로 이동)/i;
  const ICON_NAMES = /^(?:arrow[_-]?downward|keyboard[_-]?arrow[_-]?down|south|vertical[_-]?align[_-]?bottom)$/i;
  function isUiAction(text) {
    const t=clean(text);
    if(!t)return false;
    if(ICON_NAMES.test(t))return true;
    // Match the whole button label, not an enclosing region that also holds speech.
    return /^(?:(?:arrow[_-]?downward|keyboard[_-]?arrow[_-]?down|south|vertical[_-]?align[_-]?bottom)\s*)?(?:一番下に移動|一番下へ移動|最下部に移動|最下部へ移動|一番下|最下部|jump to (?:the )?bottom|scroll to (?:the )?bottom|go to (?:the )?bottom|移到最底部|滚动到底部|맨 아래로 이동)(?:\s*(?:arrow[_-]?downward|south))?$/i.test(t);
  }
  function insideUiControl(node) {
    for(let p=node;p && p!==document.documentElement;p=p.parentElement){
      if(p.matches?.(SKIP_SELECTOR))return true;
      const aria=clean(p.getAttribute?.('aria-label'));
      const title=clean(p.getAttribute?.('title'));
      if(isUiAction(aria)||isUiAction(title))return true;
      if(p.matches?.('[data-tooltip],[role="tooltip"]') && isUiAction(p.textContent))return true;
    }
    return false;
  }
  const nodeIds = new WeakMap(), sent = new Map();
  // Speaker names are metadata, never captions. Keep names seen across DOM updates,
  // because Meet frequently renders the name slightly before the spoken text.
  const knownSpeakers = new Set();
  const NAME_ONLY_CJK = /^[\p{Script=Han}]{2,6}$/u;
  function rememberSpeaker(name){
    const n=clean(name);
    if(n && n.length<=80)knownSpeakers.add(n);
  }
  function speakerLabel(node){
    return !!node?.matches?.(SPEAKER_SELECTOR+',h1,h2,h3,h4,h5,h6,[data-speaker]');
  }
  function isSpeakerOnly(text,node){
    const t=clean(text);
    if(!t)return false;
    if(knownSpeakers.has(t))return true;
    if(speakerLabel(node))return true;
    return false;
  }
  let nextNodeId = 0, timer = null, scanCount = 0, lastCaptionAt = 0, lastRegions = 0, lastCandidates = 0;
  let captureInterval = null, observer = null, contextDead = false;
  function stopCapture() {
    if (contextDead) return;
    contextDead = true;
    clearTimeout(timer);
    clearInterval(captureInterval);
    observer?.disconnect();
    globalThis.__meetLiveTranslateInstalled = false;
  }
  function contextAlive() {
    if (contextDead) return false;
    try {
      if (chrome?.runtime?.id) return true;
    } catch (_error) {
      // Chrome throws from runtime.id itself after an extension reload.
    }
    stopCapture();
    return false;
  }
  function safeSend(message) {
    if (!contextAlive()) return;
    try {
      const promise = chrome.runtime.sendMessage(message);
      if (promise?.catch) promise.catch(error => {
        if (/Extension context invalidated/i.test(String(error?.message || error))) stopCapture();
      });
    } catch (error) {
      if (/Extension context invalidated/i.test(String(error?.message || error))) stopCapture();
    }
  }
  function visible(n) {
    if (!n || !n.isConnected) return false;
    const r = n.getBoundingClientRect();
    return r.width > 5 && r.height > 4 && r.bottom > 0 && r.top < innerHeight;
  }
  function idOf(node) {
    const explicit = node.getAttribute?.('data-caption-id') || node.getAttribute?.('data-message-id');
    if (explicit) return explicit;
    if (!nodeIds.has(node)) nodeIds.set(node, ++nextNodeId);
    return 'node-' + nodeIds.get(node);
  }
  function roots() {
    const named = [...document.querySelectorAll('[role="region"][aria-label]')]
      .filter(n => visible(n) && CAPTION_LABEL.test(n.getAttribute('aria-label') || ''));
    if (named.length) return named.filter(n => !named.some(m => m !== n && m.contains(n)));
    // Only use a known Meet message as the fallback root, never the whole application.
    return [...document.querySelectorAll(ROW_SELECTOR)].filter(visible);
  }
  function parseExplicit(row) {
    const nameNode = row.querySelector(SPEAKER_SELECTOR);
    const speaker = nameNode && visible(nameNode) ? clean(nameNode.innerText || nameNode.textContent) : '';
    const bodies = [...row.querySelectorAll(BODY_SELECTOR)].filter(visible);
    const text = clean(bodies.length
      ? bodies.map(n => n.innerText || n.textContent).join(' ')
      : (row.innerText || row.textContent || '').split(/\n+/).map(clean).filter(s=>s!==speaker).join(' '));
    if(speaker)rememberSpeaker(speaker);
    if (!text || text === speaker || text.length > 1200 || isUiAction(text) || insideUiControl(row)) return null;
    if (row.querySelectorAll(SPEAKER_SELECTOR).length > 1) return null;
    if(isSpeakerOnly(text,row))return null;
    return {node:row, speaker, text};
  }
  function explicitCandidates(root) {
    const speakers = [...root.querySelectorAll(SPEAKER_SELECTOR)].filter(visible);
    const groups = [];
    for (const s of speakers) {
      let p = s.parentElement;
      while (p && p !== root) {
        if (p.querySelectorAll(SPEAKER_SELECTOR).length > 1) break;
        if (p.querySelector(BODY_SELECTOR)) { groups.push(p); break; }
        p=p.parentElement;
      }
    }
    const unique = [...new Set(groups)];
    if (unique.length) return unique.slice(-12).map(parseExplicit).filter(Boolean);
    const rows = (root.matches(ROW_SELECTOR) ? [root] : [...root.querySelectorAll(ROW_SELECTOR)])
      .filter(visible).filter(n => !n.querySelector(ROW_SELECTOR));
    if (rows.length) {
      const parsed = rows.slice(-12).map(parseExplicit).filter(Boolean);
      if (parsed.length) return parsed;
    }
    const bodies = [...root.querySelectorAll(BODY_SELECTOR)].filter(visible);
    return bodies.slice(-12).map(n => {
      const p=n.parentElement;
      const row=p && p.querySelectorAll(BODY_SELECTOR).length===1 ? p : n;
      return parseExplicit(row);
    }).filter(Boolean);
  }
  function textLeaves(root) {
    // DOM-independent fallback for current Meet markup, including nested div/span trees.
    // Only inspect the already identified caption region; do not read arbitrary Meet UI.
    const leaves=[];
    function visit(node,depth) {
      if(depth>18 || !visible(node) || insideUiControl(node) || isUiAction(node.getAttribute?.('aria-label')) || isUiAction(node.getAttribute?.('title')))return;
      // Some Meet controls are plain div/span wrappers with no button semantics.
      // Ignore the whole control when its visible text is the fixed bottom action.
      if(isUiAction(node.innerText || node.textContent))return;
      const children=[...node.children].filter(visible).filter(n=>!n.matches(SKIP_SELECTOR));
      let hasTextChildren=false;
      for(const child of children) {
        if(clean(child.innerText||child.textContent))hasTextChildren=true;
        visit(child,depth+1);
      }
      // Direct text (not descendants) also matters when Meet nests an inline transcript.
      const direct=[...node.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE)
        .map(n=>clean(n.textContent)).filter(Boolean);
      if(direct.length && !hasTextChildren) leaves.push({node,text:clean(direct.join(' '))});
      else if(!children.length){
        const txt=clean(node.innerText||node.textContent);
        if(txt)leaves.push({node,text:txt});
      }
    }
    visit(root,0);
    return leaves.filter(l=>l.text.length<=1200 && !isUiAction(l.text) && !insideUiControl(l.node)).slice(-60);
  }
  function likelySpeaker(value, nextValue) {
    if(!value || !nextValue || value.length>42 || /[。！？.!?：:]$/.test(value))return false;
    if(/^(字幕|Captions|CC|More options|参加者|Participants)$/i.test(value) || isUiAction(value))return false;
    // Speaker labels are short, while the following leaf is utterance text.
    return value.length<=25 && (nextValue.length>value.length || /[。！？.!?,，、]/.test(nextValue));
  }
  function fallbackCandidates(root) {
    const leaves=textLeaves(root);
    const result=[];
    let speaker='';
    // First pass: identify all speaker labels (including names at the end of a
    // partially rendered Meet caption area) before emitting any speech.
    for(let i=0;i<leaves.length;i++){
      const current=leaves[i],next=leaves[i+1];
      if(speakerLabel(current.node) || (next && likelySpeaker(current.text,next.text)))
        rememberSpeaker(current.text);
    }
    // Detect adjacent speaker/body leaves. Each body gets its own stable node ID.
    for(let i=0;i<leaves.length;i++){
      const current=leaves[i],next=leaves[i+1];
      if(isSpeakerOnly(current.text,current.node)){
        speaker=current.text;
        continue;
      }
      if(next && likelySpeaker(current.text,next.text)){
        speaker=current.text;rememberSpeaker(speaker);
        continue;
      }
      if(/^(Captions|字幕|CC)$/i.test(current.text) || isUiAction(current.text) || insideUiControl(current.node))continue;
      // A standalone 2–6 Han-character name with no speaker, at the edge
      // of a partial DOM update, is ambiguous. Hold it rather than
      // transmitting a person's name as a new speech caption.
      if(!speaker && !next && NAME_ONLY_CJK.test(current.text))continue;
      result.push({node:current.node,speaker,text:current.text});
    }
    // Never join leaves: separate nodes cannot accidentally become a transcript.
    return result.slice(-12);
  }
  function splitCaption(text) {
    const parts=[],max=200;let remaining=text;
    while(remaining.length>max){
      const prefix=remaining.slice(0,max);
      let cut=Math.max(prefix.lastIndexOf('。')+1,prefix.lastIndexOf('！')+1,
        prefix.lastIndexOf('？')+1,prefix.lastIndexOf('!')+1,
        prefix.lastIndexOf('?')+1,prefix.lastIndexOf('.')+1);
      if(cut<55)cut=Math.max(prefix.lastIndexOf('、')+1,prefix.lastIndexOf('，')+1,
        prefix.lastIndexOf(',')+1,prefix.lastIndexOf(' ')+1);
      if(cut<55)cut=max;
      parts.push(clean(remaining.slice(0,cut)));remaining=clean(remaining.slice(cut));
    }
    if(remaining)parts.push(remaining);
    return parts;
  }
  function capture() {
    if (contextDead) return;
    if (!contextAlive()) return;
    scanCount++;
    const regions=roots();lastRegions=regions.length;
    // Learn all explicit speaker labels first, before any root's fallback runs.
    for(const region of regions)
      for(const label of region.querySelectorAll(SPEAKER_SELECTOR))
        if(visible(label))rememberSpeaker(label.innerText||label.textContent);
    let emitted=0,found=0;
    const used=new Set();
    for(const root of regions){
      const structured=explicitCandidates(root);
      const candidates=structured.length?structured:fallbackCandidates(root);
      for(const candidate of candidates){
        if(!candidate.text || isUiAction(candidate.text) || insideUiControl(candidate.node) || used.has(candidate.node))continue;
        if(isSpeakerOnly(candidate.text,candidate.node))continue;
        used.add(candidate.node);found++;
        for(const [index,text] of splitCaption(candidate.text).entries()){
          if(!text || text===candidate.speaker)continue;
          const id='meet:'+idOf(candidate.node)+':'+candidate.speaker+':'+index;
          if(sent.get(id)===text)continue;
          sent.set(id,text);lastCaptionAt=Date.now();emitted++;
          safeSend({type:'CAPTION',payload:{
            id,text,speaker:candidate.speaker,at:lastCaptionAt
          }});
        }
      }
    }
    lastCandidates=found;
    if(scanCount%4===1)safeSend({type:'CAPTURE_STATUS',payload:{
      containers:lastRegions,found,lastCaptionAt,at:Date.now()
    }});
    if(sent.size>600)for(const k of [...sent.keys()].slice(0,300))sent.delete(k);
  }
  chrome.runtime.onMessage.addListener((msg,_sender,reply)=>{
    if(msg?.type==='CAPTURE_PING')reply({ok:true,containers:lastRegions,found:lastCandidates,lastCaptionAt});
  });
  observer = new MutationObserver(()=>{
    if (contextDead) return;
    clearTimeout(timer);timer=setTimeout(capture,90);
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  captureInterval=setInterval(capture,1000);capture();
})();
