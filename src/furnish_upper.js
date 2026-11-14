import { M } from './materials.js';
import { box, deco, cylinder, downlight } from './builder.js';
import { chair, sofa, table, bed, tv, toilet, vanity, shelves, plant, art, showerScreen, rainShower } from './props.js';
import { H } from './house.js';

const Y = H.f2;

export function furnishUpper(p) {
  // ---- Lounge overlooking the living room --------------------------------
  deco(p, -3.2, Y, -2.1, -0.2, Y + 0.012, 2.6, M.rug);
  sofa(p, -1.8, -1.45, 's', 2.6, Y, M.leather);
  art(p, 'x', 3.245, -2.8, -1.2, Y + 1.15, Y + 2.05, 'landscape'); // TV showing artwork, as in the video
  box(p, -3.1, Y + 0.12, 2.82, -0.9, Y + 0.5, 3.26, M.black);
  cylinder(p, -1.05, Y + 0.5, 3.05, 0.05, 0.42, M.ceramic, { rTop: 0.02, seg: 14 });
  table(p, -2.3, 0.3, -1.3, 0.9, 0.36, Y, M.walnut, M.black, 0.05);
  plant(p, 2.4, Y, -1.9, 1.2);
  // Family photos on the gallery wall next to bedroom 3's door
  for (const [z, y] of [[3.65, 1.5], [3.95, 1.5], [3.65, 1.9], [3.95, 1.9]]) {
    art(p, 'z', 2.88, z - 0.12, z + 0.12, Y + y - 0.16, Y + y + 0.16, 'landscape');
  }
  for (const x of [-2.4, 0, 2]) for (const z of [-1.2, 1.6]) downlight(p, x, H.uc, z);
  for (const z of [-6.5, -4.2]) for (const x of [-1.8, 1.2]) downlight(p, x, H.uc, z);
  downlight(p, 1.3, H.uc, 4.4);
  plant(p, -8.3, Y, 2.6, 1.3);

  // ---- Corridor ------------------------------------------------------------
  box(p, 5.0, Y + 0.55, 0.18, 6.6, Y + 0.62, 0.5, M.walnut);
  cylinder(p, 5.8, Y + 0.62, 0.34, 0.07, 0.38, M.ceramic, { rTop: 0.025, seg: 14 });
  for (const x of [4.5, 7.5, 10.5]) downlight(p, x, H.uc, -0.4);

  // ---- Master suite --------------------------------------------------------
  bed(p, 4.25, -4.9, 'w', Y, 2.0, 2.1);
  deco(p, 3.6, Y, -6.6, 7.0, Y + 0.012, -3.2, M.rug);
  tv(p, 'z', 8.07, -5.6, -4.1, Y + 1.25, Y + 2.1);
  box(p, 7.68, Y, -5.9, 8.08, Y + 0.62, -3.8, M.black);
  chair(p, 7.3, -7.3, 'w', Y, M.fabricCream);
  for (const x of [4.2, 6.6]) for (const z of [-6.6, -3]) downlight(p, x, H.uc, z);
  // Balcony planters
  plant(p, 3.5, Y, -8.9, 1.2);
  plant(p, 11.5, Y, -8.9, 1.2);

  // Master bath: double vanity, freestanding tub under the window
  vanity(p, 9.3, -5.25, 11.7, -4.72, 's', Y);
  box(p, 9.4, Y, -7.85, 11.2, Y + 0.6, -7.05, M.ceramic);
  deco(p, 9.5, Y + 0.56, -7.75, 11.1, Y + 0.61, -7.15, M.water);
  cylinder(p, 9.3, Y, -7.45, 0.02, 0.95, M.chrome, { seg: 8 });
  toilet(p, 11.5, -6.3, 'w', Y);
  for (const x of [9.3, 10.9]) downlight(p, x, H.uc, -6.3);

  // Walk-in closet
  shelves(p, 8.9, -4.48, 11.85, -4.05, Y, Y + 2.3, M.black, 5);
  shelves(p, 8.9, -1.95, 11.85, -1.52, Y, Y + 2.3, M.black, 5);
  for (let i = 0; i < 7; i++) {
    deco(p, 9.1 + i * 0.36, Y + 1.25, -4.4, 9.34 + i * 0.36, Y + 1.8, -4.12, i % 3 ? M.fabricGray : M.fabricCream);
  }
  downlight(p, 10.2, H.uc, -3);

  // ---- Bedroom 3 suite -----------------------------------------------------
  bed(p, 5.8, 1.78, 'n', Y);
  deco(p, 4.4, Y, 1.4, 7.2, Y + 0.012, 4.2, M.rug);
  box(p, 3.12, Y, 5.5, 3.7, Y + 2.4, 7.35, M.walnut); // wardrobe
  table(p, 4.7, 6.65, 6.9, 7.3, 0.75, Y, M.walnut, M.black);
  chair(p, 5.8, 6.25, 's', Y, M.leather);
  for (const x of [4.4, 7]) for (const z of [2.2, 5.6]) downlight(p, x, H.uc, z);

  vanity(p, 9.6, 0.72, 11.2, 1.22, 'n', Y);
  toilet(p, 11.5, 2.3, 'w', Y);
  showerScreen(p, 'x', 3.0, 9.6, 11.9, Y);
  rainShower(p, 10.9, 3.45, Y);
  downlight(p, 10.2, H.uc, 2.2);

  shelves(p, 9.2, 4.12, 11.85, 4.5, Y, Y + 2.3, M.walnut, 5);
  downlight(p, 10.2, H.uc, 5.8);
}
