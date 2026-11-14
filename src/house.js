import * as THREE from 'three';
import { M } from './materials.js';
import { box, deco, wall, clad, glassRail, addCollider, ledStrip, downlight } from './builder.js';

// Coordinate system (metres): +x = right when facing the house from the street,
// +z = toward the street, -z = toward the pool. Ground floor finish = y 0.
export const H = { grade: -0.45, gc: 3.0, f2: 3.3, uc: 6.3, roof: 6.7 };

const win = (from, to, y0, y1, extra = {}) => ({ type: 'window', from, to, y0, y1, ...extra });
const door = (from, to, extra = {}) => ({ type: 'door', from, to, ...extra });
const open = (from, to, y1, extra = {}) => ({ type: 'open', from, to, y1, ...extra });

export function buildHouse(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const g = (axis, fixed, a, b, openings = [], opts = {}) =>
    wall(root, axis, fixed, a, b, 0, H.gc, { openings, ...opts });
  // Upper walls start at the slab underside so they wrap the slab edge.
  const u = (axis, fixed, a, b, openings = [], opts = {}) =>
    wall(root, axis, fixed, a, b, H.gc, H.uc, {
      openings: openings.map((o) => ({ ...o, y0: o.y0 ?? H.f2, y1: o.y1 ?? H.f2 + 2.3 })),
      ...opts,
    });

  buildPlinth(root);
  buildGroundWalls(g, root);
  buildUpperWalls(u, root);
  buildSlabsAndRoofs(root);
  buildStairs(root);
  buildCladding(root);
  return root;
}

function buildPlinth(root) {
  const c = M.concrete;
  box(root, -9.1, H.grade, -13.1, 3.1, 0, 12.6, c); // west + centre
  box(root, 3.1, H.grade, -9.6, 12.1, 0, 7.6, c); // east wing
  box(root, -3.5, H.grade, -14.5, 3.1, 0, -13.1, c); // terrace base
  box(root, 3.1, H.grade, -14.5, 12.1, 0, -9.6, c);
  // Terrace deck boards
  deco(root, -3.5, 0, -14.5, 3.1, 0.02, -8.1, M.deck);
  deco(root, 3.1, 0, -14.5, 8.4, 0.02, -9.6, M.deck);
  // Side-yard planting strip beside the courtyard
  deco(root, -9.1, 0, 3.5, -3.7, 0.03, 6.9, M.grass);
  // Intermediate steps so every level change is walkable
  box(root, -3.5, H.grade, -14.9, 12.1, -0.225, -14.5, M.paving);
  box(root, 12.1, H.grade, 0, 12.7, -0.225, 1.6, M.paving);
  box(root, -8.4, H.grade, -13.6, -4.2, -0.225, -13.1, M.paving);
  // Entry porch + steps
  box(root, -1.2, H.grade, 12.6, 3.1, 0, 13.4, M.paving);
  box(root, -1.2, H.grade, 13.4, 3.1, -0.15, 13.8, M.paving);
  box(root, -1.2, H.grade, 13.8, 3.1, -0.3, 14.2, M.paving);
  // Planter between porch and carport
  box(root, 3.1, H.grade, 12.4, 3.6, 0.3, 14.6, M.stucco);
  // Courtyard garden bed (open to the sky)
  deco(root, -3.5, 0, 3.5, -0.5, 0.03, 6.9, M.grass);
  // Bedroom / stair timber floors
  deco(root, -8.9, 0, 7.1, -3.7, 0.012, 12.4, M.deck);
  deco(root, -8.9, 0, -12.9, -3.7, 0.012, -7.6, M.deck);
}

function buildGroundWalls(g, root) {
  // ---- West column -------------------------------------------------------
  g('x', 12.5, -9, -3.6); // bedroom 1 street wall (slatted outside)
  g('z', -9, 7, 12.5, [win(8.4, 11, 0.9, 2.3)]);
  g('x', 7, -9, -0.4, [win(-8, -5.6, 0.9, 2.3), win(-3.1, -0.9, 0.3, 2.6)]);
  g('z', -3.6, 7, 12.5, [door(7.5, 8.4)]);
  g('x', 9.2, -3.6, -0.4, [door(-2.6, -1.8)]);
  g('z', -0.4, 7, 12, [door(7.5, 8.4)]);
  // Courtyard: double-height louvred glazing to the foyer, louvre gate to the side yard
  wall(root, 'z', -0.4, 3.4, 7, 0, H.uc, { openings: [{ type: 'louver', from: 3.5, to: 6.9, y0: 0.05, y1: 6.2, side: -1 }] });
  wall(root, 'z', -3.6, 3.4, 7, 0, H.gc, { openings: [{ type: 'louver', from: 3.4, to: 7, y0: 0, y1: H.gc, glass: false, side: 0 }] });
  g('x', 3.4, -9, -0.4, [win(-3.4, -0.5, 0.02, 2.95, { mv: 2, mh: 1 })]);
  // Stair hall + rear bedroom wing
  g('z', -9, -13, 3.4, [win(-11.5, -9, 0.9, 2.3), win(-5.6, -4.2, 1.6, 2.2, { frosted: true }), win(-1.6, 1.2, 0.3, 2.8, { mv: 1 })]);
  g('x', -2, -9, -3.6);
  g('z', -3.6, -13, 3.4, [door(-7.3, -6.4, { mat: M.slat }), open(1.8, 3.2, 2.7)]);
  g('x', -7.5, -9, -3.6, [door(-5.4, -4.5)]);
  g('z', -6, -7.5, -2, [door(-6.9, -6.1)]);
  g('x', -5.5, -6, -3.6, [door(-5.2, -4.4)]);
  g('x', -13, -9, -3.6, [{ type: 'slider', from: -8.2, to: -4.4, y1: 2.4 }]);

  // ---- Centre ------------------------------------------------------------
  g('x', 12, -3.6, 3, [
    win(-3, -1.3, 1.7, 2.2, { frosted: true }),
    win(-0.25, 0.45, 0, 2.8, { mv: 0, mh: 3 }),
    { type: 'pivot', from: 0.45, to: 2.15, y1: 2.8 },
    win(2.15, 2.85, 0, 2.8, { mv: 0, mh: 3 }),
  ]);
  g('x', -8, -3.6, 3, [open(-3.4, 1.6, 2.95)]); // bi-fold opening to the terrace
  g('z', 3, -2.5, 12, [door(0.3, 1.2), open(3.2, 5.6, 2.7)]);

  // ---- East wing ---------------------------------------------------------
  g('z', 3, -9.5, -8, [win(-9.3, -8.2, 1.05, 2.5, { mv: 0 })]);
  g('x', -9.5, 3, 12, [win(3.4, 7.6, 1.05, 2.5, { mv: 3 }), { type: 'slider', from: 8.6, to: 11.4, y1: 2.4 }]);
  g('z', 8, -9.5, -0.2);
  g('x', -2.5, 3, 12, [door(6.8, 7.6), door(10.8, 11.7)]);
  g('x', -0.2, 3, 10.5);
  g('z', 10.5, -2.5, -0.2, [door(-1.7, -0.9)]);
  g('z', 12, -9.5, 7.5, [win(-8.5, -4.5, 0.9, 2.4), door(0.3, 1.3, { mat: M.frame }), win(3.5, 6, 1, 2.3)]);
  g('x', 1.8, 3, 12, [door(9, 9.9)]);
  g('z', 8, 1.8, 7.5);
  g('x', 7.5, 3, 12, [win(4.2, 4.9, 0.5, 2.5, { mv: 0, mh: 2 }), win(6, 6.7, 0.5, 2.5, { mv: 0, mh: 2 })]);

  // Folded bi-fold door panels stacked against the slat wall
  for (let i = 0; i < 5; i++) {
    deco(root, -3.42 + i * 0.07, 0.02, -8.75, -3.38 + i * 0.07, 2.9, -8.05, M.frame);
  }
}

function buildUpperWalls(u, root) {
  // Stair tower
  u('z', -9, -2, 3.4, [win(-1.6, 1.2, 3.5, 6.0, { mv: 1, mh: 1 })]);
  u('x', -2, -9, -3.6, [win(-8.4, -6.8, 4.2, 6.0)]);
  u('x', 3.4, -9, -0.4, [win(-8.4, -5.2, 4.0, 6.0)]);
  u('z', -3.6, -8, 3.4, [win(-7.4, -3, 4.7, 5.9, { mv: 2 }), open(-1.7, 3.1, 6.0)]);
  // Double-height glazing above the bi-fold doors
  u('x', -8, -3.6, 3, [win(-3.5, 2.9, 3.45, 6.2, { mv: 2 })]);
  // Spine wall between the centre and the east bedrooms
  u('z', 3, -8, 12, [open(-1.2, 0.4, 5.7), door(4.2, 5.1)]);
  // Foyer tower
  u('z', -0.4, 7, 12);
  u('x', 12, -0.4, 3, [win(0.1, 2.5, 3.7, 6.0, { mv: 1 })]);
  // Master suite
  u('x', -8, 3, 12, [{ type: 'slider', from: 3.6, to: 7.6, y1: 5.7 }, win(9, 11, 4.6, 5.6, { frosted: true })]);
  u('z', 8.2, -8, -1.4, [door(-7, -6.1), door(-3.6, -2.7)]);
  u('x', -4.6, 8.2, 12);
  u('x', -1.4, 3, 12, [door(6.4, 7.3)]);
  u('z', 12, -8, 7.5, [
    win(-7, -5.5, 4.6, 5.6, { frosted: true }),
    { type: 'louver', from: -1.2, to: 0.4, y0: 3.5, y1: 5.9, side: 1 },
    win(1.5, 3, 4.6, 5.6, { frosted: true }),
    win(5, 7, 4.2, 5.8),
  ]);
  // Bedroom 3 suite
  u('x', 0.6, 3, 12);
  u('z', 8.5, 0.6, 7.5, [door(1.6, 2.5), door(5, 5.9)]);
  u('x', 4, 8.5, 12);
  u('x', 7.5, 3, 12, [win(3.8, 7.8, 4.2, 6.0, { mv: 2 })]);

  // Balustrades: lounge edge over the living room, foyer gallery, master balcony
  glassRail(root, 'x', -2.45, -3.5, 2.9, H.f2);
  glassRail(root, 'x', 5.45, -0.3, 2.9, H.f2);
  glassRail(root, 'x', -9.45, 3.05, 12.05, H.f2);
  glassRail(root, 'z', 3.05, -9.45, -8.1, H.f2);
  glassRail(root, 'z', 12.05, -9.45, -8.1, H.f2);

  // Diagonal steel screen in front of the lounge (seen from the living room below)
  const screen = new THREE.Group();
  const bar = new THREE.BoxGeometry(0.035, 1, 0.035);
  const x0 = -3.5;
  const x1 = 0.3;
  const top = H.uc - H.f2;
  for (let i = 0; i < 16; i++) {
    const a = x0 + ((x1 - x0) * ((i * 37) % 100)) / 100;
    const b = Math.min(x1, Math.max(x0, a + (((i * 53) % 21) - 10) * 0.16));
    const m = new THREE.Mesh(bar, M.white);
    const len = Math.hypot(b - a, top);
    m.scale.y = len;
    m.position.set((a + b) / 2, H.f2 + top / 2, -2.38);
    m.rotation.z = -Math.atan2(b - a, top);
    m.castShadow = true;
    screen.add(m);
  }
  root.add(screen);
}

function slab(root, x0, z0, x1, z1) {
  box(root, x0, H.gc, z0, x1, H.f2 - 0.02, z1, M.ceiling, { collide: false });
  deco(root, x0, H.f2 - 0.02, z0, x1, H.f2, z1, M.concrete);
  addCollider(x0, H.gc, z0, x1, H.f2, z1);
}

function roof(root, x0, z0, x1, z1, y0, y1, mat = M.stucco) {
  box(root, x0, y0, z0, x1, y1, z1, mat);
}

function buildSlabsAndRoofs(root) {
  // Second-floor slabs. Gaps = living-room void, foyer void, stair well, courtyard.
  slab(root, -3.6, -2.5, 3, 3.4); // lounge
  slab(root, -0.4, 3.4, 3, 5.5); // gallery over the foyer
  slab(root, -9.1, 1.4, -3.6, 3.5); // stair tower landing strip
  slab(root, -6.4, -2.1, -3.6, 1.4);
  slab(root, 3, -9.6, 12.1, 7.6); // east wing incl. master balcony

  // Single-storey roofs with deep fascias (photo style)
  roof(root, -9.9, 6.6, -0.5, 13.5, H.gc, 3.45);
  roof(root, -9.6, -13.7, -3.7, -2.1, H.gc, 3.45);
  roof(root, 3.1, 7.6, 14.6, 15.2, 3.35, 3.8); // carport
  // Terrace canopy: dark steel with a slatted timber soffit
  roof(root, -3.7, -14.8, 2.9, -8.1, H.gc, 3.25, M.darkSteel);
  roof(root, 2.9, -14.8, 8.6, -9.6, H.gc, 3.25, M.darkSteel);
  deco(root, -3.6, 2.96, -14.7, 2.9, 3.0, -8.2, M.slat);
  deco(root, 2.9, 2.96, -14.7, 8.5, 3.0, -9.7, M.slat);
  box(root, 2.1, H.grade, -14.45, 2.35, H.gc, -14.2, M.darkSteel);
  box(root, 8.2, H.grade, -14.45, 8.45, H.gc, -14.2, M.darkSteel);

  // Upper roofs with wide overhangs
  roof(root, -4.8, -10.8, 13.3, 3.8, H.uc, H.roof); // stops short of the open courtyard
  roof(root, -0.9, 3.8, 13.3, 5.5, H.uc, H.roof);
  roof(root, 3, 5.5, 13.3, 8.8, H.uc, H.roof);
  roof(root, -0.9, 5.5, 3, 12.9, H.uc, H.roof);
  roof(root, -9.5, -2.5, -4.8, 3.9, H.uc, H.roof);

  // Warm cove lighting under the eaves
  ledStrip(root, -4.6, H.uc, -10.6, 13.1, -10.5);
  ledStrip(root, 13.0, H.uc, -10.6, 13.1, 8.6);
  ledStrip(root, 3.2, H.uc, 8.5, 13.1, 8.6);
  ledStrip(root, -0.7, H.uc, 12.6, 2.8, 12.7);
  ledStrip(root, -9.3, H.uc, 3.6, -4.8, 3.7);
  ledStrip(root, -9.7, H.gc, 13.2, -0.7, 13.3);
  ledStrip(root, 3.3, 3.35, 14.9, 14.4, 15.0);
  ledStrip(root, -3.4, 2.96, -14.6, 8.3, -14.5);
  for (const x of [4.5, 7, 9.5, 12]) for (const z of [9.5, 12.5]) downlight(root, x, 3.35, z);
  for (const x of [-2, 2, 6, 10]) downlight(root, x, H.uc, -9.9);
  for (const x of [-7.5, -5, -2.5]) downlight(root, x, H.gc, 13);
}

function buildStairs(root) {
  const rise = H.f2 / 18;
  const run = 0.28;
  const tread = (x0, x1, z0, z1, top) => box(root, x0, top - 0.07, z0, x1, top, z1, M.walnut);
  // Flight 1 climbs north along the window wall
  for (let i = 1; i <= 8; i++) tread(-8.9, -7.6, 1.4 - run * i, 1.4 - run * (i - 1), rise * i);
  // Half landing
  box(root, -8.9, rise * 9 - 0.12, -1.9, -6.4, rise * 9, -0.84, M.walnut);
  // Flight 2 returns south and lands on the upper slab at z = 1.4
  for (let j = 1; j <= 8; j++) tread(-7.5, -6.4, -0.84 + run * (j - 1), -0.84 + run * j, rise * (9 + j));

  // Steel stringers (visual only)
  const stringer = (x, zA, yA, zB, yB) => {
    const len = Math.hypot(zB - zA, yB - yA);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, len), M.darkSteel);
    m.position.set(x, (yA + yB) / 2 - 0.16, (zA + zB) / 2);
    m.rotation.x = -Math.atan2(yB - yA, zB - zA);
    m.castShadow = true;
    root.add(m);
  };
  stringer(-8.25, 1.4, 0, -0.84, rise * 8);
  stringer(-6.95, -0.84, rise * 9, 1.4, rise * 17);

  // Glass guards: between the flights, beside the stair, and around the well upstairs
  box(root, -6.41, 0, -1.9, -6.39, H.f2 + 1.05, 1.4, M.glass, { cast: false });
  box(root, -7.56, 0.2, -0.84, -7.54, H.f2 + 1.05, 1.4, M.glass, { cast: false });
  glassRail(root, 'x', 1.4, -8.9, -7.55, H.f2);

  // Pebble garden under the floating treads
  deco(root, -8.9, 0, -1.9, -6.42, 0.02, 1.4, M.pebble);
  deco(root, -6.38, 0, -1.9, -3.7, 0.02, 1.4, M.pebble);
}

function buildCladding(root) {
  // Timber slats: street face of bedroom 1, living-room TV wall
  clad(root, 'x', 12.5, 1, -9.1, -3.5, H.grade, 3.0, M.slat);
  clad(root, 'z', -3.6, 1, -6.4, 1.8, 0, 3.0, M.slat);
  clad(root, 'z', -3.6, 1, -8, -7.3, 0, 3.0, M.slat);
  clad(root, 'z', -3.6, 1, -7.3, -6.4, 2.3, 3.0, M.slat);
  // Stacked stone: BBQ wall on the terrace, carport back wall
  clad(root, 'z', -3.6, 1, -13.1, -8.1, H.grade, 3.0, M.stone);
  clad(root, 'x', 7.5, 1, 3.1, 4.2, H.grade, 3.0, M.stone);
  clad(root, 'x', 7.5, 1, 4.9, 6, H.grade, 3.0, M.stone);
  clad(root, 'x', 7.5, 1, 6.7, 12.1, H.grade, 3.0, M.stone);
  clad(root, 'x', 7.5, 1, 4.2, 4.9, H.grade, 0.5, M.stone);
  clad(root, 'x', 7.5, 1, 6, 6.7, H.grade, 0.5, M.stone);
  clad(root, 'x', 7.5, 1, 4.2, 4.9, 2.5, 3.0, M.stone);
  clad(root, 'x', 7.5, 1, 6, 6.7, 2.5, 3.0, M.stone);
  // Walnut panelling in the foyer and beside the games-room opening
  clad(root, 'z', -0.4, 1, 8.4, 11.9, 0, 3.0, M.woodPanel);
  clad(root, 'z', 3, -1, 1.3, 3.1, 0, 3.0, M.woodPanel);
  // Dark media wall in the upstairs lounge
  clad(root, 'x', 3.4, -1, -3.3, -0.7, H.f2 + 0.3, H.f2 + 2.5, M.black);
}
