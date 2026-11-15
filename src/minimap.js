import { ROADS, AREAS, FENCE, LOT, AREA_COLOR } from './world.js';
import { COAST_AREAS, BEACHES } from './coast.js';

// Round map in the corner of the HUD. You sit at the centre and the way you are facing (or the
// car's nose) is up; an N on the rim shows north and a dot on the rim points home once the
// house is off the map. Clicking it opens a larger copy. Colours come from the HUD tokens.

const NORTH = (11 * Math.PI) / 180; // true north lies this far round from +x toward +z (see scripts/build-map.mjs)
const WALK_RANGE = 70; // metres from the centre to the rim on foot
const DRIVE_RANGE = 150; // ...and in a car, widening further with speed
const FLY_RANGE = 520;
const WIDE_WALK = 520;
const WIDE_DRIVE = 720;
const WIDE_FLY = 2400;

const box = (pts) => ({
  x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])),
  z0: Math.min(...pts.map((p) => p[1])), z1: Math.max(...pts.map((p) => p[1])),
});
const areas = [...AREAS, ...COAST_AREAS].map((a) => ({ pts: a.pts, box: box(a.pts), color: `#${AREA_COLOR[a.kind].toString(16).padStart(6, '0')}` }));
const roads = new Map(); // width -> roads, so each width is one stroke
for (const r of ROADS) roads.set(r.w, [...(roads.get(r.w) || []), { pts: r.pts, box: box(r.pts) }]);
const home = [(LOT[0][0] + LOT[2][0]) / 2, (LOT[0][1] + LOT[2][1]) / 2];

function wantRange(garage, heli, wide) {
  if (heli?.craft) return (wide ? WIDE_FLY : FLY_RANGE) + Math.abs(heli.craft.speed) * (wide ? 8 : 6);
  if (garage.car) return (wide ? WIDE_DRIVE : DRIVE_RANGE) + Math.abs(garage.car.speed) * (wide ? 8 : 5);
  return wide ? WIDE_WALK : WALK_RANGE;
}

export class Minimap {
  constructor(canvas, wideCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.wideCanvas = wideCanvas;
    this.wideCtx = wideCanvas.getContext('2d');
    this.range = WALK_RANGE;
    this.wide = false;
    const css = getComputedStyle(document.documentElement);
    const token = (name) => css.getPropertyValue(name).trim();
    this.fg = token('--hud-fg');
    this.muted = token('--hud-muted');
    this.accent = token('--hud-accent');
    this.ink = token('--hud-accent-fg');
    this.fontFamily = token('--hud-font');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.size = this.canvas.clientWidth;
    this.dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = this.canvas.height = Math.round(this.size * this.dpr);
    this.wideSize = this.wideCanvas.clientWidth;
    this.wideCanvas.width = this.wideCanvas.height = Math.round(this.wideSize * this.dpr);
  }

  /** Draw the map around (x, z) with `yaw` facing up. `garage` / `heli` set the zoom when you are driving or flying. */
  draw(dt, x, z, yaw, garage, heli, extras = {}) {
    const want = wantRange(garage, heli, false);
    this.range += (want - this.range) * Math.min(1, dt * 2);
    this.paint(this.ctx, this.size, this.range, x, z, yaw, heli, extras);
    if (this.wide) this.paint(this.wideCtx, this.wideSize, wantRange(garage, heli, true), x, z, yaw, heli, extras);
  }

  /** World x/z under a click on the large map, or null if the click missed the disc. */
  pick(e, x, z, yaw, garage, heli) {
    const rect = this.wideCanvas.getBoundingClientRect();
    const size = rect.width;
    const cx = e.clientX - rect.left - size / 2;
    const cy = e.clientY - rect.top - size / 2;
    if (Math.hypot(cx, cy) > size / 2 - 4) return null;
    const range = wantRange(garage, heli, true);
    const s = size / 2 / range;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const mx = cx / s;
    const my = cy / s;
    return { x: x + mx * cos + my * sin, z: z - mx * sin + my * cos };
  }

  paint(ctx, size, range, x, z, yaw, heli, extras = {}) {
    if (!size) return;
    const { dpr } = this;
    const R = size / 2;
    const s = R / range; // pixels per metre
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const seen = (b) => b.x1 > x - range && b.x0 < x + range && b.z1 > z - range && b.z0 < z + range;
    const trace = (pts) => pts.forEach(([px, pz], i) => (i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz)));
    const toScreen = (dx, dz) => [(dx * cos - dz * sin) * s, (dx * sin + dz * cos) * s];
    const mark = Math.max(7, size * 0.022);
    const pin = Math.max(4, size * 0.014);

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
    ctx.beginPath();
    trace(LOT);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle = this.accent;
    ctx.lineWidth = 2 / s;
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
    const pad = heli?.heli;
    if (pad && heli.craft !== pad) {
      ctx.save();
      ctx.translate(pad.x, pad.z);
      ctx.rotate(-pad.heading);
      ctx.fillStyle = this.accent;
      ctx.strokeStyle = this.ink;
      ctx.lineWidth = 1.5 / s;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-4, 3.5);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-4, -3.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    ctx.translate(R, R);
    if (pad && heli.craft !== pad) {
      const [px, py] = toScreen(pad.x - x, pad.z - z);
      const farH = Math.hypot(px, py);
      if (farH > R - pin * 2) {
        ctx.beginPath();
        ctx.arc((px / farH) * (R - pin * 2.2), (py / farH) * (R - pin * 2.2), pin, 0, Math.PI * 2);
        ctx.fillStyle = this.accent;
        ctx.fill();
        ctx.strokeStyle = this.ink;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    const rim = (wx, wz, r, fill) => {
      const [sx, sy] = toScreen(wx - x, wz - z);
      const dist = Math.hypot(sx, sy);
      if (dist <= R - pin * 2.4) return;
      ctx.beginPath();
      ctx.arc((sx / dist) * (R - pin * 2.2), (sy / dist) * (R - pin * 2.2), r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = this.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };
    rim(home[0], home[1], pin * 1.25, this.accent);
    for (const b of BEACHES) rim(b.x, b.z, pin, this.muted);
    const wp = extras.waypoint;
    if (wp) {
      const [wx, wy] = toScreen(wp.x - x, wp.z - z);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(wx, wy);
      ctx.strokeStyle = this.accent;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(wx, wy, pin * 1.4, 0, Math.PI * 2);
      ctx.fillStyle = this.accent;
      ctx.fill();
      ctx.strokeStyle = this.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (extras.souvenirs) {
      ctx.fillStyle = this.accent;
      for (const s of extras.souvenirs) {
        const [sx, sy] = toScreen(s.x - x, s.z - z);
        if (sx * sx + sy * sy > (R - 4) ** 2) continue;
        ctx.beginPath();
        ctx.arc(sx, sy, pin * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const [nx, ny] = toScreen(Math.cos(NORTH) * range, Math.sin(NORTH) * range);
    ctx.font = `600 ${Math.max(12, Math.round(size * 0.038))}px ${this.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.ink;
    ctx.strokeText('N', (nx / R) * (R - pin * 3), (ny / R) * (R - pin * 3));
    ctx.fillStyle = this.fg;
    ctx.fillText('N', (nx / R) * (R - pin * 3), (ny / R) * (R - pin * 3));
    ctx.beginPath();
    ctx.moveTo(0, -mark);
    ctx.lineTo(mark * 0.75, mark * 0.88);
    ctx.lineTo(0, mark * 0.44);
    ctx.lineTo(-mark * 0.75, mark * 0.88);
    ctx.closePath();
    ctx.fillStyle = this.accent;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = this.ink;
    ctx.stroke();
  }
}
