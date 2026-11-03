import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,mkdir,readFile,writeFile}from'node:fs/promises';import{join}from'node:path';import{createPlayerStore}from'../player-store.mjs';import{createLibraryStore}from'../library-store.mjs';import{outputDirectory}from'./check-helpers.mjs';
import { prepareCharacter, publishCharacter, ensureTemplates } from '../../../../预处理/玩家/Code/prepare-player.mjs';
async function setup(){await mkdir(outputDirectory,{recursive:true});const root=await mkdtemp(join(outputDirectory,'player-store-')),store=createPlayerStore({root});const op=async b=>store.operation({...b,expectedRevision:(await store.tree()).revision});await op({action:'create',name:'玩家甲'});await op({action:'create',parent:'玩家甲',name:'角色甲-冒险'});await op({action:'create',parent:'玩家甲/角色甲-冒险',name:'01级'});return{root,store,op};}
test('玩家固定MD、目录移动复制及资源私有性',async()=>{const{root,store,op}=await setup();let r=await store.records();assert.equal(r.resources.length,1);const id=r.resources[0].resource.id;assert.equal(r.resources[0].resource.scope,'player');await op({action:'copy',path:'玩家甲/角色甲-冒险',parent:'玩家甲',name:'角色副本-冒险'});r=await store.records();assert.equal(r.resources.length,2);assert.equal(new Set(r.resources.map(x=>x.resource.id)).size,2);await op({action:'create',name:'玩家乙'});await op({action:'move',path:'玩家甲/角色副本-冒险',parent:'玩家乙'});r=await store.records();assert.equal(r.resources.find(x=>x.resource.id!==id).resource.ownerName,'玩家乙');const library=createLibraryStore({root});assert.equal((await library.catalog({role:'dm'},{kind:'角色'})).total,2);});
test('冲突、路径越界、同名目标拒绝，不覆盖原MD',async()=>{const{root,store,op}=await setup();const path='玩家甲/角色甲-冒险/01级/能力.md',before=await store.read(path);await op({action:'save',path,text:before.text+'\n新增说明'});await assert.rejects(store.operation({action:'save',path,text:before.text,expectedRevision:before.revision}),e=>e.status===409);await assert.rejects(op({action:'create',name:'../越界'}));await assert.rejects(op({action:'copy',path:'玩家甲/角色甲-冒险',parent:'玩家甲'}),e=>e.status===409);assert.match((await store.read(path)).text,/新增说明/);await assert.rejects(op({action:'save',path,text:before.text.replace('"kind": "角色"','"kind": "规则"')}));});
test('玩家能力只有明确绑定身份可读，默认世界开放不泄漏角色',async()=>{const{root,store,op}=await setup();await mkdir(join(root,'模组/测试/游玩团/run'),{recursive:true});await writeFile(join(root,'模组/测试/模组.json'),JSON.stringify({id:'m',name:'测试'}));await writeFile(join(root,'模组/测试/游玩团/run/团.json'),JSON.stringify({id:'run',moduleId:'m',name:'团',characters:[{id:'a',name:'角色甲',playerId:'a'},{id:'b',name:'角色乙',playerId:'b'}]}));const library=createLibraryStore({root}),dm={role:'dm'};await library.select(dm,{moduleId:'m',runId:'run'});const a=await library.createInvite(dm,{playerId:'a'}),b=await library.createInvite(dm,{playerId:'b'});const id=(await store.records()).resources[0].resource.id;await assert.rejects(library.read({token:a.token},id),e=>e.status===403);await library.playerOperation(dm,{action:'bind',path:'玩家甲',playerIds:['a'],expectedRevision:(await store.tree()).revision});assert.equal((await library.catalog({token:a.token},{kind:'角色'})).total,1);assert.equal((await library.catalog({token:b.token},{kind:'角色'})).total,0);assert.equal((await library.read({token:a.token},id)).resource.id,id);await assert.rejects(library.playerTree({token:a.token}),e=>e.status===403);});

test('模组筛选不隐藏角色、外部目录变化使权限签名变化、索引不能冒充文件路径', async () => {
  const { root, store, op } = await setup(), library = createLibraryStore({ root });
  const first = await library.notifications({ role: 'dm' });
  assert.equal((await library.catalog({ role: 'dm' }, { kind: '角色', modules: 'unrelated' })).total, 1);
  const file = join(root, '资源/玩家/玩家甲/索引.json');
  await writeFile(file, JSON.stringify({ id: 'owner', path: '../outside', name: '伪造名称', type: 'file', linkedPlayerIds: [] }));
  const tree = await store.tree();
  assert.equal(tree.entries.find(entry => entry.path === '玩家甲').type, 'player');
  assert.equal(tree.entries.find(entry => entry.path === '玩家甲').name, '玩家甲');
  assert.notEqual((await library.notifications({ role: 'dm' })).playerRevision, first.playerRevision);
  const path = '玩家甲/角色甲-冒险/01级/能力.md', value = await store.read(path);
  await assert.rejects(op({ action: 'save', path, text: value.text.replace('## 基础数值', '## 自定义标题') }), error => error.status === 400);
  await writeFile(file, '{broken');
  await assert.rejects(op({ action: 'rename', path: '玩家甲', name: '不应移动' }));
  assert.equal(await readFile(file, 'utf8'), '{broken');
});

test('预处理建立固定模版、发布角色并拒绝覆盖正式档案', async () => {
  await mkdir(outputDirectory, { recursive: true });
  const projectRoot = await mkdtemp(join(outputDirectory, 'player-prepare-'));
  const args = { projectRoot, player: '合成玩家', character: '合成角色-测试', through: 2 };
  await ensureTemplates(projectRoot); await prepareCharacter(args); await publishCharacter(args);
  const store = createPlayerStore({ root: projectRoot }), records = await store.records();
  assert.equal(records.resources.length, 2); assert.deepEqual(records.issues, []);
  assert.match(records.resources[0].resource.initial, /^[A-Z]$/);
  await assert.rejects(publishCharacter(args), error => error.code === 'EEXIST');
  await assert.rejects(prepareCharacter({ ...args, player: '../越界' }));
  const file = join(projectRoot, '预处理/玩家/合成玩家/合成角色-测试/01级/选择.md');
  const before = await readFile(file, 'utf8'); await prepareCharacter(args); assert.equal(await readFile(file, 'utf8'), before);
});

test('更换档案所属玩家保留角色身份与正文，并立即改变旧新邀请的读取权限', async () => {
  const { root, store, op } = await setup();
  await op({ action: 'create', name: '玩家乙' });
  const runPath = join(root, '模组/测试/游玩团/run');
  await mkdir(runPath, { recursive: true });
  await writeFile(join(root, '模组/测试/模组.json'), JSON.stringify({ id: 'm', name: '测试' }));
  await writeFile(join(runPath, '团.json'), JSON.stringify({ id: 'run', moduleId: 'm', name: '团', characters: [
    { id: 'a', name: '角色甲', playerId: 'a' }, { id: 'b', name: '角色乙', playerId: 'b' }
  ] }));
  const library = createLibraryStore({ root }), dm = { role: 'dm' };
  await library.select(dm, { moduleId: 'm', runId: 'run' });
  const a = await library.createInvite(dm, { playerId: 'a' }), b = await library.createInvite(dm, { playerId: 'b' });
  for (const [path, playerId] of [['玩家甲', 'a'], ['玩家乙', 'b']]) {
    await library.playerOperation(dm, { action: 'bind', path, playerIds: [playerId], expectedRevision: (await store.tree()).revision });
  }
  const id = (await store.records()).resources[0].resource.id, before = await library.read({ token: a.token }, id);
  await assert.rejects(library.read({ token: b.token }, id), error => error.status === 403);
  const signature = (await library.notifications({ token: a.token })).playerRevision;
  await library.playerOperation(dm, { action: 'move', path: '玩家甲/角色甲-冒险', parent: '玩家乙', expectedRevision: (await store.tree()).revision });
  await assert.rejects(library.read({ token: a.token }, id), error => error.status === 403);
  const after = await library.read({ token: b.token }, id);
  assert.equal(after.text, before.text); assert.equal(after.resource.id, id); assert.equal(after.resource.ownerName, '玩家乙');
  assert.notEqual((await library.notifications({ token: a.token })).playerRevision, signature);
});
