import * as THREE from 'three';
import { M, drawnMaterial } from './materials.js';
import { box, deco, cylinder, addCollider } from './builder.js';

// Furniture is assembled from boxes in world coordinates. "dir" is the compass
// direction a piece faces: n = -z (pool), s = +z (street), e = +x, w = -x.
const DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

// Box defined in a local frame: `f` metres forward, `r` metres to the right of (cx, cz).
function local(parent, cx, cz, dir, f0, f1, r0, r1, y0, y1, mat, collide = false) {
  const [fx, fz] = DIRS[dir];
  const rx = -fz;
  const rz = fx;
  const xs = [cx + fx * f0 + rx * r0, cx + fx * f1 + rx * r1];
  const zs = [cz + fz * f0 + rz * r0, cz + fz * f1 + rz * r1];
  return box(parent, Math.min(...xs), y0, Math.min(...zs), Math.max(...xs), y1, Math.max(...zs), mat, { collide });
}

export function chair(p, x, z, dir, y = 0, mat = M.fabricCream, legs = M.black) {
  local(p, x, z, dir, -0.24, 0.24, -0.24, 0.24, y + 0.4, y + 0.5, mat);
  local(p, x, z, dir, -0.27, -0.2, -0.24, 0.24, y + 0.5, y + 0.98, mat);
  for (const [f, r] of [[-0.21, -0.21], [-0.21, 0.21], [0.21, -0.21], [0.21, 0.21]]) {
    local(p, x, z, dir, f - 0.02, f + 0.02, r - 0.02, r + 0.02, y, y + 0.4, legs);
  }
  addCollider(x - 0.25, y, z - 0.25, x + 0.25, y + 0.9, z + 0.25);
}

export function stool(p, x, z, dir, y = 0) {
  local(p, x, z, dir, -0.19, 0.19, -0.2, 0.2, y + 0.68, y + 0.74, M.walnut);
  local(p, x, z, dir, -0.2, -0.16, -0.2, 0.2, y + 0.74, y + 0.98, M.walnut);
  for (const [f, r] of [[-0.16, -0.17], [-0.16, 0.17], [0.16, -0.17], [0.16, 0.17]]) {
    local(p, x, z, dir, f - 0.018, f + 0.018, r - 0.018, r + 0.018, y, y + 0.68, M.walnut);
  }
  addCollider(x - 0.2, y, z - 0.2, x + 0.2, y + 0.8, z + 0.2);
}

/** Sofa centred at (x, z), `len` wide, facing `dir`. */
export function sofa(p, x, z, dir, len, y = 0, mat = M.fabricGray, depth = 0.95) {
  const h = len / 2;
  const d = depth / 2;
  local(p, x, z, dir, -d, d, -h, h, y + 0.1, y + 0.42, mat); // base
  local(p, x, z, dir, -d, -d + 0.24, -h, h, y + 0.42, y + 0.82, mat); // back
  local(p, x, z, dir, -d, d, -h, -h + 0.2, y + 0.42, y + 0.64, mat); // arms
  local(p, x, z, dir, -d, d, h - 0.2, h, y + 0.42, y + 0.64, mat);
  const n = Math.max(2, Math.round((len - 0.4) / 0.8));
  const w = (len - 0.4) / n;
  for (let i = 0; i < n; i++) {
    local(p, x, z, dir, -d + 0.24, d - 0.02, -h + 0.2 + i * w + 0.015, -h + 0.2 + (i + 1) * w - 0.015, y + 0.42, y + 0.52, mat);
  }
  for (const [f, r] of [[-d + 0.08, -h + 0.08], [-d + 0.08, h - 0.08], [d - 0.08, -h + 0.08], [d - 0.08, h - 0.08]]) {
    local(p, x, z, dir, f - 0.025, f + 0.025, r - 0.025, r + 0.025, y, y + 0.1, M.walnut);
  }
  const [fx] = DIRS[dir];
  const alongX = fx === 0;
  addCollider(x - (alongX ? h : d), y, z - (alongX ? d : h), x + (alongX ? h : d), y + 0.8, z + (alongX ? d : h));
}

export function armchair(p, x, z, dir, y = 0, mat = M.fabricCream) {
  sofa(p, x, z, dir, 0.9, y, mat, 0.85);
}

/** Table: slab top on four legs. */
export function table(p, x0, z0, x1, z1, h, y = 0, top = M.walnut, legs = M.black, thick = 0.06) {
  deco(p, x0, y + h - thick, z0, x1, y + h, z1, top);
  const i = 0.08;
  for (const [x, z] of [[x0 + i, z0 + i], [x1 - i, z0 + i], [x0 + i, z1 - i], [x1 - i, z1 - i]]) {
    deco(p, x - 0.03, y, z - 0.03, x + 0.03, y + h - thick, z + 0.03, legs);
  }
  addCollider(x0, y, z0, x1, y + h, z1);
}

/** Bed with the headboard on the `head` side (n/s/e/w), centred at (x, z). */
export function bed(p, x, z, head, y = 0, w = 1.8, l = 2.05) {
  const dir = { n: 's', s: 'n', e: 'w', w: 'e' }[head]; // bed "faces" away from the headboard
  const h = w / 2;
  local(p, x, z, dir, -l / 2, l / 2, -h - 0.06, h + 0.06, y + 0.08, y + 0.32, M.walnut);
  local(p, x, z, dir, -l / 2 + 0.04, l / 2 - 0.03, -h, h, y + 0.32, y + 0.55, M.fabricWhite);
  local(p, x, z, dir, -l / 2 - 0.08, -l / 2, -h - 0.25, h + 0.25, y, y + 1.15, M.walnut);
  local(p, x, z, dir, -l / 2 + 0.1, -l / 2 + 0.5, -h + 0.12, -0.06, y + 0.55, y + 0.67, M.white);
  local(p, x, z, dir, -l / 2 + 0.1, -l / 2 + 0.5, 0.06, h - 0.12, y + 0.55, y + 0.67, M.white);
  local(p, x, z, dir, 0.25, l / 2 - 0.02, -h - 0.01, h + 0.01, y + 0.55, y + 0.58, M.fabricGray);
  for (const s of [-1, 1]) {
    local(p, x, z, dir, -l / 2, -l / 2 + 0.45, s * (h + 0.72) - 0.25, s * (h + 0.72) + 0.25, y + 0.12, y + 0.5, M.walnut);
    const [fx, fz] = DIRS[dir];
    const lx = x + fx * (-l / 2 + 0.22) + -fz * s * (h + 0.72);
    const lz = z + fz * (-l / 2 + 0.22) + fx * s * (h + 0.72);
    cylinder(p, lx, y + 0.5, lz, 0.05, 0.22, M.black);
    cylinder(p, lx, y + 0.72, lz, 0.13, 0.18, M.glowSoft, { rTop: 0.09 });
  }
  const alongX = DIRS[dir][0] !== 0;
  addCollider(x - (alongX ? l / 2 : h), y, z - (alongX ? h : l / 2), x + (alongX ? l / 2 : h), y + 0.55, z + (alongX ? h : l / 2));
}

export function tv(p, axis, fixed, a, b, y0, y1) {
  if (axis === 'x') deco(p, a, y0, fixed - 0.025, b, y1, fixed + 0.025, M.screen);
  else deco(p, fixed - 0.025, y0, a, fixed + 0.025, y1, b, M.screen);
}

export function toilet(p, x, z, dir, y = 0) {
  local(p, x, z, dir, -0.32, -0.14, -0.19, 0.19, y, y + 0.8, M.ceramic);
  local(p, x, z, dir, -0.14, 0.34, -0.18, 0.18, y, y + 0.42, M.ceramic);
  addCollider(x - 0.3, y, z - 0.3, x + 0.3, y + 0.5, z + 0.3);
}

/** Floating vanity with stone top, basin(s), tap and a lit mirror on the wall behind. */
export function vanity(p, x0, z0, x1, z1, wallSide, y = 0) {
  box(p, x0, y + 0.35, z0, x1, y + 0.82, z1, M.walnut);
  deco(p, x0 - 0.01, y + 0.82, z0 - 0.01, x1 + 0.01, y + 0.86, z1 + 0.01, M.marble);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const alongX = x1 - x0 > z1 - z0;
  const len = alongX ? x1 - x0 : z1 - z0;
  const n = len > 1.7 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const o = n === 1 ? 0 : (i - 0.5) * len * 0.5;
    const bx = alongX ? cx + o : cx;
    const bz = alongX ? cz : cz + o;
    cylinder(p, bx, y + 0.86, bz, 0.19, 0.11, M.ceramic, { rTop: 0.21 });
    const [wx, wz] = DIRS[wallSide];
    cylinder(p, bx + wx * 0.2, y + 0.86, bz + wz * 0.2, 0.014, 0.26, M.chrome);
  }
  // Mirror + light bar against the wall
  const [wx, wz] = DIRS[wallSide];
  const mirror = new THREE.MeshStandardMaterial({ color: 0xdfe8ea, roughness: 0.02, metalness: 1 });
  if (wx !== 0) {
    const mx = wx > 0 ? x1 + 0.005 : x0 - 0.005;
    deco(p, mx - 0.01, y + 1.1, z0 + 0.05, mx + 0.01, y + 2.0, z1 - 0.05, mirror);
    deco(p, mx - 0.02, y + 2.02, z0 + 0.05, mx + 0.02, y + 2.05, z1 - 0.05, M.glow);
  } else {
    const mz = wz > 0 ? z1 + 0.005 : z0 - 0.005;
    deco(p, x0 + 0.05, y + 1.1, mz - 0.01, x1 - 0.05, y + 2.0, mz + 0.01, mirror);
    deco(p, x0 + 0.05, y + 2.02, mz - 0.02, x1 - 0.05, y + 2.05, mz + 0.02, M.glow);
  }
}

/** Open shelving unit filling the given footprint. */
export function shelves(p, x0, z0, x1, z1, y0, y1, mat = M.black, n = 5) {
  const alongX = x1 - x0 > z1 - z0;
  for (let i = 0; i <= n; i++) {
    const yy = y0 + ((y1 - y0 - 0.03) * i) / n;
    deco(p, x0, yy, z0, x1, yy + 0.03, z1, mat);
  }
  if (alongX) {
    deco(p, x0, y0, z0, x0 + 0.03, y1, z1, mat);
    deco(p, x1 - 0.03, y0, z0, x1, y1, z1, mat);
  } else {
    deco(p, x0, y0, z0, x1, y1, z0 + 0.03, mat);
    deco(p, x0, y0, z1 - 0.03, x1, y1, z1, mat);
  }
  addCollider(x0, y0, z0, x1, y1, z1);
}

export function plant(p, x, y, z, s = 1, pot = true) {
  if (pot) cylinder(p, x, y, z, 0.16 * s, 0.3 * s, M.white, { rTop: 0.2 * s, collide: true });
  const base = y + (pot ? 0.3 * s : 0);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.75 * s, 5), i % 2 ? M.plant : M.plantDark);
    leaf.position.set(x + Math.cos(a) * 0.12 * s, base + 0.32 * s, z + Math.sin(a) * 0.12 * s);
    leaf.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
    leaf.castShadow = true;
    p.add(leaf);
  }
}

export function shrub(p, x, y, z, r = 0.5, mat = M.plantDark) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
  m.position.set(x, y + r * 0.7, z);
  m.scale.y = 0.8;
  m.castShadow = true;
  m.receiveShadow = true;
  p.add(m);
}

export function tree(p, x, y, z, h = 7) {
  cylinder(p, x, y, z, 0.22, h * 0.5, M.trunk, { rTop: 0.14, collide: true, seg: 8 });
  const blobs = [[0, 0.62, 0, 0.3], [0.2, 0.74, 0.1, 0.24], [-0.18, 0.72, -0.12, 0.25], [0.02, 0.86, -0.04, 0.2]];
  for (const [bx, by, bz, br] of blobs) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(h * br, 1), by > 0.8 ? M.plant : M.plantDark);
    m.position.set(x + bx * h, y + by * h, z + bz * h);
    m.castShadow = true;
    p.add(m);
  }
}

/** Abstract swirl painting like the one in the foyer. */
const swirlArt = drawnMaterial(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#16102a';
  ctx.fillRect(0, 0, w, h);
  const cols = ['#e3447a', '#f2a03d', '#4ac0d9', '#8a54d6', '#f6e04a', '#39b06b'];
  for (let i = 0; i < 46; i++) {
    ctx.strokeStyle = cols[i % cols.length];
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 1.05, 20 + i * 5.2, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }
});

const landscapeArt = drawnMaterial(256, 160, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#f3c96b');
  g.addColorStop(0.45, '#d9792b');
  g.addColorStop(1, '#3d2a14');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = ['#b8451f', '#e0a12e', '#5c6b1f', '#8c2f1a'][i % 4];
    ctx.fillRect((i * 97) % w, h * 0.5 + ((i * 53) % (h * 0.5)), 5, 3);
  }
});

export function art(p, axis, fixed, a, b, y0, y1, kind = 'swirl') {
  const mat = kind === 'swirl' ? swirlArt : landscapeArt;
  const m = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? b - a : 0.04, y1 - y0, axis === 'x' ? 0.04 : b - a), [
    axis === 'z' ? mat : M.black, axis === 'z' ? mat : M.black, M.black, M.black, axis === 'x' ? mat : M.black, axis === 'x' ? mat : M.black,
  ]);
  m.position.set(axis === 'x' ? (a + b) / 2 : fixed, (y0 + y1) / 2, axis === 'x' ? fixed : (a + b) / 2);
  p.add(m);
}

export function pendant(p, x, z, ceilingY, dropTo) {
  cylinder(p, x, dropTo + 0.3, z, 0.006, ceilingY - dropTo - 0.3, M.black, { seg: 6 });
  cylinder(p, x, dropTo, z, 0.035, 0.3, M.black, { seg: 12 });
  cylinder(p, x, dropTo - 0.03, z, 0.03, 0.03, M.glow, { seg: 12 });
}

export function showerScreen(p, axis, fixed, a, b, y = 0) {
  if (axis === 'x') box(p, a, y, fixed - 0.01, b, y + 2.1, fixed + 0.01, M.glass, { cast: false });
  else box(p, fixed - 0.01, y, a, fixed + 0.01, y + 2.1, b, M.glass, { cast: false });
}

export function rainShower(p, x, z, y = 0) {
  cylinder(p, x, y + 2.15, z, 0.15, 0.02, M.chrome);
  cylinder(p, x, y + 2.17, z, 0.012, 0.3, M.chrome, { seg: 8 });
}
