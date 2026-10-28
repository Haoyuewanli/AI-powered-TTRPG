import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {startPlatform} from '../../平台/server.mjs';

const {chromium}=await import(pathToFileURL(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const output=fileURLToPath(new URL('../../../../开发记录/临时/正式模组封面界面检查/',import.meta.url));
await mkdir(output,{recursive:true});const root=await mkdtemp(join(output,'case-')),projectRoot=join(root,'项目'),modulesDir=join(projectRoot,'模组');
const pngDirectory=join(modulesDir,'分类 A','横版PNG'),jpgDirectory=join(modulesDir,'分类 A','横版JPG'),configFile=join(modulesDir,'cover-crops.json');
await mkdir(pngDirectory,{recursive:true});await mkdir(jpgDirectory,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']});
let app,page;
const errors=[],requests=[],outside=[],checks=[],modalCases=[];
const context=await browser.newContext({viewport:{width:1366,height:1000}});
const observe=target=>{target.on('pageerror',error=>errors.push(error.message));target.on('request',request=>{if(request.url().includes('/api/'))requests.push({url:request.url(),method:request.method(),authorization:request.headers()['x-platform-session']||null});});};
const setInput=(input,value)=>input.evaluate((node,value)=>{node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));},value);
const diskConfig=()=>readFile(configFile,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
const waitFor=async(test,label)=>{for(let attempt=0;attempt<100;attempt++){if(await test())return;await new Promise(resolve=>setTimeout(resolve,40));}throw new Error('Timeout: '+label);};
const draftValues=target=>target.evaluate(()=>({mode:document.getElementById('crop-mode').value,x:document.getElementById('crop-x').value,y:document.getElementById('crop-y').value,zoom:document.getElementById('crop-zoom').value}));

try{
  page=await context.newPage();observe(page);
  const generated=await page.evaluate(()=>{
    const make=(mime,width,height,seed)=>{
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const c=canvas.getContext('2d');
      c.fillStyle=seed?'#ecd8e9':'#d6eaf0';c.fillRect(0,0,width,height);c.fillStyle=seed?'#8190b0':'#9b87b0';c.fillRect(width*.65,0,width*.35,height);
      c.strokeStyle='#243a52';c.lineWidth=8;c.strokeRect(6,6,width-12,height-12);c.beginPath();c.arc(width*.37,height*.5,height*.28,0,Math.PI*2);c.stroke();c.fillStyle='#243a52';c.font='400 42px sans-serif';c.fillText('16:9',width*.15,height*.22);
      return canvas.toDataURL(mime,.9).split(',')[1];
    };
    return {png:make('image/png',640,360,0),replacement:make('image/png',640,360,1),jpg:make('image/jpeg',960,540,1)};
  });
  const originalPNG=Buffer.from(generated.png,'base64'),replacementPNG=Buffer.from(generated.replacement,'base64'),originalJPG=Buffer.from(generated.jpg,'base64');
  const pngPath=join(pngDirectory,'模组封面.png'),jpgPath=join(jpgDirectory,'模组封面.jpg');await writeFile(pngPath,originalPNG);await writeFile(jpgPath,originalJPG);
  app=await startPlatform({projectRoot,port:0,appearanceFile:join(root,'外观.json')});
  await context.route('**/*',route=>{
    const url=route.request().url();if(!url.startsWith(app.url+'/')&&!url.startsWith('data:')&&!url.startsWith('about:')){outside.push(url);return route.abort();}return route.continue();
  });
  const login=async role=>{const response=await fetch(app.url+'/api/local-view',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role})});assert.equal(response.status,200);return (await response.json()).token;};
  const dm=await login('dm'),playerToken=await login('player');
  const catalog=async()=>{const response=await fetch(app.url+'/api/module-covers',{headers:{'X-Platform-Session':dm}});assert.equal(response.status,200);return response.json();};
  const enter=async(target,token)=>{await target.goto(app.url+'/health');await target.evaluate(token=>{if(token)sessionStorage.setItem('platform-session',token);else sessionStorage.removeItem('platform-session');},token);await target.goto(app.url+'/module-covers');};
  const select=async(target,relativeDirectory)=>{
    const data=await catalog();const group=data.groups.find(group=>group.modules.some(module=>module.relativeDirectory===relativeDirectory));assert(group,'missing fixture group: '+relativeDirectory);const module=group.modules.find(module=>module.relativeDirectory===relativeDirectory);
    await target.locator(`#module-groups button[data-group-id="${group.id}"]`).click();const button=target.locator(`#module-track button[data-module-id="${module.id}"]`);await button.click();await button.locator('img:visible').waitFor();await waitFor(async()=>await button.getAttribute('data-loaded')==='true','loaded thumbnail');await waitFor(async()=>await target.locator('#open-crop').isEnabled(),'enabled crop editor');return {module,button};
  };
  const openEditor=async target=>{await target.locator('#open-crop').click();await target.locator('#crop-dialog').waitFor({state:'visible'});assert(await target.locator('#crop-dialog').evaluate(node=>node.matches(':modal')));};
  const save=async(target,status)=>{const pending=target.waitForResponse(response=>response.url()===app.url+'/api/module-covers'&&response.request().method()==='POST');await target.locator('#save-crop').click();const response=await pending;assert.equal(response.status(),status,await response.text());return response;};

  for(const token of [null,'expired-synthetic-session',playerToken]){
    await enter(page,token);await page.locator('#auth-required:visible').waitFor();assert(await page.locator('#library-content').isHidden());assert.equal(await page.locator('#module-track button').count(),0);assert.equal(await page.locator('#auth-required a').getAttribute('href'),'/');
  }
  assert.equal(requests.filter(request=>new URL(request.url).pathname==='/api/login').length,0,'tool must not create its own DM login');
  checks.push('无会话、过期401与玩家403仅提示返回既有DM登录，不自动登录或显示目录');

  await enter(page,null);await page.locator('#auth-required a').click();await page.locator('#enter-dm:visible').waitFor();await page.locator('#enter-dm').click();
  await waitFor(async()=>await page.evaluate(()=>!!sessionStorage.getItem('platform-session')),'platform DM view session');
  const navigationToken=await page.evaluate(()=>sessionStorage.getItem('platform-session'));
  await page.locator('[data-platform-page="modules"]').click();await page.locator('[data-project-panel="modules"] summary').click();await page.locator('#platform-manage-covers').waitFor();
  const popupPromise=page.waitForEvent('popup');await page.locator('#platform-manage-covers').click();const toolPage=await popupPromise;observe(toolPage);await toolPage.waitForURL(app.url+'/module-covers');await toolPage.locator('#library-content:visible').waitFor();
  assert.equal(await toolPage.evaluate(()=>sessionStorage.getItem('platform-session')),navigationToken);
  const closed=toolPage.waitForEvent('close');await toolPage.getByRole('link',{name:'← 返回平台',exact:true}).click();await closed;
  assert(await page.locator('[data-platform-view="modules"]').isVisible());
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('platform-session')),navigationToken);
  assert.equal(requests.filter(request=>request.method==='POST'&&new URL(request.url).pathname==='/api/action').length,0);
  assert.equal(requests.filter(request=>new URL(request.url).pathname==='/api/battle/start').length,0);
  checks.push('平台DM视角实际进入真实封面工具并返回；同一平台会话保留，不启动战斗或提交机械操作');

  await enter(page,dm);await page.locator('#library-content:visible').waitFor();const selectedPNG=await select(page,'分类 A/横版PNG');
  const pngInfo=await selectedPNG.button.locator('img').evaluate(node=>({width:node.naturalWidth,height:node.naturalHeight,fit:getComputedStyle(node).objectFit,src:node.src.slice(0,22)}));assert.equal(pngInfo.width,640);assert.equal(pngInfo.height,360);assert.equal(pngInfo.fit,'contain');assert(pngInfo.src.startsWith('data:image/png'));
  const selectedJPG=await select(page,'分类 A/横版JPG');const jpgInfo=await selectedJPG.button.locator('img').evaluate(node=>({width:node.naturalWidth,height:node.naturalHeight,fit:getComputedStyle(node).objectFit,src:node.src.slice(0,23)}));assert.equal(jpgInfo.width,960);assert.equal(jpgInfo.height,540);assert.equal(jpgInfo.fit,'contain');assert(jpgInfo.src.startsWith('data:image/jpeg'));
  const addedDirectory=join(modulesDir,'分类 B','刷新新增');await mkdir(addedDirectory,{recursive:true});await writeFile(join(addedDirectory,'模组封面.png'),originalPNG);
  await page.locator('#refresh-catalog').click();await page.locator('#module-groups button').filter({hasText:'分类 B'}).waitFor();await select(page,'分类 B/刷新新增');assert.equal(await page.locator('#module-name').textContent(),'刷新新增');await select(page,'分类 A/横版PNG');
  const imageRequests=requests.filter(request=>new URL(request.url).pathname==='/api/module-covers/image');assert(imageRequests.length>=3);assert(imageRequests.every(request=>[dm,navigationToken].includes(request.authorization)));assert(imageRequests.every(request=>![...new URL(request.url).searchParams.keys()].some(key=>/token|session|authorization/i.test(key))));
  await page.screenshot({path:join(root,'正式模组封面目录.png'),fullPage:true});
  checks.push('自动读取真实临时PNG/JPG横版封面，鉴权fetch转dataURL完整显示，刷新发现新增分类与封面');

  const beforeCancel=await diskConfig(),postsBeforeCancel=requests.filter(request=>request.method==='POST'&&new URL(request.url).pathname==='/api/module-covers').length;
  await openEditor(page);await page.locator('#crop-mode').selectOption('crop');const initialPreview=await page.locator('#crop-preview').evaluate(node=>node.toDataURL());await setInput(page.locator('#crop-zoom'),1.5);await setInput(page.locator('#crop-x'),32);await setInput(page.locator('#crop-y'),61);assert.notEqual(await page.locator('#crop-preview').evaluate(node=>node.toDataURL()),initialPreview);
  await page.locator('#cancel-crop').click();await page.locator('#crop-dialog').waitFor({state:'hidden'});assert.equal(await diskConfig(),beforeCancel);assert.equal(requests.filter(request=>request.method==='POST'&&new URL(request.url).pathname==='/api/module-covers').length,postsBeforeCancel);
  await openEditor(page);await page.locator('#crop-mode').selectOption('crop');await setInput(page.locator('#crop-zoom'),1.5);await setInput(page.locator('#crop-x'),32);await setInput(page.locator('#crop-y'),61);await save(page,200);await page.locator('#crop-dialog').waitFor({state:'hidden'});
  const saved=JSON.parse(await diskConfig()),entry=saved.covers['分类 A/横版PNG'];assert.equal(saved.schemaVersion,1);assert.deepEqual(saved.frameAspectRatio,[3,4]);assert.equal(entry.mode,'crop');assert.deepEqual(entry.sourceSize,{width:640,height:360});assert(Math.abs(entry.crop.width*640/(entry.crop.height*360)-.75)<.0001);assert.deepEqual(await readFile(pngPath),originalPNG);assert.deepEqual(await readFile(jpgPath),originalJPG);
  checks.push('裁切实时预览，取消没有POST或磁盘写入；明确保存形成统一JSON且不改原图或战斗状态');

  await select(page,'分类 A/横版PNG');await openEditor(page);await setInput(page.locator('#crop-zoom'),2);await setInput(page.locator('#crop-x'),72);await setInput(page.locator('#crop-y'),23);const configDraft=await draftValues(page),external=JSON.parse(await diskConfig());external.covers['分类 A/横版PNG'].crop.x=.02;const externalRaw=JSON.stringify(external,null,2)+'\n';await writeFile(configFile,externalRaw);
  await save(page,409);await page.locator('#crop-error:visible').waitFor();assert(await page.locator('#crop-dialog').isVisible());assert(await page.locator('#save-crop').isDisabled());assert(await page.locator('#review-crop').isVisible());assert.deepEqual(await draftValues(page),configDraft);assert.equal(await diskConfig(),externalRaw);
  await page.locator('#review-crop').click();await waitFor(async()=>await page.locator('#save-crop').isEnabled(),'reviewed config enables save');assert.deepEqual(await draftValues(page),configDraft);assert.equal(await diskConfig(),externalRaw);await save(page,200);await page.locator('#crop-dialog').waitFor({state:'hidden'});
  checks.push('外部配置变化返回409、保留草稿且不覆盖；重新核对不自动写入，二次明确保存成功');

  await select(page,'分类 A/横版PNG');await openEditor(page);await setInput(page.locator('#crop-zoom'),1.8);await setInput(page.locator('#crop-x'),17);await setInput(page.locator('#crop-y'),38);const sourceDraft=await draftValues(page),configBeforeSource=await diskConfig(),oldOriginal=await page.locator('#crop-original').getAttribute('src');await writeFile(pngPath,replacementPNG);
  await save(page,409);await page.locator('#review-crop:visible').waitFor();assert.deepEqual(await draftValues(page),sourceDraft);assert.equal(await diskConfig(),configBeforeSource);assert.deepEqual(await readFile(pngPath),replacementPNG);
  await page.locator('#review-crop').click();await waitFor(async()=>await page.locator('#save-crop').isEnabled(),'reviewed image enables save');assert.notEqual(await page.locator('#crop-original').getAttribute('src'),oldOriginal);assert.deepEqual(await draftValues(page),sourceDraft);assert.equal(await diskConfig(),configBeforeSource);await page.locator('#cancel-crop').click();await page.locator('#crop-dialog').waitFor({state:'hidden'});assert.equal(await diskConfig(),configBeforeSource);
  checks.push('源图替换即使尺寸相同也冲突，409保留草稿；核对重新读取真实新图，取消仍不写配置');

  const reopened=await context.newPage();observe(reopened);await enter(reopened,dm);const reopenedModule=await select(reopened,'分类 A/横版PNG');await waitFor(async()=>await reopenedModule.button.locator('img').evaluate(node=>node.naturalWidth===300&&node.naturalHeight===400),'saved cropped thumbnail after reopening');await openEditor(reopened);assert.equal(await reopened.locator('#crop-zoom').inputValue(),'2');assert.equal(await reopened.locator('#crop-x').inputValue(),'72');assert.equal(await reopened.locator('#crop-y').inputValue(),'23');await reopened.locator('#cancel-crop').click();await reopened.locator('#crop-dialog').waitFor({state:'hidden'});
  for(const width of [390,320]){
    await reopened.setViewportSize({width,height:844});await select(reopened,'分类 A/横版PNG');const before=await diskConfig();await openEditor(reopened);const dialog=reopened.locator('#crop-dialog'),box=await dialog.boundingBox();assert(box.x>=-1&&box.y>=-1&&box.x+box.width<=width+1&&box.y+box.height<=845);assert(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1));
    for(const id of ['cancel-crop','save-crop','crop-mode','crop-x','crop-y','crop-zoom']){const control=await reopened.locator('#'+id).boundingBox();assert(control.x>=box.x-1&&control.x+control.width<=box.x+box.width+1&&control.y>=box.y-1&&control.y+control.height<=box.y+box.height+1,`${width} ${id} outside modal`);}
    await setInput(reopened.locator('#crop-zoom'),2.4);await reopened.screenshot({path:join(root,`正式裁切-${width}.png`)});await reopened.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await diskConfig(),before);assert(await reopened.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));modalCases.push({width,dialogWidth:box.width,dialogHeight:box.height});
  }
  assert.deepEqual(await readFile(pngPath),replacementPNG);assert.deepEqual(await readFile(jpgPath),originalJPG);assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
  checks.push('重新打开从统一JSON恢复已剪区域；390/320原生模态框与控件不越界，Esc取消不写配置');
  const result={checks,root,modalCases,errors,outsideRequests:outside.length,imageRequests:imageRequests.length,battleStarted:false};await writeFile(join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(error){await writeFile(join(root,'result.json'),JSON.stringify({checks,root,modalCases,errors,outsideRequests:outside,error:String(error.stack||error)},null,2));if(page)await page.screenshot({path:join(root,'failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();await app?.close();}
