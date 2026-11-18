const puppeteer=require('C:/Users/rieca/AppData/Local/npm-cache/_npx/4b4c857f6efdfb61/node_modules/puppeteer');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.setContent(fs.readFileSync(path.join(__dirname,'panel.html'),'utf8').replace('<script src="panel.js"></script>',''));
  await page.addStyleTag({path:path.join(__dirname,'panel.css')});
  await page.evaluate(()=>{
    window.sent=[];window.waiting=[];
    window.chrome={tabs:{query:async()=>[{id:11,active:true,title:'Meet'}],onActivated:{addListener(){}},onUpdated:{addListener(){}},onRemoved:{addListener(){}}},runtime:{onMessage:{addListener(fn){window.pushCaption=fn;}},sendMessage:async()=>({ok:true})},storage:{local:{get:async()=>({source:'Japanese',target:'Chinese',follow:false}),set:async()=>{}}}};
    window.fetch=async(url,opts)=>{
      if(url.endsWith('/health'))return {ok:true,json:async()=>({ok:true})};
      const text=JSON.parse(opts.body).text;window.sent.push(text);
      return new Promise(resolve=>window.waiting.push(()=>resolve({ok:true,json:async()=>({translation:'译文:'+text})})));
    };
    window.caption=text=>window.pushCaption({type:'CAPTION_EVENT',tabId:11,id:'same',speaker:'佐藤',text,at:Date.now()});
    window.complete=()=>window.waiting.shift()?.();
    window.readTranslation=()=>document.querySelector('#translated .entry-body')?.textContent;
    window.readState=()=>document.querySelector('#translated .update-state')?.textContent;
  });
  await page.addScriptTag({path:path.join(__dirname,'panel.js')});await sleep(150);
  await page.evaluate(()=>caption('一开始'));await sleep(1400);
  await page.evaluate(()=>complete());await sleep(100);
  assert.equal(await page.evaluate(()=>readTranslation()),'译文:一开始');
  await page.evaluate(()=>caption('一开始，补充内容'));
  assert.equal(await page.evaluate(()=>readTranslation()),'译文:一开始');
  assert.equal(await page.evaluate(()=>readState()),'更新中…');
  await sleep(1450);
  assert.equal(await page.evaluate(()=>readTranslation()),'译文:一开始');
  await page.evaluate(()=>complete());await sleep(120);
  assert.equal(await page.evaluate(()=>readTranslation()),'译文:一开始，补充内容');
  assert.equal(await page.evaluate(()=>readState()),undefined);
  assert.deepEqual(await page.evaluate(()=>window.sent),['一开始','一开始，补充内容']);
  console.log('PASS: previous translation retained until revised translation succeeds.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
