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
  return Math.abs(a.position.x - b.position.x) < (a.space.width + b.space.width) / 2 &&
    Math.abs(a.position.z - b.position.z) < (a.space.depth + b.space.depth) / 2;
}
