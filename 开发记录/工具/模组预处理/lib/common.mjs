// 模组预处理通用工具库。
// 只提供本地文件、哈希、路径与图像尺寸读取，不联网、不安装依赖、不读取密钥。
// 所有路径参数为绝对路径；输出中的项目相对路径一律为正斜杠、无盘符、无 ".."。

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export function sha256OfFile(absPath) {
  const buf = readFileSync(absPath);
  return { sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length };
}

export function sha256OfString(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// 项目相对路径：正斜杠、无盘符、无前导斜杠；不允许 .. 逃逸。
export function toProjectRel(projectRoot, absPath) {
  const rel = relative(resolve(projectRoot), resolve(absPath));
  const posix = rel.split('\\').join('/');
  if (posix === '..' || posix.startsWith('../') || /^[A-Za-z]:/.test(posix) || posix.startsWith('/')) {
    throw new Error(`路径不在项目根内: ${absPath}`);
  }
  return posix;
}

// 从项目相对路径解析绝对路径；含 ..、盘符、绝对路径或空段时拒绝。
export function fromProjectRel(projectRoot, rel) {
  if (typeof rel !== 'string' || rel === '') return null;
  if (/^[A-Za-z]:/.test(rel) || rel.startsWith('/')) return null;
  const parts = rel.split('/');
  if (parts.some((p) => p === '..' || p === '')) return null;
  const abs = resolve(projectRoot, ...parts);
  const relBack = relative(resolve(projectRoot), abs);
  if (relBack === '..' || relBack.startsWith('..\\') || relBack.startsWith('../') || /^[A-Za-z]:/.test(relBack)) {
    return null;
  }
  return abs;
}

export function isWithin(rootAbs, targetAbs) {
  const rel = relative(resolve(rootAbs), resolve(targetAbs));
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('..\\'));
}

export function existsFile(absPath) {
  try {
    return statSync(absPath).isFile();
  } catch {
    return false;
  }
}

export function existsDir(absPath) {
  try {
    return statSync(absPath).isDirectory();
  } catch {
    return false;
  }
}

export function ensureDir(absPath) {
  mkdirSync(absPath, { recursive: true });
  return absPath;
}

// 递归列出文件；不跟随符号链接（readdirSync 的 dirent 只按名称判断，链接文件按文件处理，
// 链接目录按普通目录判断——本工具只用于盘点与生成，写入前另有边界检查）。
export function listFilesSync(rootAbs, out = []) {
  let entries;
  try {
    entries = readdirSync(rootAbs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(rootAbs, e.name);
    if (e.isDirectory()) {
      listFilesSync(p, out);
    } else if (e.isFile()) {
      out.push(p);
    }
  }
  return out;
}

// ---------------- 图像尺寸 ----------------
// 只读文件头，不完整解码。支持 PNG 与 JPEG；其它格式返回 width/height 为 null。

export function imageSize(absPath) {
  const buf = readFileSync(absPath);
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: 'png' };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = buf.readUInt16BE(i + 5);
        const width = buf.readUInt16BE(i + 7);
        return { width, height, format: 'jpg' };
      }
      i += 2 + len;
    }
    return { width: null, height: null, format: 'jpg' };
  }
  return { width: null, height: null, format: 'unknown' };
}

export function readTextUtf8(absPath) {
  try {
    return readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}

export function readJson(absPath) {
  const text = readTextUtf8(absPath);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function dirnameOf(absPath) {
  return dirname(absPath);
}

export { dirname, join, relative, resolve };
