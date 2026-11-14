import * as THREE from 'three';
import { M } from './materials.js';
import { box, deco, clad, cylinder, addCollider, ledStrip } from './builder.js';
import { sofa, plant, shrub, tree } from './props.js';
import { H } from './house.js';

const G = H.grade;
export const POOL = { x0: -2, x1: 8, z0: -21.5, z1: -16.5, floor: -1.5 };

export function buildSite(scene) {
  const p = new THREE.Group();
  scene.add(p);

  // Ground for the whole estate, split into four slabs so the pool is a real basin you can step into
  const far = 3500;
  box(p, -far, -4, -far, far, G, POOL.z0, M.grass, { cast: false });
  box(p, -far, -4, POOL.z1, far, G, far, M.grass, { cast: false });
  box(p, -far, -4, POOL.z0, POOL.x0, G, POOL.z1, M.grass, { cast: false });
  box(p, POOL.x1, -4, POOL.z0, far, G, POOL.z1, M.grass, { cast: false });
  pool(p);

  // Driveway and paths (thin overlays on the lawn); the street itself comes from the map in world.js
  const pave = (x0, z0, x1, z1, mat = M.paving) => deco(p, x0, G, z0, x1, G + 0.012, z1, mat, { cast: false });
  pave(3.1, 7.6, 14.6, 22.6); // carport floor + drive, out to the kerb
  pave(-1.2, 14.2, 3.1, 16.2);
  pave(-3.5, -15.9, 12.5, -14.9); // terrace apron
  for (let x = -1.6; x < 8; x += 1.05) pave(x, -16.4, x + 0.8, -15.95); // stepping pads to the pool

  carport(p);
  gazebo(p);
  hotTub(p);
  firePit(p);
  planting(p);
  return p;
}

function pool(p) {
  const { x0, x1, z0, z1, floor } = POOL;
  box(p, x0, -4, z0, x1, floor, z1, M.poolTile, { cast: false });
  // Tiled liner on the basin walls
  deco(p, x0, floor, z0, x1, G, z0 + 0.03, M.poolTile, { cast: false });
  deco(p, x0, floor, z1 - 0.03, x1, G, z1, M.poolTile, { cast: false });
  deco(p, x0, floor, z0, x0 + 0.03, G, z1, M.poolTile, { cast: false });
  deco(p, x1 - 0.03, floor, z0, x1, G, z1, M.poolTile, { cast: false });
  // Entry steps at the west end (also the way back out)
  box(p, x0, floor, z0, x0 + 0.45, -0.71, z1, M.poolTile, { cast: false });
  box(p, x0 + 0.45, floor, z0, x0 + 0.9, -0.97, z1, M.poolTile, { cast: false });
  box(p, x0 + 0.9, floor, z0, x0 + 1.35, -1.23, z1, M.poolTile, { cast: false });
  // Water surface
  const water = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), M.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set((x0 + x1) / 2, G - 0.1, (z0 + z1) / 2);
  p.add(water);
  // Stone coping + deck surround
  const c = 0.45;
  const cope = (a, b, d, e) => deco(p, a, G, b, d, G + 0.04, e, M.paving, { cast: false });
  cope(x0 - c, z0 - c, x1 + c, z0);
  cope(x0 - c, z1, x1 + c, z1 + c);
  cope(x0 - c, z0, x0, z1);
  cope(x1, z0, x1 + c, z1);
}

function carport(p) {
  // Slat-clad store that carries the carport roof
  box(p, 10.6, G, 8.5, 13, 3.35, 13.5, M.stucco);
  clad(p, 'x', 13.5, 1, 10.6, 13, G, 3.35, M.slat, 0);
  clad(p, 'z', 10.6, -1, 8.5, 13.5, G, 3.35, M.slat, 0);
  clad(p, 'z', 13, 1, 8.5, 13.5, G, 3.35, M.slat, 0);
  ledStrip(p, 10.6, G + 0.03, 13.52, 13, 13.56);
  // Planter greenery between the porch and the cars
  for (const z of [12.9, 13.6, 14.2]) plant(p, 3.35, 0.3, z, 0.9, false);

  // Golf cart parked beside the store
  const g = new THREE.Group();
  const white = M.white;
  const b = (x0, y0, z0, x1, y1, z1, m) => deco(g, x0, y0, z0, x1, y1, z1, m);
  b(-0.6, 0.25, -1.2, 0.6, 0.45, 1.2, white);
  b(-0.6, 0.45, 0.6, 0.6, 0.75, 1.2, white); // front cowl
  b(-0.55, 0.45, -0.5, 0.55, 0.62, 0.1, M.fabricCream); // seat
  b(-0.55, 0.62, -0.62, 0.55, 1.05, -0.5, M.fabricCream);
  b(-0.6, 0.45, -1.2, 0.6, 0.6, -0.62, white); // rear deck
  b(-0.65, 1.78, -1.1, 0.65, 1.84, 1.0, white); // canopy
  for (const [x, z] of [[-0.58, 0.7], [0.58, 0.7], [-0.58, -1.0], [0.58, -1.0]]) b(x - 0.02, 0.45, z - 0.02, x + 0.02, 1.78, z + 0.02, M.black);
  for (const [x, z] of [[-0.6, 0.8], [0.6, 0.8], [-0.6, -0.8], [0.6, -0.8]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.18, 18), M.black);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.23, z);
    g.add(w);
  }
  g.position.set(13.8, G, 11.2);
  p.add(g);
  addCollider(13.1, G, 9.9, 14.5, G + 1.8, 12.5);
}

function gazebo(p) {
  const x0 = -9.2;
  const x1 = -5.6;
  const z0 = -19;
  const z1 = -15.4;
  box(p, x0, G, z0, x1, G + 0.08, z1, M.deck);
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    box(p, x - 0.07, G, z - 0.07, x + 0.07, G + 2.6, z + 0.07, M.darkSteel);
    // Tied-back curtains at each post
    const cur = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 2.4, 10, 1, true), M.curtain);
    cur.position.set(x + (x === x0 ? 0.22 : -0.22), G + 1.3, z + (z === z0 ? 0.22 : -0.22));
    cur.castShadow = true;
    p.add(cur);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.1, 4), M.curtain);
  roof.rotation.y = Math.PI / 4;
  roof.position.set((x0 + x1) / 2, G + 3.15, (z0 + z1) / 2);
  roof.castShadow = true;
  p.add(roof);
  // Two sun loungers
  for (const x of [-8.2, -6.6]) {
    box(p, x - 0.4, G + 0.08, -18.4, x + 0.4, G + 0.38, -16.3, M.walnut);
    deco(p, x - 0.36, G + 0.38, -18.35, x + 0.36, G + 0.48, -16.35, M.fabricWhite);
    deco(p, x - 0.36, G + 0.48, -18.35, x + 0.36, G + 0.8, -18.2, M.fabricWhite);
  }
}

function hotTub(p) {
  box(p, 12, G, -13.6, 14.4, G + 0.85, -11.2, M.slat);
  deco(p, 11.95, G + 0.85, -13.65, 14.45, G + 0.92, -11.15, M.white);
  deco(p, 12.2, G + 0.86, -13.4, 14.2, G + 0.93, -11.4, M.water);
  box(p, 11.5, G, -13.0, 12, G + 0.42, -11.8, M.slat); // step
}

function firePit(p) {
  // Sunken-style conversation pit: U-shaped bench around a fire table
  box(p, 9.6, G, -22.2, 13.8, G + 0.05, -17.6, M.paving);
  const y = G + 0.05;
  sofa(p, 11.7, -21.7, 's', 3.6, y, M.fabricCream, 0.85);
  sofa(p, 10.05, -19.7, 'e', 2.6, y, M.fabricCream, 0.85);
  sofa(p, 13.35, -19.7, 'w', 2.6, y, M.fabricCream, 0.85);
  box(p, 11.1, y, -20.2, 12.3, y + 0.4, -19.2, M.stone);
  deco(p, 11.3, y + 0.4, -20.0, 12.1, y + 0.44, -19.4, M.fire);
  const fire = new THREE.PointLight(0xff7a2a, 14, 9, 2);
  fire.position.set(11.7, y + 0.9, -19.7);
  p.add(fire);
}

function planting(p) {
  // Ornamental grasses at the entry and along the facade
  for (const [x, z] of [[-2.2, 13.4], [-3.2, 13.6], [-2.7, 14.3], [-5, 13.3], [-7, 13.4], [-8.6, 13.3]]) plant(p, x, G, z, 1.5, false);
  for (const [x, z, r] of [[-10.2, -8, 0.6], [13.3, 4, 0.6], [13.4, -5, 0.7], [-4.5, -14.6, 0.5]]) shrub(p, x, G, z, r);
  // Up-lights washing the slatted wall, as in the dusk renders
  for (const x of [-8.4, -7, -5.6, -4.2]) {
    cylinder(p, x, G, 13.0, 0.06, 0.08, M.glow, { seg: 10 });
  }
  // Trees behind the lot and across the street
  // (the lot's own walls and hedge follow the surveyed boundary; see world.js)
  const trees = [[-4, -26.5, 7], [6, -27, 9], [16, -26, 8], [12, 40, 9], [-14, 41, 10]];
  for (const [x, z, h] of trees) tree(p, x, G, z, h);
}
