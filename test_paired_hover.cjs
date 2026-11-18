const puppeteer=require('C:/Users/rieca/AppData/Local/npm-cache/_npx/4b4c857f6efdfb61/node_modules/puppeteer');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
  try{
    const page=await browser.newPage();await page.setViewport({width:380,height:760});
    await page.setContent(fs.readFileSync(path.join(__dirname,'panel.html'),'utf8').replace('<script src="panel.js"></script>',''));
    await page.addStyleTag({path:path.join(__dirname,'panel.css')});
    await page.evaluate(()=>{
      window.chrome={tabs:{query:async()=>[{id:21,active:true,title:'Meet hover test'}],onActivated:{addListener(){}},onUpdated:{addListener(){}},onRemoved:{addListener(){}}},runtime:{onMessage:{addListener(fn){window.acceptCaption=fn;}},sendMessage:async()=>({ok:true})},storage:{local:{get:async()=>({source:'Japanese',target:'Chinese',follow:false}),set:async()=>{}}}};
      window.fetch=async()=>({ok:true,json:async()=>({translation:'翻译结果'})});
      window.push=(id,text)=>window.acceptCaption({type:'CAPTION_EVENT',tabId:21,id,speaker:'佐藤',text,at:Date.now()});
    });
    await page.addScriptTag({path:path.join(__dirname,'panel.js')});
    await pause(140);await page.evaluate(()=>{push('one','第一句。');push('two','第二句。');push('three','第三句。');});
    const rows=async()=>page.evaluate(()=>({a:[...document.querySelectorAll('#original .paired-hover')].map(x=>x.dataset.entryId),b:[...document.querySelectorAll('#translated .paired-hover')].map(x=>x.dataset.entryId)}));
    await page.hover('#original .entry[data-entry-id="2"]');
    assert.deepEqual(await rows(),{a:['2'],b:['2']});
    await pause(1250); // redraw when translation is received
    assert.deepEqual(await rows(),{a:['2'],b:['2']});
    await page.hover('#translated .entry[data-entry-id="3"]');
    assert.deepEqual(await rows(),{a:['3'],b:['3']});
    await page.hover('header');
    assert.deepEqual(await rows(),{a:[],b:[]});
    await page.hover('#original .entry[data-entry-id="1"]');
    await page.click('#original .entry[data-entry-id="1"]');
    assert.equal(await page.$eval('#translated .entry[data-entry-id="1"]',el=>el.classList.contains('counterpart-flash')),true);
    console.log('PASS both directions hover, redraw persistence, clearing on leave, click flash preserved');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
