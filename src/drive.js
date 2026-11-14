import * as THREE from 'three';
import { buildCar, buildInterior, driverEye, carGlass } from './cars.js';
import { colliders } from './builder.js';
import { movers, makeObb, solidAt } from './obstacles.js';
import { nearestRoad } from './world.js';
import { POOL } from './site.js';
import { H } from './house.js';

// Drivable cars: get in, drive around the estate, get out anywhere.
// A car's heading is its rotation about y; its nose points along (cos h, -sin h).

const FLOOR = H.grade + 0.02; // wheels sit just proud of the ground so they clear the paving
const OFF_ROAD = 9; // m/s on grass
const REVERSE = 6;
const COAST = 7; // m/s² of braking once the controls are let go
const GRIP = 6.5; // m/s² of cornering the steering will ask for

/** Someone on foot that moving cars must not run over; traffic.js keeps it up to date. */
export const walker = { on: false, x: 0, z: 0 };

let blob = null;
function blobShadow(s) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(s.L + 1, s.W + 0.9), (blob ||= blobMaterial()));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}

function blobMaterial() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 8, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.4)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 });
}

export class Car {
  constructor(scene, kind, x, z, paint, heading = Math.PI / 2) {
    const { group, spec } = buildCar(kind, paint);
    this.name = spec.name;
    this.spec = spec;
    this.group = group;
    this.home = { x, z, heading }; // home cars sit nose-in toward the house
    this.interior = null; // fitted the first time someone gets in
    this.glass = [];
    // The sun's shadow map is rendered once, so moving cars carry a soft blob shadow instead.
    group.traverse((o) => {
      o.castShadow = false;
      if (o.material === carGlass) this.glass.push(o);
    });
    group.add(blobShadow(spec));
    this.obb = makeObb(x, z, spec.L / 2, spec.W / 2, 0, FLOOR, FLOOR + spec.Ht);
    movers.push(this.obb);
    scene.add(group);
    this.cockpit(false);
    this.reset();
  }

  reset() {
    Object.assign(this, this.home, { speed: 0, steer: 0, load: 0, paved: true, bump: 0 }); // the last three feed sound.js
    this.lights(false, false);
    this.place();
  }

  /** Brake lamps glow brighter than the running lamps; the white reversing lamps only light in reverse. */
  lights(brake, reverse) {
    const { tail, backup } = this.group.userData.lamps;
    tail.emissive.setHex(brake ? 0xff2a14 : 0x9c0a06);
    tail.emissiveIntensity = brake ? 2.6 : 0.7;
    backup.emissiveIntensity = reverse ? 2.2 : 0;
  }

  /** Steering lock available at the current speed: less when fast, so cornering grip stays the same. */
  get lock() {
    return Math.min(0.6, Math.atan((this.spec.wb * GRIP) / Math.max(this.speed * this.speed, 0.01)));
  }

  place() {
    this.group.position.set(this.x, FLOOR, this.z);
    this.group.rotation.y = this.heading;
    Object.assign(this.obb, { x: this.x, z: this.z, c: Math.cos(this.heading), s: Math.sin(this.heading) });
  }

  /** Show the cabin fittings and hide the tinted glass (or the reverse, for outside views). */
  cockpit(on) {
    if (on && !this.interior) this.group.add((this.interior = buildInterior(this.spec)));
    if (this.interior) this.interior.visible = on;
    for (const g of this.glass) g.visible = !on;
  }

  /** Point (lx along the nose, lz to the right) in world x/z. */
  local(lx, lz) {
    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    return [this.x + lx * c + lz * s, this.z - lx * s + lz * c];
  }

  // Three circles along the body, tested against the house, the neighbourhood and the pool.
  blocked(x, z, heading) {
    const r = this.spec.W / 2;
    const reach = this.spec.L / 2 - r;
    const lo = FLOOR + 0.3; // anything lower is a kerb the tyres ride over
    const hi = FLOOR + 1.6;
    const atHome = Math.abs(x - 2) < 45 && Math.abs(z - 7) < 55; // only then can it meet the house or the pool
    for (const k of [-1, 0, 1]) {
      const cx = x + Math.cos(heading) * reach * k;
      const cz = z - Math.sin(heading) * reach * k;
      if (solidAt(cx, cz, r, lo, hi, this.obb)) return true;
      if (walker.on && Math.hypot(cx - walker.x, cz - walker.z) < r + 0.4) return true;
      if (!atHome) continue;
      if (cx + r > POOL.x0 && cx - r < POOL.x1 && cz + r > POOL.z0 && cz - r < POOL.z1) return true;
      for (const c of colliders) {
        if (c.y1 <= lo || c.y0 >= hi) continue;
        const ex = Math.max(c.x0 - cx, 0, cx - c.x1);
        const ez = Math.max(c.z0 - cz, 0, cz - c.z1);
        if (ex * ex + ez * ez < r * r) return true;
      }
    }
    return false;
  }

  /** throttle and steer are -1..1 (steer: +1 = left). */
  drive(dt, throttle, steer, handbrake) {
    const s = this.spec;
    let v = this.speed;
    const road = nearestRoad(this.x, this.z);
    const paved = (road && road.d < road.road.w / 2 + 0.8) || (this.x > 3 && this.x < 14.6 && this.z > 7 && this.z < 23);
    const top = paved ? s.top : OFF_ROAD;
    this.paved = paved;
    const braking = handbrake || (throttle > 0 ? v < -0.3 : throttle < 0 ? v > 0.3 : Math.abs(v) > 0.3);
    const reversing = !handbrake && (throttle < 0 ? v <= 0.3 : v < -0.3);
    this.load = braking || !throttle ? 0 : Math.abs(throttle); // how hard the engine is pulling
    this.lights(braking || reversing, reversing);

    if (handbrake) v -= Math.sign(v) * Math.min(Math.abs(v), 14 * dt);
    else if (throttle > 0) v += (v < -0.3 ? 9 : s.accel * (1 - Math.max(0, v) / (top * 1.05))) * throttle * dt;
    else if (throttle < 0) v += (v > 0.3 ? 9 : 3 * (1 - Math.max(0, -v) / REVERSE)) * throttle * dt;
    else v -= Math.sign(v) * Math.min(Math.abs(v), COAST * dt); // hands off the controls: brake to a stop
    v -= Math.sign(v) * Math.min(Math.abs(v), 0.3 * dt); // rolling drag
    if (Math.abs(v) > top) v -= Math.sign(v) * Math.min(Math.abs(v) - top, 8 * dt); // grass slows you down

    // Less lock at speed, so the car asks for the same cornering grip throughout
    this.steer += (steer * this.lock - this.steer) * Math.min(1, dt * 7);

    const d = v * dt;
    if (d !== 0) {
      // Bicycle model pivoting on the rear axle
      const heading = this.heading + (d / s.wb) * Math.tan(this.steer);
      const [rx, rz] = this.local(-s.wb / 2 + d, 0);
      const x = rx + (Math.cos(heading) * s.wb) / 2;
      const z = rz - (Math.sin(heading) * s.wb) / 2;
      if (this.blocked(x, z, heading)) {
        this.bump = Math.abs(v);
        v = Math.abs(v) < 1 ? 0 : -v * 0.2;
      } else Object.assign(this, { x, z, heading });
    }
    this.speed = v;
    this.place();

    for (const w of this.group.userData.wheels) {
      w.grp.rotation.z -= d / s.wheelR;
      if (w.front) w.grp.rotation.y = this.steer;
    }
    if (this.interior) this.interior.userData.steering.rotation.z = -this.steer * 7;
  }
}

export class Garage {
  constructor(scene, camera, player) {
    this.camera = camera;
    this.player = player;
    this.homeCars = [
      new Car(scene, 'tahoe', 5.05, 11.0),
      new Car(scene, 'bj30', 8.45, 10.8),
      new Car(scene, 'c8', 6.75, 16.55), // Corvette on the drive, next to the house
    ];
    this.cars = [...this.homeCars]; // traffic.js adds the cars out on the estate, which can be driven too
    this.car = null; // the one being driven
    this.chase = false; // outside view instead of the driver's seat
    this.chaseHeading = 0;
  }

  /** The car the walker is standing next to, if any. */
  nearby() {
    const p = this.player.pos;
    if (Math.abs(p.y - H.grade) > 0.8) return null;
    let best = null;
    for (const car of this.cars) {
      const dx = p.x - car.x;
      const dz = p.z - car.z;
      const lx = Math.abs(dx * car.obb.c - dz * car.obb.s) - car.spec.L / 2;
      const lz = Math.abs(dx * car.obb.s + dz * car.obb.c) - car.spec.W / 2;
      const d = Math.max(lx, lz);
      if (d < 1.6 && (!best || d < best.d)) best = { car, d };
    }
    return best?.car ?? null;
  }

  /** Get into the nearby car, or out of the one being driven. Returns false if neither is possible. */
  toggle() {
    return this.car ? this.exit() : this.enter(this.nearby());
  }

  enter(car) {
    if (!car) return false;
    this.car = car;
    car.bump = 0;
    this.chaseHeading = car.heading;
    Object.assign(this.player, { yaw: 0, pitch: 0 }); // now the look offset from straight ahead
    car.cockpit(!this.chase);
    return true;
  }

  exit() {
    const car = this.car;
    const side = car.spec.W / 2 + 0.75;
    const spots = [car.local(0.3, -side), car.local(0.3, side), car.local(-car.spec.L / 2 - 0.8, 0), car.local(car.spec.L / 2 + 0.8, 0)];
    const spot = spots.find(([x, z]) => !this.player.blocked(x, H.grade, z));
    if (!spot) return false; // boxed in on every side
    this.leave();
    this.player.teleport(spot[0], H.grade, spot[1], car.heading - Math.PI / 2);
    return true;
  }

  /** Switch off and step away from the car being driven. */
  leave() {
    this.car.speed = 0;
    this.car.lights(false, false);
    this.car.cockpit(false);
    this.car = null;
  }

  toggleView() {
    this.chase = !this.chase;
    this.car?.cockpit(!this.chase);
  }

  /** Abandon the car being driven (if any) and bring back either of the house's cars left out on the estate. */
  recall() {
    if (this.car) this.leave();
    for (const car of this.homeCars) if (Math.hypot(car.x - car.home.x, car.z - car.home.z) > 60) car.reset();
  }

  update(dt) {
    const { car, player, camera } = this;
    const k = player.keys;
    const on = (...codes) => (codes.some((c) => k.has(c)) ? 1 : 0);
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    const throttle = clamp(on('KeyW', 'ArrowUp') - on('KeyS', 'ArrowDown') - player.stick.y);
    const steer = clamp(on('KeyA', 'ArrowLeft') - on('KeyD', 'ArrowRight') - player.stick.x);
    car.drive(dt, throttle, steer, k.has('Space'));
    player.pos.set(car.x, H.grade, car.z);

    // Glance around freely, but drift back to straight ahead once under way
    if (Math.abs(car.speed) > 1.5 && performance.now() - player.lastLook > 1500) {
      player.yaw *= Math.exp(-dt * 3);
      player.pitch *= Math.exp(-dt * 3);
    }
    if (this.chase) {
      let turn = car.heading - this.chaseHeading;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      this.chaseHeading += turn * Math.min(1, dt * 4);
      const a = this.chaseHeading + player.yaw;
      camera.position.set(car.x - Math.cos(a) * 7.5, FLOOR + 2.9 + player.pitch * 2, car.z + Math.sin(a) * 7.5);
      camera.lookAt(car.x, FLOOR + 1.4, car.z);
    } else {
      player.yaw = Math.max(-2.6, Math.min(2.6, player.yaw));
      car.group.updateMatrixWorld();
      camera.position.copy(car.group.localToWorld(driverEye(car.spec)));
      camera.rotation.set(player.pitch - 0.04, car.heading - Math.PI / 2 + player.yaw, 0, 'YXZ');
    }
  }
}
