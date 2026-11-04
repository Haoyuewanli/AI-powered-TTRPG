import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { startApp } from '../../../项目/程序/战斗/Code/server.mjs';
import { fixture } from '../../../项目/程序/战斗/Code/tests/fixture.mjs';
import {createPreviewStore} from './preview-store.mjs';
import {spawn} from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const allowed = new Set(['GET /api/client-info','POST /api/login','POST /api/logout','GET /api/state','POST /api/action','POST /api/attack-plan','GET /api/preferences','POST /api/preferences','GET /api/handoff']);

function sample() {
  const look = (patch) => ({model:'voxel',preset:'human',skin:'#d6ae88',clothes:'#347e8b',hair:'#4d382c',weapon:'sword',material:'iron',shield:false,armor:{head:'none',chest:'none',legs:'none',feet:'leather'},...patch});
  const state = fixture();
  state.campaignId = 'preview-campaign'; state.title = '战斗窗口 · 演示遭遇';
  state.board.width = 60; state.board.depth = 50;
  state.actors[0].name = '演示战士'; state.actors[0].attacks[0].name = '长剑';
  state.actors[0].appearance = look({ species: 'human', classId: 'fighter' });
  state.actors[1].name = '演示守卫';
  state.actors[1].appearance = look({ preset: 'monster', clothes: '#976d56' });
  const mage = structuredClone(state.actors[0]);
  mage.id = 'pc-002'; mage.name = '演示法师'; mage.ownerId = 'player-2'; mage.tiePriority = 2;
  mage.position = { x: 17.5, z: 27.5 }; mage.appearance = look({ classId: 'wizard', weapon: 'staff', clothes:'#6253a0' });
  state.actors.push(mage);
  state.objects = [{ id:'preview-wall', name:'演示矮墙', type:'wall', position:{x:35,y:0,z:30}, size:{width:15,depth:1,height:4}, rotation:0, hidden:false, blocksMovement:true }];
  return state;
}

export async function startPreview() {
  const temp = join(root, '开发记录/临时/战斗窗口预览');
  await mkdir(temp, { recursive:true });
  const session = await mkdtemp(join(temp, 'session-'));
  await mkdir(join(session,'演示团'));
  const core = await startApp({ campaignDir:join(session,'演示团'), workspaceDir:join(session,'工作区'), port:0, initial:sample });
  const preview = await createPreviewStore(join(session,'预览03.json'));
  const files=new Map([['/','v2.html'],...['v2.css','v2.mjs','v2-view.mjs','scene-model.mjs','voxel-grid.mjs','voxel-view.mjs'].map(name=>['/'+name,name])]);
  const server = createServer(async (req,res) => {
    const send = (status, value) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); };
    res.setHeader('Cache-Control','no-store');
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) return send(403,{error:'仅允许本机预览页面访问'});
      const path = new URL(req.url, origin).pathname;
      if (path === '/health' && req.method === 'GET') return send(200,{preview:true, synthetic:true});
      if(files.has(path)&&req.method==='GET'){
        const name=files.get(path);
        res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
        res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});
        return res.end(await readFile(join(here,name)));
      }
      if(path==='/v2/state'&&req.method==='GET')return send(200,preview.get());
      if(['/v2/state','/v2/plan'].includes(path)&&req.method==='POST'){
        if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'请使用JSON操作'});
        let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>65536)return send(413,{error:'内容过长'});chunks.push(chunk);}
        try{const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));return send(200,path==='/v2/state'?await preview.dispatch(body):preview.plan(body));}
        catch(error){return send(400,{error:error.message});}
      }
      if (path === '/preview.css' && req.method === 'GET') { res.writeHead(200,{'Content-Type':'text/css; charset=utf-8'}); return res.end(await readFile(join(here,'preview.css'))); }
      if (path.startsWith('/api/') && !allowed.has(`${req.method} ${path}`)) return send(403,{error:'此入口留待正式整合；当前仅预览战斗界面。'});
      if (!path.startsWith('/api/') && req.method !== 'GET') return send(405,{error:'不支持此方法'});
      const chunks=[]; let size=0;
      for await (const chunk of req) { size+=chunk.length; if(size>65536) return send(413,{error:'内容过长'}); chunks.push(chunk); }
      const headers = {};
      for (const name of ['content-type','authorization']) if(req.headers[name]) headers[name]=req.headers[name];
      const upstream = await fetch(core.url + (path==='/v1'?'/':path), { method:req.method, headers, ...(req.method === 'POST' ? {body:Buffer.concat(chunks)} : {}) });
      res.statusCode=upstream.status;
      res.setHeader('Content-Type',upstream.headers.get('content-type') || 'application/octet-stream');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
      if(path === '/v1') {
        let html = await upstream.text();
        html=html.replace('</head>','<link rel="stylesheet" href="/preview.css"></head>')
          .replace('<body>','<body><aside class="preview-banner"><strong>战斗窗口 · 预览 01</strong><span>演示数据 · 可放心试操作 · 本轮仅修改预览</span></aside>')
          .replace('<title>战局 · 本地战斗桌</title>','<title>战斗窗口预览 01</title>')
          .replace('你的冒险，从这里继续','界面预览，从这里开始')
          .replace('一张棋盘，一份本地进度。<br>选择身份，回到你的视角。','先选择 DM 体验布置与行动；玩家可输入 player-1。')
          .replace('正式进度保存在电脑文件中，玩家视角仍只显示公开信息和自己的状态。','本页仅使用演示角色；操作保存在临时演示目录。重新启动预览会生成新局面。');
        return res.end(html);
      }
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch(error) { send(500,{error:error.message}); }
  });
  try { await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);}); }
  catch(error) { await core.close(); throw error; }
  const url=`http://127.0.0.1:${server.address().port}`;
  return {url, session, close:async()=>{await new Promise(ok=>server.close(ok));await core.close();}};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = await startPreview();
  await writeFile(join(root,'开发记录/临时/战斗窗口预览/当前地址.txt'),app.url,'utf8');
  console.log(app.url);
  if(process.argv.includes('--open')){
    const browser=spawn(join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe'),['--new-window',app.url],{detached:true,stdio:'ignore',windowsHide:true});
    browser.on('error',()=>console.log('浏览器未自动打开，请打开上方本机地址。'));browser.unref();
  }
  for(const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await app.close();process.exit(0);});
}
