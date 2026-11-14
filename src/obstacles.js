// Rotated-box obstacles for everything that is not axis-aligned (neighbouring houses, trees,
// the cars) plus the outer fence. The house itself uses the axis-aligned `colliders` in builder.js.

const CELL = 32;
const grid = new Map();
const cellKey = (i, j) => (i + 4096) * 8192 + (j + 4096);

export const movers = []; // obstacles that move (the cars); checked on every query
let fence = null; // [[x, z], ...] ring that nothing may leave

/** Box centred on (x, z) with half-extents hw (local x) and hd (local z), turned by `angle` about y. */
export function makeObb(x, z, hw, hd, angle, y0, y1) {
  return { x, z, hw, hd, c: Math.cos(angle), s: Math.sin(angle), y0, y1 };
}

export function addObb(x, z, hw, hd, angle, y0, y1) {
  const o = makeObb(x, z, hw, hd, angle, y0, y1);
  const r = Math.hypot(hw, hd);
  for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) {
    for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
      const k = cellKey(i, j);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(o);
    }
  }
  return o;
}

export function setFence(ring) {
  fence = ring;
}

export function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[j];
    if (z1 > z !== z2 > z && x < ((x2 - x1) * (z - z1)) / (z2 - z1) + x1) inside = !inside;
  }
  return inside;
}

export const insideFence = (x, z) => !fence || pointInPolygon(x, z, fence);

function touches(o, x, z, r, yLo, yHi) {
  if (o.y1 <= yLo || o.y0 >= yHi) return false;
  const dx = x - o.x;
  const dz = z - o.z;
  const ex = Math.max(0, Math.abs(dx * o.c - dz * o.s) - o.hw);
  const ez = Math.max(0, Math.abs(dx * o.s + dz * o.c) - o.hd);
  return ex * ex + ez * ez < r * r;
}

/** True when a circle of radius r at (x, z), spanning heights yLo..yHi, hits an obstacle or leaves the fence. */
export function solidAt(x, z, r, yLo, yHi, skip, ignoreFence = false) {
  if (!ignoreFence && !insideFence(x, z)) return true;
  for (const o of movers) if (o !== skip && touches(o, x, z, r, yLo, yHi)) return true;
  for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) {
    for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
      const cell = grid.get(cellKey(i, j));
      if (cell) for (const o of cell) if (touches(o, x, z, r, yLo, yHi)) return true;
    }
  }
  return false;
}
