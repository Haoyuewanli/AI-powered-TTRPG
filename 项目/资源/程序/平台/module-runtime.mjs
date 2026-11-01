import { readdir, readFile, mkdir, lstat, copyFile, writeFile, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve, relative, isAbsolute, basename, extname, dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { preprocessModule } from './module-preprocess.mjs';

const fail = message => Object.assign(new Error(message), { status: 409 });
const json = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const folderName = value => { const result = String(value).normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim().slice(0, 65); return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result) ? '_' + result : result; };
const runPath = path => typeof path === 'string' && /^[^/]+\/战斗\/存档$/.test(path) && !['.', '..', '预处理'].includes(path.split('/')[0]);

export function createModuleRuntime({ root }) {
  const project = resolve(root), modules = join(project, '模组');
  let preprocessQueue = Promise.resolve();
  async function safe(path) {
    const target = resolve(project, path), inside = relative(project, target);
    if (inside.startsWith('..') || isAbsolute(inside)) throw fail('模组路径超出项目');
    let current = project;
    for (const part of inside.split(/[\\/]/).filter(Boolean)) {
      current = join(current, part);
      try { if ((await lstat(current)).isSymbolicLink()) throw fail('模组路径不能是链接'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return target;
  }
  async function verifySource(template, packageDirectory) {
    const source = template.source;
    if (!source || !['pdf', 'image', 'markdown', 'synthetic'].includes(source.kind)) throw fail('原始资料类型不受支持，未绕过来源核对');
    if (source.kind === 'synthetic') {
      if (template.preprocessContract) throw fail('正式资料包不能使用合成来源');
      return;
    }
    const local = source.relativePath || source.path;
    if (typeof local !== 'string' || !local || /[\\:\x00-\x1f]/.test(local) || local.split('/').some(part => !part || part === '.' || part === '..') || !/^[a-f\d]{64}$/.test(source.sha256 || '') || (source.referenceBase !== undefined && source.referenceBase !== 'project' && source.referenceBase !== 'package')) throw fail('原始资料引用或摘要无效，请重新核对预处理来源');
    const sourcePath = source.referenceBase === 'project' ? local : packageDirectory + '/' + local;
    const requiredBase = source.kind === 'markdown' ? '模组/预处理/' : packageDirectory + (source.kind === 'pdf' ? '/原PDF/' : '/原图/');
    if (!sourcePath.startsWith(requiredBase) || (source.kind === 'markdown' && extname(sourcePath).toLowerCase() !== '.md')) throw fail('原始资料路径不符合来源范围');
    const absolute = await safe(sourcePath);
    let info; try { info = await lstat(absolute); } catch (error) { if (error.code === 'ENOENT') throw fail('原始资料缺失，未创建新团'); throw error; }
    if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1 || info.size > 512 * 1024 * 1024) throw fail('原始资料文件不安全或过大');
    if (createHash('sha256').update(await readFile(absolute)).digest('hex') !== source.sha256) throw fail('原始资料已改变，未沿用旧的核对结论或创建新团');
  }
  async function templates() {
    const base = '模组/预处理', result = [], issues = [], counts = new Map();
    let categories;
    try { categories = await readdir(await safe(base), { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return { templates: [], categories: [], issues }; throw error; }
    const visibleCategories = [];
    for (const category of categories) {
      if (!category.isDirectory() || category.name.startsWith('.') || ['对话', '战斗'].includes(category.name)) {
        if (category.isSymbolicLink()) issues.push({ folder: category.name, error: '模组目录不能是链接' });
        continue;
      }
      const categoryPath = base + '/' + category.name;
      let entries;
      try { entries = await readdir(await safe(categoryPath), { withFileTypes: true }); }
      catch (error) { issues.push({ folder: category.name, error: error.message }); continue; }
      // Raw input folders are sources, not categories containing prepared packages.
      if (entries.some(entry => entry.isFile() && /\.(md|pdf)$/i.test(entry.name)) &&
        !entries.some(entry => entry.isDirectory() && !['images', '图片', '原图', '原PDF'].includes(entry.name))) continue;
      if (category.name !== '故事') visibleCategories.push(category.name);
      for (const entry of entries) {
        if (entry.name.startsWith('.') || (!entry.isDirectory() && !entry.isSymbolicLink())) continue;
        const relativePath = categoryPath + '/' + entry.name;
        let id;
        try {
          const path = await safe(relativePath + '/预处理.json'), stat = await lstat(path);
          if (!stat.isFile() || stat.nlink > 1 || stat.size > 16 * 1024 * 1024) throw fail('预处理文件不安全或过大');
          const bytes = await readFile(path), value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
          id = value.moduleId;
          if (typeof id === 'string' && id) counts.set(id, (counts.get(id) || 0) + 1);
          if (value.schemaVersion !== 1 || typeof id !== 'string' || !/^[\w-]{1,160}$/.test(id) || typeof value.title !== 'string' || !value.title.trim() || !Array.isArray(value.storyNodes) || !Array.isArray(value.maps) || (value.encounterTemplates !== undefined && !Array.isArray(value.encounterTemplates)) || (value.batchId !== undefined && (typeof value.batchId !== 'string' || !/^[\w.-]{1,100}$/.test(value.batchId)))) throw fail('预处理格式无效');
          for (const items of [value.storyNodes, value.maps, value.encounterTemplates || []]) {
            const ids = items.map(item => item?.id);
            if (ids.some(itemId => typeof itemId !== 'string' || !itemId || itemId.length > 160) || new Set(ids).size !== ids.length) throw fail('预处理条目ID无效或重复');
          }
          await verifySource(value, relativePath);
          result.push({ id, name: value.title, folder: entry.name, category: category.name === '故事' ? null : category.name, batchId: value.batchId || null,
            packageSha256: createHash('sha256').update(bytes).digest('hex'), relativePath, reviewStatus: value.reviewStatus || 'candidate', value });
        } catch (error) { issues.push({ ...(typeof id === 'string' ? { id } : {}), folder: relativePath, error: error.code === 'ENOENT' ? '模组包缺少预处理.json' : error.message }); }
      }
    }
    for (const [id, count] of counts) if (count > 1) issues.push({ id, error: '预处理ID重复' });
    return { templates: result.filter(entry => counts.get(entry.id) === 1), categories: visibleCategories, issues };
  }
  async function templateCover(templateId) {
    const template = (await templates()).templates.find(entry => entry.id === templateId);
    if (!template) throw fail('模组不存在或身份不唯一，请刷新目录');
    const cover = template.value.cover;
    const candidates = cover?.path ? [cover.referenceBase === 'project' ? cover.path : template.relativePath + '/' + cover.path]
      : ['封面.png', '模组封面.png', '封面.jpg', '模组封面.jpg', 'cover.png', 'cover.jpg'].map(name => template.relativePath + '/' + name);
    for (const path of candidates) {
      if (typeof path !== 'string' || !path.startsWith(template.relativePath + '/') || /[\\:\x00-\x1f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw fail('封面引用不在本模组目录内');
      const mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' })[extname(path).toLowerCase()];
      if (!mime) throw fail('封面须为本地图像文件');
      try {
        const absolute = await safe(path), info = await lstat(absolute);
        if (!info.isFile() || info.nlink > 1 || info.size > 8 * 1024 * 1024) throw fail('封面文件不安全或过大');
        return { mime, base64: (await readFile(absolute)).toString('base64') };
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    throw fail('尚无可用封面，原资料保留');
  }
  async function sources() {
    const result = [];
    async function walk(path, depth = 0) {
      let entries; try { entries = await readdir(await safe(path), { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
      if (entries.some(entry => entry.name === '预处理.json')) return;
      const hasPdf = entries.some(entry => entry.isFile() && /\.pdf$/i.test(entry.name));
      for (const entry of entries) {
        if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
        const child = path + '/' + entry.name;
        if (entry.isDirectory() && depth < 2 && !['原PDF', '原图'].includes(entry.name)) await walk(child, depth + 1);
        else if (entry.isFile() && /\.(pdf|png|jpe?g|webp|tiff?)$/i.test(entry.name)) {
          if (hasPdf && /^(模组封面|封面|cover)\.(png|jpe?g)$/i.test(entry.name)) continue;
          const stat = await lstat(await safe(child)); if (stat.nlink > 1 || stat.size > 512 * 1024 * 1024) continue;
          result.push({ id: createHash('sha256').update(child).digest('hex'), name: entry.name, path: child, bytes: stat.size });
        }
      }
    }
    await walk('模组/预处理/故事'); return result;
  }
  async function preprocessSource(sourceId) {
    const operation = preprocessQueue.catch(() => {}).then(async () => {
      const source = (await sources()).find(entry => entry.id === sourceId); if (!source) throw fail('找不到待处理原文件，请刷新清单');
      const inputPath = await safe(source.path), digest = createHash('sha256').update(await readFile(inputPath)).digest('hex'), moduleId = 'module-' + digest.slice(0, 20);
      const existing = (await templates()).templates.find(entry => entry.id === moduleId || entry.value.source?.sha256 === digest);
      if (existing) return { id: existing.id, name: existing.name, reviewStatus: existing.reviewStatus, reused: true, notes: '同一PDF已有预处理结果，已复用；封面可从真实封面管理中单独调整。' };
      const result = await preprocessModule({ inputPath, outputDirectory: await safe('模组/预处理/故事/' + moduleId), moduleId, title: basename(source.name, extname(source.name)) });
      const inputDirectory = dirname(inputPath), entries = await readdir(inputDirectory, { withFileTypes: true });
      const coverNames = ['模组封面.png', '模组封面.jpg', '模组封面.jpeg', '封面.png', '封面.jpg', '封面.jpeg', 'cover.png', 'cover.jpg', 'cover.jpeg'];
      const provided = coverNames.map(name => entries.find(entry => entry.isFile() && !entry.isSymbolicLink() && entry.name.toLowerCase() === name)).find(Boolean);
      const coverSource = provided ? await safe(relative(project, join(inputDirectory, provided.name))) : join(result.directory, '封面/候选封面.png');
      try {
        const info = await lstat(coverSource);
        if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1 || info.size > 16 * 1024 * 1024) throw fail('封面文件不适合直接导入，请另选普通PNG/JPEG副本');
        const name = extname(coverSource).toLowerCase() === '.png' ? '模组封面.png' : '模组封面.jpg', target = join(result.directory, name);
        const before = createHash('sha256').update(await readFile(coverSource)).digest('hex');
        await copyFile(coverSource, target, constants.COPYFILE_EXCL);
        if (createHash('sha256').update(await readFile(target)).digest('hex') !== before) throw fail('封面读取期间发生变化，原件已保留');
        result.manifest.cover = { path: relative(project, target).replaceAll('\\', '/'), referenceBase: 'project', sourceKind: provided ? 'user-provided-cover' : 'pdf-first-page-preview', sha256: before };
      } catch (error) { result.manifest.coverIssue = error.code === 'ENOENT' ? '没有可用封面预览，原图可在封面管理中补充。' : error.message; }
      const temporary = result.manifestPath + '.' + randomUUID() + '.tmp';
      try { await writeFile(temporary, JSON.stringify(result.manifest, null, 2) + '\n', { flag: 'wx' }); await rename(temporary, result.manifestPath); }
      finally { await unlink(temporary).catch(() => {}); }
      return { id: moduleId, name: result.manifest.title, reviewStatus: 'candidate', pages: result.manifest.source.pageCount,
        mapCandidates: result.manifest.mapCandidates?.length || 0, notes: '文字和图像候选已提取；请核对故事条件、地图用途、玩家版与主持版，再用于正式团。' };
    });
    preprocessQueue = operation;
    return operation.catch(error => { error.status ||= 409; throw error; });
  }
  async function registry() {
    try {
      const value = await json(await safe('模组/工作区.json'));
      if (value.formatVersion !== 1 || !Array.isArray(value.campaigns)) throw fail('战斗工作区索引无效，原件保留');
      return value;
    } catch (error) { if (error.code === 'ENOENT') return { formatVersion: 1, campaigns: [] }; throw error; }
  }
  async function readRun(moduleId) {
    if (!String(moduleId).startsWith('campaign:')) return { maps: [], storyNodes: [], resourceIds: [] };
    const record = (await registry()).campaigns.find(entry => 'campaign:' + entry.id === moduleId);
    if (!record || typeof record.path !== 'string' || !runPath(record.path.replaceAll('\\', '/'))) throw fail('所属团的存档路径不符合当前目录契约');
    const folder = record.path.replaceAll('\\', '/').split('/')[0];
    try {
      const value = await json(await safe(`模组/${folder}/故事/模组调用.json`));
      if (value.id !== moduleId) throw fail('模组调用归属不符');
      return value;
    } catch (error) { if (error.code === 'ENOENT') return { id: moduleId, maps: [], storyNodes: [], resourceIds: [] }; throw error; }
  }
  async function listRuns() {
    const result = [], issues = [];
    for (const record of (await registry()).campaigns) {
      try {
        const portable = String(record.path).replaceAll('\\', '/');
        if (!runPath(portable)) throw fail('团存档尚未按新目录迁移');
        const meta = await json(await safe('模组/' + portable + '/团资料.json'));
        if (meta.id !== record.id || !Array.isArray(meta.battles)) throw fail('团资料归属不符');
        const manifest = await readRun('campaign:' + record.id);
        result.push({ id: 'campaign:' + record.id, name: meta.name, source: 'module-run', campaignId: record.id,
          templateId: manifest.templateId || null, templateIdentity: manifest.templateIdentity || null,
          lastPlayedAt: meta.lastPlayedAt || null, status: meta.status || null, progressSummary: meta.progressSummary || null,
          battles: meta.battles.map(entry => ({ id: entry.id, name: entry.name })) });
      } catch (error) { issues.push({ id: record.id, error: error.message }); }
    }
    return { modules: result, issues };
  }
  async function createRun({ templateId, name, monsterResource, training = false, expectedPackageSha256 } = {}) {
    const [{ acquireLock, atomicJson }, { newBattleState }, { validateState }] = await Promise.all([
      import('../战斗/src/store.mjs'), import('../战斗/src/workspace.mjs'), import('../战斗/src/rules.mjs')
    ]);
    const catalog = await templates(), prepared = catalog.templates.find(entry => entry.id === templateId), template = prepared?.value;
    if (!template) throw fail(catalog.issues.find(entry => entry.id === templateId)?.error || '找不到唯一的预处理模组');
    if (typeof training !== 'boolean') throw fail('训练模式须为明确的开关');
    if (expectedPackageSha256 !== undefined && expectedPackageSha256 !== prepared.packageSha256) throw fail('模组包已变化，请重新读取后再创建');
    const encounter = template.encounterTemplates?.find(entry => typeof entry?.id === 'string' && entry.id.endsWith('voyage-merrow')) || template.encounterTemplates?.[0];
    const voyage = encounter?.id?.endsWith('voyage-merrow');
    if (typeof name !== 'string' || !name.trim() || name.length > 80) throw fail('团名称须为1～80字');
    if (monsterResource && monsterResource.edition?.rulesFamily !== 'dnd-2024') throw fail('测试遭遇需要已核对的2024规则家族资源');
    if (monsterResource && !voyage) throw fail('该模组尚无已核对的梅洛遭遇适配，未擅自加入敌人');
    if (training && (!voyage || !monsterResource)) throw fail('序幕训练须选择已支持的登船遭遇和2024梅洛资源');
    await mkdir(await safe('模组'), { recursive: true });
    const release = await acquireLock(join(modules, '.workspace.lock'));
    try {
      const current = (await templates()).templates.find(entry => entry.id === templateId);
      if (!current || current.packageSha256 !== prepared.packageSha256 || current.relativePath !== prepared.relativePath) throw fail('模组包或来源在创建前发生变化，请重新读取');
      const previous = await registry(), campaignId = randomUUID(), battleId = randomUUID(), id = 'campaign:' + campaignId;
      const folder = (folderName(name) || '新团') + '--' + campaignId.slice(0, 8), base = await safe('模组/' + folder);
      const state = newBattleState(campaignId, battleId, encounter?.name || '模组战斗准备');
      state.actors[0].notes += ' 此角色仅供完整流程接线测试，不代表真实玩家角色。';
      if (encounter?.board) state.board = { ...state.board, ...encounter.board };
      if (monsterResource) state.actors.push(merrowActor(monsterResource));
      if (voyage) {
        const width = Math.min(60, state.board.width - 10), depth = Math.min(30, state.board.depth - 10);
        state.objects = [{ id: 'voyage-schematic-deck', name: '甲板示意（非原书比例，可编辑）', type: training ? 'tile' : 'floor', shape: 'box',
          position: { x: state.board.width / 2, y: 0, z: state.board.depth / 2 }, size: { width, depth, height: .5 }, rotation: 0, hidden: false, blocksMovement: false }];
        state.actors[0].position = { x: Math.round((state.board.width / 2 - width / 4) * 2) / 2, y: .5, z: state.board.depth / 2 };
        if (state.actors[1]) state.actors[1].position = { x: Math.round((state.board.width / 2 + width / 4) * 2) / 2, y: .5, z: state.board.depth / 2 };
      }
      if (training) {
        state.actors[0].position = { x: state.board.width / 2 - 12.5, y: 0, z: state.board.depth / 2 - 2.5 };
        const { applyVoyageTraining } = await import('./voyage-training.mjs');
        applyVoyageTraining(state);
        for (const actor of state.actors) actor.position.y = 0;
        state.actors[1].position = { x: state.board.width / 2, y: 0, z: state.board.depth / 2 };
      }
      validateState(state);
      const templateIdentity = { moduleId: templateId, batchId: prepared.batchId, packageSha256: prepared.packageSha256, path: prepared.relativePath + '/预处理.json' };
      const sceneNodes = training ? template.storyNodes.filter(node => typeof node?.id === 'string' &&
        (/(?:^|[-_])voyage(?:[-_]|$)/i.test(node.id) || /驶向风骸岛/.test(node.source?.heading || '') ||
          (node.source?.mdPath === encounter.source?.mdPath && Array.isArray(node.source?.lines) && Array.isArray(encounter.source?.lines) && node.source.lines[0] >= encounter.source.lines[0] && node.source.lines[1] <= encounter.source.lines[1]))) : [];
      if (training && !sceneNodes.length) throw fail('序幕训练缺少可追溯故事节点，未建立空白试玩团');
      const trainingDetails = training ? { kind: 'voyage-training-v1', encounterId: encounter.id, rulesFamily: 'dnd-2024', monsterResourceId: monsterResource.id, sceneNodes } : undefined;
      const manifest = { formatVersion: 1, kind: 'module-run', id, name: name.trim(), campaignId, templateId,
        templateIdentity, ...(training ? { training: trainingDetails } : {}),
        source: template.source, maps: template.maps, storyNodes: template.storyNodes,
        resourceIds: [...new Set([...(template.resourceIds || []), ...(monsterResource ? [monsterResource.id] : [])])],
        encounterTemplates: template.encounterTemplates || [], reviewStatus: template.reviewStatus,
        warnings: [training ? '训练角色为明确标注的合成样本，须由DM核对后开始；不是完整职业角色卡或难度承诺。' : '占位角色须由DM替换或核对；载入不会自动开战。',
          ...(template.reviewStatus !== 'verified' ? ['这是自动提取候选，故事条件、图像用途和资源匹配仍需核对。'] : []),
          ...(voyage ? ['序幕登船遭遇可交涉或战斗，由DM决定是否采用。', '船只棋盘和甲板尺寸为可编辑示意，原书没有该船的俯视网格图；没有自动判定水域和落水。', '原书序幕教学回合法不覆盖已启用的2024机械规则。'] : [])] };
      await mkdir(base);
      for (const area of ['故事', '对话', '战斗/存档']) await mkdir(join(base, area), { recursive: true });
      await atomicJson(join(base, '故事/模组调用.json'), manifest);
      await atomicJson(join(base, '战斗/存档/战斗状态.json'), state);
      await atomicJson(join(base, '战斗/存档/团资料.json'), { formatVersion: 1, id: campaignId, name: name.trim(), battles: [{ id: battleId, name: state.title, path: '.' }] });
      const next = { ...previous, campaigns: [...previous.campaigns, { id: campaignId, path: folder + '/战斗/存档' }], activeCampaignId: campaignId, activeBattleId: battleId };
      if (previous.campaigns.length) await atomicJson(join(modules, '工作区.previous.json'), previous);
      await atomicJson(join(modules, '工作区.json'), next);
      return { moduleId: id, moduleName: name.trim(), campaignId, battleId, folder, templateIdentity, ...(training ? { training: trainingDetails } : {}), warnings: manifest.warnings };
    } finally { await release(); }
  }
  return { templates, templateCover, readRun, createRun, listRuns, sources, preprocessSource, settled: () => preprocessQueue.catch(() => {}) };
}

function merrowActor(resource) {
  // This adapter is deliberately limited to the reviewed Merrow entry; catalog text is never executable.
  if (!/Merrow/i.test(resource.name + ' ' + resource.source?.path + ' ' + resource.source?.anchor) || !/怪物图鉴2025/.test(resource.source?.path || '')) throw fail('尚未核对该怪物的战斗适配，不使用通用猜测数值');
  const block = resource.statBlock;
  if (!block || !Number.isInteger(block.armorClass) || !Number.isInteger(block.hitPoints) || !Number.isInteger(block.speedsFeet?.walk) || !Number.isInteger(block.initiativeBonus) || !Number.isInteger(block.multiattackCount) || !Array.isArray(block.attacks)) throw fail('怪物数值尚未完整核对，未生成猜测值');
  const types = { '穿刺伤害': 'piercing', '挥砍伤害': 'slashing', '钝击伤害': 'bludgeoning' }, attacks = [];
  for (const [index, action] of block.attacks.entries()) {
    if (!types[action.damageTypeText] || !Number.isInteger(action.attackBonus) || typeof action.damageFormula !== 'string') throw fail('攻击资料尚未完成适配');
    const common = { bonus: action.attackBonus, damage: [{ formula: action.damageFormula, type: types[action.damageTypeText] }], manualEffect: action.sourceText || '特殊效果由主持核对。' };
    if (action.reachFeet) attacks.push({ ...common, id: 'melee-' + index, name: action.name + '（近战）', kind: 'melee', reach: action.reachFeet });
    if (action.rangeFeet) attacks.push({ ...common, id: 'ranged-' + index, name: action.name + '（远程）', kind: 'ranged', range: action.rangeFeet.normal, longRange: action.rangeFeet.long });
  }
  return { id: 'npc-' + randomUUID(), name: resource.name, kind: 'npc', ownerId: null, ac: block.armorClass, hp: block.hitPoints, maxHp: block.hitPoints, tempHp: 0,
    speed: block.speedsFeet.walk, initiativeBonus: block.initiativeBonus, attackLimit: block.multiattackCount, tiePriority: 1, position: { x: 57.5, z: 27.5 }, space: { width: 10, depth: 10 },
    body: { width: 5, depth: 3, height: 9 }, facing: 0, hidden: false, confirmed: false, immunities: [], resistances: [], vulnerabilities: [],
    attacks,
    resources: '多重攻击共两次；步行10尺、游泳40尺，水域移动与特殊效果由DM核对。',
    notes: '战斗数值取本机怪物图鉴2025梅洛Merrow，与2014模组原始统计区分。模型长宽高只是可编辑显示占位；不是原书身体尺寸。',
    reference: { resourceId: resource.id, source: resource.source, edition: resource.edition } };
}
