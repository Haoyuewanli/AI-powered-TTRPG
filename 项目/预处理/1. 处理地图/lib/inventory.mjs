import { readdir, realpath, stat } from 'node:fs/promises';
import { extname, posix as pathPosix, relative, resolve } from 'node:path';
import { isWithin, normalizeInputPath, readInputFile, resolveInputPath, sha256 } from './io.mjs';

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const posix = path => path.replace(/\\/g, '/');
const bounded = (width, height, format) => Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= 100000 && height <= 100000
  ? { width, height, format } : { width: null, height: null, format };

export function imageSize(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return bounded(bytes.readUInt32BE(16), bytes.readUInt32BE(20), 'png');
  if (bytes.length >= 10 && /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) return bounded(bytes.readUInt16LE(6), bytes.readUInt16LE(8), 'gif');
  if (bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const kind = bytes.toString('ascii', 12, 16);
    if (kind === 'VP8X' && bytes.length >= 30) return bounded(bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1, 'webp');
    if (kind === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const value = bytes.readUInt32LE(21);
      return bounded((value & 0x3fff) + 1, ((value >>> 14) & 0x3fff) + 1, 'webp');
    }
    if (kind === 'VP8 ' && bytes.length >= 30 && bytes.subarray(23, 26).toString('hex') === '9d012a') return bounded(bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff, 'webp');
    return { width: null, height: null, format: 'webp' };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) return { width: null, height: null, format: 'jpg' };
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd8) continue;
      if (offset + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 7) return bounded(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3), 'jpg');
      offset += length;
    }
    return { width: null, height: null, format: 'jpg' };
  }
  return { width: null, height: null, format: 'unknown' };
}

function markdownImages(text) {
  const definitions = new Map();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const match = /^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(.*?))(?:\s+["'].*["'])?\s*$/.exec(line);
    if (match) definitions.set(match[1].trim().toLowerCase(), match[2] || match[3]);
  }
  const refs = [];
  lines.forEach((line, index) => {
    const pattern = /!\[([^\]]*)\]\(\s*(?:<([^>]+)>|((?:[^()]|\([^()]*\))+?))\s*\)|!\[([^\]]*)\]\[([^\]]*)\]/g;
    for (const match of line.matchAll(pattern)) {
      let target = match[2] || match[3];
      if (target) target = target.replace(/\s+["'][^"']*["']\s*$/, '').trim();
      else target = definitions.get((match[5] || match[4]).trim().toLowerCase());
      refs.push({ line: index + 1, target: target || '', ...(target ? {} : { unresolvedReference: match[5] || match[4] }) });
    }
    for (const match of line.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) refs.push({ line: index + 1, target: match[1] });
  });
  return refs;
}

export async function indexInput({ inputDir, md, images = 'images' }) {
  const root = await realpath(resolve(inputDir));
  const mdName = normalizeInputPath(md), imageName = normalizeInputPath(images);
  if (extname(mdName).toLowerCase() !== '.md') throw Error('必须明确指定MD，不能以PDF代替');
  const { bytes: mdBytes } = await readInputFile(root, mdName), text = mdBytes.toString('utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/), warnings = [];
  const headings = [];
  lines.forEach((line, index) => {
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) headings.push({ line: index + 1, level: heading[1].length, text: heading[2] });
    else if (/^\s*[A-Z]\d+[a-z]?[.．、]\s*\S/.test(line)) headings.push({ line: index + 1, level: 2, text: line.trim() });
  });
  const imageRefs = markdownImages(text), found = [];
  const imageRoot = await resolveInputPath(root, imageName);
  const visited = new Set();
  async function walk(path) {
    const actual = await realpath(path);
    if (!isWithin(root, actual) || !isWithin(imageRoot, actual)) throw Error('图片目录链接逃逸');
    if (visited.has(actual)) { warnings.push({ code: 'directory-link-repeat', path: posix(relative(root, path)) }); return; }
    visited.add(actual);
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const full = resolve(path, entry.name), name = posix(relative(root, full));
      if (entry.isDirectory()) await walk(full);
      else if (entry.isSymbolicLink()) {
        const actualEntry = await realpath(full);
        if (!isWithin(root, actualEntry) || !isWithin(imageRoot, actualEntry)) throw Error('图片目录链接逃逸');
        if ((await stat(full)).isDirectory()) await walk(full);
        else if (imageExtensions.has(extname(entry.name).toLowerCase())) {
          const { bytes } = await readInputFile(root, name); found.push({ path: name, bytes });
        }
      } else if (entry.isFile() && imageExtensions.has(extname(entry.name).toLowerCase())) {
        const { bytes } = await readInputFile(root, name); found.push({ path: name, bytes });
      }
    }
  }
  await walk(imageRoot);
  const inventoryImages = found.sort((a, b) => a.path.localeCompare(b.path, 'en', { numeric: true })).map(({ path, bytes }) => {
    const dimensions = imageSize(bytes);
    if (dimensions.width === null) warnings.push({ code: 'image-dimensions-unknown', path });
    return { path, sha256: sha256(bytes), bytes: bytes.length, ...dimensions };
  });
  const known = new Set(inventoryImages.map(image => image.path)), used = new Set(), seen = new Set();
  const mdParent = mdName.includes('/') ? mdName.slice(0, mdName.lastIndexOf('/') + 1) : '';
  for (const ref of imageRefs) {
    if (!ref.target || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(ref.target)) { warnings.push({ code: ref.target ? 'external-image-reference' : 'unresolved-image-reference', line: ref.line, target: ref.target }); continue; }
    let target;
    try {
      const rawTarget = ref.target.replace(/\\([ ()\[\]#])/g, '$1').replace(/\\/g, '/');
      const decoded = decodeURIComponent(rawTarget.split(/[?#]/)[0]);
      if (decoded.startsWith('/') || decoded.includes(':')) throw Error('绝对图片引用');
      target = normalizeInputPath(pathPosix.normalize(mdParent + decoded));
    }
    catch { warnings.push({ code: 'unsafe-image-reference', line: ref.line, target: ref.target }); continue; }
    ref.path = target;
    if (seen.has(target)) warnings.push({ code: 'duplicate-image-reference', line: ref.line, path: target });
    seen.add(target);
    if (!known.has(target)) warnings.push({ code: 'missing-image-reference', line: ref.line, path: target });
    else used.add(target);
  }
  for (const image of inventoryImages) if (!used.has(image.path)) warnings.push({ code: 'unreferenced-image', path: image.path });
  return { schemaVersion: 1, md: { path: mdName, sha256: sha256(mdBytes), bytes: mdBytes.length, lineCount: lines.length }, headings, imageRefs, images: inventoryImages, warnings };
}
