import type { Relation } from './relation';

/** The window being shown, in graph coordinates, and its size on screen. */
export interface Frame {
  x: readonly [number, number];
  y: readonly [number, number];
  width: number;
  height: number;
}

/** What a hover found: a point of the graph, and what kind of place it is. */
export interface Hit {
  x: number;
  y: number;
  kind: 'point' | 'crossing' | 'axis' | 'curve';
}

type Pt = readonly [number, number];
/** A piece of a curve without gaps. `owner` is the row it belongs to; the axes are -1 (x axis) and -2 (y axis). */
interface Run {
  owner: number;
  pts: Pt[];
}

export interface Probe {
  frame: Frame;
  runs: Run[];
  /** Places the pointer snaps to: drawn points, crossings of two curves, and where curves cross the axes. */
  specials: Hit[];
}

const SAMPLES = 500;
/** How near, in pixels, the pointer must be to snap to a special place, and to a curve. */
export const SNAP_PX = 14;
export const CURVE_PX = 10;
const GRID = 32;

/** Pixels from the window's left and top edge. */
export const toPx = (f: Frame, [x, y]: Pt): Pt => [
  ((x - f.x[0]) / (f.x[1] - f.x[0])) * f.width,
  ((f.y[1] - y) / (f.y[1] - f.y[0])) * f.height,
];

/** The pieces of a row's curve over the window: where it has no value, or the restriction fails, or it jumps across more than a few windows' height (a pole), the curve is broken. */
function runsOf(relation: Relation, owner: number, f: Frame): Run[] {
  if (relation.kind !== 'y' && relation.kind !== 'x') return [];
  const swapped = relation.kind === 'x';
  const [from, to] = swapped ? f.y : f.x;
  const across = swapped ? f.x : f.y;
  const jump = 3 * Math.abs(across[1] - across[0]);
  const runs: Run[] = [];
  let current: Pt[] | undefined;
  let last = Number.NaN;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = from + ((to - from) * i) / SAMPLES;
    const v = relation.fn(t);
    const p: Pt = swapped ? [v, t] : [t, v];
    if (!Number.isFinite(v) || (relation.where && !relation.where(p[0], p[1]))) {
      current = undefined;
      continue;
    }
    if (!current || Math.abs(v - last) > jump) {
      current = [];
      runs.push({ owner, pts: current });
    }
    current.push(p);
    last = v;
  }
  return runs;
}

/** Where segment a-b meets segment c-d, if it does. */
function meet(a: Pt, b: Pt, c: Pt, d: Pt): Pt | undefined {
  const [rx, ry] = [b[0] - a[0], b[1] - a[1]];
  const [sx, sy] = [d[0] - c[0], d[1] - c[1]];
  const denom = rx * sy - ry * sx;
  if (denom === 0) return undefined;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denom;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * rx, a[1] + t * ry] : undefined;
}

/** Every place two different curves (or a curve and an axis) meet, found by sorting segments into a grid of cells. */
function crossings(runs: Run[], f: Frame): Hit[] {
  type Seg = { owner: number; a: Pt; b: Pt };
  const cells = new Map<number, Seg[]>();
  const cellOf = (p: Pt): [number, number] => {
    const [px, py] = toPx(f, p);
    const clamp = (n: number) => Math.max(0, Math.min(GRID - 1, Math.floor(n)));
    return [clamp((px / f.width) * GRID), clamp((py / f.height) * GRID)];
  };
  for (const { owner, pts } of runs)
    for (let i = 0; i + 1 < pts.length; i++) {
      const seg = { owner, a: pts[i], b: pts[i + 1] };
      const [c0, r0] = cellOf(seg.a);
      const [c1, r1] = cellOf(seg.b);
      for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++)
        for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) {
          const key = r * GRID + c;
          const list = cells.get(key);
          if (list) list.push(seg);
          else cells.set(key, [seg]);
        }
    }
  const found = new Map<string, Hit>();
  for (const segs of cells.values())
    for (let i = 0; i < segs.length; i++)
      for (let j = i + 1; j < segs.length; j++) {
        const [s, t] = [segs[i], segs[j]];
        if (s.owner === t.owner) continue;
        const at = meet(s.a, s.b, t.a, t.b);
        if (!at) continue;
        const [px, py] = toPx(f, at);
        const key = `${Math.round(px / 2)},${Math.round(py / 2)}`;
        if (!found.has(key))
          found.set(key, { x: at[0], y: at[1], kind: s.owner < 0 || t.owner < 0 ? 'axis' : 'crossing' });
      }
  return [...found.values()];
}

/** Gets everything a hover needs of the rows over `frame`; built once per window and set of rows. */
export function buildProbe(relations: ReadonlyArray<Relation | null>, frame: Frame): Probe {
  const runs: Run[] = [];
  const specials: Hit[] = [];
  relations.forEach((relation, index) => {
    if (!relation) return;
    runs.push(...runsOf(relation, index, frame));
    if (relation.kind === 'points')
      for (const [x, y] of relation.points)
        if (x >= frame.x[0] && x <= frame.x[1] && y >= frame.y[0] && y <= frame.y[1])
          specials.push({ x, y, kind: 'point' });
  });
  const axes: Run[] = [
    {
      owner: -1,
      pts: [
        [frame.x[0], 0],
        [frame.x[1], 0],
      ],
    },
    {
      owner: -2,
      pts: [
        [0, frame.y[0]],
        [0, frame.y[1]],
      ],
    },
  ];
  specials.push(...crossings([...runs, ...axes], frame));
  return { frame, runs, specials };
}

/** What is under the pointer at (`px`, `py`) pixels from the window's top left: a special place within reach, else the nearest point of a curve. */
export function probeAt(probe: Probe, px: number, py: number): Hit | undefined {
  const { frame, runs, specials } = probe;
  let best: { hit: Hit; d: number } | undefined;
  for (const hit of specials) {
    const [sx, sy] = toPx(frame, [hit.x, hit.y]);
    const d = Math.hypot(sx - px, sy - py);
    // Drawn points win over crossings that happen to be as near.
    const weight = hit.kind === 'point' ? d - 4 : d;
    if (d <= SNAP_PX && (!best || weight < best.d)) best = { hit, d: weight };
  }
  if (best) return best.hit;
  let near: { hit: Hit; d: number } | undefined;
  for (const { pts } of runs)
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = toPx(frame, pts[i]);
      const [bx, by] = toPx(frame, pts[i + 1]);
      const [dx, dy] = [bx - ax, by - ay];
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const d = Math.hypot(ax + t * dx - px, ay + t * dy - py);
      if (d <= CURVE_PX && (!near || d < near.d)) {
        const [p, q] = [pts[i], pts[i + 1]];
        near = { d, hit: { x: p[0] + t * (q[0] - p[0]), y: p[1] + t * (q[1] - p[1]), kind: 'curve' } };
      }
    }
  return near?.hit;
}

/** A coordinate as the tooltip shows it: five significant figures, no floating point dust. */
export function coordinate(n: number): string {
  if (Math.abs(n) < 1e-9) return '0';
  return String(Number(n.toPrecision(5)));
}
