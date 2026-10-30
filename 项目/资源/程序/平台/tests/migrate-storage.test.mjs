import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, access, readdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { migrateStorage, readProcessIdentity } from '../migrate-storage.mjs';

const output = fileURLToPath(new URL('../../../../../开发记录/临时/存档迁移检查/', import.meta.url));
const executable = fileURLToPath(new URL('../migrate-storage.mjs', import.meta.url));
const absent = path => assert.rejects(access(path), { code: 'ENOENT' });

async function fixture() {
  await mkdir(output, { recursive: true });
  const workspace = await mkdtemp(join(output, 'case-')), projectRoot = join(workspace, '项目');
  const source = join(projectRoot, '存档'), target = join(projectRoot, '资源', '故事', 'Z', '战役存档');
  await mkdir(join(source, '团甲', '资料'), { recursive: true });
  await writeFile(join(source, '工作区.json'), '{"version":1,"private":"PRIVATE_SENTINEL_迁移不可打印"}\n');
  await writeFile(join(source, '团甲', '战斗状态.json'), '{"hp":19,"events":["合成"]}\n');
  await writeFile(join(source, '团甲', '资料', '参考.md'), '[角色](../角色.json)\n');
  return { workspace, projectRoot, source, target };
}

test('default dry-run reports counts without writing, printing private bodies or moving sources', async () => {
  const f = await fixture();
  const before = await readFile(join(f.source, '工作区.json'));
  const plan = await migrateStorage({ projectRoot: f.projectRoot });
  assert.equal(plan.mode, 'dry-run'); assert.equal(plan.counts.files, 3); assert.equal(plan.counts.toCopy, 3);
  assert.equal(plan.backupDirectory, null); assert(!JSON.stringify(plan).includes('PRIVATE_SENTINEL'));
  await absent(f.target); await absent(join(f.workspace, '开发记录'));
  const { stdout } = await promisify(execFile)(process.execPath, [executable, '--project-root', f.projectRoot]);
  assert.equal(JSON.parse(stdout).mode, 'dry-run'); assert(!stdout.includes('PRIVATE_SENTINEL'));
  assert.deepEqual(await readFile(join(f.source, '工作区.json')), before);
});

test('apply backs up before copying, preserves the relative tree, verifies hashes and is idempotent', async () => {
  const f = await fixture();
  const report = await migrateStorage({ projectRoot: f.projectRoot, apply: true });
  assert.equal(report.status, 'migrated'); assert.equal(report.counts.toCopy, 3);
  const manifest = JSON.parse(await readFile(join(report.backupDirectory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'verified'); assert.equal(manifest.files.length, 3);
  for (const item of manifest.files) {
    assert.match(item.sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(await readFile(join(f.projectRoot, item.source)), await readFile(join(f.projectRoot, item.target)));
    assert.deepEqual(await readFile(join(f.projectRoot, item.source)), await readFile(join(report.backupDirectory, item.backup)));
  }
  assert.equal(JSON.parse(await readFile(report.reportPath, 'utf8')).status, 'migrated');
  const repeated = await migrateStorage({ projectRoot: f.projectRoot, apply: true });
  assert.equal(repeated.status, 'already-migrated'); assert.equal(repeated.counts.toCopy, 0); assert.equal(repeated.counts.alreadyPresent, 3);
  assert.equal((await readdir(join(f.workspace, '开发记录', '临时', '迁移备份'))).length, 1);
});

test('a different or extra destination file is refused without replacing either copy', async () => {
  const f = await fixture(); await mkdir(f.target, { recursive: true });
  await writeFile(join(f.target, '工作区.json'), 'different destination');
  await assert.rejects(migrateStorage({ projectRoot: f.projectRoot, apply: true }), /不同或额外/);
  assert.equal(await readFile(join(f.target, '工作区.json'), 'utf8'), 'different destination');
  assert((await readFile(join(f.source, '工作区.json'), 'utf8')).includes('PRIVATE_SENTINEL'));
  await absent(join(f.workspace, '开发记录'));
  const other = await fixture(); await mkdir(other.target, { recursive: true });
  await writeFile(join(other.target, '额外.json'), '{}');
  await assert.rejects(migrateStorage({ projectRoot: other.projectRoot, apply: true }), /不同或额外/);
});

test('live locks in any nested source or target, including runtime trees, prevent all copying', async () => {
  for (const where of ['source', 'target', 'runtime']) {
    const f = await fixture();
    const directory = where === 'target' ? f.target : where === 'runtime' ? join(f.source, '.runtime', 'deep') : join(f.source, '团甲');
    await mkdir(directory, { recursive: true }); await writeFile(join(directory, where === 'target' ? '.workspace.lock' : '.battle.lock'), String(process.pid));
    await assert.rejects(migrateStorage({ projectRoot: f.projectRoot, apply: true }), /仍在使用|身份未明/);
    await absent(join(f.workspace, '开发记录'));
    process.kill(process.pid, 0);
  }
});

test('a reused PID proven to belong to a non-Node process is a stale lock and the old lock is retained', async () => {
  const f = await fixture(), lock = join(f.source, '.workspace.lock');
  await writeFile(lock, String(process.pid));
  let probes = 0;
  const report = await migrateStorage({ projectRoot: f.projectRoot, apply: true, processIdentity: async pid => {
    assert.equal(pid, process.pid); probes++; return { kind: 'non-node', executable: 'svchost.exe' };
  } });
  assert.equal(report.status, 'migrated'); assert.equal(report.counts.staleLocks, 1); assert(probes >= 3);
  assert.equal(await readFile(lock, 'utf8'), String(process.pid)); await absent(join(f.target, '.workspace.lock'));
  process.kill(process.pid, 0);
});

test('Node identity, unavailable identity and failed identity probes still protect a live PID', async () => {
  for (const kind of ['node', 'unknown', 'error']) {
    const f = await fixture(); await writeFile(join(f.source, '.battle.lock'), String(process.pid));
    await assert.rejects(migrateStorage({ projectRoot: f.projectRoot, apply: true, processIdentity: async () => {
      if (kind === 'error') throw new Error('synthetic process query failure');
      return { kind, executable: kind === 'node' ? 'node.exe' : undefined };
    } }), /仍在使用|身份未明/);
    await absent(f.target); await absent(join(f.workspace, '开发记录'));
  }
});

test('the Windows read-only process probe recognizes the current real Node process', { skip: process.platform !== 'win32' }, async () => {
  assert.equal((await readProcessIdentity(process.pid)).kind, 'node');
});

test('stale locks and runtime caches/logs are excluded while JSON, backups and reference bytes remain', async () => {
  const f = await fixture();
  const child = spawn(process.execPath, ['-e', ''], { windowsHide: true, stdio: 'ignore' });
  await new Promise((accept, reject) => { child.once('error', reject); child.once('exit', accept); });
  await writeFile(join(f.source, '.workspace.lock'), String(child.pid));
  for (const name of ['.runtime', 'node_modules', '战斗窗口', 'Cache']) {
    await mkdir(join(f.source, name), { recursive: true }); await writeFile(join(f.source, name, 'config.json'), '{"runtime":true}');
  }
  await writeFile(join(f.source, '服务输出.log'), 'runtime log');
  await writeFile(join(f.source, '权威.json.bak'), 'saved backup');
  await writeFile(join(f.source, '战斗日志.txt'), 'authoritative textual history');
  const report = await migrateStorage({ projectRoot: f.projectRoot, apply: true });
  assert.equal(report.counts.files, 5); assert.equal(report.counts.staleLocks, 1);
  for (const name of ['.workspace.lock', '.runtime', 'node_modules', '战斗窗口', 'Cache', '服务输出.log']) await absent(join(f.target, name));
  assert.equal(await readFile(join(f.target, '权威.json.bak'), 'utf8'), 'saved backup');
  assert.equal(await readFile(join(f.target, '战斗日志.txt'), 'utf8'), 'authoritative textual history');
});

test('source and destination junctions cannot read or write outside the explicit project', async () => {
  for (const where of ['source', 'target']) {
    const f = await fixture(), outside = join(f.workspace, '外部');
    await mkdir(outside); await writeFile(join(outside, 'sentinel.json'), 'outside sentinel');
    if (where === 'source') await symlink(outside, join(f.source, 'escaped'), process.platform === 'win32' ? 'junction' : 'dir');
    else { await mkdir(join(f.projectRoot, '资源')); await symlink(outside, join(f.projectRoot, '资源', '故事'), process.platform === 'win32' ? 'junction' : 'dir'); }
    await assert.rejects(migrateStorage({ projectRoot: f.projectRoot, apply: true }), /符号链接|目录联接/);
    assert.deepEqual(await readdir(outside), ['sentinel.json']); await absent(join(f.workspace, '开发记录'));
  }
});
