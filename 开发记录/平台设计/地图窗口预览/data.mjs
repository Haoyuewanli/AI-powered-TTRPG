import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sensory, sensorySources } from './sensory.mjs';

const exec = promisify(execFile);
const sourcePath = '模组/预处理/多人短团/风骸岛之龙/故事/原始资料/原文.md';
const sourceDigest = 'd9ea9b4515b1c55ff7585542a2a2d995c7ee858cdb6bc2bcb88685e86094c36c';
const resources = {
  island: ['F/风骸岛（主持人）--45c1817766e1', 'F/风骸岛（玩家）--4cbae8e39f65'],
  rest: ['J/巨龙之憩（主持人）--3581dfe272bf', 'J/巨龙之憩（玩家）--3ab066498915'],
  caves: ['H/海藻洞穴（主持人）--298de84b58a3', 'H/海藻洞穴（玩家）--bc0cf1d37b16'],
  wreck: ['L/罗盘蔷薇号残骸（主持人）--4ed46bcfc9d3', 'L/罗盘蔷薇号残骸（玩家）--ba29673ce7fc'],
  observatory: ['Y/崖顶天文台（主持人）--619cb4e77c28', 'Y/崖顶天文台（玩家）--8e4703aecfcb']
};

const places = [
  ['island', null, '风骸岛', [[357, 361]]],
  ['rest', 'island', '巨龙之憩', [[359, 361]]],
  ['caves', 'island', '海藻洞穴', [[715, 715], [719, 719]]],
  ['wreck', 'island', '罗盘蔷薇号残骸', [[894, 894]]],
  ['observatory', 'island', '崖顶天文台', [[1082, 1082]]],
  ['grave', 'island', '布拉斯托墓地', [[1060, 1060]]],
  ['A1', 'rest', 'A1 登山路与修道院房间', [[487, 489]]],
  ['A2', 'rest', 'A2 绞车屋', [[499, 499]]],
  ['A3', 'rest', 'A3 厨房', [[507, 507]]],
  ['A4', 'rest', 'A4 图书馆', [[513, 513]]],
  ['A5', 'rest', 'A5 巴哈姆特神殿', [[519, 519]]],
  ['B1', 'caves', 'B1 入口隧道', [[766, 766]]],
  ['B2', 'caves', 'B2 真菌农场', [[776, 776]]],
  ['B3', 'caves', 'B3 食物储藏室', [[802, 802]]],
  ['B4', 'caves', 'B4 议事圆厅', [[810, 810]]],
  ['B5', 'caves', 'B5 塞纳萨圣所', [[818, 818]]],
  ['B6', 'caves', 'B6 水晶洞穴', [[828, 828]]],
  ['C1', 'wreck', 'C1 主甲板', [[904, 904]]],
  ['C2', 'wreck', 'C2 前甲板', [[918, 918]]],
  ['C3', 'wreck', 'C3 尾甲板', [[924, 924]]],
  ['C4', 'wreck', 'C4 船长室', [[936, 936]]],
  ['C5', 'wreck', 'C5 厨房', [[948, 948]]],
  ['C6', 'wreck', 'C6 船员宿舍', [[954, 956]]],
  ['C7', 'wreck', 'C7 餐厅', [[966, 966]]],
  ['C8', 'wreck', 'C8 下层甲板', [[972, 972]]],
  ['C9', 'wreck', 'C9 货舱', [[1002, 1002]]],
  ['D1', 'observatory', 'D1 鸟瞰台', [[1154, 1154]]],
  ['D2', 'observatory', 'D2 圆厅废墟', [[1162, 1164]]],
  ['D3', 'observatory', 'D3 狗头人营地', [[1198, 1200]]],
  ['D4', 'observatory', 'D4 独立研究院', [[1208, 1208]]],
  ['D5', 'observatory', 'D5 天文台塔楼', [[1234, 1236]]],
  ['D6', 'D5', 'D6 秘密图书馆', [[1282, 1282]]]
];

const marked = (targetId, px, py, label = targetId) => ({ targetId, label, x: px / 1700, y: py / 1214 });
const hotspots = {
  island: [marked('wreck', 434, 375, '×'), marked('rest', 629, 613, '×'), marked('caves', 437, 854, '×'), marked('observatory', 852, 945, '×')],
  rest: [marked('A1', 542, 753), marked('A2', 1505, 370), marked('A3', 1328, 248), marked('A4', 1027, 127), marked('A5', 145, 291), marked('A1', 480, 755, '★'), marked('A5', 284, 347, '★')],
  caves: [marked('B1', 1062, 984), marked('B2', 1300, 824), marked('B3', 875, 667), marked('B4', 905, 375), marked('B5', 1140, 166), marked('B6', 347, 430), marked('island', 128, 550, '↖'), marked('island', 1283, 1116, '↘'), marked('B1', 677, 1008, '↑'), marked('B1', 977, 1092, '→')],
  wreck: [marked('C1', 1114, 593), marked('C2', 531, 502), marked('C3', 194, 566), marked('C4', 971, 448), marked('C5', 943, 611), marked('C6', 1377, 458), marked('C7', 1346, 615), marked('C8', 440, 934), marked('C9', 1300, 963)],
  observatory: [marked('D1', 158, 655), marked('D2', 700, 660), marked('D3', 581, 447), marked('D4', 553, 997), marked('D5', 1046, 427), marked('D6', 1314, 889), marked('D1', 301, 663, '★'), marked('D1', 301, 732, '★'), marked('D2', 599, 664, '★'), marked('D2', 599, 733, '★'), marked('D2', 628, 763, '★'), marked('D2', 670, 805, '★'), marked('D4', 495, 903, '★'), marked('D4', 527, 933, '★'), marked('D6', 1345, 753, '塔楼内部')]
};
hotspots.rest.push(marked('A1', 645, 804, '+30ft'), marked('A2', 1500, 523, '+50ft'), marked('A1', 1132, 437, '+60ft'), marked('A1', 663, 340, '+80ft'), marked('A5', 445, 342, '+90ft'));
hotspots.observatory.push(marked('D1', 176, 537, '+30ft'), marked('D3', 404, 426, '+30ft'), marked('D4', 421, 1028, '+30ft'), marked('D2', 899, 878, '+30ft'), marked('D5', 1185, 332, '+45ft'));
hotspots.wreck.push(marked('wreck', 238, 377, '上层甲板'), marked('C1', 976, 377, '主甲板层'), marked('C8', 236, 777, '下层甲板'), marked('C9', 976, 777, '货舱'));

function pngSize(bytes) {
  if (bytes.length < 24 || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw Error('地图不是有效PNG');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 20000 || height > 20000) throw Error('地图尺寸无效');
  return { width, height };
}
function register(assets, bytes) {
  const id = 'a' + createHash('sha256').update(bytes).digest('hex').slice(0, 24);
  assets.set(id, { bytes, mime: 'image/png' }); return '/assets/' + id;
}
async function localAsset(projectRoot, mapRoot, metadataPath) {
  const metadata = JSON.parse(await readFile(resolve(mapRoot, metadataPath + '.json'), 'utf8'));
  if (typeof metadata.assetPath !== 'string') throw Error('地图资源路径缺失');
  const path = await realpath(resolve(projectRoot, metadata.assetPath));
  const within = relative(mapRoot, path);
  if (isAbsolute(within) || within === '..' || within.startsWith('..\\') || within.startsWith('../') || extname(path).toLowerCase() !== '.png') throw Error('地图资源超出指定目录');
  const bytes = await readFile(path); return { path, bytes, ...pngSize(bytes) };
}

async function towerInset(path) {
  const literal = "'" + path.replace(/'/g, "''") + "'";
  const script = `Add-Type -AssemblyName System.Drawing
$image=[System.Drawing.Bitmap]::FromFile(${literal})
$crop=$null
$memory=$null
try {
  $region=[System.Drawing.Rectangle]::new(1158,695,388,389)
  $crop=$image.Clone($region,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $memory=[System.IO.MemoryStream]::new()
  $crop.Save($memory,[System.Drawing.Imaging.ImageFormat]::Png)
  [Convert]::ToBase64String($memory.ToArray())
} finally {
  if($memory){$memory.Dispose()}
  if($crop){$crop.Dispose()}
  $image.Dispose()
}`;
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 20000 });
  return Buffer.from(stdout.trim(), 'base64');
}

export async function loadModuleData({ projectRoot }) {
  const mapRoot = await realpath(resolve(projectRoot, '资源/地图'));
  const raw = await readFile(resolve(projectRoot, sourcePath), 'utf8'), lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (createHash('sha256').update(raw).digest('hex') !== sourceDigest) throw Error('模组原文版本已变化，需要重新核对地点与来源行号');
  const slice = (start, end) => lines.slice(start - 1, end).join('\n').trim();
  const assets = new Map(), sources = new Map();
  const nodes = places.map(([id, parentId, name, ranges]) => {
    let description = ranges.map(([start, end]) => slice(start, end)).join('\n\n');
    if (id === 'grave') description = description.split('。')[0] + '。';
    if (!description || /^#+\s/.test(description)) throw Error('基础描述来源发生变化：' + id);
    const start = Math.min(...ranges.map(r => r[0])), end = Math.max(...ranges.map(r => r[1]));
    sources.set(id, ranges.map(([a, b]) => `【原文第${a}～${b}行】\n` + slice(a, b)).join('\n\n'));
    return { id, parentId, name, kind: 'text', width: 280, height: 120, description, sensory: sensory[id], sensorySourceRanges: sensorySources[id], source: { start, end, ranges, label: '模组原文 ' + ranges.map(([a, b]) => a === b ? `第${a}行` : `第${a}～${b}行`).join('、') }, hotspots: [] };
  });
  let observatoryFiles;
  for (const [id, files] of Object.entries(resources)) {
    const pair = await Promise.all(files.map(file => localAsset(projectRoot, mapRoot, file)));
    const node = nodes.find(n => n.id === id);
    Object.assign(node, { kind: 'image', width: pair[0].width, height: pair[0].height, variants: pair.map((image, index) => ({ id: index ? 'player' : 'dm', label: index ? '玩家原图' : '主持原图', url: register(assets, image.bytes) })), hotspots: hotspots[id] });
    node.imageUrl = node.variants[0].url;
    if (id === 'observatory') observatoryFiles = pair;
  }
  const insetBytes = await Promise.all(observatoryFiles.map(image => towerInset(image.path)));
  const interior = nodes.find(n => n.id === 'D6');
  Object.assign(interior, { kind: 'image', ...pngSize(insetBytes[0]), variants: insetBytes.map((bytes, index) => ({ id: index ? 'player' : 'dm', label: index ? '玩家原图局部' : '主持原图局部', url: register(assets, bytes) })), hotspots: [{ label: 'D6', targetId: 'D6', x: (1314 - 1158) / 388, y: (889 - 695) / 389 }] });
  interior.imageUrl = interior.variants[0].url;
  return {
    moduleData: { id: 'stormwreck-v1436-map-preview', title: '风骸岛之龙', players: [{ id: 'p1', name: '测试玩家一' }, { id: 'p2', name: '测试玩家二' }, { id: 'p3', name: '测试玩家三' }], nodes },
    assets, sources
  };
}
