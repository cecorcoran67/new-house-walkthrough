import * as THREE from 'three';
import { Car, walker } from './drive.js';
import { ROADS } from './world.js';
import { insideFence } from './obstacles.js';
import { H } from './house.js';

// Traffic: cars that drive themselves round the estate's streets. They are ordinary Cars steered
// by the code below instead of the keyboard, so any of them can be stopped, boarded and driven.

// [kind, paint]: everyday cars, some old-timers and a few exotics
const FLEET = [
  ['sedan', 0xb9bdc2], ['sedan', 0xf3f3f1], ['taxi'], ['hatch', 0x2f5fa8], ['hatch', 0xe9e7e1],
  ['suv', 0x4c5257], ['suv', 0x6e1f24], ['pickup', 0xf1f0ec], ['pickup', 0x9a9da1],
  ['fj40', 0x7ea6b6], ['fj40', 0xb5482c], ['oldPickup', 0xc49a32], ['classicSedan', 0xd9cfb2],
  ['supercar', 0xf0b400], ['sports', 0xb5121b], ['supercar', 0xf4f4f2],
];

const LANE = 1.6; // metres right of the centre line
const NEAR = 100; // cars join the traffic between NEAR and FAR metres from the player...
const FAR = 280;
const GONE = 330; // ...and are moved back in once they stray further than this
const BRAKING = 2.5; // m/s² the drivers plan their stops around
const STOP = 11; // metres short of a junction that cars wait their turn

// A car with nothing on its mind. Of the junction zones, toward = the next one on its route,
// hold = the one it has booked and queue = the one it is waiting its turn for
const IDLE = { parked: false, wait: 0, swing: 0, back: 0, jam: 0, jams: 0, stall: 0, toward: null, hold: null, queue: null };

const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** The through streets inside the fence as a graph. `out` counts the hops from a node to a road that leads somewhere. */
function buildGraph() {
  const all = new Map();
  const node = ([x, z]) => {
    const key = `${x},${z}`;
    if (!all.has(key)) all.set(key, { x, z, links: [], out: 0 });
    return all.get(key);
  };
  for (const road of ROADS) {
    if (road.w < 6) continue; // lanes and driveways
    for (let i = 0; i + 1 < road.pts.length; i++) {
      const [p, q] = [road.pts[i], road.pts[i + 1]];
      if (!insideFence(p[0], p[1]) || !insideFence(q[0], q[1])) continue;
      const [a, b] = [node(p), node(q)];
      if (a === b || a.links.includes(b)) continue;
      a.links.push(b);
      b.links.push(a);
    }
  }

  // Keep the largest connected piece
  let nodes = [];
  const seen = new Set();
  for (const start of all.values()) {
    if (seen.has(start)) continue;
    const piece = [start];
    seen.add(start);
    for (const n of piece) for (const m of n.links) if (!seen.has(m)) seen.add(m) && piece.push(m);
    if (piece.length > nodes.length) nodes = piece;
  }

  // Peel away the cul-de-sacs; what is left are the roads that go round in loops
  const degree = new Map(nodes.map((n) => [n, n.links.length]));
  const peeled = new Set();
  const leaves = nodes.filter((n) => degree.get(n) === 1);
  for (const n of leaves) {
    peeled.add(n);
    for (const m of n.links) {
      degree.set(m, degree.get(m) - 1);
      if (degree.get(m) === 1 && !peeled.has(m)) leaves.push(m);
    }
  }
  let core = nodes.filter((n) => !peeled.has(n));
  if (!core.length) core = nodes;
  for (const n of nodes) n.out = Infinity;
  const queue = [...core];
  for (const n of queue) n.out = 0;
  for (const n of queue) for (const m of n.links) if (m.out > n.out + 1) (m.out = n.out + 1) && queue.push(m);

  // Roundabouts: the map does not say which streets are one-way, so look for small round loops
  // and ban driving them clockwise (traffic keeps right, so the island stays on the driver's left)
  const span = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
  const loop = (start, node, prev, length, trail) => {
    for (const next of node.links) {
      if (next === prev) continue;
      const total = length + span(node, next);
      if (total > 110) continue;
      if (next === start) {
        if (trail.length < 7) continue;
        const cx = trail.reduce((sum, n) => sum + n.x, 0) / trail.length;
        const cz = trail.reduce((sum, n) => sum + n.z, 0) / trail.length;
        const radii = trail.map((n) => Math.hypot(n.x - cx, n.z - cz));
        const mean = total / (2 * Math.PI);
        if (radii.every((r) => Math.abs(r - mean) < mean * 0.2)) return { trail, cx, cz };
      } else if (!trail.includes(next)) {
        const found = loop(start, next, node, total, [...trail, next]);
        if (found) return found;
      }
    }
    return null;
  };
  for (const start of nodes) {
    if (start.links.length < 3 || start.ring) continue;
    const ring = loop(start, start, null, 0, [start]);
    if (!ring) continue;
    ring.trail.forEach((a, i) => {
      const b = ring.trail[(i + 1) % ring.trail.length];
      // The island is on the left of a -> b when driven the right way round
      const left = (b.z - a.z) * (ring.cx - a.x) - (b.x - a.x) * (ring.cz - a.z);
      const [from, to] = left > 0 ? [b, a] : [a, b];
      (from.banned ||= new Set()).add(to);
      a.ring = true;
    });
  }

  // Junctions are crossed one car at a time. Those close together (a roundabout, a staggered
  // crossroads) share a zone, or cars would stop inside one junction to wait for the next.
  const junctions = nodes.filter((n) => n.links.length > 2);
  for (const n of junctions) n.zone = { ring: false };
  for (const a of junctions) {
    for (const b of junctions) {
      if (a.zone === b.zone || Math.hypot(a.x - b.x, a.z - b.z) > 26) continue;
      const old = b.zone;
      for (const n of junctions) if (n.zone === old) n.zone = a.zone;
    }
  }
  for (const n of junctions) if (n.ring) n.zone.ring = true;
  return { nodes, core };
}

/** Where to go after `node`, having come from `prev`: never into a cul-de-sac or the wrong way round a roundabout, never back unless it is a dead end. */
function choose(node, prev) {
  const options = node.links.filter((n) => n !== prev && !node.banned?.has(n));
  if (!options.length) return prev;
  const best = Math.min(...options.map((n) => n.out));
  return pick(options.filter((n) => n.out === best));
}

export class Traffic {
  constructor(scene, camera, garage, player) {
    Object.assign(this, { camera, garage, player, ...buildGraph() });
    this.frustum = new THREE.Frustum();
    this.view = new THREE.Matrix4();
    this.ball = new THREE.Sphere(new THREE.Vector3(), 4);
    this.bots = this.core.length < 2 ? [] : FLEET.map(([kind, paint]) => {
      const car = new Car(scene, kind, 0, 1e4, paint); // out of the way until it is given a street
      garage.cars.push(car);
      const bot = { car, path: [], pace: car.spec.pace * (0.9 + Math.random() * 0.25), fresh: true, placed: false };
      car.bot = bot;
      return bot;
    });
  }

  /** Whether the camera can see the ground at (x, z). */
  sees(x, z) {
    this.ball.center.set(x, H.grade + 1, z);
    return this.frustum.intersectsSphere(this.ball);
  }

  /** Put a car on a street some way from the player, out of sight if it can be managed. */
  spawn(bot) {
    const { car } = bot;
    const p = this.player.pos;
    for (let i = 0; i < 30; i++) {
      const a = pick(this.core);
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      if (d < (bot.fresh ? 45 : NEAR) || d > FAR) continue;
      if (!bot.fresh && d < 200 && this.sees(a.x, a.z)) continue;
      const b = choose(a, null);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const [ux, uz] = [(b.x - a.x) / len, (b.z - a.z) / len];
      const [x, z, heading] = [a.x - uz * LANE, a.z + ux * LANE, Math.atan2(-uz, ux)];
      if (this.garage.cars.some((c) => c !== car && Math.hypot(c.x - x, c.z - z) < 18) || car.blocked(x, z, heading)) continue;
      Object.assign(car, { x, z, heading, speed: bot.pace * 0.6, steer: 0 });
      car.place();
      Object.assign(bot, { path: [a, b], fresh: false, placed: true, patience: 3, ...IDLE });
      return;
    }
    bot.placed = false; // nowhere suitable this time: try again next frame
  }

  /** Point an abandoned car back down the nearest street. False if it was left too far from one. */
  rejoin(bot) {
    const { car } = bot;
    let best = null;
    for (const a of this.nodes) {
      for (const b of a.links) {
        const [dx, dz] = [b.x - a.x, b.z - a.z];
        const t = clamp(((car.x - a.x) * dx + (car.z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
        const d = Math.hypot(car.x - a.x - dx * t, car.z - a.z - dz * t);
        if (!best || d < best.d) best = { a, b, d };
      }
    }
    if (!best || best.d > 12) return false;
    let { a, b } = best;
    // Out of a cul-de-sac if it is in one, otherwise whichever way it already faces
    const facing = (b.x - a.x) * Math.cos(car.heading) - (b.z - a.z) * Math.sin(car.heading);
    if (a.banned?.has(b) || (!b.banned?.has(a) && (a.out < b.out || (a.out === b.out && facing < 0)))) [a, b] = [b, a];
    Object.assign(bot, { path: [a, b], ...IDLE });
    return true;
  }

  /** Drop the stretches of route already driven and plan far enough ahead to steer by. */
  route(bot) {
    const { car, path } = bot;
    for (;;) {
      if (path.length < 3) path.push(choose(path[path.length - 1], path[path.length - 2]));
      const [a, b, c] = path;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const [ux, uz] = [(b.x - a.x) / len, (b.z - a.z) / len];
      const next = Math.hypot(c.x - b.x, c.z - b.z);
      // Past the corner once across the line that bisects it (or, turning back at a dead end, at its end)
      const [bx, bz] = [ux + (c.x - b.x) / next, uz + (c.z - b.z) / next];
      const done = Math.hypot(bx, bz) > 0.3
        ? (car.x - b.x) * bx + (car.z - b.z) * bz > 0
        : (car.x - a.x) * ux + (car.z - a.z) * uz > len - 1;
      if (!done) break;
      path.shift();
    }
    let ahead = 0;
    for (let i = 1; i + 1 < path.length; i++) ahead += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
    while (ahead < 60) {
      const last = path[path.length - 1];
      const n = choose(last, path[path.length - 2]);
      ahead += Math.hypot(n.x - last.x, n.z - last.z);
      path.push(n);
    }
  }

  /** The next junction on the route that is not already booked, and how far off it is. */
  junction(bot) {
    const { car, path } = bot;
    const [a, b] = path;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    let d = -clamp(((car.x - a.x) * (b.x - a.x) + (car.z - a.z) * (b.z - a.z)) / len, 0, len);
    for (let i = 1; i < path.length; i++) {
      d += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
      if (path[i].zone && path[i].zone !== bot.hold) return { node: path[i], d };
    }
    return null;
  }

  /** The point `dist` metres further along the route, `side` metres right of the centre line. */
  ahead(bot, dist, side) {
    const { car, path } = bot;
    for (let i = 0; ; i++) {
      const [a, b] = [path[i], path[i + 1]];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const [ux, uz] = [(b.x - a.x) / len, (b.z - a.z) / len];
      if (i === 0) dist += clamp((car.x - a.x) * ux + (car.z - a.z) * uz, 0, len);
      if (dist <= len || i + 2 === path.length) return [a.x + ux * dist - uz * side, a.z + uz * dist + ux * side];
      dist -= len;
    }
  }

  update(dt) {
    const { garage, player } = this;
    const p = player.pos;
    this.frustum.setFromProjectionMatrix(this.view.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    Object.assign(walker, { on: !garage.car && Math.abs(p.y - H.grade) < 1.2, x: p.x, z: p.z });

    for (const bot of this.bots) {
      const { car } = bot;
      const away = Math.hypot(car.x - p.x, car.z - p.z);
      if (garage.car === car) {
        Object.assign(bot, { parked: true, left: 0, toward: null, hold: null, queue: null }); // the player has taken it
      } else if (!bot.placed || away > GONE) {
        this.spawn(bot);
      } else if (bot.parked) {
        // Left where the player got out; once they have wandered off it goes back to its rounds
        bot.left += dt;
        if (bot.left > 15 && away > 30 && !this.rejoin(bot)) {
          bot.left = 14;
          if (away > 150 && !this.sees(car.x, car.z)) this.spawn(bot);
        }
      } else {
        this.drive(bot, dt, away);
      }
    }
  }

  drive(bot, dt, away) {
    const { car } = bot;
    const { L, W, wb } = car.spec;
    const v = car.speed;
    car.bump = 0;

    // Backing off from whatever it is stuck behind
    if (bot.back > 0) {
      bot.back -= dt;
      car.drive(dt, -0.7, 0, false);
      return;
    }
    if (bot.swing > 0) bot.swing -= dt;
    const passing = bot.swing > 0; // going round a stopped car on the wrong side of the road
    const side = passing ? -LANE * 0.9 : LANE;
    this.route(bot);

    // Steer for a point a little way up the lane (pure pursuit)
    const [c, s] = [Math.cos(car.heading), Math.sin(car.heading)];
    const aim = (dist) => {
      const [x, z] = this.ahead(bot, dist, side);
      const [dx, dz] = [x - car.x, z - car.z];
      const [f, l] = [dx * c - dz * s, dx * s + dz * c]; // forward, and to the right
      return { err: Math.atan2(-l, f), d: Math.hypot(f, l) };
    };
    const near = aim(4 + Math.abs(v) * 0.7);
    const steer = clamp(Math.atan((2 * wb * Math.sin(near.err)) / near.d) / car.lock);

    // Slow for the bend coming up, and hold that speed until it straightens out: no more
    // sideways pull than a careful driver would accept
    const far = aim(8 + Math.abs(v) * 1.6);
    const radius = Math.min(near.d / Math.abs(Math.sin(near.err)), far.d / Math.abs(Math.sin(far.err))) / 2;
    let target = Math.min(bot.pace, Math.max(2.5, Math.sqrt(2.2 * radius)));
    if (Math.abs(near.err) > 0.9) target = Math.min(target, 3);

    // Junctions take one car at a time: book the next one, or queue a car's length short of it
    const [last] = bot.path;
    const clear = last.zone !== bot.hold || Math.hypot(car.x - last.x, car.z - last.z) > 9;
    if (bot.hold && clear && !bot.path.some((n, i) => i && n.zone === bot.hold)) bot.hold = null; // through and out the other side
    bot.queue = null;
    const next = this.junction(bot);
    bot.toward = next ? next.node.zone : null;
    if (next && next.d < (v * v) / (2 * BRAKING) + STOP + 6) {
      const { zone } = next.node;
      const reach = (c) => Math.hypot(c.x - next.node.x, c.z - next.node.z);
      const inside = this.bots.filter((o) => o !== bot && o.hold === zone && !o.parked);
      // A roundabout is free once those on it are clear of this entry. Any other junction belongs
      // to whoever booked it, unless they have been held up well short of it
      const taken = zone.ring ? inside.some((o) => reach(o.car) < 14) : inside.some((o) => o.stall < 6 || reach(o.car) < STOP + 4);
      // ...and nobody jumps the queue on their own road
      const line = this.bots.some((o) => o !== bot && o.toward === zone && Math.cos(o.car.heading - car.heading) > 0.5 && reach(o.car) < reach(car));
      if (!taken && !line) {
        bot.hold = zone;
      } else if (next.d > STOP - 3) {
        bot.queue = zone;
        target = Math.min(target, Math.sqrt(2 * BRAKING * Math.max(0, next.d - STOP)));
      }
    }

    // Slow or stop for anything in the way: the swept path ahead is an arc set by the steering
    const bend = Math.tan(car.steer) / wb; // + = curving left
    const room = passing ? 0.8 : 3;
    let blocker = null;
    const mind = (who, x, z, along, across, speed, margin) => {
      const [dx, dz] = [x - car.x, z - car.z];
      let [f, l] = [dx * c - dz * s, dx * s + dz * c]; // ahead, and to the right
      if (Math.abs(bend) > 1e-3) {
        // Measure along and across the arc instead: its centre is 1/bend to the left
        const r = 1 / bend;
        const turned = Math.atan2(f, Math.sign(r) * (l + r));
        [f, l] = [Math.abs(r) * turned, (Math.abs(r) - Math.hypot(f, l + r)) * Math.sign(r)];
        if (turned > 2) return;
      }
      if (f < 0 || f > (v * v) / (2 * BRAKING) + 12) return;
      if (Math.abs(l) > W / 2 + across + margin + (Math.abs(bend) * L * L) / 8) return; // long cars swing wide in a tight turn
      const limit = Math.max(0, speed) + Math.sqrt(2 * BRAKING * Math.max(0, f - L / 2 - along - room));
      if (limit < target) [target, blocker] = [limit, who];
    };
    for (const other of this.garage.cars) {
      if (other === car) continue;
      const dot = Math.cos(car.heading - other.heading); // 1 = same way, -1 = oncoming
      if (bot.hold && other.bot?.queue === bot.hold && dot < 0.5) continue; // queueing on another road, waiting for this car
      const cross = Math.sqrt(1 - dot * dot);
      const [oL, oW] = [other.spec.L / 2, other.spec.W / 2];
      // Oncoming cars only count when they are properly in this lane
      mind(other, other.x, other.z, oL * Math.abs(dot) + oW * cross, oW * Math.abs(dot) + oL * cross, other.speed * dot, dot < -0.5 ? -0.3 : 0.4);
    }
    if (this.crowd) {
      for (const p of this.crowd) mind(p, p.x, p.z, 0.3, 0.3, 0, 0.6);
    }
    let beside = false;
    if (walker.on) {
      mind(walker, walker.x, walker.z, 0.35, 0.35, 0, 0.5);
      // Someone standing at the door of a crawling car: wait for them to get in
      const [dx, dz] = [walker.x - car.x, walker.z - car.z];
      const gap = Math.hypot(Math.max(0, Math.abs(dx * c - dz * s) - L / 2), Math.max(0, Math.abs(dx * s + dz * c) - W / 2));
      beside = gap < 2 && Math.abs(v) < 2.5;
      if (beside) [target, blocker] = [0, walker];
    }

    bot.blocker = blocker;
    const still = Math.abs(v) < 0.3;
    bot.stall = still ? bot.stall + dt : 0;
    if (blocker && target < 0.5 && still) {
      // Held up. Other traffic will usually move off by itself; go round a parked car after a few
      // seconds and someone standing in the road after a few more
      bot.wait += dt;
      const patience = beside ? Infinity : blocker === walker ? 8 : blocker.bot && !blocker.bot.parked ? 15 : bot.patience;
      if (bot.wait > patience) Object.assign(bot, { wait: 0, swing: 8, back: 1.1, patience: 2.5 + Math.random() * 3 });
    } else if (!still) bot.wait = 0;

    // Not moving though nothing says it should not be: wedged against something
    if (target > 1 && still) {
      bot.jam += dt;
      if (bot.jam > 1.5) Object.assign(bot, { jam: 0, jams: bot.jams + 1, back: 1.2 });
    } else {
      bot.jam = 0;
      if (v > 3) bot.jams = Math.max(0, bot.jams - dt / 10);
    }
    // Hopelessly stuck: start afresh somewhere else, once nobody is looking
    if ((bot.jams >= 3 || (bot.stall > 25 && blocker !== walker)) && (away > 90 || !this.sees(car.x, car.z))) return this.spawn(bot);

    if (target < 0.3 && v < 1) car.drive(dt, 0, steer, true);
    else if (v > target + 0.8) car.drive(dt, -clamp((v - target) / 3, 0.15, 1), steer, false);
    else car.drive(dt, clamp((target - v) * 0.6 + 0.1, 0.03, 1), steer, false);
  }
}
