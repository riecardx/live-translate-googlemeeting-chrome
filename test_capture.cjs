const puppeteer=require('C:/Users/rieca/AppData/Local/npm-cache/_npx/4b4c857f6efdfb61/node_modules/puppeteer');
const path=require('path');const assert=require('assert');
(async()=>{
 const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.setViewport({width:1400,height:850});
  await page.evaluateOnNewDocument(()=>{
   window.__captureEvents=[];
   window.chrome={runtime:{sendMessage:async m=>{window.__captureEvents.push(m);},onMessage:{addListener:()=>{}}}};
  });
  await page.goto('about:blank');
  await page.evaluate(()=>{
   window.__captureEvents=[];
   window.chrome={runtime:{sendMessage:async m=>{window.__captureEvents.push(m);},onMessage:{addListener:()=>{}}}};
  });
  await page.setContent('<main><div role="region" aria-label="Captions" style="width:350px;height:100px"><div id="caption"><div id="speaker">あなた</div><div id="speech">这个。</div></div></div></main>');
  await page.addScriptTag({path:path.join(__dirname,'content.js')});
  await new Promise(r=>setTimeout(r,180));
  let events=await page.evaluate(()=>window.__captureEvents.filter(x=>x.type==='CAPTION'));
  console.log('first',JSON.stringify(events));
  assert(events.some(x=>x.payload.text==='这个。'),'initial Chinese Meet caption missing');
  await page.evaluate(()=>{document.querySelector('#speech').textContent='这个会议从十点开始。';});
  await new Promise(r=>setTimeout(r,280));
  events=await page.evaluate(()=>window.__captureEvents.filter(x=>x.type==='CAPTION'));
  console.log('revised',JSON.stringify(events));
  assert(events.some(x=>x.payload.text==='这个会议从十点开始。'),'caption revision missing');
  assert.equal(events[0].payload.id,events.at(-1).payload.id,'revision should keep same ID');
  console.log('PASS: caption captured and revision re-sent under same ID');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
