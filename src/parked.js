import * as THREE from 'three';
import { Car } from './drive.js';
import { driveways } from './world.js';
import { H } from './house.js';

// Parked cars in the driveways of the stand-in houses. A pool of ordinary Cars is moved onto
// the nearest empty drives, so every house you can see has one and any of them can be driven.

const FLEET = [
  ['sedan', 0xb9bdc2], ['sedan', 0x1f3a5f], ['sedan', 0xe8e4dc], ['sedan', 0x7a8b6e], ['sedan', 0xc2b280],
  ['hatch', 0x2f5fa8], ['hatch', 0xc45c2d], ['hatch', 0xf3f3f1], ['hatch', 0x5a4632], ['hatch', 0x4a6741],
  ['suv', 0x4c5257], ['suv', 0x6e1f24], ['suv', 0xd8d3c8], ['suv', 0x2c3540], ['suv', 0xe5d9c5],
  ['pickup', 0xf1f0ec], ['pickup', 0x3d5c3a], ['pickup', 0x9a9da1], ['pickup', 0x6b2d2d], ['pickup', 0x2b2d30],
  ['fj40', 0x7ea6b6], ['fj40', 0xb5482c], ['fj40', 0xe8e4d4], ['fj40', 0x3e4a3d],
  ['oldPickup', 0xc49a32], ['oldPickup', 0x5c4033],
  ['classicSedan', 0xd9cfb2], ['classicSedan', 0x1c3a5e], ['classicSedan', 0x8b1e1e], ['classicSedan', 0x4a4a4a],
  ['sports', 0xb5121b], ['sports', 0x2a2c2f], ['sports', 0x1a4a8a],
  ['supercar', 0x0b6b3a], ['supercar', 0xf4f4f2],
  ['taxi'],
];

const NEAR = 18; // do not pop a car in on top of the player
const FAR = 160;
const GONE = 200;

export class Parked {
  constructor(scene, camera, garage, player) {
    Object.assign(this, { camera, garage, player, spots: driveways() });
    this.frustum = new THREE.Frustum();
    this.view = new THREE.Matrix4();
    this.ball = new THREE.Sphere(new THREE.Vector3(), 3);
    this.cars = FLEET.map(([kind, paint]) => {
      const car = new Car(scene, kind, 0, 1e4, paint, 0);
      garage.cars.push(car);
      return { car, spot: null, taken: false };
    });
  }

  sees(x, z) {
    this.ball.center.set(x, H.grade + 1, z);
    return this.frustum.intersectsSphere(this.ball);
  }

  taken(spot, self) {
    return this.garage.cars.some((c) => c !== self && Math.hypot(c.x - spot.x, c.z - spot.z) < 7);
  }

  spawn(bot) {
    const p = this.player.pos;
    const ranked = this.spots
      .map((s) => ({ s, d: Math.hypot(s.x - p.x, s.z - p.z) }))
      .filter(({ s, d }) => d > NEAR && d < FAR && !this.taken(s, bot.car))
      .sort((a, b) => a.d - b.d);
    const pick = ranked.find(({ s }) => !this.sees(s.x, s.z)) || ranked[0];
    if (!pick) return;
    const { s } = pick;
    if (bot.car.blocked(s.x, s.z, s.heading)) return;
    Object.assign(bot.car, { x: s.x, z: s.z, heading: s.heading, speed: 0, steer: 0 });
    bot.car.home = { x: s.x, z: s.z, heading: s.heading };
    bot.car.lights(false, false);
    bot.car.place();
    Object.assign(bot, { spot: s, taken: false });
  }

  update() {
    const p = this.player.pos;
    this.frustum.setFromProjectionMatrix(this.view.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    for (const bot of this.cars) {
      const { car } = bot;
      const away = Math.hypot(car.x - p.x, car.z - p.z);
      if (this.garage.car === car) {
        Object.assign(bot, { spot: null, taken: true });
        continue;
      }
      car.group.visible = away < GONE;
      if (bot.taken) {
        if (away > 35) this.spawn(bot);
        continue;
      }
      if (!bot.spot || away > GONE) this.spawn(bot);
    }
  }
}
