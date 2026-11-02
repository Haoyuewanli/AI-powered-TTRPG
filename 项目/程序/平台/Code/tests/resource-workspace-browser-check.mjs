import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isolatePlatform, startIsolated } from './check-helpers.mjs';

const playwright = process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE || process.env.BATTLE_PLAYWRIGHT_MODULE
  || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwright));
const { directory, isolated } = await isolatePlatform('resource-library-ui-');
const app = await startIsolated(isolated);
const browser = await chromium.launch({ executablePath: process.env.RPG_PLATFORM_BROWSER || process.env.BATTLE_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage(), checks = [], errors = [], outside = [];
page.on('pageerror', error => errors.push(error.message));
await context.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(app.url) || /^(data:|about:)/.test(url)) return route.continue();
  outside.push(url); return route.abort();
});
await page.route(app.url + '/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><link rel="stylesheet" href="/design-workspace.css"><link rel="stylesheet" href="/resource-workspace.css"></head><body><div id="platform-covers" style="--paper:#f5f6fa;--ink:#34374d;--quiet:#565b73;--shadow:#9a9cc5;--light:#d9f6ff;--accent:#e9b5d5;--active-surface:#e9edf9;--active-ink:#34374d;--gradient-start:#fff;--gradient-end:#f1dfea;--info-ink:#34374d;--cast:#9a9cc5"><section data-test-host style="height:860px;padding:20px"><p data-old-example>旧示例保留</p></section></div></body></html>' }));
const check = name => { checks.push(name); console.log('PASS: ' + name); };
try {
  await page.goto(app.url);
  await page.evaluate(async () => {
    const { createResourceWorkspace } = await import('/resource-workspace.mjs');
    window.resources = [
      { id: 'world-a', kind: '怪物', name: '阿尔法', initial: 'A', path: '世界通用资源/怪物/A/阿尔法/描述.md', scope: 'world' },
      { id: 'world-b', kind: '怪物', name: '贝塔', initial: 'B', path: '世界通用资源/怪物/B/贝塔/描述.md', scope: 'world' },
      { id: 'module-a', kind: '地点', name: '甲模组港口', initial: 'A', moduleId: 'm1', moduleName: '甲模组', scope: 'module', path: '模组/甲模组/港口/描述.md' },
      { id: 'module-b', kind: '信件', name: '乙模组密信', initial: 'B', moduleId: 'm2', moduleName: '乙模组', scope: 'module', path: '模组/乙模组/密信/描述.md' },
      { id: 'world-letter', kind: '自定义目录', name: '通用信笺', initial: 'T', scope: 'world', path: '世界通用资源/自定义目录/T/通用信笺/描述.md' },
    ];
    window.actions = []; window.requests = []; window.role = 'dm'; window.revision = 4; window.shares = {};
    window.selected = { moduleId: 'm1', runId: 'r1', moduleName: '甲模组', runName: '甲团' };
    window.workspace = createResourceWorkspace({ root: document.querySelector('[data-test-host]'), getRole: () => window.role,
      api: async (path, body) => {
        window.requests.push({ path, body });
        const url = new URL(path, location.origin), id = url.searchParams.get('resourceId');
        if (url.pathname === '/api/library/catalog') {
          const params = url.searchParams, initials = params.get('initials')?.split(',').filter(Boolean) || [], modules = params.get('modules')?.split(',').filter(Boolean) || [];
          const matches = window.resources.filter(value => (!params.get('kind') || (params.get('kind') === '模组' ? value.scope === 'module' : value.kind === params.get('kind') && value.scope === 'world')) && (!params.get('q') || value.name.includes(params.get('q'))) && (!initials.length || initials.includes(value.initial)) && (!modules.length || modules.includes(value.moduleId)));
          return { resources: matches, kinds: ['地点', '信件', '怪物', '自定义目录'], modules: [{ id: 'm1', name: '甲模组' }, { id: 'm2', name: '乙模组' }], issues: [] };
        }
        if (url.pathname === '/api/library/context') return { selected: window.selected, characters: [{ id: 'c1', name: '角色甲', playerId: 'p1' }, { id: 'c2', name: '角色乙', playerId: 'p2' }], revision: window.revision };
        if (url.pathname === '/api/library/shares') {
          if (body) { if (body.expectedRevision !== window.revision) throw new Error('开放版本已变化'); window.shares[body.resourceId] = body.characterIds; window.revision++; window.actions.push(['share', body]); return { ...body, revision: window.revision }; }
          return { characterIds: window.shares[id] || [], revision: window.revision };
        }
        if (url.pathname === '/api/library/read') return { resource: window.resources.find(value => value.id === id), text: '# ' + window.resources.find(value => value.id === id).name + '\n\n**完整MD正文**\n\n- 第一项\n- 第二项\n\n| 属性 | 值 |\n| --- | --- |\n| 来源 | 合成资料 |\n\n![本地图](<portrait test.png>)\n\n<script>window.readerInjected=true</script>', images: [{ source: 'portrait test.png', mime: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==' }] };
        throw new Error('Unexpected API ' + path);
      }, onReference: resource => window.actions.push(['reference', resource.id]), onReveal: resource => window.actions.push(['reveal', resource.id]), onOpenContent: (resource, content) => window.actions.push(['tab', resource.id, content.textContent]) });
    window.workspace.setActive(true); await window.workspace.load();
  });
  assert(await page.getByLabel('搜索本地资源').isVisible());
  assert.deepEqual((await page.locator('[data-real-resource-kind]').evaluateAll(elements => elements.map(element => element.dataset.realResourceKind))).sort(), ['模组', '怪物', '自定义目录'].sort());
  assert.equal(await page.locator('[data-old-example]').isVisible(), false);
  check('常驻搜索与动态目录卡片，不再写死七类；模组资源统一归模组卡');
  const initials = page.locator('[data-resource-initial-filter]');
  await initials.locator('summary').click();
  await initials.getByLabel('A', { exact: true }).check();
  await initials.getByLabel('B', { exact: true }).check();
  await page.waitForFunction(() => window.requests.some(request => request.path.includes('initials=A%2CB')));
  await initials.locator('summary').click();
  const modules = page.locator('[data-resource-module-filter]');
  await modules.locator('summary').click();
  await modules.getByLabel('甲模组', { exact: true }).check();
  await modules.getByLabel('乙模组', { exact: true }).check();
  await page.waitForFunction(() => window.requests.some(request => request.path.includes('modules=m1%2Cm2')));
  await modules.locator('summary').click();
  assert.equal(await page.locator('[data-project-resource]').count(), 2);
  assert.deepEqual(await page.evaluate(() => window.actions), []);
  check('A-Z和模组下拉可多选，筛选仅浏览且不改变当前团或写资料');
  await page.evaluate(() => window.workspace.openResource('module-a'));
  const row = page.locator('[data-project-resource="module-a"]'), preview = page.locator('[data-real-resource-preview="module-a"]');
  await preview.waitFor();
  assert.equal(await page.getByLabel('本地资源类型').inputValue(), '模组');
  const geometry = await row.evaluate(element => ({ name: element.querySelector('.real-resource-name').getBoundingClientRect().bottom, controls: element.querySelector('.real-resource-row-controls').getBoundingClientRect().top }));
  assert(geometry.controls >= geometry.name);
  const areas = await page.locator('.real-resource-body').evaluate(element => ({ body: element.getBoundingClientRect().width, reader: element.querySelector('.real-resource-reader').getBoundingClientRect().width }));
  assert(Math.abs(areas.reader - (areas.body - 20) / 2) < 2);
  assert.equal(await preview.locator('h2').textContent(), '甲模组港口');
  assert.equal(await preview.locator('li').count(), 2);
  assert.equal(await preview.locator('table').count(), 1);
  assert(await preview.locator('img').evaluate(image => image.complete && image.naturalWidth > 0));
  assert.equal(await page.evaluate(() => window.readerInjected), undefined);
  check('深链接自动选模组卡并定位展开，全部控件位于名字下，右半屏安全渲染MD和本地图片');
  const roleMenu = row.locator('[data-resource-character-select]');
  await roleMenu.locator('summary').click();
  await roleMenu.getByLabel('角色甲 · p1', { exact: true }).check();
  await roleMenu.getByLabel('角色乙 · p2', { exact: true }).check();
  await row.locator('[data-resource-share-apply]').click();
  await page.waitForFunction(() => window.shares['module-a']?.length === 2);
  assert.equal(await page.evaluate(() => window.actions.at(-1)[1].expectedRevision), 4);
  await roleMenu.getByRole('button', { name: '清除选择' }).click();
  await row.locator('[data-resource-share-apply]').click();
  await page.waitForFunction(() => window.shares['module-a']?.length === 0);
  check('当前团按角色多选开放，携带版本提交；清空选择可撤回');
  await page.locator('[data-project-resource="module-b"] [data-resource-expand]').click();
  assert.equal(await page.locator('[data-real-resource-preview]').count(), 1);
  assert.equal(await page.locator('[data-real-resource-preview="module-a"]').count(), 0);
  assert.equal(await row.locator('[data-resource-expand]').textContent(), '展开');
  const otherRow = page.locator('[data-project-resource="module-b"]');
  assert(await otherRow.locator('[data-resource-share-apply]').isDisabled());
  assert.equal(await otherRow.locator('[data-resource-character-select] summary').getAttribute('aria-disabled'), 'true');
  await otherRow.locator('[data-resource-expand]').click();
  assert.equal(await page.locator('[data-real-resource-preview]').count(), 0);
  check('只能展开一项，展开收起按钮同步；其他模组的角色开放控件禁用');
  await page.evaluate(async () => { window.role = 'player'; window.workspace.clear(); await window.workspace.load(); await window.workspace.openResource('module-a'); });
  assert.equal(await page.locator('[data-resource-character-select]').count(), 0);
  assert.equal(await page.locator('[data-project-reference]').count(), 0);
  assert(await page.locator('[data-real-resource-preview="module-a"]').isVisible());
  check('Player界面仅呈现获准读取，深链接可定位，写操作不出现');
  for (const [width, height] of [[2560, 1600], [2560, 1440], [2048, 1536], [1920, 1440]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.locator('.real-resource-workspace').evaluate(element => element.scrollWidth > element.clientWidth + 2), false);
    assert(await page.locator('.real-resource-reader').evaluate(element => element.clientHeight > 0 && element.getBoundingClientRect().right <= document.documentElement.clientWidth));
  }
  check('四预设右侧正文固定在工作区内，资源区不横向溢出');
  await page.screenshot({ path: join(directory, '资源目录与右半屏MD.png'), fullPage: true });
  await page.evaluate(() => window.workspace.setActive(false));
  assert.equal(await page.locator('[data-real-resource-preview]').count(), 0);
  assert(await page.locator('[data-old-example]').isVisible());
  check('身份退出清空真实资源与正文，保留公共示例');
  assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  await writeFile(join(directory, 'report.json'), JSON.stringify({ checks, errors, outside }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, directory }));
} finally { await context.close(); await browser.close(); await app.close(); }
