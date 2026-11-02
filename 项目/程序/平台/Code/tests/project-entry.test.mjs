import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveBattleArgs } from '../project-entry.mjs';
import { outputDirectory } from './check-helpers.mjs';

test('legacy campaign and workspace entries map to verified migrated data while external fixtures remain explicit', async () => {
  await mkdir(outputDirectory, { recursive: true }); const root = await mkdtemp(join(outputDirectory, 'entry-map-'));
  const old = join(root, '存档'), migrated = join(root, '模组'), campaign = join(migrated, '样本/战斗/存档');
  await mkdir(campaign, { recursive: true });
  await mkdir(join(root, '资源/故事/G'), { recursive: true });
  await writeFile(join(root, '资源/故事/G/目录迁移.json'), JSON.stringify({ version: 2, mappings: [
    { from: '存档', to: '模组' }, { from: '存档/样本', to: '模组/样本/战斗/存档' },
    { from: '资源/故事/Z/战役存档/样本', to: '模组/样本/战斗/存档' }
  ] }));
  assert.deepEqual(resolveBattleArgs(['--campaign', join(old, '样本'), '--workspace', old], root), ['--campaign', campaign, '--workspace', migrated]);
  assert.deepEqual(resolveBattleArgs(['--campaign', join(root, '资源/故事/Z/战役存档/样本')], root), ['--campaign', campaign]);
  assert.throws(() => resolveBattleArgs(['--campaign', old], root), /未启动旧进度副本/, 'A generic old root is not a precise campaign alias');
  assert.throws(() => resolveBattleArgs(['--campaign', join(old, '未登记团')], root), /未启动旧进度副本/);
  const external = join(root, '合成夹具');
  assert.deepEqual(resolveBattleArgs(['--campaign', external], root), ['--campaign', external]);
});

test('an unmigrated old entry is refused instead of starting a second writable progress copy', async () => {
  await mkdir(outputDirectory, { recursive: true }); const root = await mkdtemp(join(outputDirectory, 'entry-refuse-'));
  assert.throws(() => resolveBattleArgs(['--campaign', join(root, '存档/尚未迁移')], root), /未启动旧进度副本/);
  assert.throws(() => resolveBattleArgs(['--workspace'], root), /需要目录参数/);
});
