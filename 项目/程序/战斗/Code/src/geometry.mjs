// Feet are shared by rules and rendering; the visual body is independent of occupied space.
export function largestFaces({ width, depth, height }) {
  const areas = { z: width * height, x: depth * height, y: width * depth };
  const axis = Object.keys(areas).sort((a, b) => areas[b] - areas[a])[0];
  return { axis, area: areas[axis], materialIndices: { x: [0, 1], y: [2, 3], z: [4, 5] }[axis] };
}

export function distanceBetween(a, b) {
  return Math.max(0,
    Math.abs(a.position.x - b.position.x) - (a.space.width + b.space.width) / 2 + 5,
    Math.abs(a.position.z - b.position.z) - (a.space.depth + b.space.depth) / 2 + 5);
}

export function overlaps(a, b) {
  // Automatic occupancy only compares actors on the same level; height traversal is adjudicated.
  return (a.position.y || 0) === (b.position.y || 0) && Math.abs(a.position.x - b.position.x) < (a.space.width + b.space.width) / 2 &&
    Math.abs(a.position.z - b.position.z) < (a.space.depth + b.space.depth) / 2;
}

export function objectBounds(object) {
  const quarter = object.rotation % 180 !== 0;
  const width = quarter ? object.size.depth : object.size.width;
  const depth = quarter ? object.size.width : object.size.depth;
  return { minX: object.position.x - width / 2, maxX: object.position.x + width / 2,
    minZ: object.position.z - depth / 2, maxZ: object.position.z + depth / 2,
    minY: object.position.y, maxY: object.position.y + object.size.height };
}

// Continuous swept occupied rectangle, allowing exact edge contact without tunnelling through thin walls.
export function pathMeetsObject(actor, destination, object) {
  const bounds = objectBounds(object), y = actor.position.y || 0;
  if (y >= bounds.maxY || y + actor.body.height <= bounds.minY) return false;
  let low = 0, high = 1;
  for (const [axis, size, min, max] of [['x', actor.space.width, bounds.minX, bounds.maxX], ['z', actor.space.depth, bounds.minZ, bounds.maxZ]]) {
    const start = actor.position[axis], delta = destination[axis] - start;
    const left = min - size / 2 + 1e-7, right = max + size / 2 - 1e-7;
    if (Math.abs(delta) < 1e-9) { if (start < left || start > right) return false; }
    else {
      const a = (left - start) / delta, b = (right - start) / delta;
      low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b));
      if (low > high) return false;
    }
  }
  return low <= high;
}
