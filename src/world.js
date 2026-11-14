import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import map from './map.json';
import { M, colorMat } from './materials.js';
import { addObb, setFence, insideFence, pointInPolygon, solidAt } from './obstacles.js';
import { H } from './house.js';
import { helipadPrecinct } from './heli.js';
import { buildCoast } from './coast.js';

// The Los Reyes neighbourhood around the house: real streets, boundary and landscape from
// OpenStreetMap (see scripts/build-map.mjs), with stand-in houses and trees. Everything is
// merged or instanced so the whole estate costs only a handful of draw calls.

const G = H.grade;
const pairs = (a) => Array.from({ length: a.length / 2 }, (_, i) => [a[i * 2], a[i * 2 + 1]]);
let seed = 20261114;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (list) => list[Math.floor(rnd() * list.length)];

export const LOT = pairs(map.lot); // street-left, street-right, rear-right, rear-left
export const ROADS = map.roads.map((r) => ({ name: r.n, w: r.w, pts: pairs(r.p) }));
const LOTS = map.lots.map((l) => ({ vacant: !!l.v, pts: pairs(l.p) }));
export const AREAS = map.areas.map((a) => ({ kind: a.k, pts: pairs(a.p) }));
AREAS.push(helipadPrecinct());
export const FENCE = pairs(map.boundary);

// ---- Road lookup -------------------------------------------------------------------------
const RCELL = 40;
const roadGrid = new Map();
const rkey = (i, j) => (i + 4096) * 8192 + (j + 4096);
for (const road of ROADS) {
  for (let k = 0; k < road.pts.length - 1; k++) {
    const [ax, az] = road.pts[k];
    const [bx, bz] = road.pts[k + 1];
    const seg = { ax, az, dx: bx - ax, dz: bz - az, road };
    for (let i = Math.floor(Math.min(ax, bx) / RCELL); i <= Math.floor(Math.max(ax, bx) / RCELL); i++) {
      for (let j = Math.floor(Math.min(az, bz) / RCELL); j <= Math.floor(Math.max(az, bz) / RCELL); j++) {
        if (!roadGrid.has(rkey(i, j))) roadGrid.set(rkey(i, j), []);
        roadGrid.get(rkey(i, j)).push(seg);
      }
    }
  }
}

/** Closest street within ~40 m: { road, d (to the centre line), x, z (nearest point on it) } or null. */
export function nearestRoad(x, z) {
  let best = null;
  const ci = Math.floor(x / RCELL);
  const cj = Math.floor(z / RCELL);
  for (let i = ci - 1; i <= ci + 1; i++) {
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (const s of roadGrid.get(rkey(i, j)) || []) {
        const len2 = s.dx * s.dx + s.dz * s.dz || 1;
        const t = Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (z - s.az) * s.dz) / len2));
        const px = s.ax + t * s.dx;
        const pz = s.az + t * s.dz;
        const d = Math.hypot(x - px, z - pz);
        if (!best || d < best.d) best = { road: s.road, d, x: px, z: pz };
      }
    }
  }
  return best;
}

/** Name of the street under (x, z), or '' when off the tarmac. */
export function streetAt(x, z) {
  const r = nearestRoad(x, z);
  return r && r.d < r.road.w / 2 + 0.6 ? r.road.name || 'Street' : '';
}

// ---- Flat geometry helpers ---------------------------------------------------------------
// Coplanar layers (verge, tarmac, markings) are separated with polygon offset, not height,
// so they never z-fight at a distance.
const layerMat = (color, layer, roughness = 0.95) => new THREE.MeshStandardMaterial({
  color, roughness, polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -layer * 4,
});

function tri(out, ax, az, bx, bz, cx, cz) {
  // Wind so the face points up
  if ((bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0) out.push(ax, 0, az, bx, 0, bz, cx, 0, cz);
  else out.push(ax, 0, az, cx, 0, cz, bx, 0, bz);
}

function ribbon(out, pts, half) {
  for (let k = 0; k < pts.length; k++) {
    const [x, z] = pts[k];
    // Round join at every vertex
    for (let s = 0; s < 10; s++) {
      const a0 = (s / 10) * Math.PI * 2;
      const a1 = ((s + 1) / 10) * Math.PI * 2;
      tri(out, x, z, x + Math.cos(a0) * half, z + Math.sin(a0) * half, x + Math.cos(a1) * half, z + Math.sin(a1) * half);
    }
    if (k === pts.length - 1) break;
    const [x2, z2] = pts[k + 1];
    const len = Math.hypot(x2 - x, z2 - z) || 1;
    const nx = (-(z2 - z) / len) * half;
    const nz = ((x2 - x) / len) * half;
    tri(out, x + nx, z + nz, x - nx, z - nz, x2 - nx, z2 - nz);
    tri(out, x + nx, z + nz, x2 - nx, z2 - nz, x2 + nx, z2 + nz);
  }
}

function flatMesh(scene, positions, mat, y) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(positions.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function polygonFill(out, pts) {
  const flatPts = pts.map(([x, z]) => new THREE.Vector2(x, z));
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(flatPts, [])) {
    tri(out, pts[a][0], pts[a][1], pts[b][0], pts[b][1], pts[c][0], pts[c][1]);
  }
}

// ---- Streets and landscape ---------------------------------------------------------------
function buildRoads(scene) {
  const verge = [];
  const tarmac = [];
  const lines = [];
  for (const r of ROADS) {
    ribbon(verge, r.pts, r.w / 2 + 0.55);
    ribbon(tarmac, r.pts, r.w / 2);
    if (r.w >= 7) ribbon(lines, r.pts, 0.07);
  }
  flatMesh(scene, verge, layerMat(0xb9b2a4, 2), G + 0.02);
  flatMesh(scene, tarmac, layerMat(0x5b5a58, 3), G + 0.03);
  flatMesh(scene, lines, layerMat(0xd9b23a, 4, 0.7), G + 0.035);
}

export const AREA_COLOR = { golf: 0x6fa24f, park: 0x5c9447, pitch: 0x86b061, water: 0x3d7fae, wood: 0x35592d, sand: 0xe6d4a0 };
function buildAreas(scene) {
  const byKind = {};
  for (const a of AREAS) polygonFill((byKind[a.kind] ||= []), a.pts);
  for (const [kind, positions] of Object.entries(byKind)) {
    flatMesh(scene, positions, layerMat(AREA_COLOR[kind], 1, kind === 'water' ? 0.15 : 0.95), G + 0.01);
  }
}

// Perimeter wall, opened wherever a street passes through (a barrier arm marks each gate;
// the fence itself still stops you there).
function buildFence(scene) {
  setFence(FENCE);
  const walls = [];
  const arms = [];
  const wallBox = (ax, az, bx, bz, t, y0, y1) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.3) return null;
    const geo = new THREE.BoxGeometry(len, y1 - y0, t);
    geo.rotateY(Math.atan2(-(bz - az), bx - ax));
    geo.translate((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2);
    return geo;
  };
  for (let i = 0; i < FENCE.length; i++) {
    const [ax, az] = FENCE[i];
    const [bx, bz] = FENCE[(i + 1) % FENCE.length];
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    // Parameter ranges of this stretch that are crossed by a street
    const gaps = [];
    for (const r of ROADS) {
      for (let k = 0; k < r.pts.length - 1; k++) {
        const [cx, cz] = r.pts[k];
        const ex = r.pts[k + 1][0] - cx;
        const ez = r.pts[k + 1][1] - cz;
        const den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-6) continue;
        const t = ((cx - ax) * ez - (cz - az) * ex) / den;
        const u = ((cx - ax) * dz - (cz - az) * dx) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const sin = Math.abs(den) / (len * Math.hypot(ex, ez));
        const half = Math.min(14, (r.w / 2 + 0.9) / Math.max(sin, 0.2)) / len;
        gaps.push([t - half, t + half]);
      }
    }
    gaps.sort((p, q) => p[0] - q[0]);
    let from = 0;
    const at = (t) => [ax + dx * t, az + dz * t];
    for (const [g0, g1] of [...gaps, [1, 1]]) {
      if (g0 > from) walls.push(wallBox(...at(from), ...at(Math.min(g0, 1)), 0.3, G, G + 2.4));
      if (g0 < 1 && g1 > from) arms.push(wallBox(...at(Math.max(g0, from, 0)), ...at(Math.min(g1, 1)), 0.12, G + 0.95, G + 1.1));
      from = Math.max(from, g1);
    }
  }
  const add = (geos, mat) => {
    const mesh = new THREE.Mesh(mergeGeometries(geos.filter(Boolean)), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  };
  add(walls, colorMat(0xe4dccd, 0.9));
  if (arms.length) add(arms, colorMat(0xc23a2a, 0.6));
}

// ---- Stand-in houses ---------------------------------------------------------------------
const WALLS = [0xf2ede4, 0xe9e0d0, 0xe6d8c3, 0xd9d4cc, 0xf5f1ea, 0xe0c9ad];
const ROOFS = [0x8c5644, 0x774d3d, 0x85614f, 0x5e5a57, 0x92604a, 0x6a4a3d];
export const houses = [];

function inAnyArea(x, z) {
  return AREAS.some((a) => pointInPolygon(x, z, a.pts));
}
const inSurveyedLot = (x, z) => pointInPolygon(x, z, LOT) || LOTS.some((l) => pointInPolygon(x, z, l.pts));

// Corners, edge midpoints and centre of a turned rectangle
function footprint(x, z, w, d, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const out = [];
  for (const u of [-0.5, 0, 0.5]) for (const v of [-0.5, 0, 0.5]) out.push([x + u * w * c + v * d * s, z - u * w * s + v * d * c]);
  return out;
}

function addHouse(x, z, w, d, angle) {
  // Which long side faces the street, so the glazing goes on the front
  const road = nearestRoad(x, z);
  const front = road && (road.x - x) * Math.sin(angle) + (road.z - z) * Math.cos(angle) < 0 ? -1 : 1;
  const h = rnd() < 0.35 ? 6.2 : 3.3;
  houses.push({ x, z, w, d, angle, h, front, wall: pick(WALLS), roof: pick(ROOFS), r: Math.hypot(w, d) / 2 });
  addObb(x, z, w / 2, d / 2, angle, G, G + h);
}

function placeHouses() {
  // The house's own sector is surveyed lot by lot: one house per built lot, sized to the lot.
  for (const lot of LOTS) {
    if (lot.vacant) continue;
    const n = lot.pts.length;
    const cx = lot.pts.reduce((s, p) => s + p[0], 0) / n;
    const cz = lot.pts.reduce((s, p) => s + p[1], 0) / n;
    let long = [1, 0];
    let best = 0;
    lot.pts.forEach((p, i) => {
      const q = lot.pts[(i + 1) % n];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len > best) [best, long] = [len, [(q[0] - p[0]) / len, (q[1] - p[1]) / len]];
    });
    const along = lot.pts.map((p) => (p[0] - cx) * long[0] + (p[1] - cz) * long[1]);
    const across = lot.pts.map((p) => -(p[0] - cx) * long[1] + (p[1] - cz) * long[0]);
    const w = Math.min(24, (Math.max(...along) - Math.min(...along)) * 0.55);
    const d = Math.min(18, (Math.max(...across) - Math.min(...across)) * 0.55);
    addHouse(cx, cz, w, d, Math.atan2(-long[1], long[0]));
  }

  // Elsewhere, line the residential streets with houses wherever there is room.
  for (const road of ROADS) {
    if (road.w < 6) continue;
    let next = 14 + rnd() * 10;
    let walked = 0;
    for (let k = 0; k < road.pts.length - 1; k++) {
      const [ax, az] = road.pts[k];
      const dx = road.pts[k + 1][0] - ax;
      const dz = road.pts[k + 1][1] - az;
      const len = Math.hypot(dx, dz);
      for (; next < walked + len; next += 25 + rnd() * 6) {
        const t = (next - walked) / len;
        for (const side of [1, -1]) {
          const w = 15 + rnd() * 6;
          const d = 11 + rnd() * 5;
          const off = (road.w / 2 + 6 + rnd() * 3 + d / 2) * side;
          const x = ax + dx * t - (dz / len) * off;
          const z = az + dz * t + (dx / len) * off;
          const angle = Math.atan2(-dz, dx);
          if (rnd() < 0.22) continue; // empty lot
          const pts = footprint(x, z, w + 3, d + 3, angle);
          if (pts.some(([px, pz]) => !insideFence(px, pz) || inSurveyedLot(px, pz) || inAnyArea(px, pz))) continue;
          if (pts.some(([px, pz]) => {
            const r = nearestRoad(px, pz);
            return r && r.d < r.road.w / 2 + 3;
          })) continue;
          if (houses.some((h) => Math.hypot(h.x - x, h.z - z) < (h.r + Math.hypot(w, d) / 2) * 0.85)) continue;
          addHouse(x, z, w, d, angle);
        }
      }
      walked += len;
    }
  }
}

function hipRoof() {
  const b = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]];
  const r = [[-0.22, 1, 0], [0.22, 1, 0]];
  const faces = [[b[3], b[2], r[1]], [b[3], r[1], r[0]], [b[1], b[0], r[0]], [b[1], r[0], r[1]], [b[2], b[1], r[1]], [b[0], b[3], r[0]]];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(faces.flat(2), 3));
  geo.computeVertexNormals();
  return geo;
}

function instanced(scene, geo, mat, count) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function buildHouses(scene) {
  placeHouses();
  const walls = instanced(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), houses.length);
  const roofs = instanced(scene, hipRoof(), new THREE.MeshStandardMaterial({ roughness: 0.85 }), houses.length);
  const glazing = instanced(scene, new THREE.BoxGeometry(1, 1, 1), M.glass, houses.length * 2);
  glazing.castShadow = false;
  const o = new THREE.Object3D();
  const color = new THREE.Color();
  let panes = 0;
  houses.forEach((h, i) => {
    o.rotation.set(0, h.angle, 0);
    o.position.set(h.x, G + h.h / 2, h.z);
    o.scale.set(h.w, h.h, h.d);
    o.updateMatrix();
    walls.setMatrixAt(i, o.matrix);
    walls.setColorAt(i, color.setHex(h.wall));
    o.position.y = G + h.h;
    o.scale.set(h.w + 1.4, 1.5 + h.d * 0.09, h.d + 1.4);
    o.updateMatrix();
    roofs.setMatrixAt(i, o.matrix);
    roofs.setColorAt(i, color.setHex(h.roof));
    for (let y = 1.55; y < h.h; y += 3) {
      const out = (h.d / 2) * h.front;
      o.position.set(h.x + Math.sin(h.angle) * out, G + y, h.z + Math.cos(h.angle) * out);
      o.scale.set(h.w * 0.72, 1.25, 0.1);
      o.updateMatrix();
      glazing.setMatrixAt(panes++, o.matrix);
    }
  });
  glazing.count = panes;
}

// ---- Trees -------------------------------------------------------------------------------
function buildTrees(scene) {
  const trees = [];
  const nearHome = (x, z) => x > -16 && x < 19 && z > -29 && z < 23;
  const plant = (x, z, h = 6 + rnd() * 5) => {
    if (nearHome(x, z) || !insideFence(x, z) || solidAt(x, z, 2, G, G + 3)) return;
    const r = nearestRoad(x, z);
    if (r && r.d < r.road.w / 2 + 2.5) return;
    trees.push({ x, z, h, r: h * (0.28 + rnd() * 0.1) });
    addObb(x, z, 0.3, 0.3, 0, G, G + 2.5);
  };
  // Garden trees behind and beside each house
  for (const h of houses) {
    const back = -(h.d / 2 + 3 + rnd() * 4) * h.front;
    const side = (rnd() - 0.5) * h.w * 1.3;
    plant(h.x + Math.sin(h.angle) * back + Math.cos(h.angle) * side, h.z + Math.cos(h.angle) * back - Math.sin(h.angle) * side);
    if (rnd() < 0.5) {
      const s2 = (h.w / 2 + 2.5) * (rnd() < 0.5 ? 1 : -1);
      plant(h.x + Math.cos(h.angle) * s2, h.z - Math.sin(h.angle) * s2, 5 + rnd() * 3);
    }
  }
  // Woodland, parks and the rough around the golf holes
  const density = { wood: 260, park: 320, golf: 900 }; // square metres per tree
  for (const a of AREAS) {
    if (!density[a.kind]) continue;
    const xs = a.pts.map((p) => p[0]);
    const zs = a.pts.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const z0 = Math.min(...zs);
    const w = Math.max(...xs) - x0;
    const d = Math.max(...zs) - z0;
    for (let n = Math.min(1800, (w * d) / density[a.kind]); n > 0; n--) {
      const x = x0 + rnd() * w;
      const z = z0 + rnd() * d;
      if (pointInPolygon(x, z, a.pts)) plant(x, z, a.kind === 'wood' ? 8 + rnd() * 7 : undefined);
    }
  }

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6, 1, true).translate(0, 0.5, 0);
  const trunks = instanced(scene, trunkGeo, M.trunk, trees.length);
  const crowns = instanced(scene, new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), trees.length);
  const o = new THREE.Object3D();
  const color = new THREE.Color();
  trees.forEach((t, i) => {
    const trunkH = t.h * 0.45;
    o.rotation.set(0, rnd() * 6.28, 0);
    o.position.set(t.x, G, t.z);
    o.scale.set(t.h / 7, trunkH, t.h / 7);
    o.updateMatrix();
    trunks.setMatrixAt(i, o.matrix);
    o.position.y = G + trunkH + t.r * 0.55;
    o.scale.set(t.r, t.r * 0.85, t.r);
    o.updateMatrix();
    crowns.setMatrixAt(i, o.matrix);
    crowns.setColorAt(i, color.setHSL(0.27 + rnd() * 0.06, 0.38 + rnd() * 0.15, 0.2 + rnd() * 0.09));
  });
  return trees.length;
}

// ---- The lot's own edges -------------------------------------------------------------------
// The lot is not square to the house, so its side walls and rear hedge are turned boxes.
function edge(scene, [ax, az], [bx, bz], inset, thick, height, mat) {
  const len = Math.hypot(bx - ax, bz - az);
  const angle = Math.atan2(-(bz - az), bx - ax);
  // Shift toward the lot's interior, which lies to the right of each edge as the lot is listed
  const cx = (ax + bx) / 2 + ((bz - az) / len) * inset;
  const cz = (az + bz) / 2 - ((bx - ax) / len) * inset;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, height, thick), mat);
  mesh.position.set(cx, G + height / 2, cz);
  mesh.rotation.y = angle;
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  addObb(cx, cz, len / 2, thick / 2, angle, G, G + height);
}

function buildLotEdges(scene) {
  const [frontL, frontR, rearR, rearL] = LOT;
  const along = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  edge(scene, along(frontR, rearR, 0.06), rearR, 0.1, 0.16, 1.9, M.stucco); // carport-side party wall
  edge(scene, rearL, along(rearL, frontL, 0.88), 0.1, 0.16, 1.9, M.stucco); // far-side party wall
  edge(scene, rearR, rearL, 0.4, 0.7, 1.6, M.plantDark); // rear hedge
}

/** One driveway bay per stand-in house, between the front wall and the street. */
export function driveways() {
  const spots = [];
  for (const h of houses) {
    const drive = (h.d / 2 + 4.6) * h.front;
    const k = Math.abs(Math.round(h.x * 5 + h.z * 3));
    const side = (k % 2 ? 1 : -1) * Math.min(h.w * 0.28, 5);
    const x = h.x + Math.sin(h.angle) * drive + Math.cos(h.angle) * side;
    const z = h.z + Math.cos(h.angle) * drive - Math.sin(h.angle) * side;
    if (pointInPolygon(x, z, LOT)) continue; // the house's own drive already has its cars
    if (!insideFence(x, z) || Math.hypot(x - 6, z - 12) < 20) continue;
    const road = nearestRoad(x, z);
    if (road && road.d < road.road.w / 2 + 1.4) continue;
    const heading = Math.atan2(h.front * Math.cos(h.angle), -h.front * Math.sin(h.angle));
    spots.push({ x, z, heading });
  }
  return spots;
}

export function buildWorld(scene) {
  buildRoads(scene);
  buildAreas(scene);
  buildFence(scene);
  buildLotEdges(scene);
  buildHouses(scene);
  const trees = buildTrees(scene);
  buildCoast(scene);
  return { houses: houses.length, trees, roads: ROADS.length };
}

export const attribution = map.attribution;
