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
      // From the index, not `xl + dx`, so cells that share a grid line agree on it to the last digit.
      const xr = x0 + (i + 1) * dx;
      const yt = y0 + (j + 1) * dy;
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

/**
 * Fills where `f(x, y) > 0` over a window, as one SVG path of polygons: each cell of a `cells`×`cells` grid contributes the
 * part of it on the positive side, cut along the interpolated edge crossings, and unbroken runs of whole cells in a
 * row join into one rectangle so a large region stays small. One path, so the pieces fill without seams.
 * Cells with a corner that is not a finite number are left out.
 */
export function shadedPath(
  f: (x: number, y: number) => number,
  [x0, x1]: Interval,
  [y0, y1]: Interval,
  cells = 200,
): string {
  const dx = (x1 - x0) / cells;
  const dy = (y1 - y0) / cells;
  const side = cells + 1;
  const values = new Float64Array(side * side);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) values[j * side + i] = f(x0 + i * dx, y0 + j * dy);
  }

  const parts: string[] = [];
  const polygon = (points: readonly (readonly [number, number])[]) =>
    parts.push(`M${points.map(([x, y]) => `${x} ${y}`).join('L')}Z`);

  for (let j = 0; j < cells; j++) {
    const yb = y0 + j * dy;
    const yt = y0 + (j + 1) * dy;
    let runStart = -1;
    const endRun = (end: number) => {
      if (runStart < 0) return;
      const xl = x0 + runStart * dx;
      const xr = x0 + end * dx;
      polygon([
        [xl, yb],
        [xr, yb],
        [xr, yt],
        [xl, yt],
      ]);
      runStart = -1;
    };
    for (let i = 0; i < cells; i++) {
      const xl = x0 + i * dx;
      const xr = x0 + (i + 1) * dx;
      // Corners counter-clockwise from the bottom left.
      const corners = [
        [xl, yb, values[j * side + i]],
        [xr, yb, values[j * side + i + 1]],
        [xr, yt, values[(j + 1) * side + i + 1]],
        [xl, yt, values[(j + 1) * side + i]],
      ] as const;
      if (!corners.every(([, , v]) => Number.isFinite(v))) {
        endRun(i);
        continue;
      }
      const inside = corners.filter(([, , v]) => v > 0).length;
      if (inside === 4) {
        if (runStart < 0) runStart = i;
        continue;
      }
      endRun(i);
      if (inside === 0) continue;

      const points: [number, number][] = [];
      for (let k = 0; k < 4; k++) {
        const [xa, ya, va] = corners[k];
        const [xb, yb2, vb] = corners[(k + 1) % 4];
        if (va > 0) points.push([xa, ya]);
        if (va > 0 !== vb > 0) {
          const t = va / (va - vb);
          points.push([xa + t * (xb - xa), ya + t * (yb2 - ya)]);
        }
      }
      polygon(points);
    }
    endRun(cells);
  }
  return parts.join('');
}

/**
 * The segments as one SVG path, pieces that meet end to end joined into continuous lines (so a dashed edge dashes
 * along the whole curve, not afresh in every cell). Neighbouring cells compute the point on their shared edge from
 * the same two corners, so the ends they share match exactly.
 */
export function segmentsPath(segments: readonly Segment[]): string {
  const key = (x: number, y: number) => `${x},${y}`;
  const touching = new Map<string, number[]>();
  segments.forEach(([x1, y1, x2, y2], i) => {
    for (const k of [key(x1, y1), key(x2, y2)]) touching.set(k, [...(touching.get(k) ?? []), i]);
  });
  const used = new Set<number>();
  /** Takes the unused segment at `point`, and gives the far end of it. */
  const follow = (point: readonly [number, number]): [number, number] | undefined => {
    const i = touching.get(key(point[0], point[1]))?.find((j) => !used.has(j));
    if (i === undefined) return undefined;
    used.add(i);
    const [x1, y1, x2, y2] = segments[i];
    return x1 === point[0] && y1 === point[1] ? [x2, y2] : [x1, y1];
  };

  let d = '';
  segments.forEach(([x1, y1, x2, y2], i) => {
    if (used.has(i)) return;
    used.add(i);
    const line: [number, number][] = [
      [x1, y1],
      [x2, y2],
    ];
    for (let end = follow(line[line.length - 1]); end; end = follow(end)) line.push(end);
    for (let start = follow(line[0]); start; start = follow(start)) line.unshift(start);
    d += `M${line.map(([x, y]) => `${x} ${y}`).join('L')}`;
  });
  return d;
}
