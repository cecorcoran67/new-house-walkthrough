import { ROADS, AREAS, FENCE, LOT, AREA_COLOR } from './world.js';

// Round map in the corner of the HUD. You sit at the centre and the way you are facing (or the
// car's nose) is up; an N on the rim shows north and a dot on the rim points home once the
// house is off the map. Colours come from the HUD tokens and the landscape's own colours.

const NORTH = (11 * Math.PI) / 180; // true north lies this far round from +x toward +z (see scripts/build-map.mjs)
const WALK_RANGE = 70; // metres from the centre to the rim on foot
const DRIVE_RANGE = 150; // ...and in a car, widening further with speed

const box = (pts) => ({
  x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])),
  z0: Math.min(...pts.map((p) => p[1])), z1: Math.max(...pts.map((p) => p[1])),
});
const areas = AREAS.map((a) => ({ pts: a.pts, box: box(a.pts), color: `#${AREA_COLOR[a.kind].toString(16).padStart(6, '0')}` }));
const roads = new Map(); // width -> roads, so each width is one stroke
for (const r of ROADS) roads.set(r.w, [...(roads.get(r.w) || []), { pts: r.pts, box: box(r.pts) }]);
const home = [(LOT[0][0] + LOT[2][0]) / 2, (LOT[0][1] + LOT[2][1]) / 2];

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.range = WALK_RANGE;
    const css = getComputedStyle(document.documentElement);
    const token = (name) => css.getPropertyValue(name).trim();
    this.fg = token('--hud-fg');
    this.muted = token('--hud-muted');
    this.accent = token('--hud-accent');
    this.ink = token('--hud-accent-fg');
    this.font = `600 12px ${token('--hud-font')}`;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.size = this.canvas.clientWidth;
    this.dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = this.canvas.height = Math.round(this.size * this.dpr);
  }

  /** Draw the map around (x, z) with `yaw` facing up. `garage` supplies the cars. */
  draw(dt, x, z, yaw, garage) {
    const { ctx, size, dpr, range } = this;
    const R = size / 2;
    const want = garage.car ? DRIVE_RANGE + Math.abs(garage.car.speed) * 5 : WALK_RANGE;
    this.range += (want - range) * Math.min(1, dt * 2);
    const s = R / range; // pixels per metre
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const seen = (b) => b.x1 > x - range && b.x0 < x + range && b.z1 > z - range && b.z0 < z + range;
    const trace = (pts) => pts.forEach(([px, pz], i) => (i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz)));
    /** Offset on the canvas, from the centre, of a point (dx, dz) metres away. */
    const toScreen = (dx, dz) => [(dx * cos - dz * sin) * s, (dx * sin + dz * cos) * s];

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(yaw);
    ctx.scale(s, s);
    ctx.translate(-x, -z);
    ctx.lineJoin = ctx.lineCap = 'round';

    for (const a of areas) {
      if (!seen(a.box)) continue;
      ctx.beginPath();
      trace(a.pts);
      ctx.fillStyle = a.color;
      ctx.fill();
    }
    ctx.beginPath();
    trace(FENCE);
    ctx.closePath();
    ctx.strokeStyle = this.muted;
    ctx.lineWidth = 2 / s;
    ctx.stroke();
    ctx.strokeStyle = this.fg;
    for (const [width, group] of roads) {
      ctx.beginPath();
      for (const r of group) if (seen(r.box)) trace(r.pts);
      ctx.lineWidth = Math.max(width, 2 / s);
      ctx.stroke();
    }
    // The house's lot: outlined and lightly tinted, so the arrow still shows when you are on it
    ctx.beginPath();
    trace(LOT);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle = this.accent;
    ctx.lineWidth = 2 / s;
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
    // Parked cars, drawn no smaller than a few pixels
    ctx.fillStyle = this.fg;
    ctx.strokeStyle = this.ink;
    ctx.lineWidth = 1 / s;
    for (const car of garage.cars) {
      if (car === garage.car) continue;
      const l = Math.max(car.spec.L, 6 / s);
      const w = Math.max(car.spec.W, 3.5 / s);
      ctx.save();
      ctx.translate(car.x, car.z);
      ctx.rotate(-car.heading);
      ctx.fillRect(-l / 2, -w / 2, l, w);
      ctx.strokeRect(-l / 2, -w / 2, l, w);
      ctx.restore();
    }
    ctx.restore();

    ctx.translate(R, R);
    // Home, pinned to the rim when it is off the map
    const [hx, hy] = toScreen(home[0] - x, home[1] - z);
    const far = Math.hypot(hx, hy);
    if (far > R - 10) {
      ctx.beginPath();
      ctx.arc((hx / far) * (R - 9), (hy / far) * (R - 9), 5, 0, Math.PI * 2);
      ctx.fillStyle = this.accent;
      ctx.fill();
      ctx.strokeStyle = this.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    const [nx, ny] = toScreen(Math.cos(NORTH) * range, Math.sin(NORTH) * range);
    ctx.font = this.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.ink;
    ctx.strokeText('N', (nx / R) * (R - 12), (ny / R) * (R - 12));
    ctx.fillStyle = this.fg;
    ctx.fillText('N', (nx / R) * (R - 12), (ny / R) * (R - 12));
    // You
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fillStyle = this.accent;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = this.ink;
    ctx.stroke();
  }
}
