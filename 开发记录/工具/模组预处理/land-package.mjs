// 落盘脚本：把阶段区生成的包与新资源复制到最终位置。
// 规则：
//  - 落盘前检查全部目标：任何目标已存在（目录非空或文件已存在）→ 停止整批写入并报告冲突，不部分写入。
//  - 逐文件复制并记录写入日志（源摘要、目标路径、字节数、SHA256、动作）。
//  - 不删除、不覆盖任何已有文件；本批只新增。
//  - 所有写入经绝对路径解析；写入根限于 项目/模组/预处理/<模块相对> 与 项目/资源/<新资源相对>。
//
// 用法：
//   node 开发记录/工具/模组预处理/land-package.mjs \
//     --project-root <工作区/项目> --package-dir <阶段区包根绝对路径> \
//     --module-rel <最终模组目录项目相对路径> \
//     --stage-root <阶段区根（新资源所在）绝对路径> \
//     --log <写入日志JSON输出绝对路径> \
//     [--check-only]

import { parseArgs } from 'node:util';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fromProjectRel, sha256OfFile } from './lib/common.mjs';

const { values } = parseArgs({
  options: {
    'project-root': { type: 'string' },
    'package-dir': { type: 'string' },
    'module-rel': { type: 'string' },
    'stage-root': { type: 'string' },
    log: { type: 'string' },
    'check-only': { type: 'boolean' },
  },
});
for (const k of ['project-root', 'package-dir', 'module-rel', 'stage-root', 'log']) {
  if (!values[k]) { console.error(`缺少参数 --${k}`); process.exit(2); }
}

const projectRoot = resolve(values['project-root']);
const packageDir = resolve(values['package-dir']);
const stageRoot = resolve(values['stage-root']);
const moduleRel = values['module-rel'].replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
const logPath = resolve(values.log);

function listFiles(dir, out = []) {
  let items;
  try { items = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of items) {
    const p = join(dir, e.name);
    if (e.isDirectory()) listFiles(p, out);
    else out.push(p);
  }
  return out;
}

// 复制计划：[{srcAbs, destRel}]
const plan = [];
const pkgFiles = listFiles(join(packageDir, ...moduleRel.split('/')));
for (const f of pkgFiles) {
  const within = relative(join(packageDir, ...moduleRel.split('/')), f).replace(/\\/g, '/');
  plan.push({ srcAbs: f, destRel: `${moduleRel}/${within}` });
}
const resFiles = listFiles(join(stageRoot, '新资源'));
for (const f of resFiles) {
  const within = relative(join(stageRoot, '新资源'), f).replace(/\\/g, '/');
  plan.push({ srcAbs: f, destRel: within });
}
plan.sort((a, b) => a.destRel.localeCompare(b.destRel));

// 预检：目标必须都不存在（目录不存在或文件不存在）；目标父目录在项目根内。
const conflicts = [];
for (const item of plan) {
  const destAbs = fromProjectRel(projectRoot, item.destRel);
  if (!destAbs) { conflicts.push({ destRel: item.destRel, reason: '目标路径解析失败或越界' }); continue; }
  if (existsSync(destAbs)) conflicts.push({ destRel: item.destRel, reason: '目标已存在，禁止覆盖' });
}
// 目标模块目录若已存在且非空（计划外内容）也视为冲突
const moduleDirAbs = fromProjectRel(projectRoot, moduleRel);
if (moduleDirAbs && existsSync(moduleDirAbs)) {
  const existing = listFiles(moduleDirAbs).map((f) => relative(moduleDirAbs, f).replace(/\\/g, '/'));
  const planned = new Set(plan.filter((p) => p.destRel.startsWith(moduleRel + '/')).map((p) => p.destRel.replace(moduleRel + '/', '')));
  const extra = existing.filter((e) => !planned.has(e));
  if (extra.length) conflicts.push({ destRel: `${moduleRel}/<既有文件>`, reason: `目标目录已存在计划外文件: ${extra.slice(0, 10).join('; ')}` });
}

const log = {
  tool: 'land-package',
  generatedAt: new Date().toISOString(),
  projectRoot,
  moduleRel,
  checkOnly: !!values['check-only'],
  totalFiles: plan.length,
  conflicts,
  writes: [],
  completed: false,
};

if (conflicts.length) {
  log.note = '发现冲突：停止整批写入，不执行任何复制。';
  writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf8');
  console.log(JSON.stringify({ status: 'conflict-stopped', conflicts }, null, 2));
  process.exit(3);
}

if (!values['check-only']) {
  for (const item of plan) {
    const destAbs = fromProjectRel(projectRoot, item.destRel);
    mkdirSync(dirname(destAbs), { recursive: true });
    copyFileSync(item.srcAbs, destAbs);
    const { sha256, bytes } = sha256OfFile(item.srcAbs);
    const destInfo = sha256OfFile(destAbs);
    log.writes.push({
      destRel: item.destRel,
      action: 'created',
      bytes,
      sha256,
      destSha256: destInfo.sha256,
      verified: destInfo.sha256 === sha256,
    });
    if (destInfo.sha256 !== sha256) {
      log.note = '复制校验失败：源与目标摘要不一致，落盘不完整。';
      writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf8');
      console.log(JSON.stringify({ status: 'copy-mismatch', file: item.destRel }, null, 2));
      process.exit(4);
    }
  }
}
log.completed = !values['check-only'];
log.note = log.note ?? (values['check-only'] ? '预检通过，无冲突（未执行写入）。' : '全部文件复制完成且源/目标摘要一致。');
writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf8');
console.log(JSON.stringify({
  status: log.completed ? 'landed' : 'check-passed',
  totalFiles: plan.length,
  conflicts: conflicts.length,
  verified: values['check-only'] ? null : log.writes.filter((x) => x.verified).length,
}, null, 2));
