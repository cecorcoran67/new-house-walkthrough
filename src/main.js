import * as THREE from 'three';
import { buildHouse, H } from './house.js';
import { buildSite } from './site.js';
import { furnishGround } from './furnish_ground.js';
import { furnishUpper } from './furnish_upper.js';
import { updateDoors, colliders, doors } from './builder.js';
import { Player } from './player.js';
import { initTouch } from './touch.js';
import { buildWorld, streetAt, LOT, attribution } from './world.js';
import { pointInPolygon } from './obstacles.js';
import { Garage } from './drive.js';
import { Traffic } from './traffic.js';
import { Parked } from './parked.js';
import { Sound } from './sound.js';
import { Minimap } from './minimap.js';
import { Helipad, PAD } from './heli.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe9cfae, 90, 520);
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.08, 900);

// ---- Golden-hour sky + sun, matching the reference renders -----------------
const sunDir = new THREE.Vector3(-0.62, 0.3, 0.72).normalize();

// Painted equirectangular sky: blue zenith, peach horizon, sun glow and warm-lit clouds.
function makeSky() {
  const W = 2048;
  const Hh = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = Hh;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, Hh);
  g.addColorStop(0, '#2f6fc4');
  g.addColorStop(0.28, '#5d9be0');
  g.addColorStop(0.42, '#a9cdee');
  g.addColorStop(0.495, '#f6dcb8');
  g.addColorStop(0.5, '#f3c592');
  g.addColorStop(0.52, '#8f8a78');
  g.addColorStop(1, '#5d6650');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, Hh);

  // Sun position in equirect space (same mapping three.js uses for sampling)
  const su = Math.atan2(sunDir.z, sunDir.x) / (Math.PI * 2) + 0.5;
  const sv = Math.asin(sunDir.y) / Math.PI + 0.5;
  const sx = su * W;
  const sy = (1 - sv) * Hh;
  for (const off of [-W, 0, W]) {
    const glow = ctx.createRadialGradient(sx + off, sy, 0, sx + off, sy, 330);
    glow.addColorStop(0, 'rgba(255,244,214,1)');
    glow.addColorStop(0.06, 'rgba(255,225,170,0.85)');
    glow.addColorStop(0.35, 'rgba(255,190,120,0.25)');
    glow.addColorStop(1, 'rgba(255,170,100,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, Hh * 0.5);
  }

  // Clouds: clusters of soft puffs, lit warm from below like the dusk renders
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 24; i++) {
    const cx = rnd() * W;
    const cy = Hh * (0.1 + rnd() * 0.33);
    const scale = 0.5 + (cy / (Hh * 0.5)) * 0.9;
    const puffs = 7 + Math.floor(rnd() * 9);
    for (let j = 0; j < puffs; j++) {
      const px = cx + (rnd() - 0.5) * 300 * scale;
      const py = cy + (rnd() - 0.5) * 34 * scale;
      const r = (26 + rnd() * 52) * scale;
      for (const off of [-W, 0, W]) {
        const pg = ctx.createRadialGradient(px + off, py - r * 0.25, 0, px + off, py, r);
        pg.addColorStop(0, 'rgba(255,250,244,0.42)');
        pg.addColorStop(0.55, 'rgba(255,224,190,0.2)');
        pg.addColorStop(1, 'rgba(255,205,160,0)');
        ctx.fillStyle = pg;
        ctx.fillRect(px + off - r, py - r, r * 2, r * 2);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const skyTex = makeSky();
scene.background = skyTex;
scene.backgroundIntensity = 0.85;
// Image-based lighting from the same sky gives soft fill and glass/paint reflections
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromEquirectangular(skyTex).texture;
scene.environmentIntensity = 0.7;

const sun = new THREE.DirectionalLight(0xffcf9c, 2.9);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { near: 1, far: 200 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// Nothing that casts a shadow moves, so the shadow map is only re-rendered when its patch of
// ground changes: a tight, sharp patch over the lot at home, and a wider one that follows you
// in 24 m steps out on the estate.
const shadowPatch = { x: NaN, z: NaN, half: 0 };
function focusShadows(pos) {
  const away = Math.max(Math.abs(pos.x), Math.abs(pos.z)) > (shadowPatch.half === 34 ? 38 : 30);
  const half = away ? 70 : 34;
  const x = away ? Math.round(pos.x / 24) * 24 : 0;
  const z = away ? Math.round(pos.z / 24) * 24 : 0;
  if (x === shadowPatch.x && z === shadowPatch.z && half === shadowPatch.half) return;
  Object.assign(shadowPatch, { x, z, half });
  sun.target.position.set(x, 0, z);
  sun.position.copy(sunDir).multiplyScalar(90).add(sun.target.position);
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half });
  sun.shadow.camera.updateProjectionMatrix();
  renderer.shadowMap.needsUpdate = true;
}
scene.add(new THREE.HemisphereLight(0xcfdcff, 0x8c7b66, 0.5));

// Warm interior fill lights (no shadows, to stay fast)
const lamps = [
  [0, 5.4, -5.2, 26, 13], [-1.5, 2.6, 0.5, 9, 8], [5.6, 2.6, -6, 12, 9], [1.3, 4.6, 8.8, 14, 10],
  [-1, 5.8, 0.6, 10, 9], [5.6, 5.8, -4.8, 10, 9], [5.6, 5.8, 4, 9, 9], [-6.6, 5.4, 0.6, 12, 10],
  [-6.3, 2.6, 9.8, 8, 8], [-6.4, 2.6, -10.3, 8, 8], [5.4, 2.6, 4.7, 8, 8], [10, 2.6, -6, 8, 8],
  [1.2, 2.6, -11.5, 12, 10], [7.4, 2.9, 11.2, 12, 11],
];
for (const [x, y, z, intensity, dist] of lamps) {
  const l = new THREE.PointLight(0xffd3a3, intensity, dist, 1.6);
  l.position.set(x, y, z);
  scene.add(l);
}

// ---- World -----------------------------------------------------------------
const house = buildHouse(scene);
furnishGround(house);
furnishUpper(house);
buildSite(scene);
const world = buildWorld(scene);

const player = new Player(camera, canvas);
const garage = new Garage(scene, camera, player);
const traffic = new Traffic(scene, camera, garage, player);
const parked = new Parked(scene, camera, garage, player);
const heli = new Helipad(scene, camera, player);

// ---- HUD -------------------------------------------------------------------
const overlay = document.getElementById('overlay');
const atlas = document.getElementById('atlas');
const mapBtn = document.getElementById('map-btn');
const roomLabel = document.getElementById('room');
const minimap = new Minimap(document.getElementById('map'), document.getElementById('atlas-map'));
initTouch(player, canvas, document.getElementById('stick'));

// Phones and tablets have no pointer lock (iOS Safari lacks the API entirely), so they get
// an on-screen joystick and drag-to-look instead of mouse capture.
let touchMode = matchMedia('(pointer: coarse)').matches || !canvas.requestPointerLock;
const setTouchMode = (on) => document.body.classList.toggle('touch', (touchMode = on));
setTouchMode(touchMode);
// Touchscreen laptops: switch over the first time a finger is used.
window.addEventListener('pointerdown', (e) => e.pointerType === 'touch' && setTouchMode(true), true);

function enter() {
  if (touchMode) overlay.classList.add('hidden');
  else player.lock();
}
document.getElementById('start').addEventListener('click', enter);
document.getElementById('credit').textContent = `${attribution} · Sounds: freesound.org (CC0)`;

// Getting in and out of the cars: E on a keyboard, or the button that appears beside a car.
const actBtn = document.getElementById('act');
const viewBtn = document.getElementById('view');
function riding() {
  return heli.craft || garage.car;
}
function toggleRide() {
  if (heli.craft) return heli.toggle();
  if (garage.car) return garage.toggle();
  const h = heli.nearby();
  const c = garage.nearby();
  if (h && (!c || Math.hypot(player.pos.x - h.x, player.pos.z - h.z) <= Math.hypot(player.pos.x - c.x, player.pos.z - c.z))) {
    return heli.enter();
  }
  return garage.toggle();
}
function toggleView() {
  if (heli.craft) heli.toggleView();
  else garage.toggleView();
}
actBtn.addEventListener('click', () => toggleRide());
viewBtn.addEventListener('click', () => toggleView());
document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyE') toggleRide();
  if (e.code === 'KeyC') toggleView();
});
const climbBtn = document.getElementById('climb');
const downBtn = document.getElementById('down');
const hold = (btn, dir) => {
  const set = (on) => { heli.touchClimb = on ? dir : (heli.touchClimb === dir ? 0 : heli.touchClimb); };
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); set(true); });
  btn.addEventListener('pointerup', () => set(false));
  btn.addEventListener('pointerleave', () => set(false));
  btn.addEventListener('pointercancel', () => set(false));
};
hold(climbBtn, 1);
hold(downBtn, -1);
function updateCarButtons() {
  const nearHeli = !riding() && heli.nearby();
  const nearCar = !riding() && garage.nearby();
  const label = heli.craft
    ? (heli.heli.airborne ? 'Land to get out' : 'Get out')
    : garage.car
      ? 'Get out'
      : nearHeli
        ? 'Fly the helicopter'
        : nearCar
          ? `Drive the ${nearCar.name}`
          : '';
  actBtn.hidden = !label;
  viewBtn.hidden = !riding();
  climbBtn.hidden = downBtn.hidden = !(heli.craft && touchMode);
  if (label && actBtn.dataset.label !== label) actBtn.firstElementChild.textContent = actBtn.dataset.label = label;
}

// Sound can only start from a tap, click or key press; M or the button on the start card mutes it.
const sound = new Sound();
for (const type of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, () => sound.unlock(), true);
document.addEventListener('visibilitychange', () => sound.pause(document.hidden));
const soundBtn = document.getElementById('sound');
function toggleSound() {
  sound.setMuted(!sound.muted);
  soundBtn.textContent = sound.muted ? 'Unmute sound' : 'Mute sound'; // names what a press will do
}
soundBtn.addEventListener('click', toggleSound);
document.addEventListener('keydown', (e) => e.code === 'KeyM' && !e.repeat && toggleSound());

document.getElementById('menu').addEventListener('click', () => overlay.classList.remove('hidden'));
canvas.addEventListener('click', () => {
  if (minimap.wide) return;
  touchMode || player.lock();
});
player.onLockChange = (locked) => {
  if (minimap.wide) overlay.classList.add('hidden');
  else overlay.classList.toggle('hidden', locked);
};

let overlayHeld = false;
function openAtlas() {
  overlayHeld = !overlay.classList.contains('hidden');
  overlay.classList.add('hidden');
  if (player.locked) document.exitPointerLock();
  minimap.wide = true;
  atlas.classList.remove('hidden');
  mapBtn.setAttribute('aria-expanded', 'true');
  mapBtn.setAttribute('aria-label', 'Close larger map');
  minimap.resize();
  document.getElementById('atlas-close').focus();
}
function closeAtlas() {
  minimap.wide = false;
  atlas.classList.add('hidden');
  mapBtn.setAttribute('aria-expanded', 'false');
  mapBtn.setAttribute('aria-label', 'Open larger map');
  player.keys.clear();
  if (overlayHeld) overlay.classList.remove('hidden');
  overlayHeld = false;
  mapBtn.blur();
}
mapBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (minimap.wide) closeAtlas();
  else openAtlas();
});
document.getElementById('atlas-close').addEventListener('click', (e) => {
  e.stopPropagation();
  closeAtlas();
});
atlas.addEventListener('click', (e) => {
  if (e.target === atlas) closeAtlas();
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && minimap.wide) {
    e.preventDefault();
    closeAtlas();
  }
});

const ROOMS = [
  // [name, x0, x1, z0, z1, floor]  (first match wins)
  ['Stair hall', -9, -3.6, -2, 3.4, 0], ['Stair landing', -9, -3.6, -2, 3.4, 1],
  ['Guest bedroom', -9, -3.6, 7, 12.5, 0], ['Guest bath', -3.6, -0.4, 9.2, 12, 0], ['Vestibule', -3.6, -0.4, 7, 9.2, 0],
  ['Pool bedroom', -9, -3.6, -13, -7.5, 0], ['Bath', -9, -6, -7.5, -2, 0], ['Closet', -6, -3.6, -5.5, -2, 0], ['Hall', -6, -3.6, -7.5, -5.5, 0],
  ['Foyer', -0.4, 3, 3.4, 12, 0], ['Dining', -3.6, 3, -2.5, 3.4, 0], ['Living room', -3.6, 3, -8, -2.5, 0],
  ['Kitchen', 3, 8, -9.5, -2.5, 0], ['Pantry', 3, 8, -2.5, -0.2, 0], ['Powder room', 8, 10.5, -2.5, -0.2, 0],
  ['Gym', 8, 12, -9.5, -2.5, 0], ['Service hall', 3, 12, -2.5, 1.8, 0], ['Games room', 3, 8, 1.8, 7.5, 0], ['Office', 8, 12, 1.8, 7.5, 0],
  ['Covered terrace', -3.6, 8.6, -14.9, -8, 0], ['Carport', 3, 14.6, 7.5, 15.2, 0], ['Entry porch', -1.2, 3, 12, 14.4, 0],
  ['Pool', -2.5, 8.5, -22, -16, 0], ['Gazebo', -9.3, -5.5, -19.1, -15.3, 0], ['Fire pit', 9.5, 13.9, -22.3, -17.5, 0],
  ['Upstairs lounge', -3.6, 3, -2.5, 3.4, 1], ['Gallery', -0.4, 3, 3.4, 5.5, 1], ['Corridor', 3, 12, -1.4, 0.6, 1],
  ['Master bedroom', 3, 8.2, -8, -1.4, 1], ['Master bath', 8.2, 12, -8, -4.6, 1], ['Master closet', 8.2, 12, -4.6, -1.4, 1],
  ['Master balcony', 3, 12, -9.5, -8, 1], ['Bedroom 3', 3, 8.5, 0.6, 7.5, 1], ['Bath 3', 8.5, 12, 0.6, 4, 1], ['Closet 3', 8.5, 12, 4, 7.5, 1],
];
// Everywhere under the roof and behind glass; the rest of ROOMS (terrace, carport, pool...) is open air.
const OPEN_AIR = ['Covered terrace', 'Carport', 'Entry porch', 'Pool', 'Gazebo', 'Fire pit', 'Master balcony'];
const INDOORS = new Set(['Stairs', 'Second floor', ...ROOMS.map((r) => r[0]).filter((name) => !OPEN_AIR.includes(name))]);

function currentRoom() {
  const { x, y, z } = player.pos;
  if (heli.craft || y > H.grade + 4) return streetAt(x, z) || 'Los Reyes';
  const floor = y > 2.4 ? 1 : 0;
  const onStairs = x > -9 && x < -6.3 && z > -2 && z < 1.5 && y > 0.1 && y < 3.25;
  if (onStairs) return 'Stairs';
  for (const [name, x0, x1, z0, z1, f] of ROOMS) {
    if (f === floor && x >= x0 && x <= x1 && z >= z0 && z <= z1) return name;
  }
  if (floor === 1) return 'Second floor';
  return streetAt(x, z) || (pointInPolygon(x, z, LOT) ? 'Garden' : 'Los Reyes');
}

// Places to jump to, from the buttons on the start card or number keys 1-8.
const SPOTS = [
  ['Street', 1.2, H.grade, 19, 0],
  ['Foyer', 1.3, 0, 10.5, 0],
  ['Living room', 0.5, 0, -1, 0],
  ['Stairs', -5, 0, 2.6, Math.PI / 2],
  ['Upstairs lounge', -1, H.f2, 1, Math.PI],
  ['Master bedroom', 6.5, H.f2, -3, 0],
  ['Terrace', 2, 0, -12.5, Math.PI], // looking back at the house
  ['Cars', 9.5, H.grade, 17.5, 0.35],
  ['Helicopter', PAD.x + 0.4, H.grade, PAD.z - 2.2, Math.PI],
];
const places = document.getElementById('places');
SPOTS.forEach(([name, ...spot], i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = name;
  const go = () => {
    garage.recall(); // step out of any car, and bring cars left out on the estate back home
    heli.recall();
    player.teleport(...spot);
  };
  b.addEventListener('click', () => {
    go();
    enter();
  });
  places.append(b);
  document.addEventListener('keydown', (e) => e.code === `Digit${i + 1}` && go());
});

// Portrait phones get a taller field of view so the view never narrows below the landscape one.
function fitCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  camera.fov = Math.min(100, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(34)) / Math.min(1, aspect))));
  camera.updateProjectionMatrix();
}
fitCamera();
window.addEventListener('resize', () => {
  fitCamera();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Loop ------------------------------------------------------------------
const clock = new THREE.Clock();
let lastRoom = '';
renderer.shadowMap.autoUpdate = false;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  parked.update();
  traffic.update(dt);
  if (minimap.wide) {
    if (heli.craft) heli.heli.spin(dt, heli.heli.airborne ? 1 : 0.1);
  } else if (heli.craft) heli.update(dt);
  else {
    heli.heli.spin(dt, 0.1);
    if (garage.car) garage.update(dt);
    else player.update(dt);
  }
  updateDoors(player.pos, dt);
  focusShadows(player.pos);
  updateCarButtons();
  const place = currentRoom();
  sound.update(dt, !INDOORS.has(place), garage, heli);
  const yaw = heli.craft
    ? heli.heli.heading - Math.PI / 2
    : garage.car
      ? garage.car.heading - Math.PI / 2
      : player.yaw;
  minimap.draw(dt, player.pos.x, player.pos.z, yaw, garage, heli);
  const speed = heli.craft
    ? Math.hypot(heli.heli.speed, heli.heli.vy)
    : garage.car
      ? Math.abs(garage.car.speed)
      : 0;
  const room = heli.craft
    ? `${place} · ${Math.round(heli.heli.y - H.grade)} m · ${Math.round(speed * 3.6)} km/h`
    : garage.car
      ? `${place} · ${Math.round(speed * 3.6)} km/h`
      : place;
  if (room !== lastRoom) {
    roomLabel.textContent = room;
    lastRoom = room;
  }
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

// Exposed for debugging / automated checks from the console.
window.__house = { scene, camera, renderer, player, garage, traffic, parked, heli, sound, world, colliders, doors, THREE };
// Debug camera: __house.cam(x, y, z, lookX, lookY, lookZ) parks a free camera; __house.walk() resumes walking.
const walkUpdate = player.update.bind(player);
window.__house.cam = (x, y, z, tx, ty, tz) => {
  overlay.classList.add('hidden');
  player.update = () => {};
  camera.position.set(x, y, z);
  camera.lookAt(tx, ty, tz);
};
window.__house.walk = () => {
  player.update = walkUpdate;
};
