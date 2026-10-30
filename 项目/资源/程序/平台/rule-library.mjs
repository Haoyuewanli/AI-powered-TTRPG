import { readdir, readFile, writeFile, mkdir, lstat, copyFile, realpath, open, link, unlink } from 'node:fs/promises';
import { resolve, join, dirname, relative, isAbsolute, sep, posix } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
export const RULE_LIBRARY_PARSER = 'bq-offline-v1';
const currentBooks = new Set(['玩家手册2024', '城主指南2024', '怪物图鉴2025', '贤者谏言2025', '艾伯伦：奇械锻炉']);
const bestiaries = new Set(['怪物图鉴', '怪物图鉴2025', '瓦罗怪物指南', '多元宇宙的怪物', '魔邓肯的众敌卷册', '费资本的巨龙宝库', '布布的星界怪兽展', '巨人之荣耀']);
const knownLegacy = new Set(['玩家手册', '城主指南', '怪物图鉴', '瓦罗怪物指南', '多元宇宙的怪物', '魔邓肯的众敌卷册', '珊娜萨的万事指南', '塔莎的万事坩埚', '费资本的巨龙宝库', '布布的星界怪兽展', '巨人之荣耀', '剑湾冒险者指南', '塞洛斯之神话奥德赛', '拉尼卡公会长指南', '斯翠海文：混沌研习', '星界冒险者指南', '艾伯伦寻路者指南', '艾伯伦：从终末战争中崛起', '艾奎兹玄有限责任公司', '范·里希腾的鸦阁魔域指南', '荒洲探险家指南', '莫提的位面游记', '印记城与外域', '万象无常书', '龙枪：龙后之影']);
const entities = { nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', hellip: '…', middot: '·', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', times: '×', divide: '÷', minus: '−', copy: '©', reg: '®', trade: '™', deg: '°', frac12: '½', frac14: '¼', frac34: '¾', shy: '' };
const collator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', { sensitivity: 'base' });
const initials = [['A', '阿'], ['B', '八'], ['C', '嚓'], ['D', '咑'], ['E', '妸'], ['F', '发'], ['G', '旮'], ['H', '哈'], ['J', '讥'], ['K', '咔'], ['L', '垃'], ['M', '妈'], ['N', '拿'], ['O', '噢'], ['P', '妑'], ['Q', '七'], ['R', '呥'], ['S', '撒'], ['T', '他'], ['W', '哇'], ['X', '夕'], ['Y', '丫'], ['Z', '帀']];
const npcPath = /(?:^|\/)[^/]*(?:非玩家角色|非玩家人物|命名人物|具名人物|重要人物|NPC)[^/]*(?:\/|\.html?$)/i;
const administrative = /(?:^|\/)(?:Credits|鸣谢|前言版权|封面|index|目录|toc)(?:\.[^/]+)?$/i;
const enc = new TextDecoder('utf-8', { fatal: true });
const encodeJson = value => JSON.stringify(value, null, 2) + '\n';

export function decodeHtml(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z\d]+);/gi, (whole, key) => {
    if (key[0] === '#') { const point = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1)); return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole; }
    return entities[key.toLowerCase()] ?? whole;
  });
}

function bodyOf(html) { return (html.match(/<body\b[^>]*>([\s\S]*?)(?:<\/body>|$)/i)?.[1] || html.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')).replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ''); }
export function htmlText(html) {
  const text = bodyOf(html).replace(/<\/?(?:p|div|h[1-6]|li|ul|ol|table|tr|blockquote|hr)\b[^>]*>/gi, '\n').replace(/<br\b[^>]*>/gi, '\n').replace(/<\/t[dh]\s*>/gi, '\t').replace(/<[^>]*>/g, '');
  return decodeHtml(text).replace(/\r/g, '').split('\n').map(line => line.replace(/[\t ]+/g, ' ').trim()).filter(Boolean).join('\n');
}
const clean = html => htmlText(html).replace(/\s+/g, ' ').trim();
function headingList(html) { return [...html.matchAll(/<(h[1-6])\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)].map(match => ({ level: Number(match[1].slice(1)), title: clean(match[3]), anchor: match[2].match(/\bid\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i)?.slice(1).find(Boolean) || null, position: match.index, end: match.index + match[0].length })); }
function tablesOf(html) {
  return [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi)].map(table => ({ rows: [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map(row => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/gi)].map(cell => clean(cell[1]))).filter(row => row.length) })).filter(table => table.rows.length);
}
function namedFonts(html) {
  const found = [];
  for (const match of html.matchAll(/<font\b([^>]*)>([\s\S]*?)<\/font\s*>/gi)) {
    if (!/\bcolor\s*=\s*["']?(?:#800000|maroon)\b/i.test(match[1])) continue;
    const start = Math.max(html.lastIndexOf('<p', match.index), html.lastIndexOf('<P', match.index));
    if (start < 0 || start + 600 < match.index) continue;
    const prefix = html.slice(start, match.index).replace(/<[^>]*>/g, '').trim();
    const title = clean(match[2]);
    if (!prefix && title.length > 1 && title.length < 180 && !/^(?:动作|特质|反应|附赠动作|传奇动作|近战|远程)/.test(title)) found.push({ title, anchor: null, position: start });
  }
  return found;
}
function classBlocks(html) {
  const stack = [], found = [];
  for (const match of html.matchAll(/<\/?div\b[^>]*>/gi)) {
    if (/^<\//.test(match[0])) { const start = stack.pop(); if (start?.stat) found.push({ start: start.position, end: match.index + match[0].length }); }
    else stack.push({ position: match.index, stat: /\bclass\s*=\s*(?:"[^"]*\bstat-block\b[^"]*"|'[^']*\bstat-block\b[^']*'|stat-block\b)/i.test(match[0]) });
  }
  return found.sort((a, b) => a.start - b.start);
}

export function parseNavigation(html) {
  const stack = [], nodes = [], byPath = new Map();
  for (const match of html.matchAll(/<\/?div\b[^>]*>|<a\b[^>]*>[\s\S]*?<\/a\s*>/gi)) {
    if (/^<\/div/i.test(match[0])) stack.pop();
    else if (/^<div/i.test(match[0])) {
      const node = /class\s*=\s*["']nav-node["']/i.test(match[0]) ? { parent: stack.findLast(entry => entry.node)?.node, title: null, path: null } : null;
      if (node) nodes.push(node); stack.push({ node });
    } else {
      const label = match[0].match(/<span\b[^>]*id=["']l\d+["'][^>]*>([\s\S]*?)<\/span>/i), href = match[0].match(/href=["']([^"']+)["']/i), node = stack.findLast(entry => entry.node)?.node;
      if (label && href && node) { node.title = clean(label[1]); try { node.path = decodeURIComponent(decodeHtml(href[1])).split('#')[0].replaceAll('\\', '/'); } catch { node.path = null; } }
    }
  }
  for (const node of nodes) if (node.path?.startsWith('topics/')) {
    const trail = []; for (let current = node; current; current = current.parent) if (current.title) trail.unshift(current.title);
    const existing = byPath.get(node.path) || []; existing.push(trail); byPath.set(node.path, existing);
  }
  return byPath;
}

export function explicitStatBlock(text) {
  const lines = text.split('\n'), acLine = lines.find(line => /(?:\bAC\b|护\s*甲\s*等\s*级)\s*[:：]?\s*\d/i.test(line));
  const hpLine = lines.find(line => /(?:\bHP\b|生\s*命\s*值)\s*[:：]?\s*\d/i.test(line));
  const ac = acLine?.match(/(?:\bAC\b|护\s*甲\s*等\s*级)\s*[:：]?\s*(\d+)/i), hp = hpLine?.match(/(?:\bHP\b|生\s*命\s*值)\s*[:：]?\s*(\d+)/i);
  if (!ac || !hp || !/(?:力量|STR)\s*\d/i.test(text) || !/(?:挑战等级|\bCR\b)\s*[:：]?\s*[\d/]/i.test(text)) return null;
  const speed = lines.find(line => /速度\s*[:：]?\s*(?:\d|游泳|飞行|攀爬|掘穴)/.test(line))?.replace(/^.*?速度\s*[:：]?\s*/, '') || null;
  const speeds = {};
  const walk = speed?.match(/^(\d+)\s*尺/); if (walk) speeds.walk = Number(walk[1]);
  for (const [label, key] of [['游泳', 'swim'], ['飞行', 'fly'], ['攀爬', 'climb'], ['掘穴', 'burrow']]) { const match = speed?.match(new RegExp(label + '\\s*(\\d+)\\s*尺')); if (match) speeds[key] = Number(match[1]); }
  const abilities = {};
  for (const [label, key] of [['力量', 'str'], ['敏捷', 'dex'], ['体质', 'con'], ['智力', 'int'], ['感知', 'wis'], ['魅力', 'cha']]) { const match = text.match(new RegExp(label + '\\s*(\\d+)')); if (match) abilities[key] = Number(match[1]); }
  const attacks = [];
  for (const line of lines) {
    const bonus = line.match(/(?:近战(?:或远程)?|远程)(?:武器)?攻击(?:检定)?\s*[:：]\s*(?:命中\s*)?([+-]\s*\d+)/), damage = line.match(/命中\s*[:：]\s*(\d+)\s*[（(]([^）)]+)[）)]\s*([^，。；;]+?伤害)/);
    if (!bonus || !damage || !/\dd\d/i.test(damage[2])) continue;
    const attack = { name: line.split(/[。]/)[0].trim(), attackBonus: Number(bonus[1].replace(/\s/g, '')), averageDamage: Number(damage[1]), damageFormula: damage[2].replace(/\s/g, ''), damageTypeText: damage[3], sourceText: line, effects: 'manual' };
    const reach = line.match(/触及\s*(\d+)\s*尺/), range = line.match(/射程\s*(\d+)\s*\/\s*(\d+)\s*尺/);
    if (reach) attack.reachFeet = Number(reach[1]); if (range) attack.rangeFeet = { normal: Number(range[1]), long: Number(range[2]) };
    attacks.push(attack);
  }
  const size = text.match(/(?:超巨型|巨型|大型|中型|小型|微型|超小型)/)?.[0] || null;
  const initiative = text.match(/先攻\s*[:：]?\s*([+-]\s*\d+)/), cr = text.match(/(?:挑战等级|\bCR\b)\s*[:：]?\s*([\d/]+)/i), pb = text.match(/(?:\bPB|熟练加值)\s*[:：]?\s*\+\s*(\d+)/i);
  const multi = lines.find(line => /多重攻击|Multiattack/i.test(line)), multiMatch = multi?.match(/(?:共计|发动|进行|发动共计)?\s*([二两三四五六七八九十]|\d+)\s*次攻击/);
  const chineseNumbers = { 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  return { armorClass: Number(ac[1]), hitPoints: Number(hp[1]), hitPointsText: hpLine, speedText: speed, speedsFeet: speeds, sizeText: size, abilityScores: abilities,
    ...(initiative ? { initiativeBonus: Number(initiative[1].replace(/\s/g, '')) } : {}), ...(cr ? { challengeRatingText: cr[1] } : {}), ...(pb ? { proficiencyBonus: Number(pb[1]) } : {}),
    attacks, ...(multiMatch ? { multiattackCount: chineseNumbers[multiMatch[1]] || Number(multiMatch[1]) } : {}), mechanicalAutomation: false };
}

function creatureEntries(html) {
  const ranges = classBlocks(html), precise = [];
  for (const range of ranges) {
    const fragment = html.slice(range.start, range.end), text = htmlText(fragment), stats = explicitStatBlock(text); if (!stats) continue;
    const heading = headingList(fragment).find(entry => entry.level <= 5);
    if (heading?.title) precise.push({ title: heading.title, anchor: heading.anchor || heading.title, text, html: fragment, stats, context: htmlText(html.slice(0, range.start)), method: 'stat-block' });
  }
  if (precise.length) return precise;
  const lines = htmlText(html).split('\n'), starts = [];
  for (let index = 0; index < lines.length; index++) {
    if (!/(?:\bAC\b|护\s*甲\s*等\s*级)\s*[:：]?\s*\d/i.test(lines[index])) continue;
    const sizeIndex = [index - 1, index - 2, index - 3].find(position => position >= 0 && /(?:超巨型|巨型|大型|中型|小型|微型|超小型)/.test(lines[position]) && lines[position].length < 180);
    if (sizeIndex === undefined) continue;
    const start = sizeIndex > 0 ? sizeIndex - 1 : 0, title = lines[start];
    if (title.length > 180 || !explicitStatBlock(lines.slice(index, Math.min(lines.length, index + 45)).join('\n'))) continue;
    starts.push({ start, index, title });
  }
  return starts.map((entry, index) => {
    const text = lines.slice(entry.start, starts[index + 1]?.start || lines.length).join('\n');
    return { title: entry.title, anchor: entry.title + (starts.filter(item => item.title === entry.title).length > 1 ? '-' + (index + 1) : ''), text, html: '', stats: explicitStatBlock(text), context: lines.slice(0, starts[0].start).join('\n'), method: 'legacy-stat-signature' };
  });
}

export function resourceId(sourcePath, anchor, kind) { return `bq-${({ 怪物: 'monster', NPC: 'npc', 物品: 'item', 规则: 'rule' })[kind]}-${hash(sourcePath + '#' + anchor).slice(0, 32)}`; }
function initial(name) {
  const first = [...name.trim()][0] || ''; if (/^[a-z]$/i.test(first)) return first.toUpperCase();
  if (!/\p{Script=Han}/u.test(first)) return 'Z'; let letter = 'A'; for (const [candidate, boundary] of initials) { if (collator.compare(first, boundary) >= 0) letter = candidate; else break; } return letter;
}
function safeName(name) { return name.normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, ' ').replace(/[. ]+$/, '').slice(0, 82) || '未命名'; }
function splitBy(html, headings) { return headings.map((heading, index) => ({ ...heading, html: html.slice(heading.position, headings[index + 1]?.position ?? html.length) })); }
function pageCategory(path) {
  if (/奇械锻炉\/第一章\/(?:第一章：奇械师|奇械师法术列表)\.html?$/.test(path)) return 'class-reference';
  if (/奇械锻炉\/第一章\/法术\.html?$/.test(path)) return 'spell';
  if (/\/法术详述\//.test(path)) return 'spell';
  if (/\/专长\//.test(path) || /专长\.html?$/.test(path)) return 'feat';
  if (/背景\//.test(path)) return 'background';
  if (/种族\//.test(path)) return 'species';
  if (/角色职业\//.test(path)) { const parts = path.split('/'), name = parts.at(-1).replace(/\.html?$/, ''); return name === parts.at(-2) ? 'class' : /法术|兼职|概述|选项/.test(name) ? 'class-reference' : 'subclass'; }
  if (/\/第一章\//.test(path) && /奇械锻炉/.test(path)) return /奇械师\.html?$/.test(path) ? 'class' : 'subclass';
  if (/魔法物品详述\//.test(path) || /附录A：魔法物品/.test(path)) return 'magic-item';
  if (/\/装备\//.test(path)) return 'equipment';
  return 'rule';
}

export function parseRulePage({ html, sourcePath, revision = null, edition = null, sourceSha256 = null, navigation = [] } = {}) {
  const path = sourcePath.replaceAll('\\', '/'), parts = path.split('/'), book = parts[0] === 'topics' ? parts[1] : null;
  const pageTitle = clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] || posix.basename(path).replace(/\.html?$/, ''));
  if (!book || ['template', 'template2', '空白页模板', '格式转换工具包', 'Generator'].includes(book)) return { entries: [], reason: 'non-content-or-template', pageTitle };
  const body = bodyOf(html), text = htmlText(body);
  if (!text) return { entries: [], reason: 'empty-body', pageTitle };
  if (administrative.test(path)) return { entries: [], reason: 'administrative', pageTitle };
  const yearText = book.match(/20\d{2}/)?.[0] || edition?.year || null;
  const navigation2024 = navigation.some(trail => trail.some(label => /2024/.test(label)));
  const family = currentBooks.has(book) ? 'dnd-2024' : knownLegacy.has(book) ? 'dnd-2014' : edition?.rulesFamily ?? (navigation2024 ? 'dnd-2024' : null);
  const sourceKind = book === '第三方' ? 'third-party' : book === '启封奥秘' ? 'playtest' : book === '模组' ? 'adventure' : knownLegacy.has(book) || currentBooks.has(book) ? 'official-reference' : 'unclassified-reference';
  const headings = headingList(body); let category = pageCategory(path);
  if (category === 'rule' && navigation.some(trail => trail.slice(-4, -1).some(label => /种族详述|种族描述/.test(label)))) category = 'species';
  if (category === 'rule' && navigation.some(trail => trail.slice(-4, -1).some(label => /专长/.test(label)))) category = 'feat';
  const entries = [], used = new Set(), npcTrail = navigation.find(trail => trail.some(label => /非玩家|\bNPCs?\b|重要人物|主要人物|具名|命名/i.test(label)));
  function add({ title, anchor, fragment = body, contentText, kind = '规则', ruleCategory = category, method = 'source-page', stats = null, context = null, tables = null }) {
    if (!title || title.length > 300) return;
    const anchorKey = anchor || title; let key = anchorKey, occurrence = 1; while (used.has(kind + ':' + key)) key = anchorKey + '--' + ++occurrence; used.add(kind + ':' + key);
    const name = title.replace(/([\p{Script=Han}])([A-Z])/gu, '$1 $2').replace(/\s+/g, ' ').trim();
    const id = resourceId(path, key, kind), content = contentText ?? htmlText(fragment);
    const value = { formatVersion: 1, id, name, resourceType: kind, ruleCategory,
      source: { collection: '5E不全书', book, title: pageTitle, entryTitle: title, path: '资源/资料/5E不全书/网页/' + path,
        originalPath: '资料/5E不全书/网页/' + path, anchor: anchor || null, entryKey: key, revision, sha256: sourceSha256 || hash(html), navigation: navigation.filter(trail => !trail.includes('本书速查')).sort((a, b) => b.length - a.length)[0] || navigation[0] || [],
        ...(kind === 'NPC' ? { npcClassificationEvidence: npcPath.test(path) ? 'source-path-explicit-NPC' : npcTrail } : {}) },
      edition: { year: yearText ? Number(yearText) : null, rulesFamily: family, sourceKind, evidence: edition?.evidence || (currentBooks.has(book) || knownLegacy.has(book) ? 'local-book-directory-and-credits' : 'not-established') },
      availability: { enabled: false, status: family ? 'reference-only' : 'unclassified-reference', requiresDmApproval: true },
      content: { text: content, ...(context ? { context } : {}), tables: tables ?? tablesOf(fragment), sections: headingList(fragment).map(({ level, title, anchor }) => ({ level, title, anchor })) },
      extraction: { parser: RULE_LIBRARY_PARSER, method, mechanicalConversion: false, warnings: method === 'legacy-stat-signature' ? ['旧版Word结构按明确资料板信号分段；未做规则换算'] : [] }, ...(stats ? { statBlock: stats } : {}) };
    entries.push({ path: `资源/${kind}/${initial(name)}/${safeName(name)}--${id.slice(-12)}.json`, value });
  }
  const creatures = creatureEntries(body);
  for (const creature of creatures) add({ title: creature.title, anchor: creature.anchor, fragment: creature.html, contentText: creature.text, context: creature.context,
    kind: npcPath.test(path) || npcTrail ? 'NPC' : '怪物', ruleCategory: npcPath.test(path) || npcTrail ? 'npc-statblock' : 'monster-statblock', method: creature.method, stats: creature.stats });
  const includeRules = family === 'dnd-2024' || bestiaries.has(book);
  if (!includeRules) return { entries, reason: entries.length ? 'creature-entries' : 'outside-selected-rule-scope', pageTitle, candidateStatBlocks: classBlocks(body).length };
  if (bestiaries.has(book) && creatures.length) return { entries, reason: 'creature-entries', pageTitle, candidateStatBlocks: classBlocks(body).length };
  if (category === 'spell') {
    const starts = headings.filter(entry => entry.level === 4);
    for (const entry of splitBy(body, starts)) add({ ...entry, fragment: entry.html, method: 'spell-heading' });
    if (!starts.length) add({ title: pageTitle, anchor: '_page', method: 'source-page-unsegmented' });
  } else if (category === 'magic-item') {
    const starts = headings.filter(entry => entry.level === 6 && !/^(?:动作|特质|反应|附赠动作|传奇动作)/.test(entry.title));
    for (const entry of splitBy(body, starts)) add({ ...entry, fragment: entry.html, kind: '物品', method: 'item-heading' });
    if (!starts.length) add({ title: pageTitle, anchor: '_page', ruleCategory: 'magic-item-reference' });
  } else if (category === 'feat' || category === 'equipment') {
    const starts = namedFonts(body);
    for (const entry of splitBy(body, starts)) add({ ...entry, fragment: entry.html, kind: category === 'equipment' ? '物品' : '规则', method: 'colored-entry-heading' });
    if (category === 'equipment') for (const [tableIndex, table] of tablesOf(body).entries()) {
      const headers = table.rows.find(row => /(?:名称|武器|护甲|物品|工具|坐骑|载具)/.test(row.join(' ')) && /(?:重量|费用|伤害|价格)/.test(row.join(' ')));
      if (!headers) continue;
      for (const row of table.rows) if (row.length >= 3 && row !== headers && row[0] && !/^(?:名称|物品|武器|护甲|工具|坐骑|载具)$/.test(row[0]) && /\d|—|\-/.test(row.slice(1).join(' '))) add({ title: row[0], anchor: `table-${tableIndex + 1}-${row[0]}`, contentText: headers.join(' | ') + '\n' + row.join(' | '), fragment: '', kind: '物品', tables: [{ rows: [headers, row] }], method: 'equipment-table-row' });
    }
    add({ title: pageTitle, anchor: '_page', ruleCategory: category + '-reference', method: 'source-page' });
  } else add({ title: headings[0]?.title || pageTitle, anchor: '_page', method: 'source-page' });
  return { entries, reason: 'selected-rule-entries', pageTitle, candidateStatBlocks: classBlocks(body).length };
}

async function safeFile(root, path) {
  if (isAbsolute(path) || path.split(/[\\/]/).some(part => part === '..')) throw new Error('资料路径不能越界');
  if ((await lstat(root)).isSymbolicLink()) throw new Error('资料根目录不能是链接');
  const base = await realpath(root); let current = resolve(root);
  for (const part of path.split('/')) { if (!part) continue; current = join(current, part); const info = await lstat(current); if (info.isSymbolicLink()) throw new Error('资料路径含链接，已拒绝'); const rel = relative(base, await realpath(current)); if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep)) throw new Error('资料路径越界'); }
  return current;
}
async function filesUnder(root) {
  const result = [], rejected = [];
  async function walk(path = '') {
    const target = path ? await safeFile(root, path) : root;
    for (const entry of await readdir(target, { withFileTypes: true })) {
      const child = path ? path + '/' + entry.name : entry.name;
      if (entry.isSymbolicLink()) { rejected.push({ path: child, reason: 'link-rejected' }); continue; }
      if (entry.isDirectory()) await walk(child); else if (entry.isFile() && /\.html?$/i.test(entry.name)) result.push(child);
    }
  }
  await walk(); return { files: result.sort(), rejected };
}

async function safeParents(root, path) {
  const target = resolve(root); await mkdir(target, { recursive: true });
  if ((await lstat(target)).isSymbolicLink()) throw new Error('输出根目录不能是链接');
  let current = target;
  for (const part of path.split('/').slice(0, -1)) {
    current = join(current, part);
    try { await mkdir(current); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const info = await lstat(current); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('输出上级目录含链接或不是文件夹');
  }
}

async function writeNew(path, content) {
  const temporary = path + '.' + randomUUID() + '.tmp'; let handle;
  try {
    handle = await open(temporary, 'wx', 0o600); await handle.writeFile(content, 'utf8'); await handle.sync(); await handle.close(); handle = null;
    await link(temporary, path);
  } finally { await handle?.close().catch(() => {}); await unlink(temporary).catch(() => {}); }
}

export async function inspectRuleLibrary({ sourceRoot, sourceRevision = null } = {}) {
  const root = resolve(sourceRoot), { files, rejected } = await filesUnder(root), entries = [], pages = [], issues = [...rejected], books = new Map();
  let navigation = new Map();
  try { navigation = parseNavigation(enc.decode(await readFile(await safeFile(root, 'webhelpcontents.htm')))); } catch (error) { if (error.code !== 'ENOENT') issues.push({ path: 'webhelpcontents.htm', reason: 'navigation-unavailable:' + error.message }); }
  for (const path of files.filter(path => /(?:Credits|前言|简介|崭新工具箱)/i.test(path))) {
    const book = path.split('/')[1]; if (!book || books.has(book)) continue;
    try { const html = enc.decode(await readFile(await safeFile(root, path))), title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
      const year = title.match(/20\d{2}/)?.[0]; if (year) books.set(book, { year: Number(year), rulesFamily: currentBooks.has(book) ? 'dnd-2024' : knownLegacy.has(book) ? 'dnd-2014' : null, evidence: path + ':title' });
    } catch { /* The full pass records decoding and file errors. */ }
  }
  const ids = new Set();
  for (const path of files) {
    try {
      const raw = await readFile(await safeFile(root, path)), html = enc.decode(raw).replace(/^\uFEFF/, ''), result = parseRulePage({ html, sourcePath: path, revision: sourceRevision, edition: books.get(path.split('/')[1]), sourceSha256: hash(raw), navigation: navigation.get(path) || [] });
      const page = { path, sha256: hash(raw), title: result.pageTitle, status: result.entries.length ? 'imported' : 'skipped', reason: result.reason, entries: [] };
      for (const entry of result.entries) { if (ids.has(entry.value.id)) { issues.push({ path, reason: 'duplicate-generated-id', id: entry.value.id }); continue; } ids.add(entry.value.id); entries.push(entry); page.entries.push(entry.value.id); }
      pages.push(page);
    } catch (error) { pages.push({ path, status: 'failed', reason: error.message, entries: [] }); issues.push({ path, reason: error.message }); }
  }
  const contentGroups = new Map();
  for (const entry of entries) {
    const key = entry.value.resourceType + ':' + entry.value.ruleCategory + ':' + hash(entry.value.content.text.replace(/\s+/g, ''));
    const group = contentGroups.get(key) || []; group.push(entry); contentGroups.set(key, group);
  }
  const duplicateGroups = [...contentGroups.values()].filter(group => group.length > 1);
  for (const group of duplicateGroups) for (const entry of group) entry.value.extraction.equivalentContentGroup = hash(group.map(item => item.value.id).sort().join('|')).slice(0, 24);
  const by = field => Object.fromEntries([...entries.reduce((map, entry) => { const key = field(entry.value); map.set(key, (map.get(key) || 0) + 1); return map; }, new Map())].sort((a, b) => a[0].localeCompare(b[0])));
  return { parser: RULE_LIBRARY_PARSER, sourceRevision, entries, pages, issues,
    stats: { htmlPages: files.length, accountedPages: pages.length, importedPages: pages.filter(page => page.status === 'imported').length, skippedPages: pages.filter(page => page.status === 'skipped').length, failedPages: pages.filter(page => page.status === 'failed').length, entries: entries.length,
      byResourceType: by(value => value.resourceType), byCategory: by(value => value.ruleCategory), byBook: by(value => value.source.book), byRulesFamily: by(value => value.edition.rulesFamily || 'unclassified'), unknownPublicationYears: entries.filter(entry => entry.value.edition.year === null).length,
      equivalentContentGroups: duplicateGroups.length, entriesInEquivalentGroups: duplicateGroups.reduce((sum, group) => sum + group.length, 0),
      skipReasons: Object.fromEntries([...pages.filter(page => page.status === 'skipped').reduce((map, page) => map.set(page.reason, (map.get(page.reason) || 0) + 1), new Map())]), issues: issues.length } };
}

export async function importRuleLibrary({ sourceRoot, sourceRevision = null, projectRoot, backupRoot, dryRun = true } = {}) {
  const result = await inspectRuleLibrary({ sourceRoot, sourceRevision });
  if (dryRun) return result;
  if (!projectRoot || !backupRoot) throw new Error('真实写入必须明确指定项目根和备份目录');
  const project = resolve(projectRoot), backup = resolve(backupRoot); await mkdir(backup, { recursive: true });
  const plan = [], conflicts = [], written = [], unchanged = [];
  for (const entry of result.entries) {
    const text = encodeJson(entry.value), fingerprint = hash(text), path = entry.path, absolute = resolve(project, path);
    const inside = relative(project, absolute); if (isAbsolute(inside) || inside.startsWith('..')) throw new Error('输出路径越界');
    let before = null;
    try { await safeFile(project, path); before = await readFile(absolute); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (before) {
      if (hash(before) === fingerprint) unchanged.push(path);
      else { conflicts.push({ path, existingSha256: hash(before), generatedSha256: fingerprint }); await mkdir(dirname(join(backup, path)), { recursive: true }); await copyFile(absolute, join(backup, path)); }
    } else plan.push({ path, absolute, text, sha256: fingerprint });
  }
  const beforeManifest = { formatVersion: 1, parser: RULE_LIBRARY_PARSER, sourceRevision, planned: plan.map(({ path, sha256 }) => ({ path, sha256 })), unchanged, conflicts };
  await writeFile(join(backup, '写入前清单.json'), encodeJson(beforeManifest), { flag: 'wx' });
  for (const entry of plan) {
    await safeParents(project, entry.path); await safeFile(project, posix.dirname(entry.path));
    try { await writeNew(entry.absolute, entry.text); written.push(entry.path); }
    catch (error) { if (error.code === 'EEXIST') conflicts.push({ path: entry.path, reason: 'appeared-during-import' }); else throw error; }
  }
  const manifest = { formatVersion: 1, id: 'bq-import-' + hash(String(sourceRevision) + RULE_LIBRARY_PARSER).slice(0, 32), name: '不全书离线资料导入清单', parser: RULE_LIBRARY_PARSER, sourceRevision,
    stats: result.stats, resources: result.entries.map(entry => ({ id: entry.value.id, path: entry.path, sha256: hash(encodeJson(entry.value)), sourcePath: entry.value.source.path, originalPath: entry.value.source.originalPath, sourceSha256: entry.value.source.sha256, resourceType: entry.value.resourceType, ruleCategory: entry.value.ruleCategory, edition: entry.value.edition, availability: entry.value.availability })), pages: result.pages, issues: result.issues, conflicts };
  const manifestPath = '资源/规则/G/不全书导入清单--' + hash(String(sourceRevision) + RULE_LIBRARY_PARSER).slice(0, 12) + '.json';
  await safeParents(project, manifestPath); await safeFile(project, posix.dirname(manifestPath));
  const manifestText = encodeJson(manifest);
  try { await writeNew(join(project, manifestPath), manifestText); }
  catch (error) { if (error.code !== 'EEXIST') throw error; const old = await readFile(await safeFile(project, manifestPath)); if (hash(old) !== hash(manifestText)) conflicts.push({ path: manifestPath, reason: 'existing-manifest-differs' }); }
  await writeFile(join(backup, '导入结果.json'), encodeJson({ manifestPath, stats: result.stats, written: written.length, unchanged: unchanged.length, conflicts, issues: result.issues }), { flag: 'wx' });
  return { ...result, manifestPath, written, unchanged, conflicts };
}
