import { mkdir, readFile, writeFile, readdir, lstat, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { playerMarkdown, parsePlayerMarkdown } from '../../../程序/平台/Code/player-format.mjs';

const validName = name => typeof name === 'string' && !!name && name.length < 100 && !/[\\/:*?"<>|\x00-\x1f]/.test(name) && !name.startsWith('.') && !/[. ]$/.test(name) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
async function localPath(projectRoot, target) {
  let cursor = resolve(projectRoot);
  if (target !== cursor && !target.startsWith(cursor + sep)) throw new Error('目录越界。');
  for (const part of relative(cursor, target).split(sep)) {
    cursor = join(cursor, part);
    try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error('不处理链接目录。'); }
    catch (error) { if (error.code === 'ENOENT') break; throw error; }
  }
  return target;
}
async function putNew(path, text) {
  try { await writeFile(path, text, { flag: 'wx' }); return true; }
  catch (error) { if (error.code === 'EEXIST') return false; throw error; }
}
async function directory(path, type) {
  await mkdir(path, { recursive: true });
  if ((await lstat(path)).isSymbolicLink()) throw new Error('不处理链接目录。');
  await putNew(join(path, '索引.json'), JSON.stringify({ id: randomUUID(), type, name: path.split(sep).at(-1), linkedPlayerIds: [] }, null, 2));
}

// Scaffold only: unknown choices remain pending and existing records are never overwritten.
export async function prepareCharacter({ projectRoot, player, character, through }) {
  if (![player, character].every(validName) || !Number.isInteger(through) || through < 1 || through > 20) throw new Error('需要有效玩家名、角色名-模组及1至20级范围。');
  const base = await localPath(projectRoot, resolve(projectRoot, '预处理/玩家', player, character));
  // Check parents before creating them; directory() also validates each existing leaf.
  const players = resolve(projectRoot, '预处理/玩家');
  await directory(join(players, player), 'player');
  await directory(base, 'character');
  for (let level = 1; level <= through; level++) {
    const levelName = String(level).padStart(2, '0') + '级', path = join(base, levelName);
    await directory(path, 'level');
    for (const filename of ['选择.md', '能力.md']) await putNew(join(path, filename), playerMarkdown(filename, { name: character, level: levelName }));
  }
}

export async function ensureTemplates(projectRoot) {
  for (const root of ['预处理/玩家', '资源/玩家']) {
    const path = await localPath(projectRoot, resolve(projectRoot, root, '模版'));
    await mkdir(path, { recursive: true });
    for (const filename of ['选择.md', '能力.md']) await putNew(join(path, filename), playerMarkdown(filename));
  }
}

export async function publishCharacter({ projectRoot, player, character }) {
  if (![player, character].every(validName)) throw new Error('名称无效。');
  const source = await localPath(projectRoot, resolve(projectRoot, '预处理/玩家', player, character));
  const destination = await localPath(projectRoot, resolve(projectRoot, '资源/玩家', player, character));
  const files = [];
  async function scan(path, relative = '') {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const from = join(path, entry.name), key = join(relative, entry.name), stat = await lstat(from);
      if (stat.isSymbolicLink() || stat.isFile() && stat.nlink > 1) throw new Error('不发布链接文件。');
      if (entry.isDirectory()) await scan(from, key);
      else if (entry.isFile()) {
        if (['选择.md', '能力.md'].includes(entry.name)) parsePlayerMarkdown(await readFile(from, 'utf8'), entry.name);
        files.push({ from, key });
      }
    }
  }
  if ((await lstat(source)).isSymbolicLink()) throw new Error('不发布链接目录。');
  await scan(source);
  await directory(resolve(projectRoot, '资源/玩家', player), 'player');
  // Existing characters require explicit review in the player editor, never a bulk overwrite.
  await mkdir(destination);
  for (const { from, key } of files) {
    const target = join(destination, key);
    await mkdir(resolve(target, '..'), { recursive: true });
    await copyFile(from, target, constants.COPYFILE_EXCL);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await ensureTemplates(fileURLToPath(new URL('../../../', import.meta.url)));
  console.log('模版已就绪；已有文件保持不变。');
}
