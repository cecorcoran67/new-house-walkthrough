import * as THREE from 'three';
import { M, drawnMaterial } from './materials.js';

// Procedural SUVs built to manufacturer dimensions. Local axes: +x = nose, y = up, z = width.

const SPECS = {
  // 2025 BAIC BJ30: 4730 x 1910 x 1790 mm, 2820 mm wheelbase. Boxy, upright, clad arches.
  bj30: {
    L: 4.73, W: 1.91, Ht: 1.79, wb: 2.82, wheelR: 0.375, belt: 1.13, hood: 1.09, roof: 1.72,
    cowl: 1.12, wsTop: 1.6, rearTop: 0.2, rearBase: 0.05, noseDrop: 0.06,
    paint: 0x6d7277, metalness: 0.45, env: 0.8, squaredArches: true, rails: true,
  },
  // 2026 Chevrolet Tahoe: 5370 x 2060 x 1930 mm, 3070 mm wheelbase.
  tahoe: {
    L: 5.37, W: 2.06, Ht: 1.93, wb: 3.07, wheelR: 0.43, belt: 1.3, hood: 1.29, roof: 1.9,
    cowl: 1.42, wsTop: 2.0, rearTop: 0.34, rearBase: 0.07, noseDrop: 0.04,
    paint: 0x040405, metalness: 0.15, env: 0.45, squaredArches: false, rails: true,
  },
};

const tire = new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.92 });
const cladding = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.8 });
export const carGlass = new THREE.MeshPhysicalMaterial({ color: 0x0c1114, roughness: 0.06, metalness: 0.3, envMapIntensity: 2, side: THREE.DoubleSide });
const headlamp = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, emissive: 0xdfeaff, emissiveIntensity: 0.7, roughness: 0.2 });
const tailLamp = new THREE.MeshStandardMaterial({ color: 0x8a0d0d, emissive: 0x9c0a06, emissiveIntensity: 0.9, roughness: 0.25 });
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
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, w + 0.01, 28), new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.4, metalness: 0.8 }));
  rim.rotation.x = Math.PI / 2;
  grp.add(rim);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(rimR * 1.9, 0.07, 0.03), M.steel);
    spoke.rotation.z = (i * Math.PI) / 5;
    spoke.position.z = side * (w / 2 + 0.008);
    grp.add(spoke);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16), M.chrome);
  cap.rotation.x = Math.PI / 2;
  cap.position.z = side * (w / 2 + 0.02);
  grp.add(cap);
  grp.position.set(x, s.wheelR, side * (s.W / 2 - w / 2 - 0.02));
  g.add(grp);
  (g.userData.wheels ||= []).push({ grp, front: x > 0 });
}

function archTrim(g, s, x, side) {
  const r = s.wheelR + 0.07;
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
  const xB = 0.22;
  const xC = -s.wb / 2 + 0.25;
  const polys = [
    [[ws(yb) - 0.14, yb], [ws(yt) - 0.12, yt], [xB + 0.045, yt], [xB + 0.045, yb]],
    [[xB - 0.045, yb], [xB - 0.045, yt], [xC + 0.045, yt], [xC + 0.045, yb]],
    [[xC - 0.045, yb], [xC - 0.045, yt], [rr(yt) + 0.16, yt], [rr(yb) + 0.13, yb]],
  ];
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

export function buildSUV(kind) {
  const s = SPECS[kind];
  const g = new THREE.Group();
  const paint = paintMat(s);
  const hx = s.L / 2;
  const cy = s.wheelR;
  const ra = s.wheelR + 0.07;

  // Lower body: side profile with wheel-arch cut-outs, extruded across the width
  const body = new THREE.Shape();
  body.moveTo(-hx + 0.08, cy);
  body.lineTo(-hx, cy + 0.18);
  body.lineTo(-hx, s.belt - 0.06);
  body.lineTo(-hx + s.rearBase, s.belt);
  body.lineTo(hx - s.cowl, s.belt);
  body.lineTo(hx - 0.16, s.hood);
  body.lineTo(hx, s.hood - s.noseDrop - 0.06);
  body.lineTo(hx, cy + 0.14);
  body.lineTo(hx - 0.08, cy);
  body.lineTo(s.wb / 2 + ra, cy);
  body.absarc(s.wb / 2, cy, ra, 0, Math.PI, false);
  body.lineTo(-s.wb / 2 + ra, cy);
  body.absarc(-s.wb / 2, cy, ra, 0, Math.PI, false);
  body.closePath();
  g.add(extrude(body, s.W, paint, 0.05));

  // Cabin / greenhouse
  const cabin = new THREE.Shape();
  cabin.moveTo(hx - s.cowl, s.belt - 0.02);
  cabin.lineTo(hx - s.wsTop, s.roof);
  cabin.lineTo(-hx + s.rearTop, s.roof);
  cabin.lineTo(-hx + s.rearBase, s.belt - 0.02);
  cabin.closePath();
  g.add(extrude(cabin, s.W - 0.16, paint, 0.05));

  // Glazing
  sideWindows(g, s, 1);
  sideWindows(g, s, -1);
  slantedGlass(g, hx - s.cowl, s.belt, hx - s.wsTop, s.roof, 0.08, 0.9, s.W - 0.42, -0.008);
  slantedGlass(g, -hx + s.rearBase, s.belt, -hx + s.rearTop, s.roof, 0.14, 0.86, s.W - 0.5, 0.008);

  // Wheels, arch trims, rocker and bumper cladding
  for (const x of [s.wb / 2, -s.wb / 2]) {
    for (const side of [1, -1]) {
      wheel(g, s, x, side);
      archTrim(g, s, x, side);
    }
  }
  bx(g, s.wb - ra * 2, 0.14, s.W + 0.03, 0, cy + 0.05, 0, cladding);
  bx(g, 0.2, 0.3, s.W - 0.06, hx - 0.07, cy + 0.12, 0, cladding);
  bx(g, 0.2, 0.3, s.W - 0.06, -hx + 0.07, cy + 0.12, 0, cladding);
  bx(g, 0.06, 0.06, s.W * 0.5, hx + 0.01, cy + 0.02, 0, M.steel); // skid plate
  bx(g, 0.06, 0.06, s.W * 0.5, -hx - 0.01, cy + 0.02, 0, M.steel);

  // Mirrors + roof rails
  for (const side of [1, -1]) {
    bx(g, 0.1, 0.16, 0.24, hx - s.cowl - 0.2, s.belt + 0.1, side * (s.W / 2 + 0.06), paint);
    if (s.rails) bx(g, s.L * 0.5, 0.05, 0.05, -0.35, s.roof + 0.06, side * (s.W / 2 - 0.25), cladding);
    // Door handles and shut lines
    bx(g, 0.16, 0.03, 0.02, 0.75, s.belt - 0.1, side * (s.W / 2 + 0.005), cladding);
    bx(g, 0.16, 0.03, 0.02, -0.35, s.belt - 0.1, side * (s.W / 2 + 0.005), cladding);
    bx(g, 0.012, s.belt - cy - 0.2, 0.01, 0.22, (s.belt + cy) / 2 + 0.05, side * (s.W / 2 + 0.002), cladding);
  }

  const frontX = hx + 0.012;
  const rearX = -hx - 0.012;
  const plate = (x, facing) => label(g, kind === 'tahoe' ? 'TAHOE 26' : 'BJ30 25', 0.5, 0.13, x, cy + 0.22, 0, facing, '#111', '#f1f1ee');

  if (kind === 'bj30') {
    // Gloss-black band across the nose with BEIJING lettering, squared lamps either side
    bx(g, 0.04, 0.2, s.W - 0.1, hx - 0.005, s.hood - 0.2, 0, M.black);
    label(g, 'B E I J I N G', 0.95, 0.11, frontX + 0.012, s.hood - 0.2, 0, 1);
    for (const side of [1, -1]) {
      bx(g, 0.05, 0.16, 0.34, frontX, s.hood - 0.2, side * (s.W / 2 - 0.26), headlamp);
      bx(g, 0.05, 0.08, 0.2, frontX, cy + 0.3, side * (s.W / 2 - 0.3), headlamp); // fog lamps
      bx(g, 0.05, 0.5, 0.11, rearX, s.belt - 0.16, side * (s.W / 2 - 0.12), tailLamp); // vertical tail lamps
    }
    // Lower intake with vertical slats
    bx(g, 0.04, 0.1, s.W * 0.55, hx, cy + 0.33, 0, M.black);
    for (let i = -3; i <= 3; i++) bx(g, 0.05, 0.09, 0.03, hx + 0.005, cy + 0.33, i * 0.14, M.darkSteel);
    bx(g, 0.03, 0.12, s.W - 0.5, rearX + 0.005, s.belt - 0.12, 0, M.black);
    label(g, 'B E I J I N G', 0.8, 0.09, rearX - 0.012, s.belt - 0.12, 0, -1);
    label(g, 'BJ30', 0.26, 0.07, rearX - 0.006, s.belt - 0.36, -s.W / 2 + 0.4, -1);
    // Roof cross bars for the off-road look
    for (const x of [0.3, -0.9]) bx(g, 0.05, 0.035, s.W - 0.45, x, s.roof + 0.1, 0, cladding);
  } else {
    // Tall grille with horizontal bars, body-colour centre bar and gold bowtie
    bx(g, 0.04, 0.6, s.W - 0.62, hx - 0.005, s.hood - 0.44, 0, M.black);
    for (let i = 0; i < 6; i++) bx(g, 0.05, 0.03, s.W - 0.66, hx + 0.004, s.hood - 0.7 + i * 0.1, 0, M.steel);
    bx(g, 0.05, 0.085, s.W - 0.62, hx + 0.008, s.hood - 0.36, 0, paint);
    bowtie(g, frontX + 0.022, s.hood - 0.36, 0, 1);
    for (const side of [1, -1]) {
      bx(g, 0.05, 0.1, 0.36, frontX, s.hood - 0.2, side * (s.W / 2 - 0.22), headlamp); // slim upper lamps
      bx(g, 0.05, 0.42, 0.045, frontX, s.hood - 0.47, side * (s.W / 2 - 0.07), headlamp); // vertical DRL signature
      bx(g, 0.05, 0.14, 0.2, frontX, s.hood - 0.52, side * (s.W / 2 - 0.2), headlamp);
      bx(g, 0.05, 0.62, 0.13, rearX, s.belt - 0.08, side * (s.W / 2 - 0.11), tailLamp);
      bx(g, s.wb - 0.3, 0.04, 0.2, 0, cy + 0.02, side * (s.W / 2 + 0.02), cladding); // running boards
    }
    bx(g, 0.03, 0.05, s.W - 0.5, rearX + 0.005, s.belt - 0.02, 0, M.chrome);
    bowtie(g, rearX - 0.012, s.belt - 0.2, 0, -1);
    label(g, 'TAHOE', 0.34, 0.075, rearX - 0.006, s.belt - 0.38, s.W / 2 - 0.42, -1);
  }
  plate(hx + 0.035, 1);
  plate(-hx - 0.035, -1);
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
export const driverEye = (s) => new THREE.Vector3(s.L / 2 - s.wsTop - 0.42, s.roof - 0.26, -0.38);

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
    for (const x of [0.22, -s.wb / 2 + 0.25, tail + 0.05]) bx(g, 0.1, s.roof - s.belt, 0.08, x, (s.roof + s.belt) / 2, z, trim);
    bx(g, 0.1, 0.2, 0.26, eye.x - 1.08, s.belt + 0.5, side * 0.42, M.leather); // rear headrests
  }
  bx(g, 0.14, 0.42, 0.5, eye.x - 0.2, s.belt + 0.2, -eye.z, M.leather); // passenger seat back
  bx(g, 0.1, 0.2, 0.26, eye.x - 0.22, s.belt + 0.5, -eye.z, M.leather);
  bx(g, 0.16, 0.4, half * 2 - 0.2, eye.x - 1.05, s.belt + 0.19, 0, M.leather); // rear bench

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
  g.add(column);
  g.userData.steering = spinner;
  g.traverse((o) => (o.castShadow = false));
  return g;
}
