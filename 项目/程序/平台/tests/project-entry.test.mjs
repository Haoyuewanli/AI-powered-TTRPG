import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveBattleArgs } from '../project-entry.mjs';
import { outputDirectory } from './check-helpers.mjs';

test('legacy campaign and workspace entries map to verified migrated data while external fixtures remain explicit', async () => {
  await mkdir(outputDirectory, { recursive: true }); const root = await mkdtemp(join(outputDirectory, 'entry-map-'));
  const old = join(root, '存档'), migrated = join(root, '资源/故事/Z/战役存档');
  await mkdir(join(migrated, '样本'), { recursive: true });
  assert.deepEqual(resolveBattleArgs(['--campaign', join(old, '样本'), '--workspace', old], root), ['--campaign', join(migrated, '样本'), '--workspace', migrated]);
  const external = join(root, '合成夹具');
  assert.deepEqual(resolveBattleArgs(['--campaign', external], root), ['--campaign', external]);
});

test('an unmigrated old entry is refused instead of starting a second writable progress copy', async () => {
  await mkdir(outputDirectory, { recursive: true }); const root = await mkdtemp(join(outputDirectory, 'entry-refuse-'));
  assert.throws(() => resolveBattleArgs(['--campaign', join(root, '存档/尚未迁移')], root), /未启动旧进度副本/);
  assert.throws(() => resolveBattleArgs(['--workspace'], root), /需要目录参数/);
});
