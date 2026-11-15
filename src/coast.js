import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, colorMat } from './materials.js';
import { pointInPolygon, addObb } from './obstacles.js';
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

const YAW_SEA = Math.atan2(-SEA[1], SEA[0]); // local +x points out to sea
const YAW_ALONG = Math.atan2(-ALONG[1], ALONG[0]);

function placed(geo, along, out, y, yaw) {
  const [x, z] = at(along, out);
  const g = geo.clone();
  g.rotateY(yaw);
  g.translate(x, G + y, z);
  return g;
}

function addMerged(scene, geos, mat, y = 0) {
  if (!geos.length) return;
  const merged = mergeGeometries(geos);
  if (!merged) return;
  const m = new THREE.Mesh(merged, mat);
  m.position.y = y;
  m.castShadow = m.receiveShadow = true;
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
  addMerged(scene, posts, colorMat(0x6a4a32, 0.9), G);
  addMerged(scene, roofs, colorMat(0xc4a15a, 0.95), G);
}

function palmCrownGeo() {
  const geos = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.BoxGeometry(0.38, 0.07, 3.6);
    g.translate(0, -0.2, 1.55);
    g.rotateX(0.68);
    g.rotateY((i / 8) * Math.PI * 2);
    geos.push(g);
  }
  return mergeGeometries(geos);
}

function palmsAndJungle(scene) {
  const palms = [];
  for (let along = -920; along <= 920; along += 16 + rnd() * 10) {
    if (rnd() < 0.18) continue;
    const [x, z] = at(along + (rnd() - 0.5) * 8, -48 - rnd() * 22);
    palms.push({ x, z, h: 8.5 + rnd() * 4.5, lean: (rnd() - 0.5) * 0.18 });
  }
  for (const along of [-40, 50, 140, 230, -380, 80, 540]) {
    for (let n = 3; n > 0; n--) {
      const [x, z] = at(along + (rnd() - 0.5) * 28, -22 - rnd() * 18);
      palms.push({ x, z, h: 7 + rnd() * 3.5, lean: (rnd() - 0.5) * 0.12 });
    }
  }
  const jungle = [];
  for (let n = 140; n > 0; n--) {
    const along = (rnd() - 0.5) * 1800;
    const out = -120 - rnd() * 460;
    const [x, z] = at(along, out);
    jungle.push({ x, z, h: 8 + rnd() * 7 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 1, 6, 1, true).translate(0, 0.5, 0);
  const palmTrunks = new THREE.InstancedMesh(trunkGeo, M.trunk, palms.length);
  const fronds = new THREE.InstancedMesh(palmCrownGeo(), colorMat(0x3f7a35, 0.95), palms.length);
  const trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), jungle.length);
  const jungleTrunks = new THREE.InstancedMesh(trunkGeo, M.trunk, jungle.length);
  palmTrunks.castShadow = fronds.castShadow = trees.castShadow = jungleTrunks.castShadow = true;
  scene.add(palmTrunks, fronds, trees, jungleTrunks);
  const o = new THREE.Object3D();
  const color = new THREE.Color();
  palms.forEach((t, i) => {
    o.rotation.set(t.lean, rnd() * 6.28, t.lean * 0.4);
    o.position.set(t.x, G, t.z);
    o.scale.set(1, t.h, 1);
    o.updateMatrix();
    palmTrunks.setMatrixAt(i, o.matrix);
    o.position.y = G + t.h;
    o.scale.set(1.15, 1.15, 1.15);
    o.updateMatrix();
    fronds.setMatrixAt(i, o.matrix);
    fronds.setColorAt(i, color.setHSL(0.27 + rnd() * 0.05, 0.5, 0.28 + rnd() * 0.08));
    addObb(t.x, t.z, 0.28, 0.28, 0, G, G + 2.2);
  });
  fronds.instanceColor.needsUpdate = true;
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

function offsetLocal(geo, lx, ly, lz, yaw) {
  // Shift a geometry that is already world-placed, in the person's local frame.
  const dx = lx * Math.cos(yaw) + lz * Math.sin(yaw);
  const dz = -lx * Math.sin(yaw) + lz * Math.cos(yaw);
  geo.translate(dx, ly, dz);
  return geo;
}

function people(scene) {
  const skinHex = [0xe0b090, 0xc48a6a, 0x8d5a3c, 0x6a4530];
  const skins = [[], [], [], []];
  const cloths = [[], [], [], []];
  const clothHex = [0x1c3558, 0xc41e3a, 0xf1efe8, 0x2c6a96];
  const hairs = [];
  const towels = [];
  const poles = [];
  const shadeHex = [0xc41e3a, 0xf1efe8, 0x1c3558, 0xe8b45a];
  const shadeBins = [[], [], [], []];
  const spots = [];
  for (const b of BEACHES) {
    const n = b.name === 'Jacó' ? 36 : 16;
    for (let i = 0; i < n; i++) {
      const wad = rnd() < 0.2;
      spots.push({
        along: b.along + (rnd() - 0.5) * b.span * 1.5,
        out: wad ? 5 + rnd() * 12 : -6 - rnd() * 28,
        sit: !wad && rnd() < 0.45,
        yaw: YAW_SEA + (rnd() - 0.5) * 0.8,
      });
    }
  }
  for (const s of spots) {
    const si = Math.floor(rnd() * skins.length);
    const ci = Math.floor(rnd() * cloths.length);
    const torso = new THREE.BoxGeometry(0.34, s.sit ? 0.42 : 0.55, 0.2);
    const head = new THREE.BoxGeometry(0.22, 0.22, 0.2);
    const cloth = new THREE.BoxGeometry(0.36, s.sit ? 0.22 : 0.3, 0.22);
    const hair = new THREE.BoxGeometry(0.24, 0.08, 0.22);
    const arm = new THREE.BoxGeometry(0.1, s.sit ? 0.36 : 0.5, 0.1);
    const leg = new THREE.BoxGeometry(0.12, s.sit ? 0.2 : 0.7, 0.14);
    const yTorso = s.sit ? 0.62 : 1.1;
    const yHead = s.sit ? 0.96 : 1.5;
    skins[si].push(placed(torso, s.along, s.out, yTorso, s.yaw));
    skins[si].push(placed(head, s.along, s.out, yHead, s.yaw));
    skins[si].push(offsetLocal(placed(arm, s.along, s.out, s.sit ? 0.6 : 1.08, s.yaw), 0, 0, 0.22, s.yaw));
    skins[si].push(offsetLocal(placed(arm, s.along, s.out, s.sit ? 0.6 : 1.08, s.yaw), 0, 0, -0.22, s.yaw));
    skins[si].push(offsetLocal(placed(leg, s.along, s.out + (s.sit ? 0.2 : 0), s.sit ? 0.22 : 0.35, s.yaw), 0, 0, 0.1, s.yaw));
    skins[si].push(offsetLocal(placed(leg, s.along, s.out + (s.sit ? 0.2 : 0), s.sit ? 0.22 : 0.35, s.yaw), 0, 0, -0.1, s.yaw));
    cloths[ci].push(placed(cloth, s.along, s.out, s.sit ? 0.42 : 0.76, s.yaw));
    hairs.push(placed(hair, s.along, s.out, yHead + 0.12, s.yaw));
    if (s.sit && rnd() < 0.55) {
      towels.push(placed(new THREE.BoxGeometry(0.85, 0.03, 1.7), s.along, s.out - 0.15, 0.03, s.yaw));
    }
  }
  for (let u = 0; u < 10; u++) {
    const b = BEACHES[u % BEACHES.length];
    const along = b.along + (rnd() - 0.5) * b.span;
    const out = -20 - rnd() * 28;
    const yaw = rnd() * Math.PI * 2;
    poles.push(placed(new THREE.CylinderGeometry(0.03, 0.03, 2.1, 5).translate(0, 1.05, 0), along, out, 0, 0));
    shadeBins[u % shadeBins.length].push(placed(new THREE.ConeGeometry(1.35, 0.28, 8).translate(0, 2.15, 0), along, out, 0, yaw));
  }
  skinHex.forEach((hex, i) => addMerged(scene, skins[i], colorMat(hex, 0.9)));
  clothHex.forEach((hex, i) => addMerged(scene, cloths[i], colorMat(hex, 0.85)));
  addMerged(scene, hairs, colorMat(0x2a1c14, 0.95));
  addMerged(scene, towels, colorMat(0xf1efe8, 0.95));
  addMerged(scene, poles, colorMat(0x6a4a32, 0.8));
  shadeHex.forEach((hex, i) => addMerged(scene, shadeBins[i], colorMat(hex, 0.75)));
}

function boats(scene) {
  const hulls = [[], [], []];
  const hullHex = [0xf1efe8, 0xc41e3a, 0x1c3558];
  const decks = [];
  const cabins = [];
  const masts = [];
  const sails = [];
  const fleet = [
    { along: -420, out: 55, sail: false },
    { along: -360, out: 78, sail: false },
    { along: -300, out: 48, sail: false },
    { along: -390, out: 120, sail: true },
    { along: 40, out: 70, sail: false },
    { along: 110, out: 95, sail: false },
    { along: 160, out: 150, sail: true },
    { along: 20, out: 40, sail: false },
    { along: 70, out: 28, sail: false },
    { along: -20, out: 34, sail: false },
    { along: 500, out: 60, sail: false },
    { along: 580, out: 88, sail: false },
    { along: 540, out: 170, sail: true },
  ];
  fleet.forEach((b, i) => {
    const yaw = YAW_SEA + (rnd() - 0.5) * 0.35 + (i % 2 ? YAW_ALONG * 0 : 0);
    const yawBoat = i % 3 === 0 ? YAW_ALONG + 0.2 : yaw;
    const hi = i % hulls.length;
    const L = b.sail ? 9.5 : 6.4;
    const W = b.sail ? 2.6 : 2.0;
    const hull = new THREE.BoxGeometry(L, 0.7, W);
    const bow = new THREE.ConeGeometry(W * 0.52, L * 0.28, 4);
    bow.rotateZ(-Math.PI / 2);
    hulls[hi].push(placed(hull, b.along, b.out, 0.28, yawBoat));
    hulls[hi].push(placed(bow, b.along, b.out, 0.32, yawBoat));
    // Cone sits at hull centre; shift bow to the nose along local +x
    const last = hulls[hi][hulls[hi].length - 1];
    offsetLocal(last, L * 0.42, 0, 0, yawBoat);
    decks.push(placed(new THREE.BoxGeometry(L * 0.72, 0.08, W * 0.72), b.along, b.out, 0.66, yawBoat));
    if (!b.sail) {
      cabins.push(placed(new THREE.BoxGeometry(1.4, 0.9, W * 0.7), b.along, b.out, 1.1, yawBoat));
      offsetLocal(cabins[cabins.length - 1], -L * 0.18, 0, 0, yawBoat);
    } else {
      masts.push(placed(new THREE.CylinderGeometry(0.06, 0.08, 8.2, 5).translate(0, 4.4, 0), b.along, b.out, 0.6, yawBoat));
      const sail = new THREE.BufferGeometry();
      sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.4, 0, 0, 8.2, 0, 3.4, 1.6, 0], 3));
      sail.computeVertexNormals();
      sails.push(placed(sail, b.along, b.out, 0.7, yawBoat));
    }
    const [x, z] = at(b.along, b.out);
    addObb(x, z, L / 2, W / 2, yawBoat, G - 0.2, G + 1.6);
  });
  hullHex.forEach((hex, i) => addMerged(scene, hulls[i], colorMat(hex, 0.55, 0.15)));
  addMerged(scene, decks, colorMat(0xd8c7a4, 0.8));
  addMerged(scene, cabins, colorMat(0xf1efe8, 0.7));
  addMerged(scene, masts, colorMat(0x6a4a32, 0.85));
  addMerged(scene, sails, new THREE.MeshStandardMaterial({ color: 0xf6f1e9, roughness: 0.85, side: THREE.DoubleSide }));
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
  palmsAndJungle(scene);
  people(scene);
  boats(scene);
}
