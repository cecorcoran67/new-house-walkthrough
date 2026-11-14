import * as THREE from 'three';
import { M } from './materials.js';

// Shared registries consumed by the player controller and the door animator.
export const colliders = []; // axis-aligned boxes: { x0, y0, z0, x1, y1, z1 }
export const doors = [];

export function addCollider(x0, y0, z0, x1, y1, z1) {
  colliders.push({
    x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1),
    x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1),
  });
}

// Rewrites UVs to world-space metres so textures tile consistently on any box.
function worldUV(geo, cx, cy, cz) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + cx;
    const y = p.getY(i) + cy;
    const z = p.getZ(i) + cz;
    if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, z, y);
    else if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, x, z);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
}

/** Axis-aligned box from two corners. Adds a collider unless opts.collide === false. */
export function box(parent, x0, y0, z0, x1, y1, z1, mat, opts = {}) {
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  const d = Math.abs(z1 - z0);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const cz = (z0 + z1) / 2;
  const geo = new THREE.BoxGeometry(w, h, d);
  worldUV(geo, cx, cy, cz);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, cy, cz);
  mesh.castShadow = opts.cast !== false && !mat.transparent;
  mesh.receiveShadow = opts.receive !== false;
  parent.add(mesh);
  if (opts.collide !== false) addCollider(x0, y0, z0, x1, y1, z1);
  return mesh;
}

/** Decorative box (no collision). */
export function deco(parent, x0, y0, z0, x1, y1, z1, mat, opts = {}) {
  return box(parent, x0, y0, z0, x1, y1, z1, mat, { ...opts, collide: false });
}

// Converts "along the wall" coordinates into world x/z extents.
// axis 'x': wall runs along X at z = fixed. axis 'z': wall runs along Z at x = fixed.
function span(axis, fixed, t, a, b) {
  return axis === 'x'
    ? { x0: a, x1: b, z0: fixed - t / 2, z1: fixed + t / 2 }
    : { x0: fixed - t / 2, x1: fixed + t / 2, z0: a, z1: b };
}

function wbox(parent, axis, fixed, t, a, b, y0, y1, mat, opts) {
  const s = span(axis, fixed, t, a, b);
  return box(parent, s.x0, y0, s.z0, s.x1, y1, s.z1, mat, opts);
}

function frameAndGlass(parent, axis, fixed, a, b, y0, y1, o) {
  const f = 0.05;
  const ft = 0.1;
  const glass = o.frosted ? M.frosted : M.glass;
  wbox(parent, axis, fixed, 0.02, a, b, y0, y1, glass, { collide: false, cast: false });
  wbox(parent, axis, fixed, ft, a, b, y0, y0 + f, M.frame, { collide: false });
  wbox(parent, axis, fixed, ft, a, b, y1 - f, y1, M.frame, { collide: false });
  wbox(parent, axis, fixed, ft, a, a + f, y0, y1, M.frame, { collide: false });
  wbox(parent, axis, fixed, ft, b - f, b, y0, y1, M.frame, { collide: false });
  const mv = o.mv ?? Math.max(0, Math.round((b - a) / 1.3) - 1);
  for (let i = 1; i <= mv; i++) {
    const p = a + ((b - a) * i) / (mv + 1);
    wbox(parent, axis, fixed, ft, p - f / 2, p + f / 2, y0, y1, M.frame, { collide: false });
  }
  const mh = o.mh ?? 0;
  for (let i = 1; i <= mh; i++) {
    const p = y0 + ((y1 - y0) * i) / (mh + 1);
    wbox(parent, axis, fixed, ft, a, b, p - f / 2, p + f / 2, M.frame, { collide: false });
  }
}

function registerDoor(d) {
  d.open = 0;
  doors.push(d);
}

function swingDoor(parent, axis, fixed, a, b, y0, y1, o) {
  const w = b - a;
  const mat = o.mat || M.woodPanel;
  // Frame
  wbox(parent, axis, fixed, 0.24, a - 0.04, a, y0, y1 + 0.04, M.walnut, { collide: false });
  wbox(parent, axis, fixed, 0.24, b, b + 0.04, y0, y1 + 0.04, M.walnut, { collide: false });
  wbox(parent, axis, fixed, 0.24, a, b, y1, y1 + 0.04, M.walnut, { collide: false });
  const pivot = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, y1 - y0 - 0.02, 0.045), mat);
  leaf.castShadow = true;
  leaf.position.set(w / 2, (y1 - y0) / 2, 0);
  pivot.add(leaf);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.12), M.chrome);
  handle.position.set(w - 0.12, 1.0, 0);
  pivot.add(handle);
  const baseRot = axis === 'x' ? 0 : -Math.PI / 2;
  pivot.rotation.y = baseRot;
  pivot.position.set(axis === 'x' ? a : fixed, y0, axis === 'x' ? fixed : a);
  parent.add(pivot);
  const cx = axis === 'x' ? (a + b) / 2 : fixed;
  const cz = axis === 'x' ? fixed : (a + b) / 2;
  registerDoor({ kind: 'swing', pivot, baseRot, axis, fixed, center: new THREE.Vector3(cx, y0, cz), dir: 1 });
}

function pivotDoor(parent, axis, fixed, a, b, y0, y1) {
  const w = b - a;
  const off = 0.4; // pivot offset from the hinge edge, like the real entry door
  const pivot = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, y1 - y0 - 0.02, 0.07), M.woodPanel);
  leaf.castShadow = true;
  leaf.position.set(w / 2 - off, (y1 - y0) / 2, 0);
  pivot.add(leaf);
  for (const side of [-0.07, 0.07]) {
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.6, 0.035), M.steel);
    pull.position.set(w - off - 0.18, (y1 - y0) / 2, side);
    pivot.add(pull);
  }
  pivot.position.set(a + off, y0, fixed);
  parent.add(pivot);
  registerDoor({ kind: 'swing', pivot, baseRot: 0, axis, fixed, center: new THREE.Vector3((a + b) / 2, y0, fixed), dir: 1, max: 1.45 });
}

function slidingDoor(parent, axis, fixed, a, b, y0, y1, o) {
  // Fixed frame around the opening, two leaves that part from the centre.
  const f = 0.05;
  wbox(parent, axis, fixed, 0.12, a, b, y1 - f, y1, M.frame, { collide: false });
  wbox(parent, axis, fixed, 0.12, a, a + f, y0, y1, M.frame, { collide: false });
  wbox(parent, axis, fixed, 0.12, b - f, b, y0, y1, M.frame, { collide: false });
  const half = (b - a) / 2;
  const leaves = [];
  for (const side of [0, 1]) {
    const g = new THREE.Group();
    const la = side === 0 ? a : a + half;
    frameAndGlass(g, axis, fixed + (side === 0 ? -0.03 : 0.03), la, la + half, y0, y1 - f, { mv: 0, frosted: o.frosted });
    parent.add(g);
    leaves.push({ g, sign: side === 0 ? -1 : 1 });
  }
  const cx = axis === 'x' ? (a + b) / 2 : fixed;
  const cz = axis === 'x' ? fixed : (a + b) / 2;
  registerDoor({ kind: 'slide', leaves, axis, travel: half * 0.92, center: new THREE.Vector3(cx, y0, cz), reach: 2.6 });
}

function louvers(parent, axis, fixed, a, b, y0, y1, o) {
  if (o.glass !== false) frameAndGlass(parent, axis, fixed, a, b, y0, y1, { mv: 0, mh: Math.round((y1 - y0) / 1.5) });
  const depth = 0.22;
  const off = (o.side ?? 1) * 0.14;
  for (let p = a + 0.12; p < b - 0.05; p += 0.26) {
    wbox(parent, axis, fixed + off, depth, p - 0.02, p + 0.02, y0, y1, M.frame, { collide: false });
  }
}

/**
 * Builds a straight wall with openings.
 * opening: { from, to, y0?, y1?, type: 'open'|'window'|'door'|'pivot'|'slider'|'louver', ...options }
 * y0/y1 on an opening are absolute heights; they default to a door-height opening from the wall base.
 */
export function wall(parent, axis, fixed, a, b, y0, y1, opts = {}) {
  const t = opts.t ?? 0.2;
  const mat = opts.mat || M.stucco;
  const openings = [...(opts.openings || [])].sort((p, q) => p.from - q.from);
  let cur = a;
  const solid = (p, q, ya, yb) => {
    if (q - p > 0.001 && yb - ya > 0.001) wbox(parent, axis, fixed, t, p, q, ya, yb, mat);
  };
  for (const o of openings) {
    const oy0 = o.y0 ?? y0;
    const oy1 = Math.min(o.y1 ?? y0 + 2.3, y1);
    solid(cur, o.from, y0, y1);
    solid(o.from, o.to, y0, oy0);
    solid(o.from, o.to, oy1, y1);
    switch (o.type) {
      case 'window':
        frameAndGlass(parent, axis, fixed, o.from, o.to, oy0, oy1, o);
        wbox(parent, axis, fixed, 0.06, o.from, o.to, oy0, oy1, M.glass, { cast: false }).visible = false;
        break;
      case 'louver':
        louvers(parent, axis, fixed, o.from, o.to, oy0, oy1, o);
        wbox(parent, axis, fixed, 0.06, o.from, o.to, oy0, oy1, M.glass, { cast: false }).visible = false;
        break;
      case 'door':
        swingDoor(parent, axis, fixed, o.from, o.to, oy0, oy1, o);
        break;
      case 'pivot':
        pivotDoor(parent, axis, fixed, o.from, o.to, oy0, oy1);
        break;
      case 'slider':
        slidingDoor(parent, axis, fixed, o.from, o.to, oy0, oy1, o);
        break;
      default:
        break; // 'open'
    }
    cur = o.to;
  }
  solid(cur, b, y0, y1);
}

/** Thin cladding panel laid over one face of a wall (side = +1 / -1 along the wall normal). */
export function clad(parent, axis, fixed, side, a, b, y0, y1, mat, wallT = 0.2) {
  const th = 0.03;
  const c = fixed + side * (wallT / 2 + th / 2);
  return wbox(parent, axis, c, th, a, b, y0, y1, mat, { collide: false });
}

/** Frameless glass balustrade with a slim top rail. */
export function glassRail(parent, axis, fixed, a, b, y0, h = 1.05) {
  wbox(parent, axis, fixed, 0.025, a, b, y0, y0 + h, M.glass, { cast: false });
  wbox(parent, axis, fixed, 0.05, a, b, y0, y0 + 0.06, M.steel, { collide: false });
  wbox(parent, axis, fixed, 0.045, a, b, y0 + h, y0 + h + 0.03, M.steel, { collide: false });
}

export function cylinder(parent, x, y, z, r, h, mat, opts = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(opts.rTop ?? r, r, h, opts.seg ?? 20), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  if (opts.collide) addCollider(x - r, y, z - r, x + r, y + h, z + r);
  return m;
}

/** Warm LED strip / downlight fixtures: emissive geometry only, real lights are added separately. */
export function ledStrip(parent, x0, y, z0, x1, z1) {
  return deco(parent, x0, y - 0.02, z0, x1, y, z1, M.glow, { cast: false, receive: false });
}

export function downlight(parent, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12), M.glow);
  m.position.set(x, y - 0.012, z);
  parent.add(m);
  return m;
}

// Animates every registered door: they open as the player approaches and
// never block movement (door leaves have no colliders).
export function updateDoors(player, dt) {
  for (const d of doors) {
    const dx = player.x - d.center.x;
    const dz = player.z - d.center.z;
    const dy = player.y - d.center.y;
    const near = Math.abs(dy) < 1.6 && dx * dx + dz * dz < (d.reach ?? 2.3) ** 2;
    if (near && d.open < 0.02 && d.kind === 'swing') {
      // Swing away from whichever side the player is approaching from.
      const s = d.axis === 'x' ? dz : dx;
      d.dir = d.axis === 'x' ? (s > 0 ? 1 : -1) : (s > 0 ? -1 : 1);
    }
    const target = near ? 1 : 0;
    d.open += (target - d.open) * Math.min(1, dt * 5);
    if (d.kind === 'swing') {
      d.pivot.rotation.y = d.baseRot + d.dir * d.open * (d.max ?? 1.5);
    } else {
      for (const l of d.leaves) {
        const off = l.sign * d.open * d.travel;
        if (d.axis === 'x') l.g.position.x = off;
        else l.g.position.z = off;
      }
    }
  }
}
