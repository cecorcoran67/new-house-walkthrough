import { M, colorMat } from './materials.js';
import { box, deco, cylinder, downlight, ledStrip } from './builder.js';
import {
  chair, stool, sofa, armchair, table, bed, tv, toilet, vanity, shelves, plant, shrub, art, pendant, showerScreen, rainShower,
} from './props.js';

export function furnishGround(p) {
  living(p);
  kitchen(p);
  entry(p);
  eastWing(p);
  bedrooms(p);
  terrace(p);
}

function living(p) {
  // Lounge group in front of the slat TV wall
  deco(p, -2.8, 0, -7.3, 2.4, 0.012, -2.9, M.rug);
  sofa(p, -1.15, -3.2, 'n', 2.9);
  sofa(p, 1.8, -5.3, 'w', 2.6);
  armchair(p, -1.7, -7.25, 's');
  armchair(p, -0.55, -7.25, 's');
  table(p, -1.5, -5.75, -0.3, -4.85, 0.38, 0, M.walnut, M.black, 0.05);
  tv(p, 'z', -3.46, -5.7, -3.7, 1.25, 2.35);
  box(p, -3.48, 0.28, -6.2, -3.02, 0.62, -3.0, M.walnut); // stops short of the flush door
  deco(p, -3.48, 0.62, -6.2, -3.02, 0.65, -3.0, M.black);
  plant(p, -3.2, 0.65, -3.4, 0.7);

  // Dining for eight beside the courtyard window
  table(p, -2.2, -1.5, -1.0, 1.3, 0.76);
  for (const z of [-1.05, -0.1, 0.85]) {
    chair(p, -2.55, z, 'e');
    chair(p, -0.65, z, 'w');
  }
  chair(p, -1.6, -1.85, 's');
  chair(p, -1.6, 1.65, 'n');
  for (const z of [-0.8, 0.6]) {
    deco(p, -1.75, 0.76, z - 0.15, -1.45, 0.77, z + 0.15, M.fabricGray);
    cylinder(p, -1.6, 0.77, z, 0.06, 0.12, M.glowSoft, { seg: 10 });
  }
  plant(p, -1.6, 0.76, -0.1, 0.55);

  // Cove lighting where the white wall meets the slats, ceiling spots under the lounge slab
  ledStrip(p, -3.46, 3.0, -8, -3.42, -2.5);
  for (const x of [-2, 0.3, 2]) for (const z of [-1.2, 1.4]) downlight(p, x, 3.0, z);
}

function kitchen(p) {
  // Island: walnut carcass, waterfall marble top, four stools on the living-room side
  box(p, 3.95, 0, -7.7, 4.95, 0.9, -4.4, M.walnut);
  deco(p, 3.75, 0.9, -7.8, 5.05, 0.96, -4.3, M.marble);
  deco(p, 3.75, 0, -7.8, 5.05, 0.9, -7.72, M.marble);
  for (const z of [-7.2, -6.4, -5.6, -4.8]) {
    stool(p, 3.45, z, 'e');
    pendant(p, 4.4, z, 3.0, 1.95);
  }
  cylinder(p, 4.6, 0.96, -6.6, 0.014, 0.32, M.chrome);
  deco(p, 4.3, 0.955, -7.0, 4.9, 0.965, -6.4, M.steel);

  // Sink run under the terrace window
  box(p, 3.15, 0, -9.38, 7.35, 0.9, -8.8, M.walnut);
  deco(p, 3.15, 0.9, -9.38, 7.35, 0.94, -8.78, M.marble);
  deco(p, 5.0, 0.935, -9.3, 5.8, 0.945, -8.9, M.steel);
  cylinder(p, 5.4, 0.94, -9.32, 0.016, 0.34, M.chrome);

  // Tall wall: ovens, fridge, walnut pantry fronts, upper cabinets with under-lighting
  box(p, 7.3, 0, -9.38, 7.9, 2.45, -3.5, M.walnut);
  deco(p, 7.27, 0.75, -6.6, 7.3, 1.35, -5.95, M.darkSteel);
  deco(p, 7.27, 1.4, -6.6, 7.3, 2.0, -5.95, M.darkSteel);
  deco(p, 7.26, 0.05, -5.8, 7.3, 2.1, -4.85, M.steel);
  deco(p, 7.24, 0.9, -5.36, 7.26, 1.6, -5.33, M.chrome);
  deco(p, 7.26, 0.05, -4.8, 7.3, 2.1, -3.85, M.steel);
  ledStrip(p, 7.0, 2.45, -9.3, 7.3, -3.5);

  // Coffee bar on the pantry wall
  box(p, 3.3, 0, -3.1, 6.5, 0.9, -2.6, M.walnut);
  deco(p, 3.3, 0.9, -3.12, 6.5, 0.94, -2.6, M.marble);
  deco(p, 3.3, 0.94, -2.63, 6.5, 2.4, -2.6, M.marble);
  for (const y of [1.45, 1.9]) {
    deco(p, 3.5, y, -2.85, 6.3, y + 0.04, -2.62, M.walnut);
    for (let i = 0; i < 6; i++) cylinder(p, 3.8 + i * 0.45, y + 0.04, -2.74, 0.045, 0.1, i % 2 ? M.white : M.plant, { seg: 10 });
  }
  box(p, 5.6, 0.94, -2.95, 5.9, 1.32, -2.68, M.black, { collide: false });
  for (const x of [4, 5.5, 7]) for (const z of [-8, -5.5]) downlight(p, x, 3.0, z);
}

function entry(p) {
  // Floating console with artwork on the walnut-panelled wall
  box(p, 2.5, 0.8, 8.4, 2.9, 0.88, 10.8, M.walnut);
  deco(p, 2.6, 0.88, 9.2, 2.85, 0.93, 9.55, colorMat(0x2b2b2e));
  art(p, 'z', 2.88, 8.9, 10.3, 1.3, 2.5, 'swirl');
  art(p, 'z', 2.88, -1.9, -0.6, 1.2, 2.3, 'swirl');
  plant(p, 0.0, 0, 11.3, 1.1);
  for (const z of [6.5, 8.5, 10.5]) downlight(p, 1.3, 6.3, z);
  // Courtyard planting visible through the louvres
  for (const [x, z] of [[-2.8, 4.3], [-1.5, 5.2], [-2.3, 6.1], [-1.0, 4.1]]) plant(p, x, 0.03, z, 1.5, false);
  shrub(p, -6.5, 0.03, 5.2, 0.55);
  shrub(p, -5.2, 0.03, 4.6, 0.4, M.plant);
  // Stair hall greenery on the pebble bed
  plant(p, -5.4, 0.02, -1.2, 1.4, false);
  plant(p, -4.5, 0.02, -0.3, 1.1, false);
}

function eastWing(p) {
  // Games room: pool table + cue rack art
  box(p, 4.75, 0.45, 3.45, 6.05, 0.78, 5.95, M.walnut);
  deco(p, 4.85, 0.78, 3.55, 5.95, 0.8, 5.85, M.felt);
  deco(p, 4.75, 0.78, 3.45, 6.05, 0.83, 3.55, M.walnut);
  deco(p, 4.75, 0.78, 5.85, 6.05, 0.83, 5.95, M.walnut);
  deco(p, 4.75, 0.78, 3.45, 4.85, 0.83, 5.95, M.walnut);
  deco(p, 5.95, 0.78, 3.45, 6.05, 0.83, 5.95, M.walnut);
  for (const [x, z] of [[4.9, 3.6], [5.9, 3.6], [4.9, 5.8], [5.9, 5.8]]) deco(p, x - 0.06, 0, z - 0.06, x + 0.06, 0.45, z + 0.06, M.walnut);
  for (let i = 0; i < 5; i++) {
    cylinder(p, 5.2 + (i % 3) * 0.14, 0.8, 4.2 + i * 0.22, 0.03, 0.06, [M.white, colorMat(0xc62828), colorMat(0xf2c230), M.black, colorMat(0x1e5fb3)][i], { seg: 10 });
  }
  pendant(p, 5.4, 4.7, 3.0, 1.9);
  art(p, 'z', 7.88, 3.6, 5.6, 1.2, 2.2, 'landscape');
  sofa(p, 5.4, 2.45, 's', 2.2, 0, M.leather, 0.85);

  // Office
  table(p, 9.0, 6.5, 11.2, 7.25, 0.75, 0, M.walnut, M.black);
  chair(p, 10.1, 6.1, 's', 0, M.leather);
  deco(p, 9.7, 0.75, 6.9, 10.5, 1.2, 6.93, M.screen);
  shelves(p, 8.15, 2.6, 8.5, 5.4, 0, 2.2, M.walnut, 5);

  // Gym: rubber floor, mirror, treadmill, bench, rack
  deco(p, 8.15, 0, -9.35, 11.9, 0.012, -2.65, colorMat(0x2a2b2d, 0.9));
  deco(p, 8.115, 0.3, -8.6, 8.125, 2.3, -4.2, colorMat(0xdfe8ea, 0.03, 1));
  box(p, 8.8, 0, -7.8, 9.5, 0.2, -5.9, M.black);
  deco(p, 8.85, 0.2, -6.1, 8.9, 1.25, -6.0, M.darkSteel);
  deco(p, 9.4, 0.2, -6.1, 9.45, 1.25, -6.0, M.darkSteel);
  deco(p, 8.8, 1.2, -6.2, 9.5, 1.45, -6.0, M.black);
  box(p, 10.2, 0.35, -7.4, 10.6, 0.47, -6.1, M.black);
  deco(p, 10.25, 0, -7.3, 10.3, 0.35, -7.2, M.darkSteel);
  deco(p, 10.5, 0, -6.3, 10.55, 0.35, -6.2, M.darkSteel);
  shelves(p, 8.5, -3.1, 10.4, -2.7, 0, 1.2, M.darkSteel, 3); // clear of the gym door
  for (let i = 0; i < 6; i++) cylinder(p, 8.7 + i * 0.3, 0.43, -2.9, 0.09, 0.1, M.black, { seg: 12 });
  for (const x of [9, 11]) for (const z of [-8, -4.5]) downlight(p, x, 3.0, z);

  // Pantry + powder room
  shelves(p, 3.2, -0.65, 6.4, -0.32, 0, 2.2, M.walnut, 5);
  toilet(p, 8.6, -0.75, 'n');
  vanity(p, 9.3, -0.75, 10.1, -0.32, 's');
  downlight(p, 9.2, 3.0, -1.4);
  for (const x of [4.5, 7.5, 10.5]) downlight(p, x, 3.0, 0.8);
}

function bedrooms(p) {
  // Bedroom 1 (street side) + bath 1
  bed(p, -6.3, 11.3, 's');
  box(p, -4.35, 0, 9.2, -3.72, 2.4, 12.35, M.walnut);
  deco(p, -8.2, 0, 8.4, -4.8, 0.014, 10.6, M.rug);
  vanity(p, -1.05, 9.8, -0.52, 11.3, 'e');
  toilet(p, -3.1, 9.75, 'e');
  showerScreen(p, 'x', 10.8, -3.5, -1.9);
  rainShower(p, -2.9, 11.4);
  for (const [x, z] of [[-6.3, 9], [-6.3, 11], [-2, 10.5], [-2, 8.1]]) downlight(p, x, 3.0, z);

  // Bedroom 2 (pool side) + bath 2 + closet
  bed(p, -4.85, -10.6, 'e');
  deco(p, -8.3, 0, -12.4, -5.8, 0.014, -8.6, M.rug);
  armchair(p, -8.2, -8.4, 'e');
  vanity(p, -8.85, -7.35, -7.3, -6.85, 'n');
  toilet(p, -8.5, -4.6, 'e');
  showerScreen(p, 'x', -3.3, -8.9, -7.1);
  rainShower(p, -8.2, -2.7);
  shelves(p, -5.85, -5.35, -5.45, -2.15, 0, 2.3, M.black, 5);
  shelves(p, -4.1, -4.3, -3.72, -2.15, 0, 2.3, M.black, 5);
  for (const [x, z] of [[-6.5, -9], [-6.5, -11.5], [-7.5, -5], [-4.8, -3.6], [-4.8, -6.5]]) downlight(p, x, 3.0, z);
}

function terrace(p) {
  // Outdoor kitchen against the stone wall
  box(p, -3.46, 0.02, -12.6, -2.78, 0.9, -8.9, M.walnut);
  deco(p, -3.46, 0.9, -12.62, -2.76, 0.94, -8.88, M.steel);
  box(p, -3.42, 0.94, -11.4, -2.82, 1.22, -10.1, M.steel, { collide: false });
  deco(p, -3.42, 1.22, -11.4, -3.05, 1.5, -10.1, M.steel);
  deco(p, -2.8, 1.02, -11.3, -2.77, 1.05, -10.2, M.chrome);
  cylinder(p, -3.25, 0.94, -9.5, 0.016, 0.3, M.chrome);
  for (const z of [-12.2, -9.3]) {
    deco(p, -3.47, 1.95, z - 0.09, -3.33, 2.35, z + 0.09, M.black);
    deco(p, -3.46, 1.93, z - 0.07, -3.34, 1.95, z + 0.07, M.glow);
    deco(p, -3.46, 2.35, z - 0.07, -3.34, 2.37, z + 0.07, M.glow);
  }
  // Dining set
  table(p, -1.5, -12.4, 0.5, -11.4, 0.75, 0.02, M.deck, M.black);
  for (const x of [-1.05, -0.5, 0.05]) {
    chair(p, x, -12.75, 's', 0.02, M.fabricWhite, M.white);
    chair(p, x, -11.05, 'n', 0.02, M.fabricWhite, M.white);
  }
  plant(p, -0.5, 0.77, -11.9, 0.5);
  // Lounge set under the canopy by the kitchen window
  sofa(p, 5.4, -10.6, 'n', 2.4, 0.02, M.fabricGray, 0.9);
  armchair(p, 3.9, -12.2, 'e', 0.02, M.fabricGray);
  table(p, 4.9, -12.6, 5.9, -12.0, 0.36, 0.02, M.walnut, M.black, 0.05);
  for (const x of [-1.5, 1, 4, 7]) for (const z of [-13.5, -10.5]) downlight(p, x, 2.96, z);
}
