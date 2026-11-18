const puppeteer=require('C:/Users/rieca/AppData/Local/npm-cache/_npx/4b4c857f6efdfb61/node_modules/puppeteer');
const assert=require('node:assert/strict'),path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1200,height:800});
  await page.goto('about:blank');
  await page.evaluate(()=>{
    window.events=[];
    window.chrome={runtime:{onMessage:{addListener(){}},sendMessage:async msg=>window.events.push(msg)}};
  });
  await page.setContent(`<div role="region" aria-label="Captions" style="width:550px;height:300px">
   <section><b>郭敏敏</b><p>今日はテストの確認です。</p></section>
   <div role="button" aria-label="一番下に移動"><span>arrow_downward</span><span>一番下に移動</span></div>
   <div id="floating"><span class="material-icons">arrow_downward</span><span>一番下に移動</span></div>
   <button>一番下に移動</button>
  </div>`);
  await page.addScriptTag({path:path.join(__dirname,'content.js')});await sleep(180);
  let items=await page.evaluate(()=>window.events.filter(e=>e.type==='CAPTION').map(e=>e.payload));
  console.log('captured',JSON.stringify(items));
  assert(items.some(x=>x.text==='今日はテストの確認です。'),'Real caption missing');
  assert(items.every(x=>!x.text.includes('一番下')&&!x.text.includes('arrow_downward')),'Control leaked');
  await page.evaluate(()=>{
    document.querySelector('#floating').innerHTML='<span>arrow_downward</span><span>一番下に移動</span>';
    document.querySelector('section p').textContent='今日はテストの確認です。連携について話します。';
  });
  await sleep(180);
  items=await page.evaluate(()=>window.events.filter(e=>e.type==='CAPTION').map(e=>e.payload));
  assert(items.some(x=>x.text.includes('連携について話します。')),'Caption update lost');
  assert(items.every(x=>!x.text.includes('一番下')&&!x.text.includes('arrow_downward')));
  console.log('PASS ignore fixed go-to-bottom control while preserving captions');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
