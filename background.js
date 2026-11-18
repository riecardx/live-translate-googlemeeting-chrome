chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(console.warn);
chrome.runtime.onInstalled.addListener(()=>chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}));
chrome.runtime.onStartup.addListener(()=>chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}));

chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  if((msg?.type==='CAPTION'||msg?.type==='CAPTURE_STATUS')&&sender.tab?.id){
    chrome.runtime.sendMessage({type:msg.type==='CAPTION'?'CAPTION_EVENT':'CAPTURE_STATUS_EVENT',
      tabId:sender.tab.id,...msg.payload}).catch(()=>{});
    return;
  }
  if(msg?.type==='ENSURE_CONTENT' && Number.isInteger(msg.tabId)){
    (async()=>{
      try{
        const tab=await chrome.tabs.get(msg.tabId);
        if(!/^https:\/\/meet\.google\.com\//.test(tab.url||''))throw Error('不是 Google Meet 标签页');
        let alive=false;
        try{alive=!!(await chrome.tabs.sendMessage(msg.tabId,{type:'CAPTURE_PING'}))?.ok;}
        catch{}
        if(!alive)await chrome.scripting.executeScript({target:{tabId:msg.tabId},files:['content.js']});
        sendResponse({ok:true,injected:!alive});
      }catch(e){sendResponse({ok:false,error:String(e.message||e)});}
    })();
    return true;
  }
});