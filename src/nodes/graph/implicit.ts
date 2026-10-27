export type Interval = readonly [min: number, max: number];

/** A line piece of the curve, in graph coordinates: x1, y1, x2, y2. */
export type Segment = readonly [number, number, number, number];

/** Which cell edges the curve crosses, as pairs, for each corner pattern (see `pattern`). Edges: 0 bottom, 1 right, 2 top, 3 left. */
const PIECES: readonly (readonly (readonly [number, number])[])[] = [
  [],
  [[3, 0]],
  [[0, 1]],
  [[3, 1]],
  [[1, 2]],
  [], // 5: the two opposite corners; decided by the middle of the cell
  [[0, 2]],
  [[3, 2]],
  [[3, 2]],
  [[0, 2]],
  [], // 10: likewise
  [[1, 2]],
  [[3, 1]],
  [[0, 1]],
  [[3, 0]],
  [],
];

/**
 * Traces `f(x, y) = 0` over a window with marching squares: each cell of a `cells`×`cells` grid whose corners differ
 * in sign holds a piece of the curve, placed by interpolating along the cell's edges.
 * Cells with a corner that is not a finite number are skipped, and so are sign changes that are only a jump in the
 * function (as across the asymptotes of `y = tan x`): at a real crossing the function is nearer zero than at either end.
 */
export function implicitSegments(
  f: (x: number, y: number) => number,
  [x0, x1]: Interval,
  [y0, y1]: Interval,
  cells = 200,
): Segment[] {
  const dx = (x1 - x0) / cells;
  const dy = (y1 - y0) / cells;
  const side = cells + 1;
  const values = new Float64Array(side * side);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) values[j * side + i] = f(x0 + i * dx, y0 + j * dy);
  }

  /** Where the curve crosses the edge from corner `a` to corner `b`, or null if it only jumps there. */
  const crossing = (xa: number, ya: number, va: number, xb: number, yb: number, vb: number) => {
    const t = va / (va - vb);
    const x = xa + t * (xb - xa);
    const y = ya + t * (yb - ya);
    const nearest = Math.min(Math.abs(va), Math.abs(vb));
    const farthest = Math.max(Math.abs(va), Math.abs(vb));
    return Math.abs(f(x, y)) <= Math.max(nearest, 1e-9 * farthest) ? ([x, y] as const) : null;
  };

  const segments: Segment[] = [];
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const xl = x0 + i * dx;
      const yb = y0 + j * dy;
      const bl = values[j * side + i];
      const br = values[j * side + i + 1];
      const tr = values[(j + 1) * side + i + 1];
      const tl = values[(j + 1) * side + i];
      if (!(Number.isFinite(bl) && Number.isFinite(br) && Number.isFinite(tr) && Number.isFinite(tl)))
        continue;

      const pattern = (bl > 0 ? 1 : 0) | (br > 0 ? 2 : 0) | (tr > 0 ? 4 : 0) | (tl > 0 ? 8 : 0);
      const xr = xl + dx;
      const yt = yb + dy;
      const edge = (e: number) => {
        switch (e) {
          case 0:
            return crossing(xl, yb, bl, xr, yb, br);
          case 1:
            return crossing(xr, yb, br, xr, yt, tr);
          case 2:
            return crossing(xl, yt, tl, xr, yt, tr);
          default:
            return crossing(xl, yb, bl, xl, yt, tl);
        }
      };

      let pieces = PIECES[pattern];
      if (pattern === 5 || pattern === 10) {
        // Two corners of one sign face each other: the curve either cuts both off or runs between them,
        // as the (average) value in the middle of the cell says.
        const joined = (bl + br + tr + tl) / 4 > 0;
        const cutOff: (readonly [number, number])[] =
          pattern === 5
            ? [
                [3, 0],
                [1, 2],
              ]
            : [
                [0, 1],
                [3, 2],
              ];
        const between: (readonly [number, number])[] =
          pattern === 5
            ? [
                [3, 2],
                [0, 1],
              ]
            : [
                [3, 0],
                [1, 2],
              ];
        pieces = (pattern === 5) === joined ? between : cutOff;
      }
      for (const [a, b] of pieces) {
        const from = edge(a);
        const to = edge(b);
        if (from && to) segments.push([from[0], from[1], to[0], to[1]]);
      }
    }
  }
  return segments;
}

/** The segments as one SVG path of separate `M … L …` pieces. */
export const segmentsPath = (segments: readonly Segment[]) =>
  segments.map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`).join('');
