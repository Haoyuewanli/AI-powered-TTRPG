import test from 'node:test';
import assert from 'node:assert/strict';
import { groupModuleCatalog } from '../../窗口/模组/Code/module-workspace.mjs';

test('真实分类保留空目录，团按稳定来源ID归属', () => {
  const catalog = groupModuleCatalog({ categories: ['单人短团', '多人短团'], templates: [{ id: 'a', name: '同名模组', category: '多人短团' }, { id: 'b', name: '同名模组', category: '自建分类' }], modules: [{ id: 'run-a', templateIdentity: { moduleId: 'a' } }, { id: 'run-b', templateId: 'b' }, { id: 'unknown', name: '同名模组' }] });
  assert.deepEqual(catalog.groups.map(group => [group.name, group.templates.length]), [['单人短团', 0], ['多人短团', 1], ['自建分类', 1]]);
  assert.deepEqual(catalog.runsFor('a').map(item => item.id), ['run-a']);
  assert.deepEqual(catalog.runsFor('b').map(item => item.id), ['run-b']);
  assert.deepEqual(catalog.unlinked.map(item => item.id), ['unknown']);
});

test('资料包缺失时旧团留在未关联入口，不按同名替换', () => {
  const catalog = groupModuleCatalog({ templates: [{ id: 'new', name: '同名' }], modules: [{ id: 'old-run', name: '同名', templateId: 'old' }] });
  assert.deepEqual(catalog.runsFor('new'), []);
  assert.equal(catalog.unlinked[0].id, 'old-run');
});

test('空资料不填入示例分类或团', () => {
  const catalog = groupModuleCatalog();
  assert.deepEqual(catalog.groups, []); assert.deepEqual(catalog.unlinked, []);
});
