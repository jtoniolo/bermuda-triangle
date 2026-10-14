"use client";
// PROTOTYPE — Variant C: "Command line". Keyboard first, like a CAD command line.
// Before a shape exists: the user can draw with the mouse, or type the walk: length, Enter, angle, Enter, ... then "c" to close.
// After the shape exists: the command line steps through each Edge. It asks for the length, then the angle at the next corner.
// Commands at any prompt: w = Wall, o = Open edge, a = make this Edge auto, n / p = next / previous Edge, r = redraw.

import { useEffect, useRef, useState } from "react";
import { toPx, formatLength, formatAngle, parseLength, parseAngle, angleIsAuto, type Pt } from "./model";
import { Grid, ShapeEdges, DrawingLayer, UnitToggle, SelfIntersectWarning, midpoint, SVG_W, SVG_H, type FloorPlan } from "./shared";

export const name = "Command line";

type Step = { edge: number; field: "length" | "angle" };

export function VariantC({ plan }: { plan: FloorPlan }) {
  const { shape, built, unit } = plan;
  const [step, setStep] = useState<Step>({ edge: 0, field: "length" });
  const [text, setText] = useState("");
  const [log, setLog] = useState<string[]>([]);
  // typed walk before a shape exists
  const [walk, setWalk] = useState<{ pts: Pt[]; heading: number; field: "length" | "angle" }>({
    pts: [{ x: 6, y: 5 }],
    heading: 0,
    field: "length",
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const n = built?.corners.length ?? 0;

  useEffect(() => inputRef.current?.focus(), [shape]);

  const say = (s: string) => setLog((l) => [...l.slice(-6), s]);

  // the next prompt that the user must type (skips values that the app calculates)
  const advance = (s: Step, dir = 1): Step => {
    if (!shape) return s;
    const order: Step[] = [];
    for (let i = 0; i < n; i++) order.push({ edge: i, field: "length" }, { edge: i, field: "angle" });
    const typed = (x: Step) => (x.field === "length" ? x.edge !== shape.auto : !angleIsAuto(shape, (x.edge + 1) % n));
    let idx = order.findIndex((o) => o.edge === s.edge && o.field === s.field);
    for (let k = 0; k < order.length; k++) {
      idx = (idx + dir + order.length) % order.length;
      if (typed(order[idx])) return order[idx];
    }
    return s;
  };

  const onEnter = () => {
    const t = text.trim().toLowerCase();
    setText("");
    if (t === "r") {
      plan.reset();
      setWalk({ pts: [{ x: 6, y: 5 }], heading: 0, field: "length" });
      say("redraw");
      return;
    }

    if (!shape) {
      // typed walk
      if (t === "c") {
        const pts = walk.pts.length > 1 && dist(walk.pts[0], walk.pts[walk.pts.length - 1]) < 1e-6 ? walk.pts.slice(0, -1) : walk.pts;
        if (pts.length >= 3) {
          plan.close(pts, false);
          setStep({ edge: 0, field: "length" });
          say("close");
        } else say("! need 3 corners or more");
        return;
      }
      if (walk.field === "length") {
        const v = parseLength(t, unit);
        if (v === null) return say(`! not a length: ${t}`);
        const last = walk.pts[walk.pts.length - 1];
        const p = { x: last.x + v * Math.cos((walk.heading * Math.PI) / 180), y: last.y + v * Math.sin((walk.heading * Math.PI) / 180) };
        setWalk({ ...walk, pts: [...walk.pts, p], field: "angle" });
        say(`length ${formatLength(v, unit)}`);
      } else {
        const v = t === "" ? 90 : parseAngle(t);
        if (v === null) return say(`! not an angle: ${t}`);
        setWalk({ ...walk, heading: walk.heading + 180 - v, field: "length" });
        say(`angle ${formatAngle(v)}`);
      }
      return;
    }

    const edge = step.edge;
    if (t === "w" || t === "o") {
      plan.setKind(edge, t === "w" ? "wall" : "open");
      return say(`Edge ${edge + 1} → ${t === "w" ? "Wall" : "Open edge"}`);
    }
    if (t === "a") {
      plan.setAuto(edge);
      say(`Edge ${edge + 1} → auto`);
      return setStep({ edge: (edge + 1) % n, field: "length" });
    }
    if (t === "n") return setStep(advance(step));
    if (t === "p") return setStep(advance(step, -1));
    if (t === "") return setStep(advance(step)); // Enter with no text keeps the value
    if (step.field === "length") {
      const v = parseLength(t, unit);
      if (v === null) return say(`! not a length: ${t}`);
      plan.setLength(edge, v);
      say(`Edge ${edge + 1} length ${formatLength(v, unit)}`);
    } else {
      const v = parseAngle(t);
      if (v === null) return say(`! not an angle: ${t}`);
      plan.setAngle((edge + 1) % n, v);
      say(`corner after Edge ${edge + 1}: ${formatAngle(v)}`);
    }
    setStep(advance(step));
  };

  let prompt: string;
  if (!shape) {
    prompt =
      walk.field === "length"
        ? `Edge ${walk.pts.length} length (or "c" to close)`
        : `angle at the corner (Enter = 90°)`;
  } else if (step.field === "length") {
    prompt = `Edge ${step.edge + 1} of ${n} · ${shape.kinds[step.edge] === "wall" ? "Wall" : "Open edge"} · length [${formatLength(shape.lengths[step.edge], unit)}]`;
  } else {
    prompt = `Edge ${step.edge + 1} of ${n} · angle at the next corner [${formatAngle(shape.angles[(step.edge + 1) % n])}]`;
  }

  const cur = shape && built ? step.edge : null;

  return (
    <div className="relative h-screen w-screen overflow-auto bg-zinc-900">
      <div className="fixed top-3 right-3 z-30 flex items-center gap-2">
        <SelfIntersectWarning built={built} />
        <UnitToggle unit={unit} setUnit={plan.setUnit} />
      </div>
      <svg width={SVG_W} height={SVG_H} className="bg-white">
        <Grid />
        {!shape && <DrawingLayer plan={plan} unit={unit} />}
        {!shape && walk.pts.length > 0 && plan.draft.length === 0 && (
          <g pointerEvents="none">
            <polyline points={walk.pts.map((p) => `${toPx(p).x},${toPx(p).y}`).join(" ")} fill="none" stroke="#18181b" strokeWidth={5} />
            <WalkArrow at={walk.pts[walk.pts.length - 1]} heading={walk.heading} />
          </g>
        )}
        {shape && built && (
          <>
            <ShapeEdges plan={plan} selected={cur} onEdgeClick={(i) => setStep({ edge: i, field: "length" })} />
            {cur !== null &&
              (() => {
                const a = built.corners[cur];
                const b = built.corners[(cur + 1) % n];
                const m = toPx(midpoint(a, b));
                const corner = toPx(b);
                return (
                  <g pointerEvents="none">
                    {step.field === "angle" && <circle cx={corner.x} cy={corner.y} r={14} fill="none" stroke="#2563eb" strokeWidth={3} />}
                    <WalkArrow at={midpoint(a, b)} heading={(Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI} />
                    <text x={m.x} y={m.y - 14} textAnchor="middle" fontSize={13} fill="#2563eb" fontWeight={600}>
                      {formatLength(cur === shape.auto ? built.autoLength : shape.lengths[cur], unit)}
                    </text>
                  </g>
                );
              })()}
            {built.corners.map((c, i) => {
              const p = toPx(c);
              return (
                <text key={i} x={p.x + 8} y={p.y - 8} fontSize={11} fill={angleIsAuto(shape, i) ? "#d97706" : "#71717a"} pointerEvents="none">
                  {formatAngle(angleIsAuto(shape, i) ? built.derivedAngles[i] : shape.angles[i])}
                </text>
              );
            })}
          </>
        )}
      </svg>

      <div className="fixed inset-x-0 bottom-16 z-30 mx-auto w-[min(760px,95vw)] rounded-lg bg-zinc-950/95 p-3 font-mono text-sm text-zinc-200 shadow-2xl">
        <div className="mb-2 space-y-0.5 text-xs text-zinc-500">
          {log.map((l, i) => (
            <div key={i} className={l.startsWith("!") ? "text-red-400" : ""}>
              {l}
            </div>
          ))}
        </div>
        <div className="text-xs text-blue-300">{prompt}</div>
        <div className="flex items-center gap-2">
          <span className="text-green-400">›</span>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onEnter();
              if (e.key === "Tab") {
                e.preventDefault();
                if (shape) setStep(advance(step, e.shiftKey ? -1 : 1));
              }
            }}
            className="flex-1 bg-transparent outline-none"
            placeholder={shape ? "value · w · o · a · n · p · r" : "value · c · r — or draw with the mouse"}
          />
        </div>
      </div>
    </div>
  );
}

function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function WalkArrow({ at, heading }: { at: Pt; heading: number }) {
  const p = toPx(at);
  return (
    <g transform={`translate(${p.x},${p.y}) rotate(${heading})`}>
      <path d="M -6 -6 L 6 0 L -6 6 Z" fill="#2563eb" />
    </g>
  );
}
