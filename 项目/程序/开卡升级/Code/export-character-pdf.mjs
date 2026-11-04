import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, loadLibrary, pad } from './library.mjs';
import { checkedPath, exists, readState } from './store.mjs';

function spellRows(lib, snapshot) {
  const names = new Set([
    ...snapshot.cantrips, ...snapshot.prepared,
    ...snapshot.grantedSpells.map(spell => spell.name)
  ]);
  return [...names].map(name => {
    const entry = lib.find('spells', name);
    if (!entry) throw new Error('缺少法术资料：' + name);
    const tags = Object.fromEntries([...entry.body.matchAll(/^(施法时间|施法距离|法术成分|持续时间)[：:]\s*([^\n]+)/gm)]
      .map(match => [match[1], match[2].trim()]));
    const body = entry.body.split(/\n/).filter(Boolean);
    const after = body.findIndex(line => /^持续时间[：:]/.test(line));
    const effect = after >= 0 ? body.slice(after + 1).join('\n') : '';
    const source = [];
    if (snapshot.cantrips.includes(name)) source.push('职业');
    if (snapshot.prepared.includes(name)) source.push('职业准备');
    for (const grant of snapshot.grantedSpells.filter(spell => spell.name === name)) {
      source.push(grant.source + (grant.ability ? '／' + grant.ability : '') +
        (grant.dc != null ? ' DC' + grant.dc : ''));
    }
    return { name, rank: entry.spellLevel, tags, effect, source };
  }).sort((a, b) => a.rank - b.rank);
}

function classFeatures(lib, snapshot) {
  const entries = [
    ['职业能力', lib.find('classes', snapshot.className)],
    ['子职能力', lib.find('subclasses', snapshot.subclass)]
  ].filter(([, entry]) => entry);
  return entries.flatMap(([category, entry]) => {
    const sections = [...entry.body.matchAll(/^(\d+)级[：:]([^\n]*)\n([\s\S]*?)(?=^\d+级[：:]|(?![\s\S]))/gm)];
    return sections.filter(section => Number(section[1]) <= snapshot.level).map(section => ({
      category, name: section[2].split(/[A-Za-z]/)[0].trim(),
      text: section[3].split('\n').map(line => line.trim()).find(line => /^[\u3400-\u9fff]/.test(line)) || ''
    }));
  }).filter(feature => feature.name);
}

function featFeatures(lib, snapshot) {
  return snapshot.feats.map(feat => {
    const entry = lib.find('feats', feat.name);
    const lines = entry?.body.split('\n').map(line => line.trim()).filter(Boolean) || [];
    const benefit = lines.slice(1).findIndex(line => /^[\u3400-\u9fff]/.test(line) && !/^[(（]/.test(line));
    return { name: feat.name, source: feat.source, text: benefit < 0 ? '' : lines.slice(benefit + 1).join('\n') };
  });
}

async function writePdf(lib, saved, template, output) {
  if (!saved.snapshot || saved.version !== lib.version || saved.sourceHash !== lib.hash) {
    throw new Error('请选择由同一版本资料生成的本级角色成果。');
  }
  if (!await exists(template)) throw new Error('缺少角色卡底表.pdf。请从项目工具目录复制底表，再重试导出。');
  const snapshot = saved.snapshot;
  const payload = {
    ...saved, spells: spellRows(lib, snapshot), classFeatures: classFeatures(lib, snapshot),
    featFeatures: featFeatures(lib, snapshot)
  };
  const script = fileURLToPath(new URL('./character-pdf.py', import.meta.url));
  const result = spawnSync('python', ['-X', 'utf8', script, template, output], {
    input: JSON.stringify(payload), encoding: 'utf8', maxBuffer: 1024 * 1024,
    timeout: 60_000, windowsHide: true
  });
  if (result.error?.code === 'ENOENT') throw new Error('找不到 Python。请使用已配置 PDF 导出环境的电脑，再重试。');
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim().split(/\r?\n/).at(-1) || 'PDF导出失败。');
}

async function existingPdf(output) {
  if (!await exists(output)) return false;
  const data = await readFile(output);
  if (data.subarray(0, 5).toString() !== '%PDF-' || !data.subarray(-32).toString().includes('%%EOF')) {
    throw new Error('已有同名文件，但它不是完整 PDF。请移开该文件后重试。');
  }
  return true;
}

export async function exportStoredCharacter(lib, dir, level, {template=join(ROOT, '角色卡底表.pdf')}={}) {
  const state = await readState(dir);
  if (level === undefined) {
    if (state.status !== 'complete') throw new Error('当前等级还未完成。导出旧版时请指定已完成的等级。');
    level = Number(state.answers.目标等级);
  }
  if (!Number.isInteger(level) || level < 1 || level > 20) throw new Error('请选择1至20级中的已完成等级。');
  const destination = join(dir, '成果', pad(level)+'级');
  const source = await checkedPath(join(destination, '角色.json'), dir);
  if (!await exists(source)) throw new Error('找不到这个等级的已完成成果。');
  const saved = JSON.parse(await readFile(source, 'utf8'));
  if (saved.id !== state.id || saved.snapshot?.level !== level) throw new Error('本级成果与角色存档不匹配。');
  const output = await checkedPath(join(destination, '角色卡.pdf'), dir);
  if (await existingPdf(output)) return output;
  try {
    await writePdf(lib, saved, template, output);
  } catch (error) {
    if (!await existingPdf(output)) throw error;
  }
  if (!await existingPdf(output)) throw new Error('PDF 导出程序没有写出文件。');
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 5) throw new Error('用法：node export-character-pdf.mjs "角色.json" "空白角色卡.pdf" "预览输出.pdf"');
    const [character, template, output] = process.argv.slice(2);
    const saved = JSON.parse(await readFile(character, 'utf8'));
    await writePdf(await loadLibrary(), saved, template, output);
    console.log(resolve(output));
  } catch (error) {
    console.error('未导出：' + error.message);
    process.exitCode = 1;
  }
}
