"use client";
// PROTOTYPE — throwaway. State and SVG parts that all variants use.
// The drawing step (click corners with the mouse) is the same in all variants.
// The variants differ in how the user types lengths and angles and changes Edge kinds.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  build,
  shapeFromDrawing,
  withAuto,
  toPx,
  PX_PER_M,
  WORLD_W,
  WORLD_H,
  formatLength,
  type Pt,
  type Shape,
  type Unit,
  type EdgeKind,
  type Built,
} from "./model";

export type FloorPlan = ReturnType<typeof useFloorPlan>;

export function useFloorPlan() {
  const [draft, setDraft] = useState<Pt[]>([]);
  const [shape, setShape] = useState<Shape | null>(null);
  const [unit, setUnit] = useState<Unit>("metric");
  const built = useMemo(() => (shape ? build(shape) : null), [shape]);

  return {
    draft,
    shape,
    built,
    unit,
    setUnit,
    addPoint: (p: Pt) => setDraft((d) => [...d, p]),
    undoPoint: () => setDraft((d) => d.slice(0, -1)),
    close: (pts: Pt[] = draft, snap = true) => {
      if (pts.length < 3) return;
      setShape(shapeFromDrawing(pts, { snap }));
      setDraft([]);
    },
    reset: () => {
      setShape(null);
      setDraft([]);
    },
    setLength: (edge: number, m: number) =>
      setShape((s) => s && { ...s, lengths: s.lengths.map((v, i) => (i === edge ? m : v)) }),
    setAngle: (corner: number, d: number) =>
      setShape((s) => s && { ...s, angles: s.angles.map((v, i) => (i === corner ? d : v)) }),
    setKind: (edge: number, k: EdgeKind) =>
      setShape((s) => s && { ...s, kinds: s.kinds.map((v, i) => (i === edge ? k : v)) }),
    toggleKind: (edge: number) =>
      setShape((s) => s && { ...s, kinds: s.kinds.map((v, i) => (i === edge ? (v === "wall" ? "open" : "wall") : v)) }),
    setAuto: (edge: number) => setShape((s) => s && withAuto(s, edge)),
  };
}

// ---------- SVG parts ----------

export const SVG_W = WORLD_W * PX_PER_M;
export const SVG_H = WORLD_H * PX_PER_M;

export function Grid() {
  const lines: ReactNode[] = [];
  for (let x = 0; x <= WORLD_W; x++)
    lines.push(
      <line key={`x${x}`} x1={x * PX_PER_M} y1={0} x2={x * PX_PER_M} y2={SVG_H} stroke={x % 5 ? "#e4e4e7" : "#d4d4d8"} />,
    );
  for (let y = 0; y <= WORLD_H; y++)
    lines.push(
      <line key={`y${y}`} x1={0} y1={y * PX_PER_M} x2={SVG_W} y2={y * PX_PER_M} stroke={y % 5 ? "#e4e4e7" : "#d4d4d8"} />,
    );
  return <g>{lines}</g>;
}

export function EdgeLine({
  a,
  b,
  kind,
  isAuto,
  highlight,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  a: Pt;
  b: Pt;
  kind: EdgeKind;
  isAuto?: boolean;
  highlight?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const pa = toPx(a);
  const pb = toPx(b);
  const color = highlight ? "#2563eb" : isAuto ? "#d97706" : "#18181b";
  return (
    <g onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} style={{ cursor: onClick ? "pointer" : undefined }}>
      {/* wide transparent line so the Edge is easy to click */}
      <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="transparent" strokeWidth={16} />
      <line
        x1={pa.x}
        y1={pa.y}
        x2={pb.x}
        y2={pb.y}
        stroke={color}
        strokeWidth={kind === "wall" ? 5 : 2}
        strokeDasharray={kind === "open" ? "8 6" : undefined}
        strokeLinecap="round"
      />
    </g>
  );
}

export function ShapeEdges({
  plan,
  selected,
  hovered,
  onEdgeClick,
  onEdgeHover,
}: {
  plan: FloorPlan;
  selected?: number | null;
  hovered?: number | null;
  onEdgeClick?: (i: number) => void;
  onEdgeHover?: (i: number | null) => void;
}) {
  const { shape, built } = plan;
  if (!shape || !built) return null;
  const n = built.corners.length;
  return (
    <g>
      <polygon points={built.corners.map((c) => `${toPx(c).x},${toPx(c).y}`).join(" ")} fill="#3b82f6" fillOpacity={0.06} />
      {built.corners.map((c, i) => (
        <EdgeLine
          key={i}
          a={c}
          b={built.corners[(i + 1) % n]}
          kind={shape.kinds[i]}
          isAuto={i === shape.auto}
          highlight={i === selected || i === hovered}
          onClick={onEdgeClick && (() => onEdgeClick(i))}
          onMouseEnter={onEdgeHover && (() => onEdgeHover(i))}
          onMouseLeave={onEdgeHover && (() => onEdgeHover(null))}
        />
      ))}
      {built.corners.map((c, i) => (
        <circle key={i} cx={toPx(c).x} cy={toPx(c).y} r={4} fill="#fff" stroke="#18181b" strokeWidth={1.5} />
      ))}
    </g>
  );
}

// Mouse drawing. Click to add a corner. Click the first corner, or press Enter, to close.
// The direction snaps to 45° steps and the length snaps to 0.1 m. Hold Alt to draw freely.
export function DrawingLayer({ plan, unit }: { plan: FloorPlan; unit: Unit }) {
  const [cursor, setCursor] = useState<Pt | null>(null);
  const { draft } = plan;
  const last = draft[draft.length - 1];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "Enter") plan.close();
      if (e.key === "Backspace") plan.undoPoint();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plan]);

  const snapPoint = (raw: Pt, free: boolean): Pt => {
    if (!last || free) return raw;
    const dx = raw.x - last.x;
    const dy = raw.y - last.y;
    const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.round(Math.hypot(dx, dy) * 10) / 10;
    return { x: last.x + len * Math.cos(ang), y: last.y + len * Math.sin(ang) };
  };
  const nearFirst = (p: Pt) => draft.length >= 3 && Math.hypot(p.x - draft[0].x, p.y - draft[0].y) < 0.4;
  const fromEvent = (e: React.MouseEvent<SVGRectElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / PX_PER_M, y: (e.clientY - r.top) / PX_PER_M };
  };

  const preview = cursor && last ? (nearFirst(cursor) ? draft[0] : cursor) : null;
  const pts = draft.map(toPx);

  return (
    <g>
      <rect
        x={0}
        y={0}
        width={SVG_W}
        height={SVG_H}
        fill="transparent"
        style={{ cursor: "crosshair" }}
        onMouseMove={(e) => setCursor(snapPoint(fromEvent(e), e.altKey))}
        onMouseLeave={() => setCursor(null)}
        onClick={(e) => {
          const p = snapPoint(fromEvent(e), e.altKey);
          if (nearFirst(p)) plan.close();
          else plan.addPoint(p);
        }}
      />
      <g pointerEvents="none">
        {pts.length > 1 && <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#18181b" strokeWidth={5} strokeLinecap="round" />}
        {preview && last && (
          <>
            <line x1={toPx(last).x} y1={toPx(last).y} x2={toPx(preview).x} y2={toPx(preview).y} stroke="#2563eb" strokeWidth={3} strokeDasharray="4 4" />
            <text x={toPx(preview).x + 10} y={toPx(preview).y - 10} fontSize={13} fill="#2563eb">
              {formatLength(Math.hypot(preview.x - last.x, preview.y - last.y), unit)}
            </text>
          </>
        )}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === 0 && draft.length >= 3 ? 8 : 4} fill={i === 0 ? "#2563eb" : "#fff"} stroke="#18181b" strokeWidth={1.5} />
        ))}
      </g>
    </g>
  );
}

export function UnitToggle({ unit, setUnit, className = "" }: { unit: Unit; setUnit: (u: Unit) => void; className?: string }) {
  return (
    <div className={`inline-flex rounded-md border border-zinc-300 bg-white p-0.5 text-sm ${className}`}>
      {(["metric", "imperial"] as const).map((u) => (
        <button
          key={u}
          onClick={() => setUnit(u)}
          className={`rounded px-2 py-1 ${unit === u ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
        >
          {u === "metric" ? "m" : "ft-in"}
        </button>
      ))}
    </div>
  );
}

// "Surface the state": the stored values, in meters, with no rounding.
export function StatePanel({ plan }: { plan: FloorPlan }) {
  const [open, setOpen] = useState(false);
  const { shape, built, draft } = plan;
  const data = shape && built
    ? {
        unit_display: plan.unit,
        auto_edge: shape.auto,
        edges: shape.kinds.map((k, i) => ({
          i,
          kind: k,
          length_m: i === shape.auto ? built.autoLength : shape.lengths[i],
          typed: i !== shape.auto,
        })),
        corner_angles_deg: built.derivedAngles,
        self_intersects: built.selfIntersects,
      }
    : { phase: "drawing", draft_corners_m: draft };
  return (
    <div className="fixed right-4 bottom-4 z-40 max-w-sm text-xs">
      <button onClick={() => setOpen(!open)} className="rounded bg-zinc-800 px-2 py-1 font-mono text-white shadow">
        {open ? "hide state" : "state"}
      </button>
      {open && (
        <pre className="mt-1 max-h-[60vh] overflow-auto rounded bg-zinc-900 p-2 font-mono text-[11px] text-green-300 shadow-lg">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function SelfIntersectWarning({ built }: { built: Built | null }) {
  if (!built?.selfIntersects) return null;
  return <div className="rounded bg-red-100 px-2 py-1 text-sm text-red-800">The Edges cross. Check the lengths and angles.</div>;
}

export function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// Unit normal that points out of the shape (the shape has a positive signed area).
export function outwardNormal(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dy / l, y: -dx / l };
}
