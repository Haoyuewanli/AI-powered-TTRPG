import { readFile, realpath, stat, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, isAbsolute, relative, resolve, dirname } from 'node:path';

const allowed = new Set(['.md', '.png', '.jpg', '.jpeg', '.webp', '.gif']);

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function normalizeInputPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw Error('输入相对路径无效');
  const path = value.replace(/\\/g, '/');
  if (path.startsWith('/') || path.includes(':') || /%2e|%2f|%5c/i.test(path)) throw Error('输入路径必须是目录内的普通相对路径');
  const parts = path.split('/');
  if (parts.some(part => part === '..' || !part)) throw Error('输入路径不得含越界或空目录段');
  return parts.filter(part => part !== '.').join('/');
}

export function isWithin(root, target) {
  const rest = relative(root, target);
  return !isAbsolute(rest) && rest !== '..' && !rest.startsWith('../') && !rest.startsWith('..\\');
}

export async function assertOutputTarget(target,inputDir,{directory=false}={}) {
  const output=resolve(target),base=inputDir?await realpath(resolve(inputDir)):null;
  if(base&&(isWithin(base,output)||(directory&&isWithin(output,base))))throw Error('输出不得位于原始输入目录内或覆盖其父目录');
  let ancestor=output;
  while(true){
    try{
      const info=await lstat(ancestor);
      if(ancestor===output)throw Error('输出已存在，不覆盖旧结果');
      const actual=await realpath(ancestor);
      const same=process.platform==='win32'?actual.toLowerCase()===resolve(ancestor).toLowerCase():actual===resolve(ancestor);
      if(info.isSymbolicLink()||!same)throw Error('输出祖先含链接，请使用真实路径');
      if(base&&isWithin(base,actual))throw Error('输出指向原始输入目录');
      return output;
    }catch(error){if(error.code!=='ENOENT')throw error;const parent=dirname(ancestor);if(parent===ancestor)throw Error('输出根目录不存在');ancestor=parent;}
  }
}

export async function resolveInputPath(root, relativePath) {
  const name = normalizeInputPath(relativePath), base = await realpath(resolve(root));
  const path = await realpath(resolve(base, name));
  if (!isWithin(base, path)) throw Error('输入链接指向指定目录之外');
  return path;
}

export async function readInputFile(root, relativePath) {
  const name = normalizeInputPath(relativePath);
  if (!allowed.has(extname(name).toLowerCase())) throw Error('第一轮只读取MD及指定图片，不读取PDF或其他文件');
  const path = await resolveInputPath(root, name);
  if (!allowed.has(extname(path).toLowerCase())) throw Error('输入链接目标不是允许的MD或图片');
  const info = await stat(path);
  if (!info.isFile()) throw Error('输入目标不是普通文件');
  if (info.size > 128 * 1024 * 1024) throw Error('单个输入文件超过128MB');
  return { path, bytes: await readFile(path) };
}
