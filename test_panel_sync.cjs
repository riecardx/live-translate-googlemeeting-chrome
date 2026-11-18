const puppeteer=require('C:/Users/rieca/AppData/Local/npm-cache/_npx/4b4c857f6efdfb61/node_modules/puppeteer');
const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
(async()=>{
 const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:350,height:740});
  const html=fs.readFileSync(path.join(__dirname,'panel.html'),'utf8').replace('<script src="panel.js"></script>','');
  await page.setContent(html);
  await page.addStyleTag({path:path.join(__dirname,'panel.css')});
  await page.evaluate(()=>{
    window.chrome={
      tabs:{query:async()=>[{id:41,active:true,title:'Google Meet demo'}],onActivated:{addListener(){}},onUpdated:{addListener(){}},onRemoved:{addListener(){}}},
      runtime:{onMessage:{addListener(fn){window.receiveMeetMessage=fn;}},sendMessage:async()=>({ok:true})},
      storage:{local:{get:async()=>({source:'Japanese',target:'Chinese',follow:false}),set:async()=>{}}}
    };
    window.fetch=async()=>({ok:true,json:async()=>({translation:'模拟译文'})});
  });
  await page.addScriptTag({path:path.join(__dirname,'panel.js')});
  await new Promise(r=>setTimeout(r,100));
  await page.evaluate(()=>{
    for(let i=0;i<28;i++)window.receiveMeetMessage({
      type:'CAPTION_EVENT',tabId:41,id:'line-'+i,speaker:i%2?'佐藤さん':'韩少锋',
      text:'字幕示例 '+i+' 再长一点的字幕，以便看到滚动变化。',at:Date.now()
    });
  });
  const names=await page.evaluate(()=>({
    top:[...document.querySelectorAll('#original .speaker')].slice(0,2).map(n=>n.textContent),
    bottom:[...document.querySelectorAll('#translated .speaker')].slice(0,2).map(n=>n.textContent),
    countA:document.querySelectorAll('#original .entry').length,
    countB:document.querySelectorAll('#translated .entry').length
  }));
  assert.deepEqual(names.top,['韩少锋','佐藤さん']);
  assert.deepEqual(names.bottom,names.top);
  assert.equal(names.countA,28);assert.equal(names.countB,28);
  await page.evaluate(()=>{document.querySelector('#original').scrollTop=420;});
  await new Promise(r=>setTimeout(r,180));
  const synced=await page.evaluate(()=>({
    a:document.querySelector('#original').scrollTop,
    b:document.querySelector('#translated').scrollTop
  }));
  assert(synced.a>0&&synced.b>0,'Scrolling top did not sync bottom');
  await page.evaluate(()=>document.querySelector('#original .entry[data-entry-id="8"]').click());
  const highlight=await page.evaluate(()=>document.querySelector('#translated .entry[data-entry-id="8"]').classList.contains('counterpart-flash'));
  assert(highlight,'Click did not highlight counterpart');
  const bidirectional=await page.evaluate(async()=>{
    document.querySelector('#translated').scrollTop=140;
    await new Promise(r=>setTimeout(r,150));
    return [document.querySelector('#original').scrollTop,document.querySelector('#translated').scrollTop];
  });
  assert(bidirectional[0]>0,'Translation pane scroll did not sync source');
  console.log('PASS names',JSON.stringify(names));
  console.log('PASS scroll',JSON.stringify(synced),JSON.stringify(bidirectional));
  console.log('PASS counterpart flash twice via CSS keyframe');
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
