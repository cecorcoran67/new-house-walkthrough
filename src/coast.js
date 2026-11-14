import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, colorMat } from './materials.js';
import { pointInPolygon } from './obstacles.js';
import { H } from './house.js';

// The real Jacó / Herradura / Hermosa strand sits ~52 km southwest of Los Reyes. The helicopter
// cannot cover that in a walkthrough, so the playable Pacific is a two-minute hop on that same
// bearing (from the owner's pad toward 9.615, -84.630). +x is ~north, +z ~east-northeast.

const G = H.grade;
const FROM = { x: 37.6, z: 540.3 }; // the helipad (src/heli.js PAD); beaches sit on the Jacó bearing from here
const SEA = [-0.535, -0.845]; // unit vector from the pad toward Jacó
const ALONG = [-0.845, 0.535]; // along the shore, Herradura → Jacó → Hermosa
const SHORE = 2480; // metres from the pad to the waterline
let seed = 77;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function at(along, out) {
  return [
    FROM.x + SEA[0] * (SHORE + out) + ALONG[0] * along,
    FROM.z + SEA[1] * (SHORE + out) + ALONG[1] * along,
  ];
}

function shorePoint(along) {
  const bay = Math.exp(-(((along + 380) / 240) ** 2)) * 110; // Herradura's cove
  return at(along, bay);
}

const STEPS = [];
for (let a = -980; a <= 980; a += 70) STEPS.push(a);
const shoreline = STEPS.map(shorePoint);
const inland = (out) => STEPS.map((a) => at(a, out));

export const OCEAN = [...shoreline, at(980, 1550), at(-980, 1550)];
export const SAND = [...shoreline, ...inland(-80).reverse()];
export const JUNGLE = [...inland(-80), ...inland(-620).reverse()];

export const BEACHES = [
  { name: 'Playa Herradura', along: -380, span: 240 },
  { name: 'Jacó', along: 80, span: 280 },
  { name: 'Playa Hermosa', along: 540, span: 240 },
].map((b) => {
  const [x, z] = at(b.along, -25);
  return { ...b, x, z };
});

export const COAST_AREAS = [
  { kind: 'wood', pts: JUNGLE },
  { kind: 'sand', pts: SAND },
  { kind: 'water', pts: OCEAN },
];

export function overWater(x, z) {
  return pointInPolygon(x, z, OCEAN);
}

/** Name of the beach, the ocean, or the coastal hills under (x, z); '' inland of that. */
export function beachAt(x, z) {
  if (overWater(x, z)) return 'Pacific Ocean';
  const origin = at(0, 0);
  const dx = x - origin[0];
  const dz = z - origin[1];
  const along = dx * ALONG[0] + dz * ALONG[1];
  const out = dx * SEA[0] + dz * SEA[1];
  if (out > 40) return 'Pacific Ocean';
  if (out >= -90 && out <= 40) {
    const hit = BEACHES.find((b) => Math.abs(along - b.along) < b.span);
    return hit ? hit.name : 'Pacific coast';
  }
  if (out > -700 && out < -90 && Math.abs(along) < 1000) return 'Pacific coast';
  return '';
}

function tri(out, ax, az, bx, bz, cx, cz) {
  if ((bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0) out.push(ax, 0, az, bx, 0, bz, cx, 0, cz);
  else out.push(ax, 0, az, cx, 0, cz, bx, 0, bz);
}

function strip(out, a, b) {
  for (let i = 0; i < a.length - 1; i++) {
    tri(out, a[i][0], a[i][1], a[i + 1][0], a[i + 1][1], b[i + 1][0], b[i + 1][1]);
    tri(out, a[i][0], a[i][1], b[i + 1][0], b[i + 1][1], b[i][0], b[i][1]);
  }
}

function mesh(scene, positions, mat, y, layer) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(positions.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -layer;
  mat.polygonOffsetUnits = -layer * 4;
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y;
  m.receiveShadow = true;
  scene.add(m);
}

function palapas(scene) {
  const posts = [];
  const roofs = [];
  const post = new THREE.CylinderGeometry(0.08, 0.1, 2.6, 5).translate(0, 1.3, 0);
  const roof = new THREE.ConeGeometry(3.4, 1.4, 6).translate(0, 3.1, 0);
  for (const along of [-40, 50, 140, 230]) {
    const [x, z] = at(along, -28 + rnd() * 8);
    const yaw = rnd() * Math.PI * 2;
    for (const [lx, lz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
      const g = post.clone();
      g.rotateY(yaw);
      g.translate(x + lx, 0, z + lz);
      posts.push(g);
    }
    const r = roof.clone();
    r.rotateY(yaw);
    r.translate(x, 0, z);
    roofs.push(r);
  }
  const add = (geos, mat) => {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.position.y = G;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  };
  add(posts, colorMat(0x6a4a32, 0.9));
  add(roofs, colorMat(0xc4a15a, 0.95));
}

function plant(scene) {
  const palms = [];
  const jungle = [];
  for (const along of STEPS) {
    if (rnd() > 0.55) continue;
    const [x, z] = at(along + (rnd() - 0.5) * 40, -18 - rnd() * 40);
    palms.push({ x, z, h: 7 + rnd() * 4 });
  }
  for (let n = 140; n > 0; n--) {
    const along = (rnd() - 0.5) * 1800;
    const out = -120 - rnd() * 460;
    const [x, z] = at(along, out);
    jungle.push({ x, z, h: 8 + rnd() * 7 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 1, 6, 1, true).translate(0, 0.5, 0);
  const palmTrunks = new THREE.InstancedMesh(trunkGeo, M.trunk, palms.length);
  const fronds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 4), colorMat(0x3f7a35, 0.95), palms.length);
  const trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), jungle.length);
  const jungleTrunks = new THREE.InstancedMesh(trunkGeo, M.trunk, jungle.length);
  palmTrunks.castShadow = fronds.castShadow = trees.castShadow = jungleTrunks.castShadow = true;
  scene.add(palmTrunks, fronds, trees, jungleTrunks);
  const o = new THREE.Object3D();
  const color = new THREE.Color();
  palms.forEach((t, i) => {
    o.rotation.set(0, rnd() * 6.28, 0);
    o.position.set(t.x, G, t.z);
    o.scale.set(0.7, t.h, 0.7);
    o.updateMatrix();
    palmTrunks.setMatrixAt(i, o.matrix);
    o.position.y = G + t.h + 0.4;
    o.scale.set(2.4, 1.1, 2.4);
    o.updateMatrix();
    fronds.setMatrixAt(i, o.matrix);
  });
  jungle.forEach((t, i) => {
    const trunkH = t.h * 0.45;
    o.rotation.set(0, rnd() * 6.28, 0);
    o.position.set(t.x, G, t.z);
    o.scale.set(t.h / 7, trunkH, t.h / 7);
    o.updateMatrix();
    jungleTrunks.setMatrixAt(i, o.matrix);
    o.position.y = G + trunkH + t.h * 0.28;
    o.scale.set(t.h * 0.3, t.h * 0.28, t.h * 0.3);
    o.updateMatrix();
    trees.setMatrixAt(i, o.matrix);
    trees.setColorAt(i, color.setHSL(0.28 + rnd() * 0.05, 0.42, 0.18 + rnd() * 0.08));
  });
  trees.instanceColor.needsUpdate = true;
}

export function buildCoast(scene) {
  const jungle = [];
  const sand = [];
  const water = [];
  const foam = [];
  strip(jungle, inland(-80), inland(-620));
  strip(sand, shoreline, inland(-80));
  strip(water, shoreline, inland(1550));
  const foamA = STEPS.map((a) => shorePoint(a));
  const foamB = STEPS.map((a) => {
    const bay = Math.exp(-(((a + 380) / 240) ** 2)) * 110;
    return at(a, bay + 9);
  });
  strip(foam, foamA, foamB);
  mesh(scene, jungle, colorMat(0x35592d, 0.98), G + 0.012, 1);
  mesh(scene, sand, colorMat(0xe6d4a0, 0.98), G + 0.02, 2);
  mesh(scene, water, new THREE.MeshPhysicalMaterial({
    color: 0x2c6a96, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.92, envMapIntensity: 1.3,
  }), G + 0.018, 2);
  mesh(scene, foam, colorMat(0xdce8ee, 0.45), G + 0.03, 4);
  palapas(scene);
  plant(scene);
}
