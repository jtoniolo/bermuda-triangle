"use client";
// PROTOTYPE — Variant B: "Edge table". The canvas only shows the shape.
// A panel at the side lists each Edge in one row: kind, length, angle at its start corner, and the auto choice.
// Hover a row to find its Edge on the canvas. Click an Edge on the canvas to go to its row.

import { useEffect, useRef, useState } from "react";
import { toPx, formatLength, formatAngle, parseLength, parseAngle, angleIsAuto } from "./model";
import { Grid, ShapeEdges, DrawingLayer, UnitToggle, SelfIntersectWarning, midpoint, SVG_W, SVG_H, type FloorPlan } from "./shared";

export const name = "Edge table";

export function VariantB({ plan }: { plan: FloorPlan }) {
  const { shape, built, unit } = plan;
  const [hovered, setHovered] = useState<number | null>(null);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const n = built?.corners.length ?? 0;

  return (
    <div className="flex h-screen w-screen bg-zinc-100">
      <div className="flex-1 overflow-auto">
        <svg width={SVG_W} height={SVG_H} className="bg-white">
          <Grid />
          {!shape && <DrawingLayer plan={plan} unit={unit} />}
          {shape && built && (
            <>
              <ShapeEdges plan={plan} hovered={hovered} onEdgeClick={setFocusRow} onEdgeHover={setHovered} />
              {built.corners.map((c, i) => {
                const m = toPx(midpoint(c, built.corners[(i + 1) % n]));
                return (
                  <g key={i} pointerEvents="none">
                    <circle cx={m.x} cy={m.y} r={10} fill={i === hovered ? "#2563eb" : "#fff"} stroke="#71717a" />
                    <text x={m.x} y={m.y + 4} textAnchor="middle" fontSize={11} fill={i === hovered ? "#fff" : "#18181b"}>
                      {i + 1}
                    </text>
                  </g>
                );
              })}
            </>
          )}
        </svg>
      </div>

      <aside className="flex w-[440px] flex-col border-l border-zinc-300 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-200 p-3">
          <h2 className="font-semibold">Area: Kitchen</h2>
          <div className="flex gap-2">
            <UnitToggle unit={unit} setUnit={plan.setUnit} />
            <button onClick={plan.reset} className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100">
              Redraw
            </button>
          </div>
        </div>

        {!shape ? (
          <div className="p-4 text-sm text-zinc-600">
            Draw the Area on the canvas. Click to add corners. Click the first corner (or press Enter) to close. Alt = free
            angle. Backspace = remove the last corner.
            <div className="mt-3 text-zinc-500">{plan.draft.length} corners</div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-3">
            <SelfIntersectWarning built={built} />
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr>
                  <th className="py-1">Edge</th>
                  <th>Kind</th>
                  <th>Length</th>
                  <th title="Interior angle at the corner where this Edge starts">Angle</th>
                  <th title="The app calculates this Edge so that the shape closes">Auto</th>
                </tr>
              </thead>
              <tbody>
                {shape.kinds.map((kind, i) => {
                  const isAuto = i === shape.auto;
                  const aAuto = angleIsAuto(shape, i);
                  return (
                    <tr
                      key={i}
                      onMouseEnter={() => setHovered(i)}
                      onMouseLeave={() => setHovered(null)}
                      className={`border-t border-zinc-100 ${i === hovered ? "bg-blue-50" : ""}`}
                    >
                      <td className="py-1.5 font-mono">{i + 1}</td>
                      <td>
                        <button
                          onClick={() => plan.toggleKind(i)}
                          className="flex items-center gap-1 rounded border border-zinc-300 px-1.5 py-0.5 text-xs hover:bg-zinc-100"
                        >
                          <svg width={22} height={6}>
                            <line
                              x1={1}
                              y1={3}
                              x2={21}
                              y2={3}
                              stroke="#18181b"
                              strokeWidth={kind === "wall" ? 4 : 1.5}
                              strokeDasharray={kind === "open" ? "4 3" : undefined}
                            />
                          </svg>
                          {kind === "wall" ? "Wall" : "Open"}
                        </button>
                      </td>
                      <td>
                        {isAuto ? (
                          <span className="text-amber-700">{formatLength(built!.autoLength, unit)}</span>
                        ) : (
                          <CellInput
                            focus={focusRow === i}
                            onFocused={() => setFocusRow(null)}
                            display={formatLength(shape.lengths[i], unit)}
                            parse={(t) => parseLength(t, unit)}
                            onCommit={(v) => plan.setLength(i, v)}
                          />
                        )}
                      </td>
                      <td>
                        {aAuto ? (
                          <span className="text-amber-700">{formatAngle(built!.derivedAngles[i])}</span>
                        ) : (
                          <CellInput display={formatAngle(shape.angles[i])} parse={parseAngle} onCommit={(v) => plan.setAngle(i, v)} />
                        )}
                      </td>
                      <td className="text-center">
                        <input type="radio" checked={isAuto} onChange={() => plan.setAuto(i)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-zinc-500">
              Imperial input: <code>12&apos; 6 1/2&quot;</code>, <code>12 6.5</code>, <code>150&quot;</code>. Metric input: <code>3.81</code>,{" "}
              <code>381 cm</code>. You can type a unit that is not the display unit.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

function CellInput({
  display,
  parse,
  onCommit,
  focus,
  onFocused,
}: {
  display: string;
  parse: (t: string) => number | null;
  onCommit: (v: number) => void;
  focus?: boolean;
  onFocused?: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focus) {
      ref.current?.focus();
      onFocused?.();
    }
  }, [focus, onFocused]);
  const bad = text !== null && parse(text) === null;
  const commit = () => {
    if (text !== null) {
      const v = parse(text);
      if (v !== null) onCommit(v);
    }
    setText(null);
  };
  return (
    <input
      ref={ref}
      value={text ?? display}
      onFocus={(e) => {
        setText(display);
        e.currentTarget.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(null);
          e.currentTarget.blur();
        }
      }}
      className={`w-28 rounded border px-1.5 py-0.5 ${bad ? "border-red-500" : "border-zinc-300 focus:border-blue-500"} outline-none`}
    />
  );
}
