"use client";
// PROTOTYPE — Variant A: "On the canvas". All editing happens on the drawing.
// Click a length label on an Edge to type the length. Click an angle badge at a corner to type the angle.
// Click an Edge to get a small toolbar: Wall / Open edge, and "make auto".

import { useRef, useState } from "react";
import { toPx, formatLength, formatAngle, parseLength, parseAngle, angleIsAuto, type Pt } from "./model";
import {
  Grid,
  ShapeEdges,
  DrawingLayer,
  UnitToggle,
  SelfIntersectWarning,
  midpoint,
  outwardNormal,
  SVG_W,
  SVG_H,
  type FloorPlan,
} from "./shared";

export const name = "On the canvas";

type Editing = { type: "length"; i: number } | { type: "angle"; i: number } | null;

export function VariantA({ plan }: { plan: FloorPlan }) {
  const { shape, built, unit } = plan;
  const [editing, setEditing] = useState<Editing>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const n = built?.corners.length ?? 0;

  // Tab moves to the next typed value: length of Edge i, then angle at corner i + 1, then length of Edge i + 1.
  const nextAfter = (e: NonNullable<Editing>): Editing => {
    if (!shape) return null;
    for (let k = 0; k < 2 * n; k++) {
      const cand: NonNullable<Editing> =
        e.type === "length" ? { type: "angle", i: (e.i + 1) % n } : { type: "length", i: e.i };
      e = cand;
      if (cand.type === "length" && cand.i !== shape.auto) return cand;
      if (cand.type === "angle" && !angleIsAuto(shape, cand.i)) return cand;
    }
    return null;
  };

  return (
    <div className="relative h-screen w-screen overflow-auto bg-zinc-50">
      <div className="fixed top-3 left-3 z-30 max-w-md rounded-lg bg-white/90 p-3 text-sm text-zinc-700 shadow">
        {!shape ? (
          <>
            <b>Draw the Area.</b> Click to add corners. Click the first corner (or press Enter) to close. Alt = free angle.
            Backspace = remove the last corner.
          </>
        ) : (
          <>
            <b>Type the dimensions.</b> Click a length or an angle to change it. Tab = next value. Click an Edge for Wall / Open
            edge. The <span className="text-amber-600">orange</span> Edge is calculated so that the shape closes.
          </>
        )}
      </div>
      <div className="fixed top-3 right-3 z-30 flex items-center gap-2">
        <SelfIntersectWarning built={built} />
        <UnitToggle unit={unit} setUnit={plan.setUnit} />
        <button onClick={plan.reset} className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm hover:bg-zinc-100">
          Redraw
        </button>
      </div>

      <svg
        width={SVG_W}
        height={SVG_H}
        className="bg-white"
      >
        <Grid />
        {!shape && <DrawingLayer plan={plan} unit={unit} />}
        {shape && built && (
          <>
            <rect width={SVG_W} height={SVG_H} fill="transparent" onClick={() => setSelected(null)} />
            <ShapeEdges plan={plan} selected={selected} onEdgeClick={(i) => setSelected(i === selected ? null : i)} />

            {/* length labels */}
            {built.corners.map((c, i) => {
              const b = built.corners[(i + 1) % n];
              const m = midpoint(c, b);
              const nrm = outwardNormal(c, b);
              const pos = toPx({ x: m.x + nrm.x * 0.6, y: m.y + nrm.y * 0.6 });
              const isAuto = i === shape.auto;
              const value = isAuto ? built.autoLength : shape.lengths[i];
              return (
                <foreignObject key={`l${i}`} x={pos.x - 60} y={pos.y - 14} width={120} height={28}>
                  {editing?.type === "length" && editing.i === i ? (
                    <InlineInput
                      initial={formatLength(value, unit)}
                      parse={(t) => parseLength(t, unit)}
                      onCommit={(v) => plan.setLength(i, v)}
                      onDone={(tab) => setEditing(tab ? nextAfter(editing) : null)}
                    />
                  ) : (
                    <button
                      disabled={isAuto}
                      onClick={() => setEditing({ type: "length", i })}
                      className={`mx-auto block rounded px-1.5 py-0.5 text-xs shadow-sm ${
                        isAuto ? "bg-amber-100 text-amber-800" : "bg-white text-zinc-900 ring-1 ring-zinc-300 hover:ring-blue-500"
                      }`}
                    >
                      {isAuto && "auto "}
                      {formatLength(value, unit)}
                    </button>
                  )}
                </foreignObject>
              );
            })}

            {/* angle badges, placed inside the corner */}
            {built.corners.map((c, i) => {
              const prev = built.corners[(i - 1 + n) % n];
              const next = built.corners[(i + 1) % n];
              const n1 = outwardNormal(prev, c);
              const n2 = outwardNormal(c, next);
              const inward: Pt = { x: -(n1.x + n2.x), y: -(n1.y + n2.y) };
              const l = Math.hypot(inward.x, inward.y) || 1;
              const sign = built.derivedAngles[i] > 180 ? -1 : 1;
              const pos = toPx({ x: c.x + (sign * inward.x / l) * 0.7, y: c.y + (sign * inward.y / l) * 0.7 });
              const isAuto = angleIsAuto(shape, i);
              const value = isAuto ? built.derivedAngles[i] : shape.angles[i];
              return (
                <foreignObject key={`a${i}`} x={pos.x - 36} y={pos.y - 12} width={72} height={24}>
                  {editing?.type === "angle" && editing.i === i ? (
                    <InlineInput
                      initial={String(value)}
                      parse={parseAngle}
                      onCommit={(v) => plan.setAngle(i, v)}
                      onDone={(tab) => setEditing(tab ? nextAfter(editing) : null)}
                    />
                  ) : (
                    <button
                      disabled={isAuto}
                      onClick={() => setEditing({ type: "angle", i })}
                      className={`mx-auto block rounded-full px-1.5 text-[11px] ${
                        isAuto ? "text-amber-700" : value === 90 ? "text-zinc-400 hover:text-blue-600" : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      {formatAngle(value)}
                    </button>
                  )}
                </foreignObject>
              );
            })}

            {/* toolbar for the selected Edge */}
            {selected !== null &&
              (() => {
                const a = built.corners[selected];
                const b = built.corners[(selected + 1) % n];
                const m = midpoint(a, b);
                const nrm = outwardNormal(a, b);
                const pos = toPx({ x: m.x - nrm.x * 0.9, y: m.y - nrm.y * 0.9 });
                return (
                  <foreignObject x={pos.x - 110} y={pos.y - 16} width={220} height={32}>
                    <div className="flex justify-center gap-1">
                      <div className="inline-flex rounded-md bg-zinc-900 p-0.5 text-xs text-white shadow-lg">
                        <button
                          onClick={() => plan.setKind(selected, "wall")}
                          className={`rounded px-2 py-1 ${shape.kinds[selected] === "wall" ? "bg-white text-zinc-900" : ""}`}
                        >
                          ━ Wall
                        </button>
                        <button
                          onClick={() => plan.setKind(selected, "open")}
                          className={`rounded px-2 py-1 ${shape.kinds[selected] === "open" ? "bg-white text-zinc-900" : ""}`}
                        >
                          ┅ Open
                        </button>
                        {selected !== shape.auto && (
                          <button onClick={() => plan.setAuto(selected)} className="rounded px-2 py-1 text-amber-300">
                            make auto
                          </button>
                        )}
                      </div>
                    </div>
                  </foreignObject>
                );
              })()}
          </>
        )}
      </svg>
    </div>
  );
}

function InlineInput({
  initial,
  parse,
  onCommit,
  onDone,
}: {
  initial: string;
  parse: (t: string) => number | null;
  onCommit: (v: number) => void;
  onDone: (tab: boolean) => void;
}) {
  const [text, setText] = useState(initial);
  const done = useRef(false);
  const finish = (tab: boolean) => {
    if (done.current) return;
    done.current = true;
    commit();
    onDone(tab);
  };
  const bad = parse(text) === null;
  const commit = () => {
    const v = parse(text);
    if (v !== null) onCommit(v);
  };
  return (
    <input
      autoFocus
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          finish(e.key === "Tab");
        }
        if (e.key === "Escape") {
          done.current = true;
          onDone(false);
        }
      }}
      className={`w-full rounded border px-1 py-0.5 text-center text-xs shadow outline-none ${bad ? "border-red-500" : "border-blue-500"}`}
    />
  );
}
