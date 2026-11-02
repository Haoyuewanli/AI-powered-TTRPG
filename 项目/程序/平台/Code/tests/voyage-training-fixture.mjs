import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, lstat, copyFile } from 'node:fs/promises';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { openWorkspace, newBattleState } from '../../../战斗/Code/src/workspace.mjs';
import { fixture } from '../../../战斗/Code/tests/fixture.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));

function within(root, path) {
  const target = resolve(root, path), inside = relative(root, target);
  assert(!inside.startsWith('..') && !isAbsolute(inside), 'Fixture path escaped its explicit root');
  return target;
}

export async function createVoyageTrainingFixture({ sourceRoot, directory }) {
  assert(sourceRoot, 'Set RPG_MODULE_TEST_ROOT to the project containing the candidate module and 2024 Merrow resource');
  sourceRoot = resolve(sourceRoot);
  const info = await lstat(sourceRoot);
  assert(info.isDirectory() && !info.isSymbolicLink(), 'Read-only source project must be a normal directory');
  const projectRoot = join(directory, '项目');
  await mkdir(projectRoot);
  const sourceHashes = new Map(), copied = new Set();
  async function copySource(path) {
    if (copied.has(path)) return;
    const source = within(sourceRoot, path), target = within(projectRoot, path), stat = await lstat(source);
    assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink <= 1, 'Fixture input must be an ordinary independent file');
    const bytes = await readFile(source); sourceHashes.set(path, digest(bytes));
    await mkdir(dirname(target), { recursive: true }); await copyFile(source, target);
    assert.equal(digest(await readFile(target)), sourceHashes.get(path), 'Fixture source changed during copying');
    copied.add(path);
  }
  async function copyTree(path) {
    const stat = await lstat(within(sourceRoot, path));
    assert(stat.isDirectory() && !stat.isSymbolicLink(), 'Fixture package cannot contain directory links');
    for (const entry of await readdir(within(sourceRoot, path), { withFileTypes: true })) {
      assert(!entry.isSymbolicLink(), 'Fixture package cannot contain links');
      const child = path + '/' + entry.name;
      if (entry.isDirectory()) await copyTree(child);
      else if (entry.isFile()) await copySource(child);
    }
  }
  const templateFolder = process.env.RPG_VOYAGE_TEMPLATE_PATH || '模组/预处理/多人短团/风骸岛之龙';
  assert(templateFolder.startsWith('模组/预处理/'), 'Only a preprocessed package may be copied');
  await copyTree(templateFolder);
  const templatePath = templateFolder + '/预处理.json', templateBytes = await readFile(within(projectRoot, templatePath));
  const template = json(templateBytes);
  assert.equal(template.reviewStatus, 'candidate', 'This check must retain the real package candidate status');
  assert(template.batchId && template.storyNodes.some(node => /voyage/.test(node.id)), 'Expected a batch with voyage story nodes');
  assert.equal(template.source.kind, 'markdown');
  if (template.source.referenceBase === 'project') await copySource(template.source.relativePath || template.source.path);

  const merrowPath = '资源/怪物/M/梅洛 Merrow--2580c8832735.json'; await copySource(merrowPath);
  const merrow = json(await readFile(within(projectRoot, merrowPath)));
  assert.equal(merrow.edition?.rulesFamily, 'dnd-2024');
  assert.match(merrow.source?.path || '', /怪物图鉴2025/);

  const oldFolder = '已有合成团', oldSeed = join(projectRoot, '模组', oldFolder, '战斗/存档');
  await mkdir(oldSeed, { recursive: true });
  const workspace = await openWorkspace({ seedDirectory: oldSeed, workspaceDirectory: join(projectRoot, '模组'),
    initial: () => newBattleState('old-synthetic-campaign', 'old-synthetic-battle', oldFolder, fixture()) });
  const oldSelection = workspace.selection; await workspace.close();
  const oldHashes = new Map();
  async function snapshot(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await snapshot(child);
      else if (entry.isFile()) oldHashes.set(child, digest(await readFile(child)));
    }
  }
  await snapshot(join(projectRoot, '模组', oldFolder));
  return { projectRoot, sourceRoot, template, templatePath, packageSha256: digest(templateBytes), merrow, merrowPath, oldSelection,
    sourceFileCount: sourceHashes.size, oldFileCount: oldHashes.size,
    async verifyUntouched() {
      for (const [path, expected] of sourceHashes) assert.equal(digest(await readFile(within(sourceRoot, path))), expected, 'Read-only source changed: ' + path);
      for (const [path, expected] of oldHashes) assert.equal(digest(await readFile(path)), expected, 'Existing synthetic campaign changed: ' + path);
    } };
}
