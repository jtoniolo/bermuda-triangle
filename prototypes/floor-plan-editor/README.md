# PROTOTYPE: floor plan editor

This is throwaway code for the ticket "Prototype: The floor plan editor for drawing Edges with typed lengths" (#7). Do not use it as production code.

## Run

```sh
npm --prefix prototypes/floor-plan-editor install
npm --prefix prototypes/floor-plan-editor run dev
```

Open <http://localhost:3000/prototype/floor-plan-editor> for round 2. Round 1 is at <http://localhost:3000/prototype/floor-plan-editor/round-1>.

## Round 2

The user picked variant B of round 1. Round 2 has these changes:

- A properties panel shows the selected Area, Edge or corner.
- The rectangle tool draws a rectangle. A shape that touches or overlaps an Area merges with it into one Area.
- The user can drag corners and Edges. The connected parts follow.
- The app stores the corners. Lengths and angles come from the corners. There is no auto Edge.
- Snapping: 0.1 m, the x and y of near corners, and 45° steps for the line tool. Hold Alt to turn snapping off.

Rules for a typed value:

- A new length moves the far corner along the Edge. The next Edge moves with it and keeps its direction. All angles stay the same.
- A new angle at a corner turns the Edge that starts there. The next corner slides along the Edge after it.
- A dragged Edge moves parallel to itself. Its end corners slide along the Edges next to it.

## Round 1

- `?variant=A`: On the canvas. Rejected: too busy on a large floor plan.
- `?variant=B`: Edge table. Picked.
- `?variant=C`: Command line. Rejected.
