// PROTOTYPE — throwaway. The geometry and unit model for the floor plan editor prototype.
//
// Corner i is the start of Edge i. Edge i goes from corner i to corner i + 1.
// The angle at corner i is the interior angle between Edge i - 1 and Edge i.
// One Edge is the "auto" Edge. The app calculates its length and the two angles at its ends,
// so that the shape always closes. The user types all the other lengths and angles.

export type Pt = { x: number; y: number };
export type EdgeKind = "wall" | "open";
export type Unit = "metric" | "imperial";

export type Shape = {
  lengths: number[]; // meters, one for each Edge. The value for the auto Edge is not used.
  angles: number[]; // degrees, one for each corner. The values at the two ends of the auto Edge are not used.
  kinds: EdgeKind[];
  auto: number; // index of the auto Edge
  anchor: Pt; // position of corner auto + 1, in meters
  heading: number; // direction of Edge auto + 1, in degrees
};

export type Built = {
  corners: Pt[];
  autoLength: number;
  derivedAngles: number[]; // the interior angles that the built corners really have
  selfIntersects: boolean;
};

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const mod = (i: number, n: number) => ((i % n) + n) % n;
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const dirDeg = (a: Pt, b: Pt) => deg(Math.atan2(b.y - a.y, b.x - a.x));

function signedArea(p: Pt[]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

// Interior angle at each corner, for a polygon with a positive signed area.
function interiorAngles(p: Pt[]) {
  const n = p.length;
  return p.map((_, i) => {
    const inDir = dirDeg(p[mod(i - 1, n)], p[i]);
    const outDir = dirDeg(p[i], p[mod(i + 1, n)]);
    let turn = outDir - inDir;
    while (turn > 180) turn -= 360;
    while (turn <= -180) turn += 360;
    return 180 - turn;
  });
}

export function build(s: Shape): Built {
  const n = s.lengths.length;
  const corners: Pt[] = new Array(n);
  let p = s.anchor;
  let th = s.heading;
  corners[mod(s.auto + 1, n)] = p;
  for (let step = 0; step < n - 1; step++) {
    const i = mod(s.auto + 1 + step, n);
    p = { x: p.x + s.lengths[i] * Math.cos(rad(th)), y: p.y + s.lengths[i] * Math.sin(rad(th)) };
    const next = mod(i + 1, n);
    corners[next] = p;
    if (step < n - 2) th += 180 - s.angles[next];
  }
  const autoLength = dist(corners[s.auto], corners[mod(s.auto + 1, n)]);
  return {
    corners,
    autoLength,
    derivedAngles: interiorAngles(corners),
    selfIntersects: selfIntersects(corners),
  };
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt) {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

function selfIntersects(p: Pt[]) {
  const n = p.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true;
    }
  return false;
}

// Make a Shape from the corners that the user drew. The drawn shape is rough:
// angles snap to 45° steps (so a near-square corner becomes 90°) and lengths round to 0.1 m.
// The last drawn Edge (the one that closes the shape) becomes the auto Edge.
export function shapeFromDrawing(drawn: Pt[], opts: { snap: boolean }): Shape {
  let p = drawn;
  if (signedArea(p) < 0) p = [p[0], ...p.slice(1).reverse()];
  const n = p.length;
  const angles = interiorAngles(p).map((a) =>
    opts.snap ? Math.min(315, Math.max(45, Math.round(a / 45) * 45)) : Math.round(a * 1e6) / 1e6,
  );
  const lengths = p.map((a, i) => {
    const l = dist(a, p[(i + 1) % n]);
    return opts.snap ? Math.max(0.1, Math.round(l * 10) / 10) : l;
  });
  return {
    lengths,
    angles,
    kinds: p.map(() => "wall"),
    auto: n - 1,
    anchor: p[0],
    heading: opts.snap ? Math.round(dirDeg(p[0], p[1]) / 45) * 45 : dirDeg(p[0], p[1]),
  };
}

// Make a different Edge the auto Edge. The shape does not move.
export function withAuto(s: Shape, auto: number): Shape {
  const b = build(s);
  const n = s.lengths.length;
  const lengths = b.corners.map((c, i) => dist(c, b.corners[(i + 1) % n]));
  return {
    ...s,
    lengths,
    angles: b.derivedAngles,
    auto,
    anchor: b.corners[mod(auto + 1, n)],
    heading: dirDeg(b.corners[mod(auto + 1, n)], b.corners[mod(auto + 2, n)]),
  };
}

// The angle at a corner is typed by the user, except at the two ends of the auto Edge.
export function angleIsAuto(s: Shape, corner: number) {
  const n = s.lengths.length;
  return corner === s.auto || corner === mod(s.auto + 1, n);
}

// ---------- Units ----------

const M_PER_IN = 0.0254;

export function formatLength(m: number, unit: Unit) {
  if (unit === "metric") return `${m.toFixed(2)} m`;
  const halves = Math.round((m / M_PER_IN) * 2);
  const ft = Math.floor(halves / 24);
  const rem = halves - ft * 24;
  const inch = Math.floor(rem / 2);
  return `${ft}' ${inch}${rem % 2 ? "½" : ""}"`;
}

export function formatAngle(d: number) {
  const r = Math.round(d * 10) / 10;
  return `${r}°`;
}

function parseMixed(s: string): number | null {
  // "6", "6.5", "6 1/2", "1/2", ""
  s = s.trim();
  if (s === "") return 0;
  const m = s.match(/^(\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+))?$/);
  if (!m || (!m[1] && !m[2])) return null;
  return (m[1] ? parseFloat(m[1]) : 0) + (m[2] ? parseInt(m[2]) / parseInt(m[3]) : 0);
}

// Returns meters, or null when the text is not a length.
// Metric mode: "3.81", "381 cm", "3810mm". Imperial mode: "12' 6 1/2\"", "12 6.5", "12.5'", "150\"", "12ft 6in".
// An explicit unit always wins, so "3.8 m" works in imperial mode too.
export function parseLength(raw: string, unit: Unit): number | null {
  const s = raw.trim().toLowerCase().replace(/½/g, " 1/2").replace(/[′]/g, "'").replace(/[″]/g, '"');
  const metric = s.match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m)$/);
  if (metric) {
    const v = parseFloat(metric[1]);
    return metric[2] === "mm" ? v / 1000 : metric[2] === "cm" ? v / 100 : v;
  }
  if (unit === "metric" && !/['"]|ft|in/.test(s)) {
    const v = Number(s);
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  const t = s.replace(/\b(feet|foot|ft)\b|ft/g, "'").replace(/\b(inches|inch|in)\b|in/g, '"').trim();
  let ft = 0;
  let rest = t;
  const fi = t.indexOf("'");
  if (fi >= 0) {
    const f = Number(t.slice(0, fi).trim());
    if (!Number.isFinite(f)) return null;
    ft = f;
    rest = t.slice(fi + 1);
  } else if (!t.includes('"')) {
    const parts = t.split(/\s+/);
    const f = Number(parts[0]);
    if (!Number.isFinite(f)) return null;
    ft = f;
    rest = parts.slice(1).join(" ");
  }
  const inch = parseMixed(rest.replace(/"/g, ""));
  if (inch === null) return null;
  const total = (ft * 12 + inch) * M_PER_IN;
  return total > 0 ? total : null;
}

export function parseAngle(raw: string): number | null {
  const v = Number(raw.trim().replace(/°|deg/g, ""));
  return Number.isFinite(v) && v > 0 && v < 360 ? v : null;
}

// ---------- Drawing surface ----------

export const PX_PER_M = 40;
export const WORLD_W = 30; // meters
export const WORLD_H = 20; // meters
export const toPx = (p: Pt) => ({ x: p.x * PX_PER_M, y: p.y * PX_PER_M });
