import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { importRuleLibrary } from './rule-library.mjs';

export async function runRuleImport(args = process.argv.slice(2)) {
  const value = flag => { const index = args.indexOf(flag); if (index < 0) return null; if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(flag + '需要参数'); return args[index + 1]; };
  const sourceRoot = value('--source'); if (!sourceRoot) throw new Error('须用--source明确指定本机网页快照目录；本工具不会联网下载');
  const dryRun = !args.includes('--apply'), projectRoot = value('--project'), backupRoot = value('--backup'), report = value('--report');
  if (!dryRun && (!projectRoot || !backupRoot)) throw new Error('--apply须同时提供--project和--backup，原文件不会被覆盖');
  const result = await importRuleLibrary({ sourceRoot, sourceRevision: value('--revision'), projectRoot, backupRoot, dryRun });
  const summary = { dryRun, stats: result.stats, manifestPath: result.manifestPath || null, written: result.written?.length || 0, unchanged: result.unchanged?.length || 0, conflicts: result.conflicts || [], issues: result.issues };
  if (report) { await mkdir(dirname(resolve(report)), { recursive: true }); await writeFile(resolve(report), JSON.stringify(summary, null, 2) + '\n'); }
  return summary;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { const result = await runRuleImport(); console.log(JSON.stringify(result, null, 2)); if (result.conflicts.length || result.stats.failedPages) process.exitCode = 2; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
