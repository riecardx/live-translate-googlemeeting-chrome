const puppeteer=require('C:/Users/rieca/AppData/Local/npm-cache/_npx/4b4c857f6efdfb61/node_modules/puppeteer');
const assert=require('node:assert/strict'),path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1400,height:900});
  await page.goto('about:blank');
  await page.evaluate(()=>window.chrome={runtime:{id:'test-extension-id',onMessage:{addListener(){}},sendMessage:async m=>(window.events.push(m))}});
  await page.evaluate(()=>window.events=[]);
  await page.setContent('<div role="region" aria-label="Captions" style="width:600px;height:300px">'+
    '<div class="iOzk7" id="r1"><span class="zs7s8d">金桂善</span><div class="iTTPOb">最初の説明です。</div></div>'+
    '<div class="iOzk7" id="r2"><span class="zs7s8d">呉越</span><div class="iTTPOb">次の説明です。</div></div></div>');
  await page.addScriptTag({path:path.join(__dirname,'content.js')});
  await sleep(180);
  let items=await page.evaluate(()=>window.events.filter(m=>m.type==='CAPTION').map(m=>m.payload));
  assert.equal(items.length,2,'Two speakers must produce two independent messages');
  assert.deepEqual(items.map(i=>i.speaker),['金桂善','呉越']);
  assert.deepEqual(items.map(i=>i.text),['最初の説明です。','次の説明です。']);
  await page.evaluate(()=>document.querySelector('#r2 .iTTPOb').textContent='次の説明です。補足があります。');
  await sleep(190);
  items=await page.evaluate(()=>window.events.filter(m=>m.type==='CAPTION').map(m=>m.payload));
  assert.equal(items.length,3,'Only the changed speaker should send a correction');
  assert.equal(items[1].id,items[2].id);
  assert.notEqual(items[0].id,items[1].id);
  await page.evaluate(()=>{
    const r=document.createElement('div');r.className='iOzk7';r.id='r3';
    const s=document.createElement('span');s.className='zs7s8d';s.textContent='金桂善';
    const t=document.createElement('div');t.className='iTTPOb';t.textContent='三番目の発言です。';
    r.append(s,t);document.querySelector('[role=region]').append(r);
  });
  await sleep(190);
  items=await page.evaluate(()=>window.events.filter(m=>m.type==='CAPTION').map(m=>m.payload));
  assert.equal(items.length,4,'Returning speaker should create a new row');
  assert.notEqual(items[0].id,items[3].id);
  console.log('PASS independent speakers, revision ID, returning speaker',JSON.stringify(items.map(i=>[i.speaker,i.text])));
  // Unknown markup: extract independent caption text leaves, never concatenate all speakers.
  await page.evaluate(()=>{
    window.events=[];
    document.querySelector('[role=region]').innerHTML='<section><h4>金桂善</h4><p>一つ目です。</p><h4>呉越</h4><p>二つ目です。</p><h4>金桂善</h4><p>三つ目です。</p></section>';
  });
  await sleep(190);
  items=await page.evaluate(()=>window.events.filter(m=>m.type==='CAPTION').map(m=>m.payload));
  assert.equal(items.length,3,'Fallback must recover three separate utterances');
  assert.deepEqual(items.map(x=>x.text),['一つ目です。','二つ目です。','三つ目です。']);
  assert.deepEqual(items.map(x=>x.speaker),['金桂善','呉越','金桂善']);
  assert(items.every(x=>x.text.length<30),'No full-region transcript merge allowed');
  console.log('PASS markup-independent fallback extracts three separate utterances');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
