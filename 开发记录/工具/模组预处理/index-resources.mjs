// 已有资源精简索引：只提取 JSON 的关键字段，不读正文。
// 输出供模型匹配用；同名、旧状态与目录位置只算候选，不视为内容身份确认。
//
// 用法：
//   node 开发记录/工具/模组预处理/index-resources.mjs \
//     --project-root <工作区/项目> --resources-root <项目/资源> \
//     --out <输出JSON绝对路径>

import { parseArgs } from 'node:util';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { toProjectRel, sha256OfFile } from './lib/common.mjs';

const { values } = parseArgs({
  options: {
    'project-root': { type: 'string' },
    'resources-root': { type: 'string' },
    out: { type: 'string' },
  },
});

for (const k of ['project-root', 'resources-root', 'out']) {
  if (!values[k]) {
    console.error(`缺少参数 --${k}`);
    process.exit(2);
  }
}

const projectRoot = resolve(values['project-root']);
const resourcesRoot = resolve(values['resources-root']);
const types = ['角色', 'NPC', '怪物', '地图', '故事', '规则', '物品'];

const entries = [];

function walk(dir) {
  let items;
  try {
    items = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of items) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      walk(p);
    } else if (e.isFile() && e.name.endsWith('.json')) {
      try {
        const text = readFileSync(p, 'utf8');
        if (text.includes('"id"')) {
          const j = JSON.parse(text);
          if (j && typeof j.id === 'string') {
            entries.push({
              id: j.id,
              name: typeof j.name === 'string' ? j.name : null,
              resourceType: typeof j.resourceType === 'string' ? j.resourceType : null,
              jsonPath: toProjectRel(projectRoot, p),
              assetPath: typeof j.assetPath === 'string' ? j.assetPath : null,
              originalAssetPath: typeof j.originalAssetPath === 'string' ? j.originalAssetPath : null,
              bodyPath: typeof j.bodyPath === 'string' ? j.bodyPath : null,
              formatVersion: j.formatVersion ?? null,
              reviewStatus: j.reviewStatus ?? null,
              rulesFamily: j.edition?.rulesFamily ?? null,
              year: j.edition?.year ?? null,
              sourceBook: j.source?.book ?? null,
              sourceKind: j.source?.kind ?? null,
              sourceDocumentPath: j.source?.documentPath ?? null,
              enabled: j.availability?.enabled ?? null,
            });
          }
        }
      } catch {
        // 忽略无法解析或非资源 JSON 的文件
      }
    }
  }
}

for (const t of types) {
  walk(join(resourcesRoot, t));
}

const result = {
  tool: 'index-resources',
  generatedAt: new Date().toISOString(),
  total: entries.length,
  byType: {},
  entries: entries.sort((a, b) => a.jsonPath.localeCompare(b.jsonPath)),
};

for (const e of entries) {
  result.byType[e.resourceType] = (result.byType[e.resourceType] ?? 0) + 1;
}

// 为后续“复用前摘要”检查附上各 JSON 当前摘要与字节数。
for (const e of result.entries) {
  const abs = join(projectRoot, ...e.jsonPath.split('/'));
  const { sha256, bytes } = sha256OfFile(abs);
  e.jsonSha256 = sha256;
  e.jsonBytes = bytes;
}

await import('node:fs').then((fs) => fs.writeFileSync(resolve(values.out), JSON.stringify(result, null, 2), 'utf8'));
console.log(`已写出 ${resolve(values.out)}`);
console.log(`资源条目 ${result.total} 个`);
for (const [t, n] of Object.entries(result.byType)) console.log(`  ${t}: ${n}`);
