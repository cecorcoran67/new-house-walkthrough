import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { colorMat } from './materials.js';
import { ROADS } from './world.js';
import { insideFence } from './obstacles.js';
import { H } from './house.js';
import { BEACHES } from './coast.js';
import { PAD } from './heli.js';

// GTA-ish street life without any of the trouble: people on the pavements, and little gold
// souvenirs to find. Pedestrians step aside for cars and scatter if you honk.

const G = H.grade;
const STORE = 'new-house-souvenirs';
const N_PEDS = 22;

function figureGeo() {
  const torso = new THREE.BoxGeometry(0.34, 0.55, 0.2).translate(0, 1.1, 0);
  const head = new THREE.BoxGeometry(0.22, 0.22, 0.2).translate(0, 1.5, 0);
  const legL = new THREE.BoxGeometry(0.12, 0.7, 0.14).translate(-0.1, 0.35, 0);
  const legR = new THREE.BoxGeometry(0.12, 0.7, 0.14).translate(0.1, 0.35, 0);
  const armL = new THREE.BoxGeometry(0.1, 0.5, 0.1).translate(-0.24, 1.08, 0);
  const armR = new THREE.BoxGeometry(0.1, 0.5, 0.1).translate(0.24, 1.08, 0);
  return mergeGeometries([torso, head, legL, legR, armL, armR]);
}

function sidewalk(pts, side) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    out.push([pts[i][0] - ((b[1] - a[1]) / len) * side, pts[i][1] + ((b[0] - a[0]) / len) * side]);
  }
  return out;
}

function along(path, u) {
  let d = u;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i];
    const [bx, bz] = path[i + 1];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    if (d <= len) {
      const t = d / len;
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      return { x: ax + ux * d, z: az + uz * d, yaw: Math.atan2(-uz, ux), len: pathLen(path) };
    }
    d -= len;
  }
  const [ax, az] = path[path.length - 2];
  const [bx, bz] = path[path.length - 1];
  return { x: bx, z: bz, yaw: Math.atan2(-(bz - az), bx - ax), len: pathLen(path) };
}

function pathLen(path) {
  let n = 0;
  for (let i = 0; i < path.length - 1; i++) n += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
  return n;
}

const CLOTH = [0x4a7ab5, 0xc41e3a, 0xf1efe8, 0x3d8fbf, 0xc4a15a, 0xe8b45a];

function loadTaken() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || '[]');
    return Array.isArray(v) ? new Set(v.map(Number).filter(Number.isFinite)) : new Set();
  } catch {
    return new Set();
  }
}

export class Life {
  constructor(scene) {
    this.crowd = []; // { x, z } for traffic to brake for
    this.taken = loadTaken();
    this.paths = ROADS.filter((r) => r.w >= 6 && r.pts.length > 1).flatMap((r) => {
      const left = sidewalk(r.pts, r.w / 2 + 1.6);
      const right = sidewalk(r.pts, -(r.w / 2 + 1.6));
      return [left, right].filter((p) => p.length > 1 && insideFence(p[0][0], p[0][1]));
    });
    this.peds = [];
    this.mesh = null;
    if (this.paths.length) this.buildPeds(scene);
    this.buildSouvenirs(scene);
  }

  buildPeds(scene) {
    const geo = figureGeo();
    const mesh = new THREE.InstancedMesh(geo, colorMat(0xc48a6a, 0.9), N_PEDS);
    mesh.castShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    this.mesh = mesh;
    const color = new THREE.Color();
    const dummy = new THREE.Object3D();
    for (let i = 0; i < N_PEDS; i++) {
      const path = this.paths[i % this.paths.length];
      const len = pathLen(path);
      const u = Math.random() * len;
      const at = along(path, u);
      this.peds.push({
        path, u, len, dir: Math.random() < 0.5 ? 1 : -1, speed: 1.05 + Math.random() * 0.4,
        x: at.x, z: at.z, yaw: at.yaw, panic: 0, hop: 0,
      });
      mesh.setColorAt(i, color.setHex(CLOTH[i % CLOTH.length]));
      dummy.position.set(at.x, G, at.z);
      dummy.rotation.y = at.yaw;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceColor.needsUpdate = true;
  }

  buildSouvenirs(scene) {
    const spots = [
      [0.6, -6], [8.5, -18], [11, 16], [1.2, 22], [-6, -12],
      [PAD.x + 8, PAD.z], [PAD.x - 10, PAD.z + 6],
      ...BEACHES.map((b) => [b.x, b.z]),
      [BEACHES[0].x + 18, BEACHES[0].z - 8],
      [BEACHES[1].x - 12, BEACHES[1].z + 6],
      [-40, 80], [120, 200], [-200, 400], [60, 300], [-80, 140],
      [200, 90], [-150, 250], [40, 160],
    ];
    const geo = new THREE.OctahedronGeometry(0.28);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe7a567, emissive: 0xe7a567, emissiveIntensity: 0.7, roughness: 0.35, metalness: 0.4,
    });
    this.souvenirs = spots.map(([x, z], i) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, G + 0.55, z);
      m.visible = !this.taken.has(i);
      scene.add(m);
      return { x, z, mesh: m, i };
    });
    this.total = this.souvenirs.length;
  }

  get found() {
    return this.taken.size;
  }

  leftovers() {
    return this.souvenirs.filter((s) => s.mesh.visible);
  }

  update(dt, player, garage, honking) {
    const px = player.pos.x;
    const pz = player.pos.z;
    const car = garage.car;
    const dummy = this.dummy ||= new THREE.Object3D();
    this.crowd.length = 0;
    if (this.mesh) {
      this.peds.forEach((p, i) => {
        const threat = car && Math.hypot(car.x - p.x, car.z - p.z) < 9 && Math.abs(car.speed) > 2;
        if (honking && Math.hypot(px - p.x, pz - p.z) < 18) p.panic = 1.4;
        if (threat) p.panic = Math.max(p.panic, 0.9);
        p.panic = Math.max(0, p.panic - dt);
        const run = p.panic > 0 ? 2.6 : 1;
        p.u += p.dir * p.speed * run * dt;
        if (p.u < 0 || p.u > p.len) {
          p.dir *= -1;
          p.u = Math.max(0, Math.min(p.len, p.u));
        }
        const at = along(p.path, p.u);
        p.x = at.x;
        p.z = at.z;
        p.yaw = at.yaw + (p.dir < 0 ? Math.PI : 0);
        p.hop += dt * (6 + run * 4);
        dummy.position.set(p.x, G + (p.panic > 0 ? Math.abs(Math.sin(p.hop)) * 0.12 : 0), p.z);
        dummy.rotation.y = p.yaw;
        dummy.updateMatrix();
        this.mesh.setMatrixAt(i, dummy.matrix);
        this.crowd.push({ x: p.x, z: p.z });
      });
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    let picked = 0;
    for (const s of this.souvenirs) {
      if (!s.mesh.visible) continue;
      s.mesh.rotation.y += dt * 1.6;
      s.mesh.position.y = G + 0.55 + Math.sin(performance.now() / 400 + s.i) * 0.08;
      if (Math.hypot(px - s.x, pz - s.z) < 1.7 && Math.abs(player.pos.y - G) < 2.5) {
        s.mesh.visible = false;
        this.taken.add(s.i);
        picked++;
      }
    }
    if (picked) {
      try { localStorage.setItem(STORE, JSON.stringify([...this.taken])); } catch { /* private mode */ }
    }
    return picked;
  }
}
