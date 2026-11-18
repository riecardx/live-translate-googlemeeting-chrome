const puppeteer=require('C:/Users/rieca/AppData/Local/npm-cache/_npx/4b4c857f6efdfb61/node_modules/puppeteer');
const assert=require('node:assert/strict'),path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto('about:blank');
  await page.evaluate(()=>{window.events=[];window.chrome={runtime:{onMessage:{addListener(){}},sendMessage:async m=>(window.events.push(m))}}});
  await page.setContent('<div role="region" aria-label="Captions" style="width:500px;height:340px"><div class="iOzk7"><span class="zs7s8d">呉越</span><div class="iTTPOb" id="spoken"></div></div></div>');
  const phrase='連携対象のデータを確認していきます。';
  await page.evaluate((p)=>document.querySelector('#spoken').textContent=p.repeat(20),phrase);
  await page.addScriptTag({path:path.join(__dirname,'content.js')});await sleep(170);
  let first=await page.evaluate(()=>window.events.filter(e=>e.type==='CAPTION').map(e=>e.payload));
  assert(first.length>=2);
  assert(first.every(x=>x.text.length<=200 && x.speaker==='呉越'));
  const prev=first.map(x=>x.id);
  await page.evaluate(p=>{document.querySelector('#spoken').textContent+=p.repeat(5);},phrase);
  await sleep(190);
  const all=await page.evaluate(()=>window.events.filter(e=>e.type==='CAPTION').map(e=>e.payload));
  assert(all.every(x=>x.text.length<=200));
  assert(all.length>first.length);
  assert(all.some(x=>!prev.includes(x.id)),'New chunks should get new IDs');
  console.log('PASS long speech chunking, max chars:',Math.max(...all.map(x=>x.text.length)),'events:',all.length);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
