import * as THREE from 'three';
import { colliders } from './builder.js';

const RADIUS = 0.28; // half-width of the walker
const HEIGHT = 1.78; // body height used for head clearance
const EYE = 1.62;
const STEP = 0.3; // tallest ledge that can be walked up (stair risers are 0.18, coffee tables are taller)
const WALK = 3.4;
const RUN = 6.5;
const GRAVITY = 22;

export class Player {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.pos = new THREE.Vector3(1.2, -0.45, 19); // feet position
    this.vy = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.eyeY = this.pos.y + EYE;
    this.keys = new Set();
    this.locked = false;
    this.onGround = true;
    this.bob = 0;

    document.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - e.movementY * 0.0022));
    });
  }

  lock() {
    this.dom.requestPointerLock?.();
  }

  teleport(x, y, z, yaw = 0) {
    this.pos.set(x, y, z);
    this.vy = 0;
    this.yaw = yaw;
    this.pitch = 0;
    this.eyeY = y + EYE;
  }

  // True when a body standing at (x, feetY, z) would intersect something solid
  // that is too tall to step onto.
  blocked(x, feetY, z) {
    for (const c of colliders) {
      if (x + RADIUS <= c.x0 || x - RADIUS >= c.x1 || z + RADIUS <= c.z0 || z - RADIUS >= c.z1) continue;
      if (c.y1 <= feetY + STEP + 0.001) continue; // low enough to step on
      if (c.y0 >= feetY + HEIGHT) continue; // above the head
      return true;
    }
    return false;
  }

  // Highest walkable surface under the feet (within step-up range).
  groundAt(x, feetY, z) {
    let g = -Infinity;
    const r = RADIUS * 0.9;
    for (const c of colliders) {
      if (x + r <= c.x0 || x - r >= c.x1 || z + r <= c.z0 || z - r >= c.z1) continue;
      if (c.y1 <= feetY + STEP + 0.001 && c.y1 > g) g = c.y1;
    }
    return g;
  }

  update(dt) {
    const k = this.keys;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    if (k.has('ArrowLeft')) this.yaw += dt * 1.9;
    if (k.has('ArrowRight')) this.yaw -= dt * 1.9;

    const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? RUN : WALK;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let dx = (-sin * f + cos * s);
    let dz = (-cos * f - sin * s);
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      dx = (dx / len) * speed * dt;
      dz = (dz / len) * speed * dt;
    }

    // Move in small sub-steps, one axis at a time, so we slide along walls
    // and never tunnel through thin glass.
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.08));
    for (let i = 0; i < steps; i++) {
      const nx = this.pos.x + dx / steps;
      if (!this.blocked(nx, this.pos.y, this.pos.z)) this.pos.x = nx;
      const nz = this.pos.z + dz / steps;
      if (!this.blocked(this.pos.x, this.pos.y, nz)) this.pos.z = nz;
      const g = this.groundAt(this.pos.x, this.pos.y, this.pos.z);
      if (this.onGround && g > this.pos.y) this.pos.y = g; // step up
    }

    // Gravity / landing
    if (k.has('Space') && this.onGround) {
      this.vy = 5.2;
      this.onGround = false;
    }
    const ground = this.groundAt(this.pos.x, this.pos.y, this.pos.z);
    if (!this.onGround || ground < this.pos.y - 0.001) {
      this.vy -= GRAVITY * dt;
      let ny = this.pos.y + this.vy * dt;
      // Head bump against ceilings while jumping
      if (this.vy > 0 && this.blocked(this.pos.x, ny, this.pos.z)) {
        this.vy = 0;
        ny = this.pos.y;
      }
      const g2 = this.groundAt(this.pos.x, Math.max(ny, this.pos.y), this.pos.z);
      if (this.vy <= 0 && ny <= g2) {
        ny = g2;
        this.vy = 0;
        this.onGround = true;
      } else {
        this.onGround = false;
      }
      this.pos.y = ny;
    } else {
      this.pos.y = ground;
      this.vy = 0;
      this.onGround = true;
    }
    if (this.pos.y < -30) this.teleport(1.2, -0.45, 19); // safety net

    // Smooth eye height (soft stair climbing) plus a subtle head bob
    const moving = len > 0 && this.onGround;
    this.bob += dt * (moving ? speed * 2.2 : 0);
    const targetEye = this.pos.y + EYE + (moving ? Math.sin(this.bob) * 0.018 : 0);
    this.eyeY += (targetEye - this.eyeY) * Math.min(1, dt * 14);

    this.camera.position.set(this.pos.x, this.eyeY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
