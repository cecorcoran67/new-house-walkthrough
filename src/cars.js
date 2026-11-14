import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, drawnMaterial } from './materials.js';

// Procedural cars. Each is a side profile (lower body + cabin) extruded across its width, then
// dressed with glass, wheels, lamps and trim. Local axes: +x = nose, y = up, z = width.
//
// Profile, in metres: belt = window line, hood = bonnet height at the nose, cowl / wsTop = how far
// back from the nose the windscreen starts / meets the roof, rearBase / rearTop = the same for the
// rear window measured from the tail (a long rearBase makes a boot or a pickup bed), sill = how far
// the body hangs below the wheel centres, gap = clearance in the wheel arches.
// pillars = where the side glass is divided; blindRear leaves out the pane behind the last one.
// top (m/s), accel (m/s²) and engine set how it drives and sounds; pace is how fast traffic takes it.
const spec = (o) => ({
  gap: 0.07, sill: 0, noseDrop: 0.06, metalness: 0.4, env: 0.8, pillars: [0.22, -o.wb / 2 + 0.25],
  face: 'plain', lamps: 'rect', tail: 'wide', bumper: 'paint', seats: 5, top: 19.5, accel: 6.8, engine: 'i4', pace: 9, ...o,
});

const SPECS = {
  // 2025 BAIC BJ30: 4730 x 1910 x 1790 mm, 2820 mm wheelbase. Boxy, upright, clad arches.
  bj30: spec({
    name: 'BJ30', L: 4.73, W: 1.91, Ht: 1.79, wb: 2.82, wheelR: 0.375, belt: 1.13, hood: 1.09, roof: 1.72,
    cowl: 1.12, wsTop: 1.6, rearTop: 0.2, rearBase: 0.05,
    paint: 0x6d7277, metalness: 0.45, face: 'bj30', bumper: 'clad', squaredArches: true, rails: true,
  }),
  // 2026 Chevrolet Tahoe: 5370 x 2060 x 1930 mm, 3070 mm wheelbase.
  tahoe: spec({
    name: 'Tahoe', L: 5.37, W: 2.06, Ht: 1.93, wb: 3.07, wheelR: 0.43, belt: 1.3, hood: 1.29, roof: 1.9,
    cowl: 1.42, wsTop: 2.0, rearTop: 0.34, rearBase: 0.07, noseDrop: 0.04,
    paint: 0x040405, metalness: 0.15, env: 0.45, face: 'tahoe', bumper: 'clad', rails: true, engine: 'v8',
  }),

  // ---- Everyday traffic
  sedan: spec({
    name: 'sedan', L: 4.65, W: 1.82, Ht: 1.45, wb: 2.7, wheelR: 0.33, belt: 0.95, hood: 0.9, roof: 1.42,
    cowl: 1.2, wsTop: 1.8, rearTop: 1.35, rearBase: 0.75, noseDrop: 0.08, sill: 0.12, pillars: [-0.1, -0.85], top: 22,
  }),
  hatch: spec({
    name: 'hatchback', L: 4.05, W: 1.74, Ht: 1.5, wb: 2.55, wheelR: 0.31, belt: 0.95, hood: 0.9, roof: 1.47,
    cowl: 1.1, wsTop: 1.6, rearTop: 0.5, rearBase: 0.08, sill: 0.1, pillars: [-0.15, -1.0], top: 20, accel: 6.2,
  }),
  suv: spec({
    name: 'SUV', L: 4.5, W: 1.84, Ht: 1.68, wb: 2.68, wheelR: 0.36, belt: 1.08, hood: 1.04, roof: 1.63,
    cowl: 1.15, wsTop: 1.7, rearTop: 0.35, rearBase: 0.06, pillars: [-0.05, -1.0], bumper: 'clad', tail: 'tall', rails: true, top: 20, accel: 6.5,
  }),
  pickup: spec({
    name: 'pickup', L: 5.3, W: 1.86, Ht: 1.8, wb: 3.08, wheelR: 0.39, belt: 1.12, hood: 1.1, roof: 1.75,
    cowl: 1.2, wsTop: 1.75, rearTop: 1.9, rearBase: 1.75, pillars: [0.25, -0.62], blindRear: true,
    bumper: 'clad', tail: 'tall', top: 20, accel: 6.2,
  }),

  // ---- Old-timers: chrome bumpers, round lamps, steel wheels
  // After the Toyota Land Cruiser FJ40 (1960-84): 3840 x 1665 x 1930 mm, white roof.
  fj40: spec({
    name: 'classic 4x4', L: 3.84, W: 1.67, Ht: 1.93, wb: 2.285, wheelR: 0.38, belt: 1.12, hood: 1.1, roof: 1.86,
    cowl: 1.22, wsTop: 1.3, rearTop: 0.08, rearBase: 0.04, noseDrop: 0.02, pillars: [0.05],
    metalness: 0.1, env: 0.4, lamps: 'round', tail: 'tall', bumper: 'chrome', steelWheels: true, roofColor: 0xf1efe8,
    top: 15, accel: 4.2, pace: 6.5,
  }),
  // After the 1970s Toyota Hilux / Datsun 620.
  oldPickup: spec({
    name: 'old pickup', L: 4.3, W: 1.6, Ht: 1.58, wb: 2.6, wheelR: 0.33, belt: 0.98, hood: 0.95, roof: 1.5,
    cowl: 1.1, wsTop: 1.45, rearTop: 1.95, rearBase: 1.85, noseDrop: 0.03, sill: 0.04, pillars: [-0.2], blindRear: true,
    metalness: 0.1, env: 0.4, lamps: 'round', tail: 'tall', bumper: 'chrome', steelWheels: true, seats: 2,
    top: 15, accel: 4, pace: 6.5,
  }),
  // After the Mercedes-Benz W123 saloon (1976-85): 4725 x 1786 x 1438 mm.
  classicSedan: spec({
    name: 'classic sedan', L: 4.72, W: 1.79, Ht: 1.44, wb: 2.8, wheelR: 0.32, belt: 0.96, hood: 0.93, roof: 1.4,
    cowl: 1.35, wsTop: 1.85, rearTop: 1.4, rearBase: 0.95, noseDrop: 0.03, sill: 0.1, pillars: [-0.1, -0.8],
    metalness: 0.15, env: 0.5, lamps: 'round', bumper: 'chrome', steelWheels: true, top: 17, accel: 4.4, pace: 7.5,
  }),

  // ---- Exotics: low, wide and quick
  // Mid-engined wedge in the manner of a Lamborghini Huracán: 4520 x 2000 x 1165 mm.
  supercar: spec({
    name: 'supercar', L: 4.52, W: 2.0, Ht: 1.17, wb: 2.62, wheelR: 0.34, gap: 0.04, belt: 0.8, hood: 0.72, roof: 1.15,
    cowl: 1.35, wsTop: 2.15, rearTop: 1.25, rearBase: 0.25, noseDrop: 0.14, sill: 0.2, pillars: [-0.55], blindRear: true,
    metalness: 0.55, env: 1.1, lamps: 'slim', wing: true, seats: 2, top: 33, accel: 11, engine: 'v8', pace: 12,
  }),
  // Rear-engined fastback in the manner of a Porsche 911: 4500 x 1850 x 1300 mm.
  sports: spec({
    name: 'sports car', L: 4.5, W: 1.85, Ht: 1.3, wb: 2.45, wheelR: 0.33, gap: 0.05, belt: 0.86, hood: 0.78, roof: 1.27,
    cowl: 1.4, wsTop: 2.05, rearTop: 1.5, rearBase: 0.1, noseDrop: 0.12, sill: 0.16, pillars: [-0.4, -0.95], blindRear: true,
    metalness: 0.5, env: 1, lamps: 'round', seats: 2, top: 30, accel: 10, engine: 'v8', pace: 11,
  }),
  // 2020- Chevrolet Corvette C8 Stingray: 4630 x 1934 x 1234 mm, 2722 mm wheelbase. Mid-engined, long hood, full-width tail bar.
  c8: spec({
    name: 'Corvette', L: 4.63, W: 1.93, Ht: 1.23, wb: 2.72, wheelR: 0.335, gap: 0.04, belt: 0.76, hood: 0.68, roof: 1.2,
    cowl: 1.55, wsTop: 2.4, rearTop: 0.95, rearBase: 0.32, noseDrop: 0.16, sill: 0.22, pillars: [-0.45],
    paint: 0xc41e3a, metalness: 0.5, env: 1.1, face: 'c8', lamps: 'slim', seats: 2, top: 32, accel: 11, engine: 'v8', pace: 12,
  }),
};
// Costa Rican taxis are red saloons with a yellow roof sign.
SPECS.taxi = { ...SPECS.sedan, name: 'taxi', paint: 0xc4161c, sign: true };

const tire = new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.92 });
const cladding = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.8 });
export const carGlass = new THREE.MeshPhysicalMaterial({ color: 0x0c1114, roughness: 0.06, metalness: 0.3, envMapIntensity: 2, side: THREE.DoubleSide });
const headlamp = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, emissive: 0xdfeaff, emissiveIntensity: 0.7, roughness: 0.2 });
const tailLamp = new THREE.MeshStandardMaterial({ color: 0x8a0d0d, emissive: 0x9c0a06, emissiveIntensity: 0.7, roughness: 0.25 });
const backupLamp = new THREE.MeshStandardMaterial({ color: 0xdcdcd6, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.25 });
const plateMat = new THREE.MeshStandardMaterial({ color: 0xf1f1ee, roughness: 0.6 });
const steelWheel = new THREE.MeshStandardMaterial({ color: 0xd9d5c8, roughness: 0.5, metalness: 0.2 });
const alloy = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.4, metalness: 0.8 });
const gold = new THREE.MeshStandardMaterial({ color: 0xd4a437, roughness: 0.3, metalness: 0.9 });

function paintMat(s) {
  return new THREE.MeshPhysicalMaterial({ color: s.paint, roughness: 0.34, metalness: s.metalness, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: s.env });
}

function extrude(shape, width, mat, bevel = 0.04) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    // bevelOffset keeps the rounded outline exactly on the authored profile
    depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelOffset: -bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 20,
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function bx(g, w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

/** Round lamp facing along x. */
function disc(g, r, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 20), mat);
  m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  g.add(m);
}

/** Merge a group's own meshes into one per material, so a whole car costs a handful of draw calls.
 *  Nested groups (wheels, the steering wheel) are left alone so they can still turn. */
function flatten(g) {
  const byMat = new Map();
  for (const m of [...g.children]) {
    if (!m.isMesh) continue;
    m.updateMatrix();
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
    byMat.set(m.material, [...(byMat.get(m.material) || []), geo]);
    g.remove(m);
  }
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.receiveShadow = true;
    g.add(m);
  }
}

function textMat(text, fg, bg, w = 512, h = 96, font = 'bold 64px Arial') {
  return drawnMaterial(w, h, (ctx) => {
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = fg;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 4);
  }, { transparent: !bg, material: { metalness: 0.6, roughness: 0.35 } });
}

function label(g, text, width, height, x, y, z, facing, fg = '#e8e8e8', bg = null) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), textMat(text, fg, bg));
  m.position.set(x, y, z);
  m.rotation.y = facing * (Math.PI / 2); // +1 faces forward (+x), -1 faces rearward
  g.add(m);
  return m;
}

function wheel(g, s, x, side) {
  const grp = new THREE.Group();
  const w = 0.27;
  const t = new THREE.Mesh(new THREE.CylinderGeometry(s.wheelR, s.wheelR, w, 32), tire);
  t.rotation.x = Math.PI / 2;
  t.castShadow = true;
  grp.add(t);
  const rimR = s.wheelR * 0.68;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, w + 0.01, 28), s.steelWheels ? steelWheel : alloy);
  rim.rotation.x = Math.PI / 2;
  grp.add(rim);
  // Alloys have spokes; old steel wheels just a chrome hub cap
  for (let i = 0; i < (s.steelWheels ? 0 : 5); i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(rimR * 1.9, 0.07, 0.03), M.steel);
    spoke.rotation.z = (i * Math.PI) / 5;
    spoke.position.z = side * (w / 2 + 0.008);
    grp.add(spoke);
  }
  const capR = s.steelWheels ? rimR * 0.55 : 0.06;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(capR, capR, 0.03, 16), M.chrome);
  cap.rotation.x = Math.PI / 2;
  cap.position.z = side * (w / 2 + 0.02);
  grp.add(cap);
  flatten(grp);
  grp.position.set(x, s.wheelR, side * (s.W / 2 - w / 2 - 0.02));
  g.add(grp);
  (g.userData.wheels ||= []).push({ grp, front: x > 0 });
}

function archTrim(g, s, x, side) {
  const r = s.wheelR + s.gap;
  const shape = new THREE.Shape();
  if (s.squaredArches) {
    const o = r + 0.11;
    shape.moveTo(-o, 0);
    shape.lineTo(-o * 0.86, o * 0.72);
    shape.lineTo(-o * 0.45, o);
    shape.lineTo(o * 0.45, o);
    shape.lineTo(o * 0.86, o * 0.72);
    shape.lineTo(o, 0);
  } else {
    shape.absarc(0, 0, r + 0.06, Math.PI, 0, true);
  }
  shape.lineTo(r, 0);
  shape.absarc(0, 0, r, 0, Math.PI, false);
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false, curveSegments: 18 }), cladding);
  m.position.set(x, s.wheelR, side > 0 ? s.W / 2 - 0.01 : -s.W / 2 - 0.025);
  g.add(m);
}

function sideWindows(g, s, side) {
  const hx = s.L / 2;
  const yb = s.belt + 0.04;
  const yt = s.roof - 0.1;
  const ws = (y) => THREE.MathUtils.mapLinear(y, s.belt, s.roof, hx - s.cowl, hx - s.wsTop);
  const rr = (y) => THREE.MathUtils.mapLinear(y, s.belt, s.roof, -hx + s.rearBase, -hx + s.rearTop);
  // One pane between each pair of uprights: windscreen pillar, the door pillars, rear pillar
  const edges = [[ws(yb) - 0.14, ws(yt) - 0.12], ...s.pillars.map((x) => [x, x]), [rr(yb) + 0.13, rr(yt) + 0.16]];
  const polys = [];
  for (let i = 0; i < edges.length - (s.blindRear ? 2 : 1); i++) {
    const [fb, ft] = edges[i];
    const [rb, rt] = edges[i + 1];
    const f = i ? 0.045 : 0; // half a pillar
    const r = i < edges.length - 2 ? 0.045 : 0;
    polys.push([[fb - f, yb], [ft - f, yt], [rt + r, yt], [rb + r, yb]]);
  }
  for (const p of polys) {
    const sh = new THREE.Shape(p.map(([x, y]) => new THREE.Vector2(x, y)));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), carGlass);
    m.position.z = side * (s.W / 2 - 0.076);
    g.add(m);
  }
}

// Glass strip lying on the cabin edge A->B, trimmed to the t0..t1 portion of that edge.
// `out` shifts it along the edge normal so it sits just proud of the bodywork.
function slantedGlass(g, ax, ay, bx2, by2, t0, t1, width, out) {
  const xA = ax + (bx2 - ax) * t0;
  const yA = ay + (by2 - ay) * t0;
  const xB = ax + (bx2 - ax) * t1;
  const yB = ay + (by2 - ay) * t1;
  const len = Math.hypot(xB - xA, yB - yA);
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.012, width), carGlass);
  const ang = Math.atan2(yB - yA, xB - xA);
  m.rotation.z = ang;
  m.position.set((xA + xB) / 2 - Math.sin(ang) * out, (yA + yB) / 2 + Math.cos(ang) * out, 0);
  g.add(m);
}

/** Plain nose and tail for the traffic cars, in whichever lamp and bumper style the spec asks for. */
function plainFace(g, s, base, tail, backup) {
  const hx = s.L / 2;
  const frontX = hx + 0.012;
  const rearX = -hx - 0.012;
  const noseY = s.hood - s.noseDrop - 0.06; // top edge of the nose
  const lampZ = s.W / 2 - 0.27;
  const tailY = s.belt - 0.17;
  const chrome = s.bumper === 'chrome';

  if (s.lamps !== 'slim') bx(g, 0.04, 0.12, s.W - 1.0, hx - 0.005, noseY - 0.1, 0, chrome ? M.chrome : M.black); // grille
  bx(g, 0.04, 0.1, s.W * 0.55, hx - 0.002, base + 0.24, 0, M.black); // lower intake
  bx(g, 0.02, 0.11, 0.44, hx + 0.03, base + 0.24, 0, plateMat);
  bx(g, 0.02, 0.11, 0.44, -hx - 0.03, base + 0.34, 0, plateMat);
  if (chrome) for (const x of [hx + 0.04, -hx - 0.04]) bx(g, 0.1, 0.09, s.W + 0.04, x, base + 0.16, 0, M.chrome);

  for (const side of [1, -1]) {
    if (s.lamps === 'round') disc(g, 0.095, frontX, noseY - 0.1, side * lampZ, headlamp);
    else if (s.lamps === 'slim') bx(g, 0.05, 0.05, 0.38, frontX, noseY - 0.05, side * (lampZ - 0.03), headlamp);
    else bx(g, 0.05, 0.11, 0.36, frontX, noseY - 0.1, side * (lampZ - 0.02), headlamp);
    if (s.tail === 'tall') {
      bx(g, 0.05, 0.32, 0.1, rearX, tailY - 0.03, side * (s.W / 2 - 0.1), tail);
      bx(g, 0.052, 0.07, 0.09, rearX - 0.002, tailY - 0.27, side * (s.W / 2 - 0.1), backup);
    } else {
      bx(g, 0.05, 0.09, 0.4, rearX, tailY, side * (s.W / 2 - 0.26), tail);
      bx(g, 0.052, 0.07, 0.1, rearX - 0.002, tailY, side * (s.W / 2 - 0.54), backup);
    }
  }
  if (s.wing) {
    bx(g, 0.3, 0.03, s.W - 0.16, -hx + 0.2, s.belt + 0.24, 0, cladding);
    for (const side of [1, -1]) bx(g, 0.1, 0.24, 0.03, -hx + 0.22, s.belt + 0.11, side * (s.W / 2 - 0.4), cladding);
  }
  if (s.roofColor) {
    const len = s.L - s.wsTop - s.rearTop;
    bx(g, len + 0.04, 0.05, s.W - 0.12, (s.rearTop - s.wsTop) / 2, s.roof + 0.005, 0, new THREE.MeshStandardMaterial({ color: s.roofColor, roughness: 0.6 }));
  }
  if (s.sign) bx(g, 0.14, 0.12, 0.4, -0.25, s.roof + 0.06, 0, new THREE.MeshStandardMaterial({ color: 0xf6c915, emissive: 0xf6c915, emissiveIntensity: 0.35, roughness: 0.4 }));
}

/**
 * Build a car. `paint` overrides the spec's colour. Returns { group, spec }; the group's userData
 * carries its wheels (for spinning and steering) and its tail and reversing lamp materials.
 */
export function buildCar(kind, paint) {
  const s = paint === undefined ? SPECS[kind] : { ...SPECS[kind], paint };
  const g = new THREE.Group();
  const paintwork = paintMat(s);
  const tail = tailLamp.clone();
  const backup = backupLamp.clone();
  const hx = s.L / 2;
  const cy = s.wheelR;
  const ra = s.wheelR + s.gap;
  const base = cy - s.sill; // underside of the body
  const a0 = -Math.asin(s.sill / ra); // where the arch meets the underside
  const rx = ra * Math.cos(a0);

  // Lower body: side profile with wheel-arch cut-outs, extruded across the width
  const body = new THREE.Shape();
  body.moveTo(-hx + 0.08, base);
  body.lineTo(-hx, base + 0.18);
  body.lineTo(-hx, s.belt - 0.06);
  body.lineTo(-hx + s.rearBase, s.belt);
  body.lineTo(hx - s.cowl, s.belt);
  body.lineTo(hx - 0.16, s.hood);
  body.lineTo(hx, s.hood - s.noseDrop - 0.06);
  body.lineTo(hx, base + 0.14);
  body.lineTo(hx - 0.08, base);
  body.lineTo(s.wb / 2 + rx, base);
  body.absarc(s.wb / 2, cy, ra, a0, Math.PI - a0, false);
  body.lineTo(-s.wb / 2 + rx, base);
  body.absarc(-s.wb / 2, cy, ra, a0, Math.PI - a0, false);
  body.closePath();
  g.add(extrude(body, s.W, paintwork, 0.05));

  // Cabin / greenhouse
  const cabin = new THREE.Shape();
  cabin.moveTo(hx - s.cowl, s.belt - 0.02);
  cabin.lineTo(hx - s.wsTop, s.roof);
  cabin.lineTo(-hx + s.rearTop, s.roof);
  cabin.lineTo(-hx + s.rearBase, s.belt - 0.02);
  cabin.closePath();
  g.add(extrude(cabin, s.W - 0.16, paintwork, 0.05));

  // Glazing
  sideWindows(g, s, 1);
  sideWindows(g, s, -1);
  slantedGlass(g, hx - s.cowl, s.belt, hx - s.wsTop, s.roof, 0.08, 0.9, s.W - 0.42, -0.008);
  slantedGlass(g, -hx + s.rearBase, s.belt, -hx + s.rearTop, s.roof, 0.14, 0.86, s.W - 0.5, 0.008);

  // Wheels, and for the off-roaders arch trims, rocker and bumper cladding
  const clad = s.bumper === 'clad';
  for (const x of [s.wb / 2, -s.wb / 2]) {
    for (const side of [1, -1]) {
      wheel(g, s, x, side);
      if (clad) archTrim(g, s, x, side);
    }
  }
  if (clad) {
    bx(g, s.wb - ra * 2, 0.14, s.W + 0.03, 0, cy + 0.05, 0, cladding);
    bx(g, 0.2, 0.3, s.W - 0.06, hx - 0.07, cy + 0.12, 0, cladding);
    bx(g, 0.2, 0.3, s.W - 0.06, -hx + 0.07, cy + 0.12, 0, cladding);
    bx(g, 0.06, 0.06, s.W * 0.5, hx + 0.01, cy + 0.02, 0, M.steel); // skid plate
    bx(g, 0.06, 0.06, s.W * 0.5, -hx - 0.01, cy + 0.02, 0, M.steel);
  }

  // Mirrors, roof rails, door handles and shut lines
  const door = s.pillars[0];
  for (const side of [1, -1]) {
    bx(g, 0.1, 0.16, 0.24, hx - s.cowl - 0.2, s.belt + 0.1, side * (s.W / 2 + 0.06), paintwork);
    if (s.rails) bx(g, s.L * 0.5, 0.05, 0.05, -0.35, s.roof + 0.06, side * (s.W / 2 - 0.25), cladding);
    bx(g, 0.16, 0.03, 0.02, door + 0.53, s.belt - 0.1, side * (s.W / 2 + 0.005), cladding);
    if (s.seats > 2 && s.pillars.length > 1) bx(g, 0.16, 0.03, 0.02, door - 0.57, s.belt - 0.1, side * (s.W / 2 + 0.005), cladding);
    bx(g, 0.012, s.belt - cy - 0.2, 0.01, door, (s.belt + cy) / 2 + 0.05, side * (s.W / 2 + 0.002), cladding);
  }

  const frontX = hx + 0.012;
  const rearX = -hx - 0.012;
  const plate = (x, facing) => label(g, s.face === 'tahoe' ? 'TAHOE 26' : 'BJ30 25', 0.5, 0.13, x, cy + 0.22, 0, facing, '#111', '#f1f1ee');

  if (s.face === 'bj30') {
    // Gloss-black band across the nose with BEIJING lettering, squared lamps either side
    bx(g, 0.04, 0.2, s.W - 0.1, hx - 0.005, s.hood - 0.2, 0, M.black);
    label(g, 'B E I J I N G', 0.95, 0.11, frontX + 0.012, s.hood - 0.2, 0, 1);
    for (const side of [1, -1]) {
      bx(g, 0.05, 0.16, 0.34, frontX, s.hood - 0.2, side * (s.W / 2 - 0.26), headlamp);
      bx(g, 0.05, 0.08, 0.2, frontX, cy + 0.3, side * (s.W / 2 - 0.3), headlamp); // fog lamps
      bx(g, 0.05, 0.5, 0.11, rearX, s.belt - 0.16, side * (s.W / 2 - 0.12), tail); // vertical tail lamps
      bx(g, 0.052, 0.08, 0.08, rearX - 0.003, s.belt - 0.34, side * (s.W / 2 - 0.12), backup);
    }
    // Lower intake with vertical slats
    bx(g, 0.04, 0.1, s.W * 0.55, hx, cy + 0.33, 0, M.black);
    for (let i = -3; i <= 3; i++) bx(g, 0.05, 0.09, 0.03, hx + 0.005, cy + 0.33, i * 0.14, M.darkSteel);
    bx(g, 0.03, 0.12, s.W - 0.5, rearX + 0.005, s.belt - 0.12, 0, M.black);
    label(g, 'B E I J I N G', 0.8, 0.09, rearX - 0.012, s.belt - 0.12, 0, -1);
    label(g, 'BJ30', 0.26, 0.07, rearX - 0.006, s.belt - 0.36, -s.W / 2 + 0.4, -1);
    // Roof cross bars for the off-road look
    for (const x of [0.3, -0.9]) bx(g, 0.05, 0.035, s.W - 0.45, x, s.roof + 0.1, 0, cladding);
    plate(hx + 0.035, 1);
    plate(-hx - 0.035, -1);
  } else if (s.face === 'tahoe') {
    // Tall grille with horizontal bars, body-colour centre bar and gold bowtie
    bx(g, 0.04, 0.6, s.W - 0.62, hx - 0.005, s.hood - 0.44, 0, M.black);
    for (let i = 0; i < 6; i++) bx(g, 0.05, 0.03, s.W - 0.66, hx + 0.004, s.hood - 0.7 + i * 0.1, 0, M.steel);
    bx(g, 0.05, 0.085, s.W - 0.62, hx + 0.008, s.hood - 0.36, 0, paintwork);
    bowtie(g, frontX + 0.022, s.hood - 0.36, 0, 1);
    for (const side of [1, -1]) {
      bx(g, 0.05, 0.1, 0.36, frontX, s.hood - 0.2, side * (s.W / 2 - 0.22), headlamp); // slim upper lamps
      bx(g, 0.05, 0.42, 0.045, frontX, s.hood - 0.47, side * (s.W / 2 - 0.07), headlamp); // vertical DRL signature
      bx(g, 0.05, 0.14, 0.2, frontX, s.hood - 0.52, side * (s.W / 2 - 0.2), headlamp);
      bx(g, 0.05, 0.62, 0.13, rearX, s.belt - 0.08, side * (s.W / 2 - 0.11), tail);
      bx(g, 0.052, 0.1, 0.09, rearX - 0.003, s.belt - 0.3, side * (s.W / 2 - 0.11), backup);
      bx(g, s.wb - 0.3, 0.04, 0.2, 0, cy + 0.02, side * (s.W / 2 + 0.02), cladding); // running boards
    }
    bx(g, 0.03, 0.05, s.W - 0.5, rearX + 0.005, s.belt - 0.02, 0, M.chrome);
    bowtie(g, rearX - 0.012, s.belt - 0.2, 0, -1);
    label(g, 'TAHOE', 0.34, 0.075, rearX - 0.006, s.belt - 0.38, s.W / 2 - 0.42, -1);
    plate(hx + 0.035, 1);
    plate(-hx - 0.035, -1);
  } else if (s.face === 'c8') {
    // Sharp nose with a wide lower intake, slim C-shaped corner lamps and a gold bowtie
    const noseY = s.hood - s.noseDrop - 0.06;
    bx(g, 0.04, 0.05, s.W - 0.7, hx - 0.002, noseY - 0.02, 0, M.black);
    bx(g, 0.06, 0.16, s.W * 0.78, hx + 0.008, base + 0.2, 0, M.black);
    bowtie(g, frontX + 0.02, noseY + 0.01, 0, 1);
    for (const side of [1, -1]) {
      bx(g, 0.05, 0.055, 0.46, frontX, noseY - 0.05, side * (s.W / 2 - 0.3), headlamp);
      bx(g, 0.04, 0.05, 0.16, frontX, base + 0.2, side * (s.W / 2 - 0.42), headlamp);
    }
    // Full-width tail bar, twin central exhausts, engine-cover vents
    bx(g, 0.05, 0.055, s.W - 0.12, rearX, s.belt - 0.06, 0, tail);
    bx(g, 0.052, 0.045, 0.14, rearX - 0.002, s.belt - 0.18, 0, backup);
    bowtie(g, rearX - 0.012, s.belt - 0.28, 0, -1);
    label(g, 'CORVETTE', 0.42, 0.06, rearX - 0.006, s.belt - 0.38, 0, -1);
    for (const side of [1, -1]) {
      disc(g, 0.04, rearX - 0.01, base + 0.14, side * 0.18, M.chrome);
      bx(g, 0.28, 0.035, 0.32, -hx + 0.62, s.roof - 0.01, side * (s.W / 2 - 0.3), cladding);
    }
  } else {
    plainFace(g, s, base, tail, backup);
  }
  flatten(g);
  g.userData.lamps = { tail, backup };
  return { group: g, spec: s };
}

function bowtie(g, x, y, z, facing) {
  const sh = new THREE.Shape();
  const pts = [[-0.13, 0.022], [-0.04, 0.022], [-0.04, 0.045], [0.05, 0.045], [0.05, 0.022], [0.14, 0.022],
    [0.13, -0.022], [0.04, -0.022], [0.04, -0.045], [-0.05, -0.045], [-0.05, -0.022], [-0.14, -0.022]];
  sh.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) sh.lineTo(p[0], p[1]);
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }), gold);
  m.position.set(x, y, z);
  m.rotation.y = facing * (Math.PI / 2);
  g.add(m);
}

const trim = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.85 });
const liner = new THREE.MeshStandardMaterial({ color: 0xcfc8bc, roughness: 0.95 });
const display = new THREE.MeshStandardMaterial({ color: 0x0a0f18, emissive: 0x24384d, emissiveIntensity: 0.5, roughness: 0.2 });

/** Where the driver's eyes are, in the car's local axes (left-hand drive: left is -z). */
export const driverEye = (s) => new THREE.Vector3(s.L / 2 - s.wsTop - 0.42, Math.max(s.roof - 0.26, s.belt + 0.19), -0.38);

/**
 * Cabin fittings as seen from the driver's seat: dash, wheel, pillars, headlining and seat tops.
 * Only shown while driving; from outside the tinted glass hides the cabin anyway.
 */
export function buildInterior(s) {
  const g = new THREE.Group();
  const hx = s.L / 2;
  const half = s.W / 2 - 0.1; // inner face of the doors
  const cowl = hx - s.cowl; // foot of the windscreen
  const head = hx - s.wsTop; // top of the windscreen
  const tail = -hx + s.rearTop + 0.08;
  const eye = driverEye(s);
  const mid = (cowl + tail) / 2;
  const len = cowl - tail;
  const bar = (x0, y0, x1, y1, z, t, mat) => {
    const m = bx(g, Math.hypot(x1 - x0, y1 - y0), t, t, (x0 + x1) / 2, (y0 + y1) / 2, z, mat);
    m.rotation.z = Math.atan2(y1 - y0, x1 - x0);
  };

  bx(g, len, 0.02, half * 2, mid, s.belt + 0.012, 0, trim); // everything below the window line
  bx(g, 0.48, 0.16, half * 2, cowl - 0.26, s.belt - 0.04, 0, trim); // dashboard
  bx(g, 0.2, 0.08, 0.4, cowl - 0.36, s.belt + 0.07, eye.z, trim); // instrument binnacle
  bx(g, 0.02, 0.12, 0.32, cowl - 0.51, s.belt + 0.07, 0.1, display); // centre screen
  bx(g, len - 0.4, 0.03, half * 2, mid - 0.2, s.roof - 0.075, 0, liner); // headlining
  bx(g, 0.1, 0.06, half * 2, head - 0.03, s.roof - 0.06, 0, liner); // windscreen header
  bx(g, 0.03, 0.07, 0.24, head - 0.14, s.roof - 0.17, 0, trim); // rear-view mirror
  for (const side of [1, -1]) {
    const z = side * half;
    bx(g, len, 0.07, 0.1, mid, s.belt + 0.035, z - side * 0.02, trim); // door tops
    bar(cowl, s.belt, head, s.roof - 0.04, z - side * 0.02, 0.05, trim); // A-pillar
    for (const x of [...s.pillars, tail + 0.05]) bx(g, 0.1, s.roof - s.belt, 0.08, x, (s.roof + s.belt) / 2, z, trim);
    if (s.seats > 2) bx(g, 0.1, 0.2, 0.26, eye.x - 1.08, s.belt + 0.5, side * 0.42, M.leather); // rear headrests
  }
  bx(g, 0.14, 0.42, 0.5, eye.x - 0.2, s.belt + 0.2, -eye.z, M.leather); // passenger seat back
  bx(g, 0.1, 0.2, 0.26, eye.x - 0.22, s.belt + 0.5, -eye.z, M.leather);
  if (s.seats > 2) bx(g, 0.16, 0.4, half * 2 - 0.2, eye.x - 1.05, s.belt + 0.19, 0, M.leather); // rear bench

  // Steering wheel: raked column, and a spinner that turns with the front wheels
  const column = new THREE.Group();
  column.position.set(eye.x + 0.47, s.belt - 0.07, eye.z);
  column.rotation.z = -0.42;
  const rim = new THREE.Group();
  rim.rotation.y = Math.PI / 2;
  const spinner = new THREE.Group();
  spinner.add(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.016, 10, 28), trim));
  spinner.add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.045, 0.02), trim));
  spinner.add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.18, 0.02), trim).translateY(-0.09));
  rim.add(spinner);
  column.add(rim);
  flatten(g); // dash, seats and lining; not the column, which is a nested group
  g.add(column);
  g.userData.steering = spinner;
  return g;
}
