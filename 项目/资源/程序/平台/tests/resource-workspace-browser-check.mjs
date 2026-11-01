import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isolatePlatform, startIsolated } from './check-helpers.mjs';

const playwright = process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE || process.env.BATTLE_PLAYWRIGHT_MODULE
  || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwright));
const { directory, isolated } = await isolatePlatform('resource-workspace-');
const app = await startIsolated(isolated);
const browser = await chromium.launch({ executablePath: process.env.RPG_PLATFORM_BROWSER || process.env.BATTLE_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage(), checks = [], errors = [], outside = [];
page.on('pageerror', error => errors.push(error.message));
await context.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(app.url) || /^(data:|about:)/.test(url)) return route.continue();
  outside.push(url); return route.abort();
});
await page.route(app.url + '/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><link rel="stylesheet" href="/design-workspace.css"><link rel="stylesheet" href="/resource-workspace.css"></head><body><div id="platform-covers" style="--paper:#f5f6fa;--ink:#34374d;--quiet:#565b73;--shadow:#9a9cc5;--light:#d9f6ff;--accent:#e9b5d5;--active-surface:#e9edf9;--active-ink:#34374d;--gradient-start:#fff;--gradient-end:#f1dfea;--info-ink:#34374d;--cast:#9a9cc5"><section data-test-host style="height:760px;padding:20px"><p data-old-example>旧示例保留</p></section></div></body></html>` }));
const check = name => { checks.push(name); console.log('PASS: ' + name); };
try {
  await page.goto(app.url);
  await page.evaluate(async () => {
    const { createResourceWorkspace } = await import('/resource-workspace.mjs');
    const resources = [
      { id: 'merrow-2024', kind: '怪物', name: '梅洛 Merrow', path: '资源/怪物/M/梅洛2024.json', sourceBook: '怪物图鉴2025', rulesFamily: 'dnd-2024' },
      { id: 'merrow-other', kind: '怪物', name: '梅洛 Merrow', path: '资源/怪物/M/另一个来源.json', sourceBook: '独立来源', rulesFamily: 'dnd-2024' },
      { id: 'snapshot', kind: '怪物', name: '梅洛 Merrow', path: '资源/怪物/M/团内快照.json', sourceLabel: '团内基准快照' },
    ];
    window.actions = []; window.readRequests = 0;
    window.workspace = createResourceWorkspace({ root: document.querySelector('[data-test-host]'),
      api: async path => {
        if (path.startsWith('/api/project/resources?')) {
          const params = new URL(path, location.origin).searchParams;
          const matches = resources.filter(value => (!params.get('kind') || value.kind === params.get('kind')) && (!params.get('q') || value.name.includes(params.get('q'))));
          return { resources: matches, total: matches.filter(value => !value.sourceLabel).length, hiddenSnapshots: 1, issues: [] };
        }
        window.readRequests++;
        const id = new URL(path, location.origin).searchParams.get('resourceId');
        return { resource: resources.find(value => value.id === id), text: JSON.stringify({ source: { book: '怪物图鉴2025' }, edition: { rulesFamily: 'dnd-2024' }, statBlock: { hitPoints: 45, armorClass: 13 }, content: { text: '# 梅洛\n\n**基础定义**\n\n- 游泳\n- 三叉戟\n\n| 属性 | 值 |\n| --- | --- |\n| 力量 | 18 |\n\n![合成小图](portrait.png)\n\n![外部图](https://example.invalid/secret.png)\n\n<script>window.readerInjected=true</script>' } }), images: [{ source: 'portrait.png', mime: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==' }] };
      }, getSelected: () => ({ moduleName: '合成团' }), onReference: resource => window.actions.push(['reference', resource.id]), onRelease: (resource, player) => window.actions.push(['release', resource.id, player]), onReveal: resource => window.actions.push(['reveal', resource.id]), onOpenContent: (resource, content) => window.actions.push(['tab', resource.id, content.textContent]) });
    window.workspace.setActive(true); await window.workspace.load();
  });
  assert(await page.getByLabel('搜索本地资源').isVisible());
  assert.equal(await page.locator('[data-real-resource-kind]').count(), 7);
  assert.equal(await page.locator('[data-old-example]').isVisible(), false);
  check('搜索常驻可见，七类卡片接入原有外观，原示例DOM保留');
  await page.locator('[data-real-resource-kind="怪物"]').click();
  assert.equal(await page.locator('[data-real-resource-layout]').getAttribute('data-phase'), 'moving');
  await page.locator('[data-real-resource-layout][data-phase="open"]').waitFor();
  assert.equal(await page.locator('[data-project-resource]').count(), 2);
  await page.getByRole('button', { name: '收起', exact: true }).click();
  assert.equal(await page.locator('[data-real-resource-layout]').getAttribute('data-phase'), 'closed');
  check('分类卡片先移动，再展开真实资料抽屉；收起恢复卡片浏览');
  await page.getByLabel('搜索本地资源').fill('梅洛');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await page.locator('[data-real-resource-layout][data-phase="open"]').waitFor();
  assert.equal(await page.locator('[data-project-resource]').count(), 2);
  assert.equal(await page.locator('[data-project-resource="snapshot"]').count(), 0);
  assert(await page.locator('[data-project-resource="merrow-other"]').innerText().then(value => value.includes('独立来源')));
  assert.deepEqual(await page.evaluate(() => window.actions), []);
  check('搜索结果保留同名不同来源，团内快照不重复显示且未调用写操作');
  await page.locator('[data-project-resource="merrow-2024"]').getByRole('button', { name: '展开梅洛 Merrow', exact: true }).click();
  const preview = page.locator('[data-real-resource-preview="merrow-2024"]');
  await preview.waitFor();
  assert.equal(await preview.locator('h2').textContent(), '梅洛');
  assert.equal(await preview.locator('li').count(), 2);
  assert.equal(await preview.locator('table tbody td').count(), 2);
  assert.match(await preview.innerText(), /默认HP 45/);
  assert.equal(await preview.locator('img').count(), 1);
  assert(await preview.locator('img').evaluate(image => image.complete && image.naturalWidth > 0));
  assert.equal(await page.evaluate(() => window.readerInjected), undefined);
  assert.equal(await preview.locator('script').count(), 0);
  assert.match(await preview.innerText(), /图片未加载：外部图/);
  check('正文渲染标题、强调、列表、表格和本地图片，脚本作为文字显示且不加载外站图');
  await page.evaluate(async () => {
    const { renderResourcePreview, renderResourceMarkdown } = await import('/resource-workspace.mjs');
    const sample = document.createElement('div'); sample.dataset.readerCompatibility = '';
    sample.append(renderResourcePreview({ resource: { name: '旧版剧情引用' }, text: JSON.stringify({ description: '核对规则后再使用。', resolvedRuleResourceId: 'merrow-2024' }) }, { onOpenResource: id => { window.linkedResourceId = id; } }));
    sample.append(renderResourceMarkdown('![带空格的相对图片](<portrait test.png>)', [{ source: 'portrait test.png', mime: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==' }]));
    document.body.append(sample);
  });
  await page.getByRole('button', { name: '查看已核对的2024规则资料' }).click();
  assert.equal(await page.evaluate(() => window.linkedResourceId), 'merrow-2024');
  assert(await page.locator('[data-reader-compatibility] img').evaluate(image => image.complete && image.naturalWidth > 0));
  await page.locator('[data-reader-compatibility]').evaluate(element => element.remove());
  check('保留剧情引用跳转已核对规则资料，支持尖括号包裹的带空格图片路径');
  await page.getByRole('button', { name: '在对话标签中打开' }).click();
  assert.equal(await page.evaluate(() => window.actions.at(-1)[0]), 'tab');
  await page.locator('[data-project-resource="merrow-2024"]').getByRole('button', { name: '更多', exact: true }).click();
  await page.locator('[data-project-resource="merrow-2024"] [data-project-reference]').click();
  assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), ['reference', 'merrow-2024']);
  check('展开保留在资源页，明确选择后才打开对话标签，更多操作调用既有引用回调');
  for (const [width, height] of [[2560, 1600], [2560, 1440], [2048, 1536], [1920, 1440], [800, 700]]) {
    await page.setViewportSize({ width, height });
    assert(await page.getByLabel('搜索本地资源').isVisible());
    assert.equal(await page.locator('.real-resource-workspace').evaluate(element => element.scrollWidth > element.clientWidth + 2), false);
  }
  check('四种预设和窄窗均可找到搜索，资源工作区无横向溢出');
  await page.screenshot({ path: join(directory, '资源搜索与MD正文.png'), fullPage: true });
  await page.evaluate(() => window.workspace.setActive(false));
  assert.equal(await page.locator('[data-real-resource-preview]').count(), 0);
  assert(await page.locator('[data-old-example]').isVisible());
  check('切出DM视图会清空真实资料，恢复公共示例');
  assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  await writeFile(join(directory, 'report.json'), JSON.stringify({ checks, errors, outside }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, directory }));
} finally { await context.close(); await browser.close(); await app.close(); }
