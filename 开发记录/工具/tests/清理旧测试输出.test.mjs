import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, symlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCleanup, planCleanup } from '../清理旧测试输出.mjs';

const output = fileURLToPath(new URL('../../临时/迭代-20261029/开发记录清理/合成测试/', import.meta.url));
const old = Date.now() - 5 * 24 * 60 * 60 * 1000;
async function fixture() {
  await mkdir(output, { recursive: true });
  const directory = await mkdtemp(join(output, 'case-')), root = join(directory, '临时');
  await mkdir(root); return { directory, root };
}
async function leaf(root, name, timestamp, report = { checks: ['synthetic'], errors: [] }) {
  const path = join(root, '战斗测试', name); await mkdir(path, { recursive: true });
  await writeFile(join(path, 'data.json'), JSON.stringify({ synthetic: true }));
  await writeFile(join(path, 'result.json'), JSON.stringify(report));
  for (const part of [join(path,'data.json'), join(path,'result.json'), path]) await utimes(part,timestamp/1000,timestamp/1000);
  return path;
}

test('dry run keeps newest success/failure and never enters current iteration, worktrees, backups or sources', async () => {
  const { root } = await fixture();
  const removed = await leaf(root,'case-OLD001',old);
  const success = await leaf(root,'case-NEW001',old+10000);
  const failed = await leaf(root,'case-FAIL01',old+20000,{ error:'retained synthetic failure' });
  for (const folder of ['工作树','迭代-20261029','迁移备份','整合备份-20261028','规则核验报告','未知人工内容']) {
    await mkdir(join(root,folder,'case-OLD001'),{recursive:true});
    await writeFile(join(root,folder,'case-OLD001','keep.txt'),'keep');
  }
  await writeFile(join(root,'战斗测试','人工对照.csv'),'keep');
  const plan = await planCleanup({ roots:[root], minAgeMinutes:60 });
  assert.deepEqual(plan.candidates.map(item=>item.path),[removed]);
  assert.ok(plan.retained.some(item=>item.path===success)); assert.ok(plan.retained.some(item=>item.path===failed));
  assert.equal(await readFile(join(removed,'data.json'),'utf8'),JSON.stringify({synthetic:true}));
  assert.equal(plan.summary.candidateFiles,2);
  const result = await applyCleanup(plan);
  assert.equal(result.summary.deletedLeaves,1); assert.equal(result.summary.deletedFiles,2); assert.equal(result.summary.skipped,0);
  await assert.rejects(access(removed),{code:'ENOENT'}); await access(success); await access(failed);
  for (const folder of ['工作树','迭代-20261029','迁移备份','整合备份-20261028','规则核验报告','未知人工内容'])
    assert.equal(await readFile(join(root,folder,'case-OLD001','keep.txt'),'utf8'),'keep');
});

test('a changed generated leaf is skipped after planning; source contents remain unchanged', async () => {
  const { root } = await fixture();
  const changed = await leaf(root,'case-OLD001',old); await leaf(root,'case-NEW001',old+10000);
  const plan = await planCleanup({roots:[root]});
  await writeFile(join(changed,'new-user-note.txt'),'do not remove a changed directory');
  const result = await applyCleanup(plan);
  assert.equal(result.summary.deletedLeaves,0); assert.equal(result.summary.skipped,1);
  assert.match(result.skipped[0].reason,/内容已变化/);
  assert.equal(await readFile(join(changed,'new-user-note.txt'),'utf8'),'do not remove a changed directory');
});

test('tampered outside/protected paths cannot become deletion targets', async () => {
  const { root, directory } = await fixture();
  await leaf(root,'case-OLD001',old); await leaf(root,'case-NEW001',old+10000);
  const plan = await planCleanup({roots:[root]});
  const outside = join(directory,'outside'); await mkdir(outside); await writeFile(join(outside,'keep.txt'),'keep');
  plan.candidates[0].path=outside;
  let result=await applyCleanup(plan); assert.equal(result.summary.deletedLeaves,0); assert.match(result.skipped[0].reason,/越过/);
  const protectedPath=join(root,'工作树','case-OLD001'); await mkdir(protectedPath,{recursive:true});
  plan.candidates[0].path=protectedPath;
  result=await applyCleanup(plan); assert.equal(result.summary.deletedLeaves,0); assert.match(result.skipped[0].reason,/许可测试分类/);
  assert.equal(await readFile(join(outside,'keep.txt'),'utf8'),'keep'); await access(protectedPath);
});

test('any descendant junction prevents deleting its containing generated leaf', async t => {
  const {root,directory}=await fixture();
  const linked=await leaf(root,'case-LINK01',old); await leaf(root,'case-NEW001',old+10000);
  const outside=join(directory,'source'); await mkdir(outside); await writeFile(join(outside,'keep.txt'),'keep');
  try { await symlink(outside,join(linked,'linked-source'),process.platform==='win32'?'junction':'dir'); }
  catch(error) { if(['EPERM','EACCES','ENOSYS'].includes(error.code)){t.skip('环境未允许建立合成目录链接');return;} throw error; }
  const plan=await planCleanup({roots:[root]});
  assert.equal(plan.candidates.length,0); assert.ok(plan.skipped.some(item=>item.path===linked&&/链接/.test(item.reason)));
  assert.equal(await readFile(join(outside,'keep.txt'),'utf8'),'keep');
});

test('recent leaves are preserved even if another newer generated sample exists',async()=>{
  const {root}=await fixture();
  const recent=await leaf(root,'case-RECENT',Date.now()-1000);
  await leaf(root,'case-NEW001',Date.now());
  const plan=await planCleanup({roots:[root],minAgeMinutes:60});
  assert.equal(plan.candidates.length,0); assert.ok(plan.retained.some(item=>item.path===recent&&/近期/.test(item.reason)));
});
