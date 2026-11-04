import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadLibrary } from './library.mjs';

const [character, template, output] = process.argv.slice(2);

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

async function main() {
  if (process.argv.length !== 5) throw new Error('用法：node export-character-pdf.mjs "角色.json" "空白角色卡.pdf" "预览输出.pdf"');
  const saved = JSON.parse(await readFile(character, 'utf8'));
  const lib = await loadLibrary();
  if (!saved.snapshot || saved.version !== lib.version || saved.sourceHash !== lib.hash) {
    throw new Error('请选择由同一版本资料生成的本级角色成果。');
  }
  const snapshot = saved.snapshot;
  const payload = {
    ...saved, spells: spellRows(lib, snapshot), classFeatures: classFeatures(lib, snapshot),
    featFeatures: featFeatures(lib, snapshot)
  };
  const script = fileURLToPath(new URL('./character-pdf.py', import.meta.url));
  const result = spawnSync('python', ['-X', 'utf8', script, template, output], {
    input: JSON.stringify(payload), encoding: 'utf8', maxBuffer: 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'PDF导出失败。');
  process.stdout.write(result.stdout);
}

main().catch(error => {
  console.error('未导出：' + error.message);
  process.exitCode = 1;
});
