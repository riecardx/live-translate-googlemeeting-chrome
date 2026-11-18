const puppeteer=require('C:/Users/rieca/AppData/Local/npm-cache/_npx/4b4c857f6efdfb61/node_modules/puppeteer');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:350,height:720});
  await page.setContent(fs.readFileSync(path.join(__dirname,'panel.html'),'utf8').replace('<script src="panel.js"></script>',''));
  await page.addStyleTag({path:path.join(__dirname,'panel.css')});
  await page.evaluate(()=>{
    window.requests=[];window.maxConcurrent=0;window.concurrent=0;window.responses=[];
    window.chrome={
      tabs:{query:async()=>[{id:41,active:true,title:'Meet test'}],onActivated:{addListener(){}},onUpdated:{addListener(){}},onRemoved:{addListener(){}}},
      runtime:{onMessage:{addListener(fn){window.receiveMeetMessage=fn;}},sendMessage:async()=>({ok:true})},
      storage:{local:{get:async()=>({source:'Japanese',target:'Chinese',follow:false}),set:async()=>{}}}
    };
    window.fetch=async(url,opts)=>{
      if(url.endsWith('/health'))return {ok:true,json:async()=>({ok:true})};
      const body=JSON.parse(opts.body);
      window.concurrent++;window.maxConcurrent=Math.max(window.concurrent,window.maxConcurrent);
      window.requests.push(body.text);
      return new Promise(resolve=>window.responses.push(()=>{
        window.concurrent--;
        resolve({ok:true,json:async()=>({translation:'译文:'+body.text})});
      }));
    };
    window.emit=(id,text)=>window.receiveMeetMessage({type:'CAPTION_EVENT',tabId:41,id,speaker:'佐藤',text,at:Date.now()});
    window.finishOne=()=>window.responses.shift()?.();
  });
  await page.addScriptTag({path:path.join(__dirname,'panel.js')});
  await sleep(150);
  await page.evaluate(()=>{emit('A','first A');emit('B','first B');emit('C','first C');emit('C','first C');});
  await sleep(3300);
  let state=await page.evaluate(()=>({requests,maxConcurrent,concurrent}));
  assert.deepEqual(state.requests,['first C'],'Newest caption should go first');
  assert.equal(state.maxConcurrent,1);
  await page.evaluate(()=>{emit('C','updated C');emit('B','updated B');emit('B','updated B');});
  await sleep(3350);
  state=await page.evaluate(()=>({requests,maxConcurrent,concurrent}));
  assert.equal(state.requests.length,1,'Should not start a second request while first pending');
  await page.evaluate(()=>finishOne());
  await sleep(150);
  state=await page.evaluate(()=>({requests,maxConcurrent,concurrent}));
  assert.deepEqual(state.requests.slice(0,2),['first C','updated B'],'Latest pending must run first');
  assert.equal(state.maxConcurrent,1);
  const result=await page.evaluate(()=>({
    original:[...document.querySelectorAll('#original .entry-body')].map(x=>x.textContent),
    translated:[...document.querySelectorAll('#translated .entry-body')].map(x=>x.textContent)
  }));
  assert.equal(result.translated[2],'翻译中…','Stale result must not replace revised caption');
  await page.evaluate(()=>finishOne());await sleep(100);
  await page.evaluate(()=>finishOne());await sleep(100);
  await page.evaluate(()=>finishOne());await sleep(100);
  state=await page.evaluate(()=>({requests,maxConcurrent,concurrent}));
  assert.equal(state.maxConcurrent,1);
  assert.equal(state.requests.filter(x=>x==='first B').length,0,'Old superseded version should not be requested');
  assert.equal(state.requests.filter(x=>x==='updated B').length,1);
  console.log('PASS one HTTP request at a time; max=',state.maxConcurrent);
  console.log('PASS newest first, revisions and stale responses:',JSON.stringify(state.requests));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
