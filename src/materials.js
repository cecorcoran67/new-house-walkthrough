import * as THREE from 'three';

// Procedural textures so the project needs no external image assets.
// Every texture is authored for a known world size (metres) so that the
// world-space UVs produced in builder.js tile correctly.

function canvasTexture(size, draw, worldSize) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / worldSize, 1 / worldSize);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Deterministic pseudo-random so the house looks the same on every load.
let seed = 7;
function rnd() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function noise(ctx, s, amount, alpha = 0.08) {
  for (let i = 0; i < amount; i++) {
    const v = rnd() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${rnd() * alpha})`;
    ctx.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

function woodGrain(ctx, x, y, w, h, base, vertical) {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < 26; i++) {
    const dark = rnd() > 0.5;
    ctx.strokeStyle = dark ? `rgba(40,18,6,${0.05 + rnd() * 0.12})` : `rgba(255,205,150,${0.03 + rnd() * 0.07})`;
    ctx.lineWidth = 0.5 + rnd() * 1.5;
    ctx.beginPath();
    if (vertical) {
      const px = x + rnd() * w;
      ctx.moveTo(px, y);
      ctx.bezierCurveTo(px + rnd() * 3 - 1.5, y + h * 0.3, px + rnd() * 3 - 1.5, y + h * 0.7, px + rnd() * 2 - 1, y + h);
    } else {
      const py = y + rnd() * h;
      ctx.moveTo(x, py);
      ctx.bezierCurveTo(x + w * 0.3, py + rnd() * 3 - 1.5, x + w * 0.7, py + rnd() * 3 - 1.5, x + w, py + rnd() * 2 - 1);
    }
    ctx.stroke();
  }
}

const WOOD = ['#8a4f2b', '#93552f', '#7f4725', '#9a5b33', '#874b28'];

// Vertical slat cladding: 16 slats per metre-wide tile with dark shadow gaps.
const slatTex = canvasTexture(512, (ctx, s) => {
  ctx.fillStyle = '#1c0f08';
  ctx.fillRect(0, 0, s, s);
  const n = 16;
  const w = s / n;
  for (let i = 0; i < n; i++) {
    woodGrain(ctx, i * w + 3, 0, w - 6, s, WOOD[i % WOOD.length], true);
    const g = ctx.createLinearGradient(i * w + 3, 0, i * w + w - 3, 0);
    g.addColorStop(0, 'rgba(255,220,180,0.18)');
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(i * w + 3, 0, w - 6, s);
  }
}, 1);

const plankTex = canvasTexture(512, (ctx, s) => {
  const n = 8;
  const h = s / n;
  for (let i = 0; i < n; i++) {
    woodGrain(ctx, 0, i * h, s, h, ['#5d3520', '#63391f', '#57311d', '#6a3f24'][i % 4], false);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, i * h, s, 2);
  }
}, 1.2);

const panelTex = canvasTexture(512, (ctx, s) => {
  woodGrain(ctx, 0, 0, s, s, '#7a4526', true);
  woodGrain(ctx, 0, 0, s, s, 'rgba(0,0,0,0)', true);
}, 1.6);

const stoneTex = canvasTexture(1024, (ctx, s) => {
  ctx.fillStyle = '#6f6455';
  ctx.fillRect(0, 0, s, s);
  const rows = 22;
  const rh = s / rows;
  const tones = ['#cdbfa6', '#bfae93', '#d8cbb3', '#b3a188', '#c7b79b', '#a99880', '#ded2bd'];
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 80;
    while (x < s) {
      const w = 50 + rnd() * 130;
      const inset = 1 + rnd() * 2;
      ctx.fillStyle = tones[Math.floor(rnd() * tones.length)];
      ctx.fillRect(x + inset, r * rh + inset, w - inset * 2, rh - inset * 2);
      const g = ctx.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
      g.addColorStop(0, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(0,0,0,0.28)');
      ctx.fillStyle = g;
      ctx.fillRect(x + inset, r * rh + inset, w - inset * 2, rh - inset * 2);
      x += w;
    }
  }
  noise(ctx, s, 9000, 0.12);
}, 2.4);

const concreteTex = canvasTexture(512, (ctx, s) => {
  ctx.fillStyle = '#a9a39a';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 90; i++) {
    const r = 30 + rnd() * 110;
    const x = rnd() * s;
    const y = rnd() * s;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const v = rnd() > 0.5 ? 255 : 60;
    g.addColorStop(0, `rgba(${v},${v},${v},0.07)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  noise(ctx, s, 5000, 0.06);
}, 4);

const pavingTex = canvasTexture(512, (ctx, s) => {
  ctx.fillStyle = '#b9b4ab';
  ctx.fillRect(0, 0, s, s);
  noise(ctx, s, 9000, 0.09);
  ctx.strokeStyle = 'rgba(70,66,60,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, s, s);
}, 3);

const grassTex = canvasTexture(512, (ctx, s) => {
  ctx.fillStyle = '#4f7a34';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 14000; i++) {
    const g = 95 + rnd() * 80;
    ctx.strokeStyle = `rgba(${40 + rnd() * 50},${g},${25 + rnd() * 30},0.5)`;
    const x = rnd() * s;
    const y = rnd() * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rnd() * 3 - 1.5, y - 2 - rnd() * 5);
    ctx.stroke();
  }
}, 3);

const marbleTex = canvasTexture(512, (ctx, s) => {
  ctx.fillStyle = '#eeeae4';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = `rgba(${120 + rnd() * 40},${112 + rnd() * 30},${100 + rnd() * 30},${0.1 + rnd() * 0.3})`;
    ctx.lineWidth = 0.6 + rnd() * 2.4;
    ctx.beginPath();
    let x = rnd() * s;
    let y = 0;
    ctx.moveTo(x, y);
    while (y < s) {
      x += rnd() * 70 - 30;
      y += 20 + rnd() * 50;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}, 2);

const pebbleTex = canvasTexture(512, (ctx, s) => {
  ctx.fillStyle = '#1d1f21';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 900; i++) {
    const v = 50 + rnd() * 90;
    ctx.fillStyle = `rgb(${v},${v + 3},${v + 6})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * s, rnd() * s, 6 + rnd() * 10, 4 + rnd() * 7, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}, 1);

const rugTex = canvasTexture(256, (ctx, s) => {
  ctx.fillStyle = '#9b948a';
  ctx.fillRect(0, 0, s, s);
  noise(ctx, s, 14000, 0.16);
}, 0.8);

const std = (o) => new THREE.MeshStandardMaterial(o);

export const M = {
  stucco: std({ color: 0xf2efe9, roughness: 0.92 }),
  ceiling: std({ color: 0xf6f3ee, roughness: 0.95 }),
  slat: std({ map: slatTex, roughness: 0.62 }),
  woodPanel: std({ map: panelTex, roughness: 0.5 }),
  walnut: std({ map: panelTex, color: 0xb98d6f, roughness: 0.45 }),
  deck: std({ map: plankTex, roughness: 0.7 }),
  stone: std({ map: stoneTex, roughness: 0.95 }),
  concrete: std({ map: concreteTex, roughness: 0.32, metalness: 0.05 }),
  paving: std({ map: pavingTex, roughness: 0.85 }),
  grass: std({ map: grassTex, roughness: 1 }),
  marble: std({ map: marbleTex, roughness: 0.18 }),
  pebble: std({ map: pebbleTex, roughness: 0.9 }),
  rug: std({ map: rugTex, roughness: 1 }),
  frame: std({ color: 0x1b1c1e, roughness: 0.45, metalness: 0.6 }),
  steel: std({ color: 0xb9bcc0, roughness: 0.3, metalness: 0.9 }),
  darkSteel: std({ color: 0x2a2c2f, roughness: 0.5, metalness: 0.7 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xbfd6dd, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16,
    envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false,
  }),
  frosted: std({ color: 0xe6eef0, roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false }),
  water: new THREE.MeshPhysicalMaterial({ color: 0x3f9db0, roughness: 0.06, transparent: true, opacity: 0.78, envMapIntensity: 1.5 }),
  poolTile: std({ color: 0x8fc4cc, roughness: 0.4 }),
  white: std({ color: 0xffffff, roughness: 0.6 }),
  black: std({ color: 0x0c0c0d, roughness: 0.35 }),
  screen: std({ color: 0x050506, roughness: 0.08, metalness: 0.4 }),
  fabricGray: std({ color: 0x77747a, roughness: 0.95 }),
  fabricCream: std({ color: 0xd9cdb8, roughness: 0.95 }),
  fabricWhite: std({ color: 0xeeeae2, roughness: 0.95 }),
  leather: std({ color: 0x5d5f63, roughness: 0.55 }),
  felt: std({ color: 0x1f8a43, roughness: 1 }),
  plant: std({ color: 0x3f7a35, roughness: 0.9 }),
  plantDark: std({ color: 0x2b5a2a, roughness: 0.9 }),
  trunk: std({ color: 0x4a3524, roughness: 1 }),
  ceramic: std({ color: 0xfafafa, roughness: 0.15 }),
  chrome: std({ color: 0xe8e8e8, roughness: 0.12, metalness: 1 }),
  glow: std({ color: 0xfff1d6, emissive: 0xffc98a, emissiveIntensity: 2.4 }),
  glowSoft: std({ color: 0xfff1d6, emissive: 0xffb873, emissiveIntensity: 1.2 }),
  fire: std({ color: 0xff8a2b, emissive: 0xff6a12, emissiveIntensity: 3 }),
  curtain: std({ color: 0xf4f1ea, roughness: 1, side: THREE.DoubleSide }),
};

export function colorMat(color, roughness = 0.6, metalness = 0) {
  return std({ color, roughness, metalness });
}

// Small helper for text/artwork on a canvas (badges, plates, paintings).
export function drawnMaterial(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return std({ map: t, roughness: 0.5, transparent: !!opts.transparent, ...opts.material });
}
