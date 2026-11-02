import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const workspace=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
const input=resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('用法：node check-html.mjs 地图.html');
const root=join(workspace,'开发记录/临时/地图第一轮');await mkdir(root,{recursive:true});
const out=await mkdtemp(join(root,'browser-'));
const runtime=process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE||join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(runtime));
const browser=await chromium.launch({executablePath:process.env.RPG_PLATFORM_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const checks=[],errors=[],outside=[];
const note=text=>{checks.push(text);console.log('通过：'+text);};
try{
 const context=await browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true});
 const url=pathToFileURL(input).href;
 await context.route('**/*',route=>{const target=route.request().url();if(target===url||/^(data:|blob:|about:)/.test(target))return route.continue();outside.push(target.slice(0,150));return route.abort();});
 context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
 const page=await context.newPage();page.setDefaultTimeout(15000);
 await page.goto(url);await page.waitForFunction(()=>window.mapPreview?.ready);
 const data=await page.evaluate(()=>{const m=window.mapPreview.getModule();return {id:m.id,title:m.title,sharing:m.capabilities.sharing,nodes:m.nodes.map(({id,kind,hotspots,name})=>({id,kind,hotspots,name}))};});
 assert.equal(await page.locator('[data-focus-node]').count(),data.nodes.length);
 assert.equal(data.sharing,false);assert.equal(await page.locator('.share-panel input').count(),0);
 await page.evaluate(async()=>{const assets=JSON.parse(document.getElementById('map-offline-data').textContent).assets;await Promise.all(Object.values(assets).map(async url=>{const image=new Image();image.src=url;await image.decode();}));});
 note('单文件直接打开，全部图片版本解码，目录唯一且共享仅占位');
 let count=0;
 for(const node of data.nodes)for(const [i,hotspot] of node.hotspots.entries()){
  await page.evaluate(id=>window.mapPreview.focusNode(id),node.id);
  await page.locator(`[data-node-id="${node.id}"] [data-hotspot-index="${i}"]`).click();
  assert.equal(await page.locator('#selection-name').inputValue(),data.nodes.find(n=>n.id===hotspot.targetId).name);count++;
 }
 note(`${count}个真实热点逐个点击，跳转对应地点`);
 await page.locator('[data-focus-node]').first().click();
 const base=await page.evaluate(()=>{const doc=window.mapPreview.getDocument(),n=doc.nodes[0];return {x:n.x+n.w*.4,y:n.y+n.h*.4};});
 const screen=await page.evaluate(p=>{const d=window.mapPreview.getDocument(),r=document.getElementById('viewport').getBoundingClientRect();return {x:r.x+d.camera.x+p.x*d.camera.zoom,y:r.y+d.camera.y+p.y*d.camera.zoom};},base);
 await page.locator('[data-tool=player]').click();await page.mouse.click(screen.x,screen.y);
 await page.locator('#selection-name').fill('Round1测试');await page.locator('#selection-name').press('Tab');
 const downloadPromise=page.waitForEvent('download');await page.locator('#save').click();const download=await downloadPromise;
 const save=join(out,'layout.json');await download.saveAs(save);
 const saved=JSON.parse(await readFile(save,'utf8'));assert(saved.objects.some(o=>o.name==='Round1测试'));
 const next=await context.newPage();await next.goto(url);await next.waitForFunction(()=>window.mapPreview?.ready);await next.locator('#import-file').setInputFiles(save);
 await next.waitForFunction(()=>window.mapPreview.getDocument().objects.some(o=>o.name==='Round1测试'));
 assert.deepEqual(await next.evaluate(()=>window.mapPreview.getDocument()),saved);
 note('手动放标记、改名、下载后在新页面载入恢复');
 for(const [width,height] of [[1920,1080],[1280,800],[1024,768],[600,800]]){
  await next.setViewportSize({width,height});await next.locator('#fit-all').click();
  const metrics=await next.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:document.documentElement.clientWidth,canvas:document.getElementById('viewport').getBoundingClientRect().width}));
  assert.equal(metrics.scroll,metrics.width);assert(metrics.canvas>150);await next.screenshot({path:join(out,'view-'+width+'.png')});
 }
 note('四种尺寸无整页横向溢出，画布与目录可达');
 assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
 note('无页面脚本错误，无网络或外部文件请求');
 await writeFile(join(out,'results.json'),JSON.stringify({input,moduleId:data.id,nodes:data.nodes.length,hotspots:count,checks,errors,outside},null,2));
 console.log('证据：'+out);
}catch(error){await writeFile(join(out,'failure.json'),JSON.stringify({message:error.message,checks,errors,outside},null,2));throw error;}
finally{await browser.close();}
