import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isolatePlatform, startIsolated } from './check-helpers.mjs';
const { chromium } = await import(pathToFileURL(join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const { directory, isolated } = await isolatePlatform('promoted-ui-'), projectRoot = join(directory, '项目');
async function put(path, value) { const target = join(projectRoot, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, typeof value === 'string' ? value : JSON.stringify(value)); }
const md = (id, name, kind, text) => '---\n' + JSON.stringify({ id, name, kind, initial: 'A' }) + '\n---\n' + text;
for (let i = 1; i <= 4; i++) await put('模组/冒险/模组' + i + '/模组.json', { id: 'module-' + i, name: '合成冒险' + i });
await mkdir(join(projectRoot, '模组/空分类'), { recursive: true });
await put('模组/冒险/模组1/游玩团/run-1/团.json', { id: 'run-1', moduleId: 'module-1', name: '合成测试团', characters: [{ id: 'alice', name: '合成角色', playerId: 'synthetic-player', playerName: '合成玩家' }] });
await put('资源/规则/规则.md', md('rule-a', '规则甲', '规则', '# 规则甲正文\n\n**共有的正文**'));
await put('资源/怪物/怪物.md', md('monster-a', '怪物甲', '怪物', '# 怪物甲正文'));
await put('模组/冒险/模组1/资源/故事/故事.md', md('story-a', '剧情甲', '故事', '# DM秘密正文'));
const app = await startIsolated(isolated, { projectRoot }); let browser, page; const errors = [], checks = [];
const note = value => { checks.push(value); console.log('通过：' + value); };
try {
 browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
 page = await browser.newPage({ viewport: { width: 1540, height: 1020 } }); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
 await page.goto(app.url); await page.locator('#enter-dm').click(); await page.locator('#platform-go-modules').click();
 const refresh = page.locator('[data-project-refresh-modules]'); await page.locator('[data-real-module-template=module-1]').waitFor();
 assert.equal(await page.locator('[data-real-module-template]').count(), 4); assert.equal(await page.locator('[data-project-module-examples]').isVisible(), false);
 await page.getByRole('button', { name: '下一个本地模组', exact: true }).click(); await page.locator('[data-real-module-template=module-2][aria-pressed=true]').waitFor();
 await page.locator('[data-real-module-template=module-1]').click(); await page.getByRole('button', { name: '继续此团', exact: true }).click();
 await page.locator('[data-real-module-host][aria-busy=false]').waitFor();
 await page.screenshot({ path: join(directory, '01-module.png') });
 await mkdir(join(projectRoot, '模组/新分类'), { recursive: true });
 await rename(join(projectRoot, '模组/冒险/模组1'), join(projectRoot, '模组/新分类/移动后的模组'));
 await refresh.click(); await page.locator('[data-real-module-category=新分类][aria-pressed=true]').waitFor(); assert.equal(await page.locator('[data-real-run=run-1]').count(), 1);
 await put('模组/新分类/新增模组/模组.json', { id: 'module-5', name: '新增冒险' });
 await put('模组/损坏目录/模组.json', '{invalid'); await refresh.click(); await page.locator('[data-real-module-template=module-5]').waitFor({ state: 'attached' });
 await page.locator('[data-real-module-category=空分类]').click(); assert.match(await page.locator('.module-empty').innerText(), /还没有/);
 note('环状切换、实际分类、移动后保留团、新增及坏文件隔离');
 await page.locator('[data-platform-page=dialogue]').click();
 await page.getByRole('button', { name: '群聊', exact: true }).click(); await page.getByLabel('群聊消息', { exact: true }).fill('正式组件的合成消息'); await page.getByLabel('群聊消息', { exact: true }).press('Enter');
 await page.locator('.project-message').filter({ hasText: '正式组件的合成消息' }).waitFor();
 assert.match(await readFile(join(projectRoot, '模组/新分类/移动后的模组/游玩团/run-1/群聊.json'), 'utf8'), /正式组件的合成消息/);
 note('正常群聊入口按当前团保存消息');
 await page.locator('[data-platform-page=resources]').click(); await page.locator('[data-project-resource=rule-a]').waitFor(); await page.locator('[data-resource-expand=rule-a]').click();
 await page.locator('.real-resource-reader').getByRole('heading', { name: '规则甲正文' }).waitFor();
 await page.getByRole('button', { name: '在对话标签中打开', exact: true }).click(); await page.locator('.dialogue-resource-tab [data-resource-expand=rule-a][aria-expanded=true]').waitFor();
 await page.locator('.dialogue-new-tab').click(); await page.getByRole('button', { name: '资源', exact: true }).last().click();
 await page.locator('.dialogue-resource-tab:visible [data-project-resource=monster-a]').waitFor();
 const resourceTabs = page.locator('[data-dialogue-tab^=resource-]'); assert.equal(await resourceTabs.count(), 2);
 await page.locator('.dialogue-resource-tab:visible [data-real-resource-search]').fill('怪物甲'); await page.locator('.dialogue-resource-tab:visible').getByRole('button', { name: '搜索', exact: true }).click();
 await page.waitForFunction(() => document.querySelector('.dialogue-resource-tab .real-resource-list')?.textContent.includes('怪物甲'));
 const first = await resourceTabs.nth(0).getAttribute('data-dialogue-tab'), second = await resourceTabs.nth(1).getAttribute('data-dialogue-tab');
 await resourceTabs.nth(0).click(); assert.equal(await page.locator('.dialogue-resource-tab:visible [data-real-resource-search]').inputValue(), '');
 assert.equal(await page.locator('.dialogue-resource-tab:visible [data-resource-expand=rule-a]').getAttribute('aria-expanded'), 'true');
 note('资源标签与资源窗口共用组件，多开筛选与展开独立');
 async function dragSplit(id, zone) {
  const tab = page.locator('[data-dialogue-tab="' + id + '"]'), pane = page.locator('.dialogue-pane').first(), rect = await pane.boundingBox();
  const positions = { right: [.94, .5], bottom: [.5, .92], 'bottom-right': [.9, .9] }, [x,y] = positions[zone];
  const transfer = await page.evaluateHandle(() => new DataTransfer()); await tab.dispatchEvent('dragstart', { dataTransfer: transfer });
  await pane.dispatchEvent('dragover', { dataTransfer: transfer, clientX: rect.x + rect.width*x, clientY: rect.y + rect.height*y });
  await page.locator('[data-split-zone="' + zone + '"]').waitFor();
  await pane.dispatchEvent('drop', { dataTransfer: transfer, clientX: rect.x + rect.width*x, clientY: rect.y + rect.height*y });
 }
 await dragSplit(second, 'right'); assert.equal(await page.locator('#dialogue-workspace').getAttribute('data-dialogue-layout'), 'columns');
 await page.locator('.dialogue-sidebar-toggle').first().click(); await page.locator('#dialogue-layout').selectOption('single');
 await dragSplit(second, 'bottom'); assert.equal(await page.locator('#dialogue-workspace').getAttribute('data-dialogue-layout'), 'rows');
 await page.locator('#dialogue-layout').selectOption('single'); await dragSplit(second, 'bottom-right'); assert.equal(await page.locator('.dialogue-pane').count(), 4);
 assert.equal(await page.locator('[data-dialogue-tab="' + first + '"]').count(), 1); assert.equal(await page.locator('[data-dialogue-tab="' + second + '"]').count(), 1);
 await page.screenshot({ path: join(directory, '02-split.png') }); note('拖动显示落点预览，左右、上下、四分屏均保持标签内容');
 await page.setViewportSize({width:700,height:950}); assert.equal(await page.locator('.dialogue-pane:visible').count(),4); await page.setViewportSize({width:1540,height:1020});
 await page.locator('[data-platform-page=modules]').click();
 await page.locator('[data-real-module-host][aria-busy=false]').waitFor();
 for (let attempt=0; ; attempt++) { try { await rename(join(projectRoot, '模组/新分类/移动后的模组'), join(projectRoot, '移出的模组')); break; } catch (error) { if (error.code !== 'EPERM' || attempt >= 9) throw error; await new Promise(resolve => setTimeout(resolve, 100)); } }
 await refresh.click(); await page.waitForFunction(() => document.querySelector('#platform-current-session').textContent.includes('从本地模组'));
 assert.equal(await page.locator('[data-real-module-template=module-1]').count(), 0); note('删除当前模组后刷新清除失效选择，页面继续可用');
 assert.deepEqual(errors, []); await writeFile(join(directory,'result.json'), JSON.stringify({checks,errors},null,2)); console.log('证据：' + directory);
} catch(error) { await page?.screenshot({ path: join(directory, 'failure.png'), fullPage: true }); console.error('证据：'+directory, errors); throw error; }
finally { await browser?.close(); await app.close(); }

