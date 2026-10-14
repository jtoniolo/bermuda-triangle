// PROTOTYPE — throwaway. Round 2 geometry: an Area stores its corners. Lengths and angles come from the corners.
//
// Corner i is the start of Edge i. Edge i goes from corner i to corner i + 1.
// The angle at corner i is the interior angle between Edge i - 1 and Edge i.
// All corners are in one coordinate system for the Floor, in meters. y points down (screen order).

import polygonClipping from "polygon-clipping";

export type Pt = { x: number; y: number };
export type EdgeKind = "wall" | "open";
export type Unit = "metric" | "imperial";
export type Area = { id: string; name: string; corners: Pt[]; kinds: EdgeKind[] };

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
export const mod = (i: number, n: number) => ((i % n) + n) % n;
export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const unit = (a: Pt): Pt => mul(a, 1 / (Math.hypot(a.x, a.y) || 1));
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;

export function signedArea(p: Pt[]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += cross(p[i], p[(i + 1) % p.length]);
  return s / 2;
}

export function edgeLength(c: Pt[], i: number) {
  return dist(c[i], c[mod(i + 1, c.length)]);
}

export function cornerAngle(c: Pt[], i: number) {
  const n = c.length;
  const din = sub(c[i], c[mod(i - 1, n)]);
  const dout = sub(c[mod(i + 1, n)], c[i]);
  let turn = deg(Math.atan2(dout.y, dout.x) - Math.atan2(din.y, din.x));
  while (turn > 180) turn -= 360;
  while (turn <= -180) turn += 360;
  return 180 - turn;
}

// Intersection of the line through p with direction d, and the line through q with direction e.
function intersect(p: Pt, d: Pt, q: Pt, e: Pt): Pt | null {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(q, p), e) / den;
  return add(p, mul(d, t));
}

// Type a length: the far end of Edge i moves along Edge i. Edge i + 1 keeps its direction.
// Corner i + 2 slides along Edge i + 2. All angles stay the same.
export function setLength(c: Pt[], i: number, L: number): Pt[] | null {
  const n = c.length;
  const i1 = mod(i + 1, n), i2 = mod(i + 2, n), i3 = mod(i + 3, n);
  const newC1 = add(c[i], mul(unit(sub(c[i1], c[i])), L));
  const newC2 = intersect(newC1, sub(c[i2], c[i1]), c[i3], sub(c[i3], c[i2]));
  if (!newC2) return null;
  const out = [...c];
  out[i1] = newC1;
  out[i2] = newC2;
  return out;
}

// Type an angle at corner k: Edge k turns around corner k. Corner k + 1 slides along Edge k + 1.
export function setAngle(c: Pt[], k: number, angleDeg: number): Pt[] | null {
  const n = c.length;
  const kp = mod(k - 1, n), k1 = mod(k + 1, n), k2 = mod(k + 2, n);
  const din = sub(c[k], c[kp]);
  const h = Math.atan2(din.y, din.x) + rad(180 - angleDeg);
  const dir = { x: Math.cos(h), y: Math.sin(h) };
  const newC1 = intersect(c[k], dir, c[k2], sub(c[k2], c[k1]));
  if (!newC1 || dist(newC1, c[k]) < 1e-6) return null;
  // reject a result where the corner jumps to the far side (the Edge would point backwards)
  if ((newC1.x - c[k].x) * dir.x + (newC1.y - c[k].y) * dir.y <= 0) return null;
  const out = [...c];
  out[k1] = newC1;
  return out;
}

// Drag Edge i parallel to itself by offset t (meters, along its outward normal).
// Its two end corners slide along the Edges next to them. All angles stay the same.
export function moveEdge(c: Pt[], i: number, t: number): Pt[] | null {
  const n = c.length;
  const i0 = i, i1 = mod(i + 1, n), ip = mod(i - 1, n), i2 = mod(i + 2, n);
  const d = sub(c[i1], c[i0]);
  const nrm = outwardNormal(c[i0], c[i1]);
  const p = add(c[i0], mul(nrm, t));
  const a = intersect(p, d, c[ip], sub(c[i0], c[ip]));
  const b = intersect(p, d, c[i2], sub(c[i1], c[i2]));
  if (!a || !b) return null;
  const out = [...c];
  out[i0] = a;
  out[i1] = b;
  return out;
}

// Unit normal that points out of the Area (the corners have a positive signed area).
export function outwardNormal(a: Pt, b: Pt): Pt {
  const u = unit(sub(b, a));
  return { x: u.y, y: -u.x };
}

export function selfIntersects(p: Pt[]) {
  const n = p.length;
  const o = (a: Pt, b: Pt, c: Pt) => Math.sign(cross(sub(b, a), sub(c, a)));
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = p[i], b = p[(i + 1) % n], c = p[j], d = p[(j + 1) % n];
      if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return true;
    }
  return false;
}

export function pointInPolygon(pt: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distToSegment(p: Pt, a: Pt, b: Pt) {
  const d = sub(b, a);
  const l2 = d.x * d.x + d.y * d.y || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / l2));
  return dist(p, add(a, mul(d, t)));
}

// Remove repeated corners and corners on a straight line.
function clean(p: Pt[]): Pt[] {
  let out = p.filter((c, i) => dist(c, p[(i + 1) % p.length]) > 1e-6);
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[mod(i - 1, out.length)], b = out[i], c = out[mod(i + 1, out.length)];
      if (Math.abs(cross(sub(b, a), sub(c, b))) < 1e-6 && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) > 0) {
        out = out.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return out;
}

export function normalize(p: Pt[]): Pt[] {
  const c = clean(p);
  return signedArea(c) < 0 ? c.reverse() : c;
}

let nextId = 1;
export const newId = () => `area-${nextId++}`;

// Add a new shape. An Area that overlaps or touches it merges with it into one Area.
// After the merge, an Edge stays an Open edge if it is on an old Open edge. All other Edges are Walls.
export function addShape(areas: Area[], shape: Pt[]): { areas: Area[]; id: string } {
  const s = normalize(shape);
  const touches = (a: Area) => {
    const inter = polygonClipping.intersection([ring(a.corners)], [ring(grow(s, 1e-4))]);
    return inter.length > 0;
  };
  const hit = areas.filter(touches);
  const rest = areas.filter((a) => !hit.includes(a));
  if (hit.length === 0) {
    const a: Area = { id: newId(), name: `Area ${nextId - 1}`, corners: s, kinds: s.map(() => "wall") };
    return { areas: [...rest, a], id: a.id };
  }
  const merged = polygonClipping.union([ring(s)], ...hit.map((a) => [ring(a.corners)]));
  // A hole is not supported in this prototype: only the outer ring of each part is kept.
  // Shapes that touch only at one corner stay separate parts, so each part becomes its own Area.
  const openEdges = hit
    .flatMap((a) => a.corners.map((c, i) => ({ a: c, b: a.corners[mod(i + 1, a.corners.length)], k: a.kinds[i] })))
    .filter((e) => e.k === "open");
  const parts: Area[] = merged.map((poly, idx) => {
    const corners = normalize(poly[0].slice(0, -1).map(([x, y]) => ({ x, y })));
    const kinds: EdgeKind[] = corners.map((c, i) => {
      const m = mul(add(c, corners[mod(i + 1, corners.length)]), 0.5);
      return openEdges.some((e) => distToSegment(m, e.a, e.b) < 1e-4) ? "open" : "wall";
    });
    return idx === 0
      ? { id: hit[0].id, name: hit[0].name, corners, kinds }
      : { id: newId(), name: `Area ${nextId - 1}`, corners, kinds };
  });
  return { areas: [...rest, ...parts], id: parts[0].id };
}

function ring(p: Pt[]): [number, number][] {
  return [...p, p[0]].map((c) => [c.x, c.y]);
}

// Make a shape a little larger, so that a shape that only touches an Area counts as an overlap.
function grow(p: Pt[], e: number): Pt[] {
  const cx = p.reduce((s, c) => s + c.x, 0) / p.length;
  const cy = p.reduce((s, c) => s + c.y, 0) / p.length;
  return p.map((c) => {
    const v = unit({ x: c.x - cx, y: c.y - cy });
    return { x: c.x + v.x * e, y: c.y + v.y * e };
  });
}

// Snap a point: to 0.1 m, then to the x or the y of a near corner, then onto a near corner. Alt turns snapping off.
export function snapPoint(p: Pt, others: Pt[], free: boolean): Pt {
  if (free) return p;
  for (const o of others) if (dist(p, o) < 0.3) return o;
  let x = Math.round(p.x * 10) / 10;
  let y = Math.round(p.y * 10) / 10;
  let bx = 0.2, by = 0.2;
  for (const o of others) {
    if (Math.abs(o.x - p.x) < bx) { bx = Math.abs(o.x - p.x); x = o.x; }
    if (Math.abs(o.y - p.y) < by) { by = Math.abs(o.y - p.y); y = o.y; }
  }
  return { x, y };
}

// ---------- Units ----------

const M_PER_IN = 0.0254;

export function formatLength(m: number, u: Unit) {
  if (u === "metric") return `${m.toFixed(2)} m`;
  const halves = Math.round((m / M_PER_IN) * 2);
  const ft = Math.floor(halves / 24);
  const rem = halves - ft * 24;
  return `${ft}' ${Math.floor(rem / 2)}${rem % 2 ? "½" : ""}"`;
}

export function formatArea(m2: number, u: Unit) {
  return u === "metric" ? `${m2.toFixed(1)} m²` : `${(m2 / (M_PER_IN * 12) ** 2).toFixed(0)} ft²`;
}

export function formatAngle(d: number) {
  return `${Math.round(d * 10) / 10}°`;
}

function parseMixed(s: string): number | null {
  s = s.trim();
  if (s === "") return 0;
  const m = s.match(/^(\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+))?$/);
  if (!m || (!m[1] && !m[2])) return null;
  return (m[1] ? parseFloat(m[1]) : 0) + (m[2] ? parseInt(m[2]) / parseInt(m[3]) : 0);
}

// Metric mode: "3.81", "381 cm". Imperial mode: "12' 6 1/2\"", "12 6.5", "150\"". An explicit unit always wins.
export function parseLength(raw: string, u: Unit): number | null {
  const s = raw.trim().toLowerCase().replace(/½/g, " 1/2");
  const metric = s.match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m)$/);
  if (metric) {
    const v = parseFloat(metric[1]);
    return metric[2] === "mm" ? v / 1000 : metric[2] === "cm" ? v / 100 : v;
  }
  if (u === "metric" && !/['"]|ft|in/.test(s)) {
    const v = Number(s);
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  const t = s.replace(/feet|foot|ft/g, "'").replace(/inches|inch|in/g, '"').trim();
  let ft = 0;
  let rest = t;
  const fi = t.indexOf("'");
  if (fi >= 0) {
    ft = Number(t.slice(0, fi).trim());
    rest = t.slice(fi + 1);
  } else if (!t.includes('"')) {
    const parts = t.split(/\s+/);
    ft = Number(parts[0]);
    rest = parts.slice(1).join(" ");
  }
  if (!Number.isFinite(ft)) return null;
  const inch = parseMixed(rest.replace(/"/g, ""));
  if (inch === null) return null;
  const total = (ft * 12 + inch) * M_PER_IN;
  return total > 0 ? total : null;
}

export function parseAngle(raw: string): number | null {
  const v = Number(raw.trim().replace(/°|deg/g, ""));
  return Number.isFinite(v) && v > 0 && v < 360 ? v : null;
}

export const PX_PER_M = 40;
export const WORLD_W = 36;
export const WORLD_H = 24;
export const px = (v: number) => v * PX_PER_M;
