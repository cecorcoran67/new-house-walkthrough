import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, colorMat, drawnMaterial } from './materials.js';
import { colliders } from './builder.js';
import { movers, makeObb, solidAt } from './obstacles.js';
import { H } from './house.js';

// Flyable light helicopter on a pad at the owner's pin (9.946556, -84.275337).
// Local axes match the cars: +x = nose, y = up, z = right. Heading is rotation about y;
// the nose points along (cos h, -sin h).

export const PAD = { x: 37.6, z: 540.3, r: 16, heading: 0 };
const FLOOR = H.grade + 0.04;
const MAX_SPEED = 42; // m/s, about 150 km/h
const MAX_ALT = 140;
const CLIMB = 11;
const GRAVITY = 9.2;

const paint = colorMat(0xe7e2d8, 0.32, 0.28);
const navy = colorMat(0x1c3558, 0.4, 0.35);
const trim = colorMat(0x2a2c2f, 0.4, 0.5);

export function helipadPrecinct() {
  const { x, z, r } = PAD;
  return {
    kind: 'pitch',
    pts: Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return [x + Math.cos(a) * r, z + Math.sin(a) * r];
    }),
  };
}

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
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    g.add(mesh);
  }
}

function box(g, x0, y0, z0, x1, y1, z1, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  g.add(m);
  return m;
}

function buildPad(scene) {
  const { x, z } = PAD;
  const group = new THREE.Group();
  group.position.set(x, FLOOR, z);
  scene.add(group);

  const mark = drawnMaterial(512, 512, (ctx, w) => {
    ctx.fillStyle = '#8a8680';
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = '#f4efe6';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(w / 2, w / 2, w * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#f4efe6';
    ctx.lineWidth = 52;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(w * 0.32, w * 0.28);
    ctx.lineTo(w * 0.32, w * 0.72);
    ctx.moveTo(w * 0.68, w * 0.28);
    ctx.lineTo(w * 0.68, w * 0.72);
    ctx.moveTo(w * 0.32, w * 0.5);
    ctx.lineTo(w * 0.68, w * 0.5);
    ctx.stroke();
  }, { material: { roughness: 0.92 } });
  mark.map.wrapS = mark.map.wrapT = THREE.ClampToEdgeWrapping;
  mark.map.repeat.set(1, 1);

  const disc = new THREE.Mesh(new THREE.CircleGeometry(12.2, 48), mark);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.025;
  disc.receiveShadow = true;
  group.add(disc);

  const apron = new THREE.Mesh(
    new THREE.RingGeometry(12.2, 14.6, 48),
    colorMat(0x6e6b66, 0.95),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = 0.02;
  apron.receiveShadow = true;
  group.add(apron);

  const lamp = colorMat(0xfff1d6, 0.4);
  lamp.emissive = new THREE.Color(0xffc98a);
  lamp.emissiveIntensity = 1.4;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.28), lamp);
    m.position.set(Math.cos(a) * 13.4, 0.07, Math.sin(a) * 13.4);
    group.add(m);
  }
}

function buildHeli() {
  const body = new THREE.Group();
  // Cabin and boom
  box(body, -1.35, 0.55, -0.72, 2.15, 1.72, 0.72, paint);
  box(body, 0.2, 1.72, -0.62, 1.85, 2.15, 0.62, paint); // roof
  box(body, -5.4, 0.85, -0.16, -1.35, 1.35, 0.16, paint); // tail boom
  box(body, -5.55, 0.7, -0.08, -5.15, 2.15, 0.08, navy); // vertical fin
  box(body, -5.5, 1.85, -0.85, -5.2, 1.95, 0.85, paint); // tailplane
  box(body, -1.2, 0.7, -0.76, 2.05, 1.05, -0.68, navy); // stripe
  box(body, -1.2, 0.7, 0.68, 2.05, 1.05, 0.76, navy);
  // Chin and skid pylons
  box(body, 1.55, 0.42, -0.5, 2.25, 0.7, 0.5, paint);
  box(body, -0.35, 0.18, -0.85, 0.05, 0.7, -0.72, trim);
  box(body, -0.35, 0.18, 0.72, 0.05, 0.7, 0.85, trim);
  box(body, 1.35, 0.18, -0.85, 1.7, 0.7, -0.72, trim);
  box(body, 1.35, 0.18, 0.72, 1.7, 0.7, 0.85, trim);
  // Skids
  box(body, -1.15, 0.0, -0.92, 2.35, 0.08, -0.78, trim);
  box(body, -1.15, 0.0, 0.78, 2.35, 0.08, 0.92, trim);
  // Mast
  box(body, 0.82, 2.15, -0.08, 1.12, 2.55, 0.08, trim);
  flatten(body);

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x9ec4d4, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.28,
    envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false,
  });
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 12, 0, Math.PI), glassMat);
  bubble.rotation.z = -Math.PI / 2;
  bubble.scale.set(1.15, 0.95, 0.82);
  bubble.position.set(1.55, 1.28, 0);
  body.add(bubble);

  const glass = [bubble];
  const interior = new THREE.Group();
  interior.visible = false;
  box(interior, 0.55, 0.72, -0.58, 1.55, 0.88, -0.08, M.fabricGray);
  box(interior, 0.55, 0.72, 0.08, 1.55, 0.88, 0.58, M.fabricGray);
  box(interior, 0.5, 0.88, -0.58, 0.62, 1.45, -0.08, M.fabricGray);
  box(interior, 0.5, 0.88, 0.08, 0.62, 1.45, 0.58, M.fabricGray);
  box(interior, 1.55, 0.95, -0.55, 1.85, 1.12, 0.55, trim); // dash
  body.add(interior);

  const main = new THREE.Group();
  main.position.set(0.97, 2.58, 0);
  const bladeMat = colorMat(0x2c3036, 0.45, 0.4);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.035, 0.22), bladeMat);
    b.position.x = 2.45;
    const arm = new THREE.Group();
    arm.rotation.y = (i * Math.PI) / 2;
    arm.add(b);
    main.add(arm);
  }
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(5.2, 32),
    new THREE.MeshBasicMaterial({ color: 0x1a1c20, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  disc.rotation.x = -Math.PI / 2;
  main.add(disc);
  body.add(main);

  const tail = new THREE.Group();
  tail.position.set(-5.35, 1.55, 0.22);
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.12), bladeMat);
    b.position.x = 0.42;
    const arm = new THREE.Group();
    arm.rotation.z = i * Math.PI;
    arm.add(b);
    tail.add(arm);
  }
  body.add(tail);

  const navL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.08), colorMat(0x22c55a, 0.3));
  navL.material.emissive = new THREE.Color(0x16a34a);
  navL.material.emissiveIntensity = 1.2;
  navL.position.set(1.9, 0.95, 0.74);
  const navR = navL.clone();
  navR.material = colorMat(0xef4444, 0.3);
  navR.material.emissive = new THREE.Color(0xdc2626);
  navR.material.emissiveIntensity = 1.2;
  navR.position.set(1.9, 0.95, -0.74);
  body.add(navL, navR);

  const group = new THREE.Group();
  group.add(body);
  group.traverse((o) => { o.castShadow = false; });
  return { group, body, main, tail, disc, glass, interior };
}

export class Helicopter {
  constructor(scene) {
    const built = buildHeli();
    this.name = 'helicopter';
    this.spec = { L: 11.4, W: 2.4, Ht: 3.3, name: 'helicopter' };
    Object.assign(this, built);
    this.home = { x: PAD.x, z: PAD.z, heading: PAD.heading };
    this.obb = makeObb(PAD.x, PAD.z, 5.5, 1.3, 0, FLOOR, FLOOR + 3.3);
    movers.push(this.obb);
    scene.add(this.group);
    this.blob = this.makeBlob();
    this.eye = new THREE.Vector3();
    scene.add(this.blob);
    this.reset();
  }

  makeBlob() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 6, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const mat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), mat);
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  reset() {
    Object.assign(this, this.home, { y: FLOOR, speed: 0, vy: 0, yawRate: 0, rotor: 0, load: 0, bump: 0 });
    this.tilt = 0;
    this.roll = 0;
    this.cockpit(false);
    this.place();
  }

  get airborne() {
    return this.y > FLOOR + 0.2;
  }

  local(lx, lz) {
    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    return [this.x + lx * c + lz * s, this.z - lx * s + lz * c];
  }

  cockpit(on) {
    this.interior.visible = on;
    for (const g of this.glass) g.visible = !on;
  }

  place() {
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
    this.body.rotation.z = this.tilt;
    this.body.rotation.x = this.roll;
    const alt = Math.max(0, this.y - FLOOR);
    this.blob.position.set(this.x, FLOOR + 0.03, this.z);
    this.blob.scale.setScalar(1 + alt * 0.04);
    this.blob.material.opacity = Math.max(0.12, 1 - alt / 80);
    Object.assign(this.obb, {
      x: this.x, z: this.z,
      c: Math.cos(this.heading), s: Math.sin(this.heading),
      y0: this.y, y1: this.y + 3.2,
    });
  }

  blocked(x, y, z) {
    const r = 1.6;
    const lo = y + 0.4;
    const hi = y + 2.4;
    if (solidAt(x, z, r, lo, hi, this.obb)) return true;
    if (Math.abs(x - 2) > 45 || Math.abs(z - 7) > 55) return false;
    for (const c of colliders) {
      if (c.y1 <= lo || c.y0 >= hi) continue;
      const ex = Math.max(c.x0 - x, 0, x - c.x1);
      const ez = Math.max(c.z0 - z, 0, z - c.z1);
      if (ex * ex + ez * ez < r * r) return true;
    }
    return false;
  }

  spin(dt, target) {
    if (target !== undefined) this.rotor += (target - this.rotor) * Math.min(1, dt * 0.8);
    this.main.rotation.y += dt * (4 + this.rotor * 38);
    this.tail.rotation.z += dt * (8 + this.rotor * 70);
    this.disc.material.opacity = this.rotor * 0.22;
  }

  /** cyclicY, collective and yawInput are -1..1. yawInput +1 = left, matching the cars. */
  fly(dt, cyclicY, collective, yawInput) {
    const want = this.y > FLOOR + 0.15 || collective > 0.05 ? 1 : 0.18;
    this.rotor += (want - this.rotor) * Math.min(1, dt * (collective > 0 ? 1.8 : 0.7));
    const lift = this.rotor * this.rotor;
    this.load = Math.max(0, collective);

    let vy = this.vy;
    if (lift > 0.35) {
      vy += (collective * CLIMB - 3.2 * (1 - lift)) * dt;
      vy -= vy * Math.min(1, dt * 1.4);
    } else {
      vy -= GRAVITY * dt;
    }
    let y = this.y + vy * dt;
    if (y <= FLOOR) {
      y = FLOOR;
      vy = vy < -4 ? -vy * 0.15 : 0;
    }
    if (y > FLOOR + MAX_ALT) {
      y = FLOOR + MAX_ALT;
      vy = Math.min(0, vy);
    }

    if (y < FLOOR + 3 && collective < 0.15 && lift > 0.35) vy -= 7 * dt;
    if (y < FLOOR + 0.55 && collective <= 0 && Math.abs(this.speed) < 4) {
      y = FLOOR;
      vy = 0;
    }
    const power = lift * (y > FLOOR + 0.15 ? 1 : 0);
    let v = this.speed;
    v += cyclicY * 24 * power * dt;
    const drag = (y > FLOOR + 3 ? 4 : 12) + (collective < 0 ? 6 : 0);
    v -= Math.sign(v) * Math.min(Math.abs(v), drag * dt);
    if (Math.abs(v) > MAX_SPEED * lift) v -= Math.sign(v) * Math.min(Math.abs(v) - MAX_SPEED * lift, 20 * dt);

    const yaw = yawInput * 1.55 * Math.max(0.25, lift);
    this.yawRate += (yaw - this.yawRate) * Math.min(1, dt * 6);
    const heading = this.heading + this.yawRate * dt;

    const d = v * dt;
    const x = this.x + Math.cos(heading) * d;
    const z = this.z - Math.sin(heading) * d;
    if (this.blocked(x, y, z)) {
      this.bump = Math.max(this.bump, Math.hypot(v, vy));
      v *= -0.2;
      vy = Math.max(vy, 0.4);
    } else {
      this.x = x;
      this.z = z;
      this.y = y;
      this.heading = heading;
    }
    this.speed = v;
    this.vy = vy;
    this.tilt += (-v * 0.018 - this.tilt) * Math.min(1, dt * 5);
    this.roll += (this.yawRate * 0.22 - this.roll) * Math.min(1, dt * 5);
    this.spin(dt);
    this.place();
  }
}

export class Helipad {
  constructor(scene, camera, player) {
    buildPad(scene);
    this.camera = camera;
    this.player = player;
    this.heli = new Helicopter(scene);
    this.craft = null;
    this.chase = false;
    this.chaseHeading = 0;
    this.touchClimb = 0;
  }

  nearby() {
    const p = this.player.pos;
    if (Math.abs(p.y - H.grade) > 0.8) return null;
    const h = this.heli;
    const dx = p.x - h.x;
    const dz = p.z - h.z;
    const lx = Math.abs(dx * h.obb.c - dz * h.obb.s) - h.spec.L / 2;
    const lz = Math.abs(dx * h.obb.s + dz * h.obb.c) - h.spec.W / 2;
    return Math.max(lx, lz) < 2.2 && !h.airborne ? h : null;
  }

  toggle() {
    return this.craft ? this.exit() : this.enter();
  }

  enter() {
    const h = this.nearby();
    if (!h) return false;
    this.craft = h;
    h.bump = 0;
    this.chaseHeading = h.heading;
    Object.assign(this.player, { yaw: 0, pitch: 0 });
    h.cockpit(!this.chase);
    return true;
  }

  exit() {
    const h = this.craft;
    if (!h || h.airborne || Math.abs(h.speed) > 2) return false;
    const side = h.spec.W / 2 + 0.9;
    const spots = [h.local(0.4, -side), h.local(0.4, side), h.local(-2.2, -side), h.local(2.4, 0)];
    const spot = spots.find(([x, z]) => !this.player.blocked(x, H.grade, z));
    if (!spot) return false;
    this.leave();
    this.player.teleport(spot[0], H.grade, spot[1], h.heading - Math.PI / 2);
    return true;
  }

  leave() {
    const h = this.craft;
    if (!h) return;
    h.speed = 0;
    h.vy = 0;
    h.cockpit(false);
    this.craft = null;
  }

  toggleView() {
    this.chase = !this.chase;
    this.craft?.cockpit(!this.chase);
  }

  recall() {
    if (this.craft) this.leave();
    this.heli.reset();
  }

  update(dt) {
    const { heli, player, camera } = this;
    const k = player.keys;
    const on = (...codes) => (codes.some((c) => k.has(c)) ? 1 : 0);
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    const cyclicY = clamp(on('KeyW', 'ArrowUp') - on('KeyS', 'ArrowDown') - player.stick.y);
    const yawInput = clamp(on('KeyA', 'ArrowLeft') - on('KeyD', 'ArrowRight') - player.stick.x);
    const collective = clamp(on('Space', 'KeyR') - on('ShiftLeft', 'ShiftRight', 'KeyF') + this.touchClimb);
    heli.fly(dt, cyclicY, collective, yawInput);
    player.pos.set(heli.x, heli.y, heli.z);

    if (Math.hypot(heli.speed, heli.vy) > 2 && performance.now() - player.lastLook > 1500) {
      player.yaw *= Math.exp(-dt * 3);
      player.pitch *= Math.exp(-dt * 3);
    }
    if (this.chase) {
      let turn = heli.heading - this.chaseHeading;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      this.chaseHeading += turn * Math.min(1, dt * 3.5);
      const a = this.chaseHeading + player.yaw;
      const back = 11 + Math.min(8, Math.abs(heli.speed) * 0.12);
      camera.position.set(
        heli.x - Math.cos(a) * back,
        heli.y + 4.2 + player.pitch * 3,
        heli.z + Math.sin(a) * back,
      );
      camera.lookAt(heli.x, heli.y + 1.2, heli.z);
    } else {
      player.yaw = Math.max(-2.6, Math.min(2.6, player.yaw));
      heli.group.updateMatrixWorld();
      camera.position.copy(heli.body.localToWorld(heli.eye.set(1.05, 1.42, -0.38)));
      camera.rotation.set(player.pitch - 0.05, heli.heading - Math.PI / 2 + player.yaw, heli.roll * 0.4, 'YXZ');
    }
  }
}
