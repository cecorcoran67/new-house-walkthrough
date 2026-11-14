// Builds src/map.json: the Los Reyes street network, boundary and landscape from OpenStreetMap,
// projected into the house's coordinate system (metres; +z = toward the street, +x = right
// when facing the house from the street, origin = the house model's origin).
//
//   node scripts/build-map.mjs            fetch from the Overpass API
//   MAP_CACHE=dir node scripts/build-map.mjs   reuse/store the raw responses in dir
//
// Map data © OpenStreetMap contributors (ODbL).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const REF = { lat: 9.9454399, lon: -84.2798091 }; // projection reference (Google Maps view centre supplied by the owner)
const BEARING = 79; // compass bearing the lot faces (its street side), from the lot's side boundaries
const OFFSET = [10.0, 35.45]; // puts the lot's street edge at z = 17.6 and centres the house across the lot
const OUR_LOT = '6b-24';
// Lots in the house's sector with nothing built on them yet (from aerial imagery, Nov 2026).
const VACANT = new Set([2, 3, 12, 13, 14, 19, 21, 23, 28, 39, 41, 43, 45, 47, 52, 56, 62, 64, 66].map((n) => `6b-${n}`));
const BBOX = '9.9325,-84.2865,9.9590,-84.2595';
const BOUNDARY_REL = 18322769;
const ROAD_WIDTH = { residential: 7, unclassified: 7, living_street: 6, service: 4.5, track: 3.5 };
const MIRRORS = ['https://overpass-api.de', 'https://overpass.kumi.systems', 'https://overpass.private.coffee'];

async function overpass(name, query) {
  const cache = process.env.MAP_CACHE && `${process.env.MAP_CACHE}/${name}.json`;
  if (cache && existsSync(cache)) return JSON.parse(await readFile(cache, 'utf8')).elements;
  for (let attempt = 0; attempt < 9; attempt++) {
    try {
      const res = await fetch(`${MIRRORS[attempt % MIRRORS.length]}/api/interpreter`, {
        method: 'POST',
        headers: { 'User-Agent': 'new-house-walkthrough/1.0' },
        body: new URLSearchParams({ data: query }),
      });
      const text = await res.text();
      if (text.startsWith('{')) {
        if (cache) await writeFile(cache, text);
        return JSON.parse(text).elements;
      }
    } catch { /* try the next mirror */ }
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  throw new Error(`Overpass query "${name}" failed on every mirror`);
}

// ---- Projection ------------------------------------------------------------------------
const MX = 111320 * Math.cos((REF.lat * Math.PI) / 180);
const MY = 110574;
const B = (BEARING * Math.PI) / 180;
const r1 = (v) => Math.round(v * 10) / 10;
function project({ lat, lon }) {
  const e = (lon - REF.lon) * MX;
  const n = (lat - REF.lat) * MY;
  return [r1(-e * Math.cos(B) + n * Math.sin(B) + OFFSET[0]), r1(e * Math.sin(B) + n * Math.cos(B) + OFFSET[1])];
}
const line = (geometry) => geometry.map(project);
const flat = (pts) => pts.flat();

// Joins way fragments end-to-end into rings.
function rings(ways) {
  const parts = ways.map((w) => [...w]);
  const out = [];
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.6;
  while (parts.length) {
    const ring = parts.shift();
    for (let grew = true; grew && !near(ring[0], ring.at(-1));) {
      grew = false;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (near(ring.at(-1), p[0])) ring.push(...p.slice(1));
        else if (near(ring.at(-1), p.at(-1))) ring.push(...p.reverse().slice(1));
        else if (near(ring[0], p.at(-1))) ring.unshift(...p.slice(0, -1));
        else if (near(ring[0], p[0])) ring.unshift(...p.reverse().slice(0, -1));
        else continue;
        parts.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (near(ring[0], ring.at(-1))) ring.pop(); // rings are stored open; the last point joins the first
    out.push(ring);
  }
  return out;
}

function inside([x, z], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[j];
    if (z1 > z !== z2 > z && x < ((x2 - x1) * (z - z1)) / (z2 - z1) + x1) c = !c;
  }
  return c;
}
function distToRing([x, z], poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j];
    const dx = poly[i][0] - ax;
    const dz = poly[i][1] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
}

// ---- Build -----------------------------------------------------------------------------
if (process.env.MAP_CACHE) await mkdir(process.env.MAP_CACHE, { recursive: true });
const [rel] = await overpass('boundary', `[out:json][timeout:80];rel(${BOUNDARY_REL});out geom;`);
const kinds = ['highway', 'building', 'leisure', 'natural', 'landuse'];
const elements = await overpass('features', `[out:json][timeout:120];(${kinds.map((k) => `way["${k}"](${BBOX});`).join('')}relation["leisure"="golf_course"](${BBOX}););out geom;`);

// The mapped boundary has a gap; rings() leaves it as one open chain, which closes with a straight edge.
const boundary = rings(rel.members.filter((m) => m.type === 'way').map((m) => line(m.geometry)))
  .sort((a, b) => b.length - a.length)[0];
const nearSite = (pts, margin) => pts.some((p) => inside(p, boundary) || distToRing(p, boundary) < margin);

const roads = [];
const lots = [];
const areas = [];
let lot = null;
const AREA = { park: 'park', garden: 'park', playground: 'park', pitch: 'pitch', water: 'water', wood: 'wood', scrub: 'wood', grass: 'park' };
for (const el of elements) {
  const t = el.tags || {};
  if (el.type === 'relation') {
    const outers = el.members.filter((m) => m.type === 'way' && m.role !== 'inner').map((m) => line(m.geometry));
    for (const ring of rings(outers)) if (ring.length > 2) areas.push({ k: 'golf', p: flat(ring) });
    continue;
  }
  if (!el.geometry) continue;
  const pts = line(el.geometry);
  if (t.highway) {
    const w = ROAD_WIDTH[t.highway];
    if (w && nearSite(pts, 25)) roads.push({ n: t.name || '', w, p: flat(pts) });
  } else if (t.building) {
    // In this sector the mapped "buildings" are the surveyed lots, named by lot number.
    if (!/^6b/i.test(t.name || '')) continue;
    const name = t.name.toLowerCase().replace(/^6b-?/, '6b-');
    pts.pop();
    if (name === OUR_LOT) lot = flat(pts);
    else lots.push({ n: name, v: VACANT.has(name) ? 1 : 0, p: flat(pts) });
  } else {
    const k = AREA[t.leisure] || AREA[t.natural] || AREA[t.landuse];
    if (!k || pts.length < 4 || !nearSite(pts, 0)) continue;
    pts.pop();
    areas.push({ k, p: flat(pts) });
  }
}
if (!lot) throw new Error(`Lot ${OUR_LOT} not found`);

const map = { attribution: 'Map data © OpenStreetMap contributors', lot, boundary: flat(boundary), roads, lots, areas };
await writeFile(new URL('../src/map.json', import.meta.url), JSON.stringify(map));
console.log(`roads ${roads.length}, lots ${lots.length}, areas ${areas.length}, boundary points ${boundary.length}`);
