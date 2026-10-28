import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {startApp} from '../server.mjs';
import {fixture} from './fixture.mjs';
const {chromium}=await import(pathToFileURL(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const out=fileURLToPath(new URL('../../../开发记录/临时/文件刷新检查/',import.meta.url));await mkdir(out,{recursive:true});const dir=await mkdtemp(join(out,'ui-'));
const app=await startApp({campaignDir:dir,port:0,initial:fixture});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(app.url);await page.locator('#enter-dm').click();await page.locator('canvas[data-ready=true]').waitFor();await page.locator('[data-tool=files]:visible').first().click();await page.getByText('NPC资料.json',{exact:true}).waitFor();
 const path=join(dir,'玩家资料.json');const library=JSON.parse(await readFile(path,'utf8'));library.actors[0].hp=23;await writeFile(path,JSON.stringify(library,null,2));
 await page.getByRole('button',{name:'刷新文件列表',exact:true}).click();await page.getByRole('button',{name:'预览此角色资料 → 本场',exact:true}).first().click();await page.locator('#file-preview').filter({hasText:'23'}).waitFor();
 await page.getByRole('button',{name:'应用已核对的文件差异'}).click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('v1'));assert.equal(app.store.state.actors[0].hp,23);
 await page.keyboard.press('Escape');const external=app.store.state;external.actors[0].hp=18;await writeFile(app.store.path,JSON.stringify(external,null,2));await page.locator('#external-file-notice:visible').waitFor();await page.locator('#external-file-notice').click();
 await page.getByRole('button',{name:'预览并刷新本场JSON'}).click();await page.locator('#file-preview').filter({hasText:'18'}).waitFor();await page.getByRole('button',{name:'应用已核对的文件差异'}).click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('v2'));assert.equal(app.store.state.actors[0].hp,18);
 await writeFile(app.store.path,'{broken');await page.getByRole('button',{name:'预览并刷新本场JSON'}).click();await page.locator('#toast').filter({hasText:'有效JSON'}).waitFor();assert.equal(app.store.state.actors[0].hp,18);
 await page.screenshot({path:join(out,'文件管理与格式提示.png')});assert.deepEqual(errors,[]);
 // Restore only this synthetic file before close; real game files are never used.
 await writeFile(app.store.path,JSON.stringify(app.store.state,null,2)+'\n');
 console.log('PASS: JSON library edit/import, external battle change notice/preview/reload, invalid JSON preserves memory');
}finally{await browser.close();await app.close();}
