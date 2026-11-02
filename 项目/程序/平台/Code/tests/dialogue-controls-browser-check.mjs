import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isolatePlatform, startIsolated } from './check-helpers.mjs';

const playwright = process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE || process.env.BATTLE_PLAYWRIGHT_MODULE
  || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwright));
const { directory, isolated } = await isolatePlatform('dialogue-controls-');
const projectRoot = join(directory, '项目');
await mkdir(join(projectRoot, '模组/对话验收'), { recursive: true });
await writeFile(join(projectRoot, '模组/对话验收/模组调用.json'), JSON.stringify({ id: 'dialogue-test-run', name: '对话验收' }));
const app = await startIsolated(isolated, { projectRoot });
const browser = await chromium.launch({ executablePath: process.env.RPG_PLATFORM_BROWSER || process.env.BATTLE_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
  .catch(async error => { await app.close(); throw error; });
const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, deviceScaleFactor: 1 });
const errors = [], outside = [], checks = [], screenshots = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
await context.route('**/*', route => {
  const url = route.request().url();
  if (/^(data:|about:)/.test(url) || new URL(url).origin === app.url) return route.continue();
  outside.push(url); return route.abort();
});
const page = await context.newPage();
const check = name => { checks.push(name); console.log('PASS: ' + name); };
const screenshot = async name => { const path = join(directory, name + '.png'); await page.screenshot({ path, fullPage: true }); screenshots.push(path); };
const until = async read => { for (let i = 0; i < 100; i++) { if (await read()) return; await new Promise(resolve => setTimeout(resolve, 30)); } throw new Error('等待操作完成超时'); };

async function reachable(locator) {
  await locator.scrollIntoViewIfNeeded();
  const hit = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect(), x = (rect.left + rect.right) / 2, y = (rect.top + rect.bottom) / 2;
    const actual = document.elementFromPoint(x, y);
    return { ok: element === actual || element.contains(actual), text: element.textContent, actual: actual?.outerHTML.slice(0, 250), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, screen: { width: innerWidth, height: innerHeight } };
  });
  assert(hit.ok, JSON.stringify(hit));
}

try {
  await page.goto(app.url); await page.locator('#enter-dm').click();
  await page.locator('[data-platform-page=dialogue]').click();
  const input = page.locator('#dialogue-message');
  await input.fill('第一行'); await input.press('Control+Enter'); await page.keyboard.insertText('第二行');
  assert.equal(await input.inputValue(), '第一行\n第二行');
  assert.equal(await page.locator('.dialogue-message').count(), 5);
  await input.press('Enter'); await until(async () => await input.inputValue() === '');
  assert.equal(await page.locator('.dialogue-message').count(), 6);
  assert.equal(await page.locator('.dialogue-message').last().locator('p').textContent(), '第一行\n第二行');
  await input.fill('中文确认');
  await input.evaluate(element => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true }));
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '确认' }));
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
  });
  assert.equal(await input.inputValue(), '中文确认'); assert.equal(await page.locator('.dialogue-message').count(), 6);
  await input.press('Enter'); await until(async () => await input.inputValue() === '');
  assert.equal(await page.locator('.dialogue-message').count(), 7);
  check('Enter发送、Ctrl+Enter插入换行；中文输入确认不会发送，下一次Enter才发送');

  await page.evaluate(async () => {
    const { bindChatComposer } = await import('/chat-composer.mjs');
    const host = document.createElement('section'); host.dataset.composerProbe = '';
    const input = document.createElement('textarea'), send = document.createElement('button'); send.textContent = '发送';
    host.append(input, send); document.body.append(host);
    window.composerProbe = { count: 0, errors: 0, fail: false };
    bindChatComposer({ input, send, onSubmit: async () => {
      window.composerProbe.count++;
      await new Promise(resolve => setTimeout(resolve, 90));
      if (window.composerProbe.fail) throw new Error('合成保存失败');
    }, onError: () => window.composerProbe.errors++ });
  });
  const probe = page.locator('[data-composer-probe]'), probeInput = probe.locator('textarea'), probeSend = probe.locator('button');
  await probeInput.fill('仅发送一次'); await probeInput.press('Enter'); await probeInput.press('Enter');
  await probeSend.evaluate(element => element.click());
  assert.equal(await probeInput.evaluate(element => element.readOnly), true);
  await until(async () => !(await probeSend.isDisabled()));
  assert.equal(await page.evaluate(() => window.composerProbe.count), 1);
  assert.equal(await probeInput.inputValue(), '');
  await probeInput.fill('鼠标选择中文候选后发送');
  await probeInput.evaluate(element => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  });
  await new Promise(resolve => setTimeout(resolve, 100));
  await probeInput.press('Enter'); await until(async () => !(await probeSend.isDisabled()));
  assert.equal(await page.evaluate(() => window.composerProbe.count), 2);
  assert.equal(await probeInput.inputValue(), '');
  await page.evaluate(() => { window.composerProbe.fail = true; });
  await probeInput.fill('失败保留草稿'); await probeSend.click();
  await until(async () => !(await probeSend.isDisabled()));
  assert.equal(await probeInput.inputValue(), '失败保留草稿');
  assert.equal(await page.evaluate(() => window.composerProbe.errors), 1);
  assert.equal(await probeInput.evaluate(element => element.readOnly), false);
  await probe.evaluate(element => element.remove());
  check('保存期间重复Enter和按钮不重复提交；失败后草稿保留，输入与发送按钮恢复');

  await page.locator('[data-dialogue-source=resource-characters]').click();
  await page.locator('[data-dialogue-source=chat]').click();
  await input.fill('保留未发送文字');
  const presets = ['2560x1600', '2560x1440', '2048x1536', '1920x1440'];
  const layouts = ['single', 'columns', 'rows', 'grid', 'left-stack', 'right-stack'];
  for (const size of [{ width: 1600, height: 1050 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(size);
    for (const preset of presets) {
      await page.locator('select[data-display-preset]:visible').first().selectOption(preset);
      for (const layout of layouts) {
        await page.locator('#dialogue-layout').selectOption(layout);
        await reachable(page.locator('#dialogue-layout'));
        await reachable(page.locator('[data-dialogue-source=resource-characters]'));
        await page.locator('[data-dialogue-source=chat]').click();
        await reachable(page.locator('.dialogue-send'));
        for (const control of await page.locator('.dialogue-pane-controls button:visible').all()) await reachable(control);
        assert.equal(await input.inputValue(), '保留未发送文字');
      }
      await screenshot('对话-' + size.width + '-' + preset);
    }
  }
  check('两个桌面尺寸下四预设×六分屏布局的布局选择、标签、发送及底部移动按钮均可滚动到达且未被遮挡');

  await page.locator('#dialogue-layout').selectOption('single');
  await page.getByRole('button', { name: '关闭冒险群聊 · 示例', exact: true }).click();
  await page.locator('[data-dialogue-source=chat]').click();
  assert.equal(await input.inputValue(), '保留未发送文字');
  assert.equal(await page.locator('.dialogue-message').count(), 7);
  check('最近打开的资料入口保留；关闭重开和分屏切换保留当前页面消息与草稿');

  await input.fill('');
  await page.locator('[data-platform-page=modules]').click();
  await page.locator('[data-real-run=dialogue-test-run]').waitFor({ state: 'attached' });
  const run = page.locator('[data-real-run=dialogue-test-run]');
  if (!await run.isVisible()) await page.getByText('其他已有团 · 1', { exact: true }).click();
  await run.click(); await page.locator('[data-project-select-module=dialogue-test-run]').click();
  await until(async () => (await page.locator('[data-platform-view=dialogue] [data-module-context]').textContent()).includes('对话验收'));
  await page.locator('[data-platform-page=dialogue]').click();
  const tools = page.locator('[data-project-panel=dialogue]');
  await tools.locator('summary').click();
  const realInput = page.locator('[data-project-chat-input]'), realSend = page.locator('[data-project-chat-send]');
  await realInput.waitFor();
  await page.locator('#dialogue-layout').selectOption('grid');
  await realInput.fill('真实群聊第一行'); await realInput.press('Control+Enter'); await page.keyboard.insertText('第二行');
  await realInput.press('Enter'); await until(async () => await realInput.inputValue() === '');
  const chatPath = join(projectRoot, '模组/对话验收/对话/对话验收/对话.md');
  const saved = await readFile(chatPath, 'utf8');
  assert(saved.includes('真实群聊第一行\n第二行'));
  await page.route(app.url + '/api/project/dialogue', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '合成保存失败' }) }));
  await realInput.fill('真实保存失败保留'); await realInput.press('Enter');
  await until(async () => !(await realSend.isDisabled()));
  assert.equal(await realInput.inputValue(), '真实保存失败保留');
  assert.equal(await readFile(chatPath, 'utf8'), saved);
  await page.unroute(app.url + '/api/project/dialogue');
  await realInput.fill('');
  let releaseRead;
  const readGate = new Promise(resolve => { releaseRead = resolve; });
  let readWaiting = false;
  await page.route(app.url + '/api/project/dialogue-read', async route => { readWaiting = true; await readGate; await route.continue(); });
  try {
    if (await tools.evaluate(element => element.open)) await tools.locator('summary').click();
    await tools.locator('summary').click();
    await until(async () => readWaiting);
    await reachable(page.locator('#dialogue-layout')); await reachable(realSend);
    assert.equal(await tools.evaluate(element => element.open), true);
  } finally { releaseRead(); }
  await until(async () => !(await tools.evaluate(element => element.open)));
  await page.unroute(app.url + '/api/project/dialogue-read');
  for (const preset of presets) {
    await page.locator('select[data-display-preset]:visible').first().selectOption(preset);
    for (const layout of layouts) {
      await page.locator('#dialogue-layout').selectOption(layout);
      await reachable(realInput); await reachable(realSend);
      await reachable(page.locator('#dialogue-layout'));
    }
  }
  await screenshot('真实群聊-四预设可达');
  check('从正常模组入口继续合成团并打开群聊，快捷键实际写盘；失败保留草稿且磁盘不变，四预设六分屏下输入与发送可到达');
  assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  await writeFile(join(directory, 'result.json'), JSON.stringify({ checks, screenshots, errors, outside }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, directory }, null, 2));
} catch (error) {
  await screenshot('失败时界面').catch(() => {});
  throw error;
} finally { await browser.close(); await app.close(); }
