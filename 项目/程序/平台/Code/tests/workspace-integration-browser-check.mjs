import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { isolatePlatform, startIsolated } from './check-helpers.mjs';

const playwright = process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE || process.env.BATTLE_PLAYWRIGHT_MODULE || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwright));
const { directory, isolated } = await isolatePlatform('workspace-integration-');
const projectRoot = join(directory, '项目'), protectedFiles = new Map();
const digest = value => createHash('sha256').update(value).digest('hex');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
async function source(path, value) {
  const target = join(projectRoot, path), content = typeof value === 'object' && !Buffer.isBuffer(value) ? JSON.stringify(value, null, 2) : value;
  await mkdir(join(target, '..'), { recursive: true }); await writeFile(target, content); protectedFiles.set(target, digest(content));
}
for (const category of ['单人短团', '多人短团', '长团']) await mkdir(join(projectRoot, '模组/预处理', category), { recursive: true });
for (const [id, category] of [['alpha', '多人短团'], ['beta', '长团']]) {
  await source(`模组/预处理/${category}/${id}/预处理.json`, { schemaVersion: 1, moduleId: id, title: '同名合成模组', source: { kind: 'synthetic' }, reviewStatus: 'candidate', storyNodes: [{ id: id + '-node' }], maps: [], encounterTemplates: [] });
  await source(`模组/预处理/${category}/${id}/封面.png`, png);
}
await source('模组/合成甲团/module.json', { id: 'run-alpha', name: '合成甲团', templateId: 'alpha' });
await source('模组/合成乙团/module.json', { id: 'run-beta', name: '合成乙团', templateIdentity: { moduleId: 'beta' } });
const monster = { id: 'merrow-base', name: '合成梅洛 Merrow', englishName: 'Merrow', aliases: ['海中巨人'], tags: ['训练索引'], edition: { rulesFamily: 'dnd-2024' }, source: { book: '合成怪物图鉴2025' }, statBlock: { armorClass: 13, hitPoints: 45 }, content: { text: '# 合成梅洛阅读\n\n这里是**共享基础定义**，默认HP45。\n\n![合成本地图](图.png)\n\n<script>window.resourceInjected=true</script>' } };
await source('资源/怪物/M/梅洛.json', monster);
await source('资源/怪物/M/图.png', png);
await source('资源/怪物/M/梅洛其他来源.json', { ...monster, id: 'merrow-other', source: { book: '另一个合成来源' }, content: { text: '# 独立来源\n同名条目保留独立身份。' } });
await source('资源/怪物/M/团内快照.json', { ...monster, id: 'merrow-snapshot', projection: { format: 'battle-resource-v1' }, statBlock: { armorClass: 13, hitPoints: 32 } });
const app = await startIsolated(isolated, { projectRoot });
let browser;
const checks = [], errors = [], outside = [], writes = [], screenshots = [];
const pass = name => { checks.push(name); console.log('PASS: ' + name); };
try {
  browser = await chromium.launch({ executablePath: process.env.RPG_PLATFORM_BROWSER || process.env.BATTLE_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, deviceScaleFactor: 1 });
  await context.route('**/*', route => {
    const value = route.request().url();
    if (value.startsWith('data:') || new URL(value).origin === app.url) return route.continue();
    outside.push(value); return route.abort();
  });
  const page = await context.newPage(); page.on('pageerror', error => { errors.push(error.stack || error.message); console.error(error.stack || error.message); });
  page.on('request', request => { if (request.method() === 'POST') writes.push({ path: new URL(request.url()).pathname, body: request.postData() }); });
  const nav = name => page.locator('[data-platform-page=' + name + ']').click();
  const shot = async name => { const path = join(directory, name + '.png'); await page.screenshot({ path, fullPage: true }); screenshots.push(path); };
  const selected = () => page.evaluate(async () => { const response = await fetch('/api/project/status', { headers: { 'X-Platform-Session': sessionStorage.getItem('platform-session') } }); return (await response.json()).selected; });
  async function reachable(locator) {
    await locator.scrollIntoViewIfNeeded();
    assert.equal(await locator.evaluate(node => { const rect = node.getBoundingClientRect(); const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2); return node === target || node.contains(target); }), true, 'Control should be reachable without another panel covering its center');
  }
  await page.goto(app.url); await page.locator('#enter-dm').click();
  await page.waitForFunction(() => !!sessionStorage.getItem('platform-session'));
  await page.locator('#platform-go-modules').click();
  await page.locator('[data-real-module-template=alpha]').waitFor();
  await page.waitForFunction(() => { const image = document.querySelector('[data-real-module-template=alpha] img'); return image?.complete && image.naturalWidth > 0; });
  assert.equal(await selected(), null);
  assert.equal(await page.locator('[data-real-run=run-alpha]').count(), 1);
  assert.equal(await page.locator('[data-real-run=run-beta]').count(), 0);
  assert.equal(await page.locator('[data-project-panel=modules]').isVisible(), false);
  pass('首页正常入口显示真实封面及关联团，读取封面成功，不靠附属工具区');
  await page.locator('[data-real-module-category="长团"]').click();
  assert.equal(await page.locator('[data-real-run=run-alpha]').count(), 0);
  assert.equal(await page.locator('[data-real-run=run-beta]').count(), 1);
  await page.locator('[data-real-run=run-beta]').click();
  assert.equal(await selected(), null);
  assert.equal(writes.filter(item => item.path.endsWith('/select-module')).length, 0);
  pass('同名模板按稳定ID区分团，点封面分类和团概况均不切团');
  await page.locator('[data-real-module-category="多人短团"]').click();
  await page.locator('[data-real-run=run-alpha]').click();
  await page.locator('[data-project-select-module=run-alpha]').click();
  await page.waitForFunction(() => document.querySelector('#platform-current-session')?.textContent.includes('合成甲团'));
  assert.equal((await selected()).moduleId, 'run-alpha');
  assert.equal(writes.filter(item => item.path.endsWith('/select-module')).length, 1);
  assert.equal(writes.filter(item => item.path.startsWith('/api/battle/start')).length, 0);
  await shot('module-real'); pass('明确继续才切换所属团，普通团不启动战斗进程');
  await nav('resources'); await page.getByLabel('搜索本地资源').fill('Merrow'); await page.getByLabel('搜索本地资源').press('Enter');
  await page.locator('[data-project-resource=merrow-base]').waitFor();
  assert.equal(await page.locator('[data-project-resource=merrow-snapshot]').count(), 0);
  assert.equal(await page.locator('[data-project-resource=merrow-other]').count(), 1);
  assert.match(await page.locator('.real-resource-status').innerText(), /2条共享基础资料.*1条团内快照/);
  pass('正常资源入口搜索全库，隐藏团快照且保留同名不同来源');
  await page.locator('[data-project-resource=merrow-base]').getByRole('button', { name: '展开合成梅洛 Merrow', exact: true }).click();
  const reader = page.locator('.real-resource-reader'); await reader.locator('h2', { hasText: '合成梅洛阅读' }).waitFor();
  await page.waitForFunction(() => { const image = document.querySelector('.real-resource-reader img'); return image?.complete && image.naturalWidth > 0; });
  assert.match(await reader.innerText(), /默认HP 45/);
  assert.equal(await page.evaluate(() => window.resourceInjected), undefined);
  assert.equal(await reader.locator('script').count(), 0);
  await shot('resource-reading'); pass('资料展开渲染Markdown和本地图片，默认HP45且正文脚本不执行');
  await reader.getByRole('button', { name: '在对话标签中打开', exact: true }).click();
  await page.locator('[data-platform-view=dialogue]:visible').waitFor();
  await page.locator('.dialogue-panel [data-real-resource-preview=merrow-base]').waitFor();
  assert.equal((await selected()).moduleId, 'run-alpha');
  assert.equal(await page.locator('.dialogue-source[data-dialogue-source^=real-]').count() > 0, true);
  pass('资源可进入真实对话标签，保留最近打开入口且不切团');
  const chatPanel = page.locator('[data-project-panel=dialogue]');
  await chatPanel.locator('summary').click(); await page.locator('[data-project-chat-input]').waitFor();
  if (await chatPanel.evaluate(node => node.open)) await chatPanel.locator('summary').click();
  const input = page.locator('[data-project-chat-input]'), send = page.locator('[data-project-chat-send]');
  for (const preset of ['2560x1600', '2560x1440', '2048x1536', '1920x1440']) {
    const [width, height] = preset.split('x').map(Number); await page.setViewportSize({ width, height });
    await page.locator('select[data-display-preset]:visible').first().selectOption(preset);
    await reachable(input); await reachable(send); await reachable(page.locator('#dialogue-layout'));
    await nav('modules'); await page.locator('[data-real-module-host][aria-busy=false]').waitFor(); await page.locator('[data-real-run=run-alpha]').waitFor();
    await reachable(page.locator('[data-project-refresh-modules]'));
    if (!await page.locator('[data-project-select-module=run-alpha]').isVisible()) await page.locator('[data-real-run=run-alpha]').click();
    await reachable(page.locator('[data-project-select-module=run-alpha]'));
    await nav('resources'); await reachable(page.getByLabel('搜索本地资源')); await reachable(page.locator('.real-resource-toolbar button[type=submit]'));
    await nav('dialogue');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  pass('四显示预设下模组刷新/继续、资源搜索、聊天输入/发送/布局控件可到达，无横向溢出');
  await input.fill('整合第一行'); await input.press('Control+Enter'); await input.type('第二行');
  assert.equal(await input.inputValue(), '整合第一行\n第二行');
  assert.equal(writes.filter(item => item.path.endsWith('/dialogue')).length, 0);
  await input.press('Enter'); await page.waitForFunction(() => document.querySelector('[data-project-chat-input]')?.value === '');
  assert.equal(writes.filter(item => item.path.endsWith('/dialogue')).length, 1);
  assert.match(await page.locator('[data-project-chat-log]').innerText(), /整合第一行\n第二行/);
  await shot('dialogue-real'); pass('真实聊天Ctrl+Enter换行，Enter只发送一次并读取已保存消息');
  for (const [path, expected] of protectedFiles) assert.equal(digest(await readFile(path)), expected, 'Existing synthetic input changed: ' + path);
  assert.equal(outside.length, 0); assert.deepEqual(errors, []);
  pass('合成源资料、旧团元数据与快照字节不变，无外部请求或页面错误');
  await writeFile(join(directory, 'result.json'), JSON.stringify({ checks, errors, outside, writes, screenshots }, null, 2));
  console.log(JSON.stringify({ directory, checks: checks.length, screenshots }));
} finally { await browser?.close(); await app.close(); }
