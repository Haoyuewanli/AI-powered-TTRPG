import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRulePage, inspectRuleLibrary, importRuleLibrary, parseNavigation } from '../rule-library.mjs';

let repository = dirname(fileURLToPath(import.meta.url));
while (!existsSync(join(repository, 'AGENTS.md'))) { const parent = dirname(repository); if (parent === repository) throw new Error('Run inside this workspace'); repository = parent; }
const output = join(repository, '开发记录/临时/规则资料检查');
const page = body => '<html><head><title>合成资料</title><script>throw new Error("not executed")</script></head><body>' + body + '</body></html>';
const block = '<div class="stat-block"><h5 id="Synthetic">合成生物 Synthetic</h5><div class="sub-line">大型怪兽，中立</div><p>AC 12<br>HP 20（3d10+5）<br>速度 10尺，游泳30尺<br>力量 14 敏捷 12 体质 12 智力 7 感知 10 魅力 8<br>CR 1（XP200；PB+2）</p><h6>动作Actions</h6><p>合成爪击 Synthetic Claw。近战攻击检定：+4，触及5尺。命中：6（1d8+2）挥砍伤害。</p></div>';

test('2024 spells split by explicit headings and preserve source, tables, edition and disabled status', () => {
  const html = page('<h4 id="One">合成甲 One</h4><p>甲 &amp; 数据</p><table><tr><td>环阶</td><td>1</td></tr></table><h4 id="Two">合成乙 Two</h4><p>乙数据</p>');
  const result = parseRulePage({ html, sourcePath: 'topics/玩家手册2024/法术详述/1环.htm', revision: 'synthetic-revision' });
  assert.equal(result.entries.length, 2); assert.equal(result.entries[0].value.ruleCategory, 'spell');
  assert.equal(result.entries[0].value.edition.rulesFamily, 'dnd-2024'); assert.equal(result.entries[0].value.availability.enabled, false);
  assert(result.entries[0].value.content.text.includes('甲 & 数据')); assert(!result.entries[0].value.content.text.includes('乙数据'));
  assert.equal(result.entries[0].value.content.tables.length, 1); assert.equal(result.entries[0].value.source.anchor, 'One');
  assert(result.entries[0].value.source.path.startsWith('资源/资料/')); assert(result.entries[0].value.source.originalPath.startsWith('资料/'));
  assert.equal(parseRulePage({ html, sourcePath: 'topics/玩家手册2024/法术详述/1环.htm' }).entries[0].value.id, result.entries[0].value.id);
});

test('monsters and explicitly labelled NPCs remain separate and source numbers are copied without effect automation', () => {
  const html = page(block), monster = parseRulePage({ html, sourcePath: 'topics/怪物图鉴2025/怪兽/合成.htm' }), npc = parseRulePage({ html, sourcePath: 'topics/怪物图鉴/非玩家角色/合成.htm' });
  assert.equal(monster.entries.length, 1); assert.equal(monster.entries[0].value.resourceType, '怪物'); assert.equal(npc.entries[0].value.resourceType, 'NPC');
  const stat = monster.entries[0].value.statBlock; assert.equal(stat.armorClass, 12); assert.equal(stat.hitPoints, 20); assert.equal(stat.speedsFeet.swim, 30);
  assert.equal(stat.attacks[0].attackBonus, 4); assert.equal(stat.attacks[0].damageFormula, '1d8+2'); assert.equal(stat.attacks[0].effects, 'manual');
  assert.equal(monster.entries[0].value.edition.year, 2025); assert.equal(monster.entries[0].value.edition.rulesFamily, 'dnd-2024');
  assert.equal(npc.entries[0].value.edition.rulesFamily, 'dnd-2014');
});

test('legacy Word-like stat signatures retain each creature and general book pages remain references', () => {
  const html = page('<p><b>合成巨人 Giant</b><br>大型巨人，中立<br>护甲等级：14<br>生命值：35<br>速度：30尺<br>力量18 敏捷10 体质14 智力8 感知10 魅力7<br>挑战等级：2<br>动作：待主持</p>');
  const result = parseRulePage({ html, sourcePath: 'topics/怪物图鉴/巨人/合成巨人.htm' });
  assert.equal(result.entries.length, 1); assert.equal(result.entries[0].value.extraction.method, 'legacy-stat-signature'); assert.equal(result.entries[0].value.statBlock.hitPoints, 35);
  const reference = parseRulePage({ html: page('<h1>图鉴概述</h1><p>普通介绍。</p>'), sourcePath: 'topics/怪物图鉴/前言.htm' });
  assert.equal(reference.entries[0].value.resourceType, '规则');
});

test('feat and item headings/table rows are individual resources while page context is retained', () => {
  const feats = parseRulePage({ html: page('<h2>专长</h2><p><b><font color=#800000>合成警觉 Alert</font></b><br>起源专长</p><p><b><font color=#800000>合成技巧 Skilled</font></b><br>起源专长</p>'), sourcePath: 'topics/玩家手册2024/专长/起源.htm' });
  assert.equal(feats.entries.filter(entry => entry.value.ruleCategory === 'feat').length, 2);
  const items = parseRulePage({ html: page('<h2>武器</h2><table><tr><th>名称</th><th>伤害</th><th>重量</th></tr><tr><td>合成短剑</td><td>1d6</td><td>2磅</td></tr></table>'), sourcePath: 'topics/玩家手册2024/装备/武器.htm' });
  assert.equal(items.entries.filter(entry => entry.value.resourceType === '物品').length, 1);
  assert.equal(items.entries.find(entry => entry.value.resourceType === '物品').value.extraction.method, 'equipment-table-row');
});

test('unknown editions stay unclassified and playtest/third party sources never become enabled', () => {
  const result = parseRulePage({ html: page(block), sourcePath: 'topics/第三方/合成合作/测试.htm' });
  assert.equal(result.entries[0].value.edition.rulesFamily, null); assert.equal(result.entries[0].value.edition.sourceKind, 'third-party'); assert.equal(result.entries[0].value.availability.enabled, false);
  assert.equal(parseRulePage({ html: page('<p>资料</p>'), sourcePath: 'topics/怪物图鉴/Credits.htm' }).reason, 'administrative');
});

test('an explicitly labelled NPC navigation ancestor classifies its cards without copying all monsters as NPCs', () => {
  const nav = parseNavigation('<div class="nav-node"><a href="topics/艾伯伦：奇械锻炉/NPC.htm"><span id="l1">龙纹NPC</span></a><div id="d1"><div class="nav-node"><a href="topics/艾伯伦：奇械锻炉/数据卡/样本.htm"><span id="l2">样本</span></a></div></div></div>');
  const path = 'topics/艾伯伦：奇械锻炉/数据卡/样本.htm', entries = parseRulePage({ html: page(block), sourcePath: path, navigation: nav.get(path) }).entries;
  assert.equal(entries[0].value.resourceType, 'NPC'); assert(entries[0].value.source.npcClassificationEvidence.includes('龙纹NPC'));
  assert.equal(parseRulePage({ html: page(block), sourcePath: 'topics/怪物图鉴2025/怪兽/样本.htm' }).entries[0].value.resourceType, '怪物');
});

test('the full import accounts for every page, is repeatable and preserves conflicting existing files with a backup manifest', async () => {
  await mkdir(output, { recursive: true }); const directory = await mkdtemp(join(output, 'case-')), sourceRoot = join(directory, '网页'), projectRoot = join(directory, '项目');
  const put = async (path, content) => { await mkdir(dirname(join(sourceRoot, path)), { recursive: true }); await writeFile(join(sourceRoot, path), content); };
  await put('topics/玩家手册2024/法术详述/1环.htm', page('<h4 id="Test">合成法术 Test</h4><p>内容。</p>'));
  await put('topics/怪物图鉴2025/怪兽/合成.htm', page(block)); await put('topics/怪物图鉴/Credits.htm', page('<p>版权。</p>')); await put('index.html', page('<p>导航。</p>'));
  const plan = await inspectRuleLibrary({ sourceRoot, sourceRevision: 'synthetic' }); assert.equal(plan.stats.htmlPages, 4); assert.equal(plan.stats.accountedPages, 4); assert.equal(plan.stats.failedPages, 0);
  const first = await importRuleLibrary({ sourceRoot, sourceRevision: 'synthetic', projectRoot, backupRoot: join(directory, '备份一'), dryRun: false });
  assert.equal(first.written.length, 2); assert.equal(first.conflicts.length, 0);
  const second = await importRuleLibrary({ sourceRoot, sourceRevision: 'synthetic', projectRoot, backupRoot: join(directory, '备份二'), dryRun: false }); assert.equal(second.written.length, 0); assert.equal(second.unchanged.length, 2); assert.equal(second.conflicts.length, 0);
  const target = join(projectRoot, first.entries[0].path); await writeFile(target, '{"id":"user-owned","name":"保留用户版本"}');
  const third = await importRuleLibrary({ sourceRoot, sourceRevision: 'synthetic', projectRoot, backupRoot: join(directory, '备份三'), dryRun: false });
  assert(third.conflicts.some(entry => entry.path === first.entries[0].path)); assert((await readFile(target, 'utf8')).includes('user-owned'));
  assert((await readFile(join(directory, '备份三', first.entries[0].path), 'utf8')).includes('user-owned'));
  assert((await readdir(join(directory, '备份三'))).includes('写入前清单.json'));
});
