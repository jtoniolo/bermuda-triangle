"use client";
// PROTOTYPE — throwaway. Round 2 of the floor plan editor, after the user picked variant B ("Edge table") in round 1.
// Changes from round 1: a properties panel for the selected item, a rectangle tool, merge of shapes that overlap or touch,
// draggable corners and Edges, and no auto Edge. The app stores corners. Lengths and angles come from the corners.

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  addShape,
  cornerAngle,
  dist,
  edgeLength,
  formatAngle,
  formatArea,
  formatLength,
  mod,
  moveEdge,
  outwardNormal,
  parseAngle,
  parseLength,
  pointInPolygon,
  px,
  selfIntersects,
  setAngle,
  setLength,
  signedArea,
  snapPoint,
  PX_PER_M,
  WORLD_H,
  WORLD_W,
  type Area,
  type EdgeKind,
  type Pt,
  type Unit,
} from "./geom";
import polygonClipping from "polygon-clipping";

type Tool = "select" | "rect" | "line";
type Sel = { type: "area"; id: string } | { type: "edge"; id: string; i: number } | { type: "corner"; id: string; i: number } | null;
type Drag = { type: "corner" | "edge"; id: string; i: number; start: Pt; orig: Pt[]; moved: boolean };
type Hover = { id: string; edge?: number; corner?: number } | null;

const SVG_W = px(WORLD_W);
const SVG_H = px(WORLD_H);
const letter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `C${i + 1}`);

export function Editor() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [history, setHistory] = useState<Area[][]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [tool, setTool] = useState<Tool>("rect");
  const [unit, setUnit] = useState<Unit>("metric");
  const [draft, setDraft] = useState<Pt[]>([]);
  const [rectStart, setRectStart] = useState<Pt | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [message, setMessage] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const area = (id: string) => areas.find((a) => a.id === id);
  const selArea = sel ? area(sel.id) : undefined;

  const commit = (next: Area[]) => {
    setHistory((h) => [...h.slice(-50), areas]);
    setAreas(next);
  };
  const updateCorners = (id: string, corners: Pt[] | null, what: string) => {
    if (!corners) return setMessage(`The app cannot do this ${what}: the Edges would not meet.`);
    setMessage(null);
    commit(areas.map((a) => (a.id === id ? { ...a, corners } : a)));
  };
  const undo = () => {
    if (!history.length) return;
    setAreas(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  };

  const allCorners = (except?: { id: string; i: number }) =>
    areas.flatMap((a) => a.corners.filter((_, i) => !(except && a.id === except.id && i === except.i)));

  const worldPt = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / PX_PER_M, y: (e.clientY - r.top) / PX_PER_M };
  };

  // the line tool: 45° steps from the last corner, 0.1 m lengths, and snap onto near corners. Alt = free.
  const snapLine = (p: Pt, free: boolean): Pt => {
    const last = draft[draft.length - 1];
    if (free) return p;
    if (draft.length >= 3 && dist(p, draft[0]) < 0.4) return draft[0];
    const near = allCorners().find((c) => dist(c, p) < 0.3);
    if (near) return near;
    if (!last) return snapPoint(p, allCorners(), false);
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.round(Math.hypot(dx, dy) * 10) / 10;
    return { x: last.x + len * Math.cos(ang), y: last.y + len * Math.sin(ang) };
  };

  const finishShape = (pts: Pt[]) => {
    if (pts.length < 3 || Math.abs(signedArea(pts)) < 0.01) return;
    const r = addShape(areas, pts);
    const merged = r.areas.length <= areas.length;
    commit(r.areas);
    setSel({ type: "area", id: r.id });
    setMessage(merged ? "The new shape touched or overlapped an Area, so the app merged them into one Area." : null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = worldPt(e);
    if (tool === "rect") {
      setRectStart(snapPoint(p, allCorners(), e.altKey));
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } else if (tool === "line") {
      const q = snapLine(p, e.altKey);
      if (draft.length >= 3 && dist(q, draft[0]) < 1e-6) {
        finishShape(draft);
        setDraft([]);
      } else setDraft([...draft, q]);
    } else {
      const hit = [...areas].reverse().find((a) => pointInPolygon(p, a.corners));
      setSel(hit ? { type: "area", id: hit.id } : null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = worldPt(e);
    const d = drag.current;
    if (d) {
      const a = area(d.id);
      if (!a) return;
      const delta = { x: p.x - d.start.x, y: p.y - d.start.y };
      if (!d.moved && Math.hypot(delta.x, delta.y) < 0.05) return;
      if (!d.moved) {
        d.moved = true;
        setHistory((h) => [...h.slice(-50), areas]);
      }
      let corners: Pt[] | null;
      if (d.type === "corner") {
        const q = snapPoint({ x: d.orig[d.i].x + delta.x, y: d.orig[d.i].y + delta.y }, allCorners({ id: d.id, i: d.i }), e.altKey);
        corners = d.orig.map((c, i) => (i === d.i ? q : c));
      } else {
        const n = outwardNormal(d.orig[d.i], d.orig[mod(d.i + 1, d.orig.length)]);
        let t = delta.x * n.x + delta.y * n.y;
        if (!e.altKey) t = Math.round(t * 10) / 10;
        corners = moveEdge(d.orig, d.i, t);
      }
      if (corners) setAreas((as) => as.map((x) => (x.id === d.id ? { ...x, corners: corners! } : x)));
      return;
    }
    if (tool === "rect") setCursor(snapPoint(p, allCorners(), e.altKey));
    else if (tool === "line") setCursor(snapLine(p, e.altKey));
  };

  const onPointerUp = () => {
    if (drag.current) {
      drag.current = null;
      return;
    }
    if (tool === "rect" && rectStart && cursor) {
      const a = rectStart, b = cursor;
      if (Math.abs(a.x - b.x) > 0.2 && Math.abs(a.y - b.y) > 0.2)
        finishShape([a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]);
    }
    setRectStart(null);
  };

  const startDrag = (e: React.PointerEvent, type: "corner" | "edge", a: Area, i: number) => {
    if (tool !== "select") return;
    e.stopPropagation();
    setSel({ type, id: a.id, i });
    drag.current = { type, id: a.id, i, start: worldPt(e), orig: a.corners, moved: false };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") return undo();
      if (e.key === "Escape") {
        setDraft([]);
        setRectStart(null);
        setSel(null);
      }
      if (e.key === "Enter" && draft.length >= 3) {
        finishShape(draft);
        setDraft([]);
      }
      if (e.key === "Backspace" && draft.length) setDraft(draft.slice(0, -1));
      if ((e.key === "Delete" || e.key === "Backspace") && !draft.length && sel?.type === "area") {
        commit(areas.filter((a) => a.id !== sel.id));
        setSel(null);
      }
      if (e.key === "v") setTool("select");
      if (e.key === "r") setTool("rect");
      if (e.key === "l") setTool("line");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const overlaps = (a: Area) =>
    areas.some((b) => b.id !== a.id && polygonArea(polygonClipping.intersection([ring(a.corners)], [ring(b.corners)])) > 1e-4);

  return (
    <div className="flex h-screen w-screen bg-zinc-100">
      <div className="flex-1 overflow-auto">
        <svg
          ref={svgRef}
          width={SVG_W}
          height={SVG_H}
          className="bg-white select-none"
          style={{ cursor: tool === "select" ? "default" : "crosshair" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setCursor(null)}
        >
          <Grid />
          {areas.map((a) => {
            const isSel = sel?.id === a.id;
            const n = a.corners.length;
            const bad = selfIntersects(a.corners) || overlaps(a);
            const cx = a.corners.reduce((s, c) => s + c.x, 0) / n;
            const cy = a.corners.reduce((s, c) => s + c.y, 0) / n;
            return (
              <g key={a.id}>
                <polygon
                  points={a.corners.map((c) => `${px(c.x)},${px(c.y)}`).join(" ")}
                  fill={bad ? "#ef4444" : "#3b82f6"}
                  fillOpacity={isSel ? 0.14 : 0.06}
                />
                <text x={px(cx)} y={px(cy)} textAnchor="middle" fontSize={13} fill="#52525b" pointerEvents="none">
                  {a.name}
                </text>
                {a.corners.map((c, i) => {
                  const b = a.corners[(i + 1) % n];
                  const hl =
                    (sel?.type === "edge" && isSel && sel.i === i) || (hover?.id === a.id && hover.edge === i);
                  return (
                    <g key={i} onPointerDown={(e) => startDrag(e, "edge", a, i)} style={{ cursor: tool === "select" ? "move" : undefined }}>
                      <line x1={px(c.x)} y1={px(c.y)} x2={px(b.x)} y2={px(b.y)} stroke="transparent" strokeWidth={16} />
                      <line
                        x1={px(c.x)}
                        y1={px(c.y)}
                        x2={px(b.x)}
                        y2={px(b.y)}
                        stroke={hl ? "#2563eb" : "#18181b"}
                        strokeWidth={a.kinds[i] === "wall" ? 5 : 2}
                        strokeDasharray={a.kinds[i] === "open" ? "8 6" : undefined}
                        strokeLinecap="round"
                        pointerEvents="none"
                      />
                    </g>
                  );
                })}
                {isSel &&
                  a.corners.map((c, i) => {
                    const b = a.corners[(i + 1) % n];
                    const nr = outwardNormal(c, b);
                    const mx = (c.x + b.x) / 2 + nr.x * 0.45;
                    const my = (c.y + b.y) / 2 + nr.y * 0.45;
                    return (
                      <text key={`l${i}`} x={px(mx)} y={px(my) + 4} textAnchor="middle" fontSize={11} fill="#2563eb" pointerEvents="none">
                        {formatLength(edgeLength(a.corners, i), unit)}
                      </text>
                    );
                  })}
                {a.corners.map((c, i) => {
                  const hl = (sel?.type === "corner" && isSel && sel.i === i) || (hover?.id === a.id && hover.corner === i);
                  return (
                    <g key={`c${i}`} onPointerDown={(e) => startDrag(e, "corner", a, i)} style={{ cursor: tool === "select" ? "grab" : undefined }}>
                      <circle cx={px(c.x)} cy={px(c.y)} r={9} fill="transparent" />
                      <circle cx={px(c.x)} cy={px(c.y)} r={hl ? 6 : 4} fill={hl ? "#2563eb" : "#fff"} stroke="#18181b" strokeWidth={1.5} />
                      {isSel && (
                        <text x={px(c.x) + 8} y={px(c.y) - 8} fontSize={11} fontWeight={600} fill="#18181b" pointerEvents="none">
                          {letter(i)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* previews for the drawing tools */}
          {tool === "rect" && rectStart && cursor && (
            <g pointerEvents="none">
              <rect
                x={px(Math.min(rectStart.x, cursor.x))}
                y={px(Math.min(rectStart.y, cursor.y))}
                width={px(Math.abs(cursor.x - rectStart.x))}
                height={px(Math.abs(cursor.y - rectStart.y))}
                fill="#2563eb"
                fillOpacity={0.08}
                stroke="#2563eb"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
              <text x={px(cursor.x) + 10} y={px(cursor.y) + 18} fontSize={12} fill="#2563eb">
                {formatLength(Math.abs(cursor.x - rectStart.x), unit)} × {formatLength(Math.abs(cursor.y - rectStart.y), unit)}
              </text>
            </g>
          )}
          {tool === "line" && draft.length > 0 && (
            <g pointerEvents="none">
              <polyline points={draft.map((p) => `${px(p.x)},${px(p.y)}`).join(" ")} fill="none" stroke="#18181b" strokeWidth={5} strokeLinecap="round" />
              {cursor && (
                <>
                  <line
                    x1={px(draft[draft.length - 1].x)}
                    y1={px(draft[draft.length - 1].y)}
                    x2={px(cursor.x)}
                    y2={px(cursor.y)}
                    stroke="#2563eb"
                    strokeWidth={3}
                    strokeDasharray="4 4"
                  />
                  <text x={px(cursor.x) + 10} y={px(cursor.y) - 10} fontSize={12} fill="#2563eb">
                    {formatLength(dist(draft[draft.length - 1], cursor), unit)}
                  </text>
                </>
              )}
              {draft.map((p, i) => (
                <circle key={i} cx={px(p.x)} cy={px(p.y)} r={i === 0 && draft.length >= 3 ? 8 : 4} fill={i === 0 ? "#2563eb" : "#fff"} stroke="#18181b" />
              ))}
            </g>
          )}
        </svg>
      </div>

      <aside className="flex w-[420px] flex-col border-l border-zinc-300 bg-white text-sm">
        <div className="flex items-center gap-2 border-b border-zinc-200 p-3">
          <div className="inline-flex rounded-md border border-zinc-300 p-0.5">
            {(
              [
                ["select", "Select", "V"],
                ["rect", "Rectangle", "R"],
                ["line", "Line", "L"],
              ] as const
            ).map(([t, label, key]) => (
              <button
                key={t}
                title={`${label} (${key})`}
                onClick={() => {
                  setTool(t);
                  setDraft([]);
                }}
                className={`rounded px-2 py-1 ${tool === t ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <UnitToggle unit={unit} setUnit={setUnit} />
          <button onClick={undo} disabled={!history.length} className="ml-auto rounded-md border border-zinc-300 px-2 py-1 disabled:opacity-40">
            Undo
          </button>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {message && <div className="mb-3 rounded bg-amber-50 px-2 py-1 text-amber-900">{message}</div>}
          <ToolHint tool={tool} />

          {!sel || !selArea ? (
            <AreaList areas={areas} unit={unit} onPick={(id) => setSel({ type: "area", id })} />
          ) : (
            <>
              {sel.type !== "area" && (
                <button onClick={() => setSel({ type: "area", id: selArea.id })} className="mb-2 text-blue-600 hover:underline">
                  ← {selArea.name}
                </button>
              )}
              {sel.type === "area" && (
                <AreaProps
                  a={selArea}
                  unit={unit}
                  bad={selfIntersects(selArea.corners) ? "The Edges cross." : overlaps(selArea) ? "This Area overlaps another Area." : null}
                  setHover={setHover}
                  onRename={(name) => commit(areas.map((x) => (x.id === selArea.id ? { ...x, name } : x)))}
                  onKind={(i, k) =>
                    commit(areas.map((x) => (x.id === selArea.id ? { ...x, kinds: x.kinds.map((v, j) => (j === i ? k : v)) } : x)))
                  }
                  onLength={(i, L) => updateCorners(selArea.id, setLength(selArea.corners, i, L), "length")}
                  onAngle={(i, d) => updateCorners(selArea.id, setAngle(selArea.corners, i, d), "angle")}
                  onSelect={(s) => setSel(s)}
                  onDelete={() => {
                    commit(areas.filter((x) => x.id !== selArea.id));
                    setSel(null);
                  }}
                />
              )}
              {sel.type === "edge" && (
                <EdgeProps
                  a={selArea}
                  i={sel.i}
                  unit={unit}
                  onKind={(k) =>
                    commit(areas.map((x) => (x.id === selArea.id ? { ...x, kinds: x.kinds.map((v, j) => (j === sel.i ? k : v)) } : x)))
                  }
                  onLength={(L) => updateCorners(selArea.id, setLength(selArea.corners, sel.i, L), "length")}
                  onAngle={(c, d) => updateCorners(selArea.id, setAngle(selArea.corners, c, d), "angle")}
                />
              )}
              {sel.type === "corner" && (
                <CornerProps
                  a={selArea}
                  i={sel.i}
                  unit={unit}
                  onAngle={(d) => updateCorners(selArea.id, setAngle(selArea.corners, sel.i, d), "angle")}
                />
              )}
            </>
          )}
        </div>
        <StatePanel areas={areas} sel={sel} />
      </aside>
    </div>
  );
}

// ---------- panel parts ----------

function ToolHint({ tool }: { tool: Tool }) {
  const text: Record<Tool, string> = {
    select: "Click an Area, an Edge or a corner. Drag a corner or an Edge to move it. Delete removes the selected Area. Ctrl+Z = undo.",
    rect: "Drag to draw a rectangle. A rectangle that touches or overlaps an Area merges with it. Alt = no snapping.",
    line: "Click to add corners. Click the first corner, or press Enter, to close. Backspace = remove the last corner. Alt = free angle.",
  };
  return <p className="mb-3 text-xs text-zinc-500">{text[tool]}</p>;
}

function AreaList({ areas, unit, onPick }: { areas: Area[]; unit: Unit; onPick: (id: string) => void }) {
  if (!areas.length) return <p className="text-zinc-500">No Areas yet.</p>;
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-zinc-500 uppercase">Areas on this Floor</h3>
      {areas.map((a) => (
        <button key={a.id} onClick={() => onPick(a.id)} className="flex w-full justify-between rounded px-2 py-1.5 hover:bg-zinc-100">
          <span>{a.name}</span>
          <span className="text-zinc-500">{formatArea(Math.abs(signedArea(a.corners)), unit)}</span>
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="mb-1 text-xs font-semibold text-zinc-500 uppercase">{title}</h3>
      {children}
    </div>
  );
}

function AreaProps({
  a,
  unit,
  bad,
  setHover,
  onRename,
  onKind,
  onLength,
  onAngle,
  onSelect,
  onDelete,
}: {
  a: Area;
  unit: Unit;
  bad: string | null;
  setHover: (h: Hover) => void;
  onRename: (n: string) => void;
  onKind: (i: number, k: EdgeKind) => void;
  onLength: (i: number, L: number) => void;
  onAngle: (i: number, d: number) => void;
  onSelect: (s: Sel) => void;
  onDelete: () => void;
}) {
  const n = a.corners.length;
  const perimeter = a.corners.reduce((s, _, i) => s + edgeLength(a.corners, i), 0);
  return (
    <>
      <Section title="Area">
        <input
          key={a.id}
          defaultValue={a.name}
          onBlur={(e) => e.target.value !== a.name && onRename(e.target.value)}
          className="w-full rounded border border-zinc-300 px-2 py-1 font-semibold"
        />
        <div className="mt-1 text-xs text-zinc-500">
          Linked Home Assistant area: (not in this prototype) · {formatArea(Math.abs(signedArea(a.corners)), unit)} · perimeter{" "}
          {formatLength(perimeter, unit)}
        </div>
        {bad && <div className="mt-2 rounded bg-red-100 px-2 py-1 text-red-800">{bad}</div>}
      </Section>
      <Section title="Edges">
        <table className="w-full">
          <tbody>
            {a.corners.map((_, i) => (
              <tr key={i} onMouseEnter={() => setHover({ id: a.id, edge: i })} onMouseLeave={() => setHover(null)} className="border-t border-zinc-100 hover:bg-blue-50">
                <td className="py-1">
                  <button onClick={() => onSelect({ type: "edge", id: a.id, i })} className="font-mono hover:text-blue-600">
                    {letter(i)}–{letter(mod(i + 1, n))}
                  </button>
                </td>
                <td>
                  <KindToggle kind={a.kinds[i]} onChange={(k) => onKind(i, k)} />
                </td>
                <td className="text-right">
                  <CellInput display={formatLength(edgeLength(a.corners, i), unit)} parse={(t) => parseLength(t, unit)} onCommit={(v) => onLength(i, v)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Corners (interior angle)">
        <table className="w-full">
          <tbody>
            {a.corners.map((_, i) => (
              <tr key={i} onMouseEnter={() => setHover({ id: a.id, corner: i })} onMouseLeave={() => setHover(null)} className="border-t border-zinc-100 hover:bg-blue-50">
                <td className="py-1">
                  <button onClick={() => onSelect({ type: "corner", id: a.id, i })} className="font-mono hover:text-blue-600">
                    {letter(i)}
                  </button>
                </td>
                <td className="text-right">
                  <CellInput display={formatAngle(cornerAngle(a.corners, i))} parse={parseAngle} onCommit={(v) => onAngle(i, v)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-zinc-500">
          A new angle at a corner turns the Edge that starts there. The next corner slides along the Edge after it.
        </p>
      </Section>
      <button onClick={onDelete} className="rounded border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50">
        Delete Area
      </button>
    </>
  );
}

function EdgeProps({
  a,
  i,
  unit,
  onKind,
  onLength,
  onAngle,
}: {
  a: Area;
  i: number;
  unit: Unit;
  onKind: (k: EdgeKind) => void;
  onLength: (L: number) => void;
  onAngle: (corner: number, d: number) => void;
}) {
  const n = a.corners.length;
  const j = mod(i + 1, n);
  return (
    <>
      <Section title={`Edge ${letter(i)}–${letter(j)}`}>
        <div className="flex items-center justify-between py-1">
          <span>Kind</span>
          <KindToggle kind={a.kinds[i]} onChange={onKind} />
        </div>
        <div className="flex items-center justify-between py-1">
          <span>Length</span>
          <CellInput autoFocus display={formatLength(edgeLength(a.corners, i), unit)} parse={(t) => parseLength(t, unit)} onCommit={onLength} />
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          A new length moves corner {letter(j)} along this Edge. Edge {letter(j)}–{letter(mod(j + 1, n))} moves with it. All angles stay
          the same.
        </p>
      </Section>
      <Section title="Corners at the ends">
        {[i, j].map((c) => (
          <div key={c} className="flex items-center justify-between py-1">
            <span className="font-mono">{letter(c)}</span>
            <CellInput display={formatAngle(cornerAngle(a.corners, c))} parse={parseAngle} onCommit={(v) => onAngle(c, v)} />
          </div>
        ))}
      </Section>
    </>
  );
}

function CornerProps({ a, i, unit, onAngle }: { a: Area; i: number; unit: Unit; onAngle: (d: number) => void }) {
  const c = a.corners[i];
  return (
    <Section title={`Corner ${letter(i)}`}>
      <div className="flex items-center justify-between py-1">
        <span>Interior angle</span>
        <CellInput autoFocus display={formatAngle(cornerAngle(a.corners, i))} parse={parseAngle} onCommit={onAngle} />
      </div>
      <div className="flex items-center justify-between py-1 text-zinc-600">
        <span>Position (x, y)</span>
        <span>
          {formatLength(c.x, unit)}, {formatLength(c.y, unit)}
        </span>
      </div>
    </Section>
  );
}

function KindToggle({ kind, onChange }: { kind: EdgeKind; onChange: (k: EdgeKind) => void }) {
  return (
    <div className="inline-flex rounded border border-zinc-300 p-0.5 text-xs">
      {(["wall", "open"] as const).map((k) => (
        <button key={k} onClick={() => onChange(k)} className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${kind === k ? "bg-zinc-900 text-white" : "text-zinc-600"}`}>
          <svg width={18} height={6}>
            <line x1={1} y1={3} x2={17} y2={3} stroke="currentColor" strokeWidth={k === "wall" ? 3.5 : 1.5} strokeDasharray={k === "open" ? "3 2" : undefined} />
          </svg>
          {k === "wall" ? "Wall" : "Open"}
        </button>
      ))}
    </div>
  );
}

function CellInput({
  display,
  parse,
  onCommit,
  autoFocus,
}: {
  display: string;
  parse: (t: string) => number | null;
  onCommit: (v: number) => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const bad = text !== null && parse(text) === null;
  return (
    <input
      autoFocus={autoFocus}
      value={text ?? display}
      onFocus={(e) => {
        setText(display);
        e.currentTarget.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== null && text !== display) {
          const v = parse(text);
          if (v !== null) onCommit(v);
        }
        setText(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(display);
          e.currentTarget.blur();
        }
      }}
      className={`w-28 rounded border px-1.5 py-0.5 text-right outline-none ${bad ? "border-red-500" : "border-zinc-300 focus:border-blue-500"}`}
    />
  );
}

function UnitToggle({ unit, setUnit }: { unit: Unit; setUnit: (u: Unit) => void }) {
  return (
    <div className="inline-flex rounded-md border border-zinc-300 p-0.5">
      {(["metric", "imperial"] as const).map((u) => (
        <button key={u} onClick={() => setUnit(u)} className={`rounded px-2 py-1 ${unit === u ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}>
          {u === "metric" ? "m" : "ft-in"}
        </button>
      ))}
    </div>
  );
}

// "Surface the state": the stored corners, in meters, with no rounding.
function StatePanel({ areas, sel }: { areas: Area[]; sel: Sel }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-zinc-200 p-2 text-xs">
      <button onClick={() => setOpen(!open)} className="rounded bg-zinc-800 px-2 py-1 font-mono text-white">
        {open ? "hide stored state" : "stored state"}
      </button>
      {open && (
        <pre className="mt-1 max-h-[40vh] overflow-auto rounded bg-zinc-900 p-2 font-mono text-[11px] text-green-300">
          {JSON.stringify({ selection: sel, areas }, null, 2)}
        </pre>
      )}
    </div>
  );
}

function Grid() {
  const lines: ReactNode[] = [];
  for (let x = 0; x <= WORLD_W; x++)
    lines.push(<line key={`x${x}`} x1={px(x)} y1={0} x2={px(x)} y2={SVG_H} stroke={x % 5 ? "#f0f0f2" : "#d4d4d8"} />);
  for (let y = 0; y <= WORLD_H; y++)
    lines.push(<line key={`y${y}`} x1={0} y1={px(y)} x2={SVG_W} y2={px(y)} stroke={y % 5 ? "#f0f0f2" : "#d4d4d8"} />);
  return <g pointerEvents="none">{lines}</g>;
}

function ring(p: Pt[]): [number, number][] {
  return [...p, p[0]].map((c) => [c.x, c.y]);
}

function polygonArea(mp: [number, number][][][]) {
  let s = 0;
  for (const poly of mp)
    for (const r of poly) {
      let a = 0;
      for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
      s += Math.abs(a / 2);
    }
  return s;
}
