// The battle grid remains five feet. Construction uses one- and five-foot solids.
export const BASE_BLOCK_UNITS = Object.freeze([1, 5]);

export function baseBlockBrush(unit = 5, custom = null) {
  if (unit === 'current' && custom) return structuredClone(custom);
  const size = Number(unit);
  if (!BASE_BLOCK_UNITS.includes(size)) throw new Error('基础方块只能选择1尺或5尺。');
  return { name: `${size}尺基础方块`, type: 'prop', shape: 'box',
    size: { width: size, depth: size, height: size }, position: { x: 0, y: 0, z: 0 },
    rotation: 0, hidden: false, blocksMovement: true };
}

export function placementAgainstFace(brush, point, normal = { x: 0, y: 1, z: 0 }, unit = brush.size.width) {
  const step = BASE_BLOCK_UNITS.includes(Number(unit)) ? Number(unit) : 1;
  const rotated = [90, 270].includes(brush.rotation);
  const size = { x: rotated ? brush.size.depth : brush.size.width, y: brush.size.height, z: rotated ? brush.size.width : brush.size.depth };
  // Side faces are snapped against their plane; tangent coordinates keep a grid origin.
  const center = {};
  for (const axis of ['x', 'y', 'z']) {
    const wanted = point[axis] + normal[axis] * (size[axis] / 2 + .005);
    center[axis] = Math.round((wanted - size[axis] / 2) / step) * step + size[axis] / 2;
  }
  return { x: center.x, y: center.y - size.y / 2, z: center.z };
}

export function buildingBoundsValid(item, board = {}) {
  const p = item.position, rotated = [90, 270].includes(item.rotation);
  const s = { ...item.size, width: rotated ? item.size.depth : item.size.width, depth: rotated ? item.size.width : item.size.depth };
  if (![p.x, p.y, p.z, s.width, s.depth, s.height].every(Number.isFinite)) return false;
  if (p.y < 0 || p.y + s.height > 100 || Math.abs(p.x) + s.width / 2 > 10000 || Math.abs(p.z) + s.depth / 2 > 10000) return false;
  return !!board.extended || p.x >= s.width / 2 && p.z >= s.depth / 2 && p.x <= board.width - s.width / 2 && p.z <= board.depth - s.depth / 2;
}

// Integer cuboids can be displayed as five-foot cores with one-foot edge blocks.
// A mesh budget keeps old, large hand-built platforms from producing huge scenes.
export function baseBlockComposition(size, budget = 1200) {
  const { width: w, height: h, depth: d } = size;
  if (![w, h, d].every(value => Number.isInteger(value) && value > 0) || w * h * d > 20000) return null;
  const occupied = new Set(), cells = [];
  const index = (x, y, z) => `${x},${y},${z}`;
  for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
    if (occupied.has(index(x, y, z))) continue;
    let unit = x + 5 <= w && y + 5 <= h && z + 5 <= d ? 5 : 1;
    if (unit === 5) outer: for (let yy = y; yy < y + 5; yy++) for (let zz = z; zz < z + 5; zz++) for (let xx = x; xx < x + 5; xx++) if (occupied.has(index(xx, yy, zz))) { unit = 1; break outer; }
    if (cells.length >= budget) return null;
    cells.push({ unit, x: x + unit / 2 - w / 2, y: y + unit / 2, z: z + unit / 2 - d / 2 });
    for (let yy = y; yy < y + unit; yy++) for (let zz = z; zz < z + unit; zz++) for (let xx = x; xx < x + unit; xx++) occupied.add(index(xx, yy, zz));
  }
  return cells;
}
