import type { PlotFn, Relation } from './relation';

/** The part of the plane a graph shows: x from `x[0]` to `x[1]`, y from `y[0]` to `y[1]`. */
export interface Box {
  x: [number, number];
  y: [number, number];
}

export const DEFAULT_BOX: Box = { x: [-5, 5], y: [-5, 5] };

/** Samples per look at a function; odd, so the middle one is 0. */
const SAMPLES = 401;
/** The widest and narrowest looks, as half-widths: 0.01, 0.02, 0.05, 0.1, ... 100000. */
const SCALES = Array.from({ length: 8 }, (_, decade) => [1, 2, 5].map((m) => m * 10 ** (decade - 2))).flat();
/** A look that shows this many distinct points of interest is wide enough. */
const ENOUGH = 3;
/** The least a fitted axis spans, so a small curve is not blown up to fill the node. */
const MIN_SPAN = 10;
/** How much room is left around what is fitted, as a share of each side. */
const PADDING = 0.12;

type Point = { t: number; v: number };

const finite = (n: number) => Number.isFinite(n);

/** Where `fn` crosses 0 between `a` and `b` (which it is known to), found by halving. */
function root(fn: PlotFn, a: number, b: number): Point | undefined {
  let [lo, hi] = [a, b];
  let [flo, fhi] = [fn(lo), fn(hi)];
  const size = Math.abs(flo) + Math.abs(fhi);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const fm = fn(mid);
    if (!finite(fm)) return undefined;
    if (Math.sign(fm) === Math.sign(flo)) [lo, flo] = [mid, fm];
    else [hi, fhi] = [mid, fm];
  }
  // A jump (1/x, tan) changes sign without crossing: what is left at the "root" is still large.
  const t = (lo + hi) / 2;
  const v = fn(t);
  return finite(v) && Math.abs(v) <= 1e-3 * size ? { t, v: 0 } : undefined;
}

/** The points of interest of `fn` on [-scale, scale]: where it crosses the axes, and its peaks and dips. */
function interesting(fn: PlotFn, scale: number): Point[] {
  const ts = Array.from({ length: SAMPLES }, (_, i) => -scale + (2 * scale * i) / (SAMPLES - 1));
  const vs = ts.map(fn);
  const points: Point[] = [];
  const atZero = vs[(SAMPLES - 1) / 2];
  if (finite(atZero)) points.push({ t: 0, v: atZero });
  const biggest = Math.max(0, ...vs.filter(finite).map(Math.abs));
  const noise = 1e-10 * biggest;
  const sizes = vs
    .filter(finite)
    .map(Math.abs)
    .sort((p, q) => p - q);
  const typical = sizes[Math.floor(sizes.length / 2)] ?? 0;
  for (let i = 0; i < SAMPLES - 1; i++) {
    const [a, b] = [vs[i], vs[i + 1]];
    // Where the curve starts or stops being drawn (a restriction, the edge of a domain) is worth seeing.
    if (finite(a) !== finite(b)) {
      // Not at a pole, where the value on the finite side is already enormous.
      const edge = finite(a) ? { t: ts[i], v: a } : { t: ts[i + 1], v: b };
      if (Math.abs(edge.v) <= 10 * typical + 1e-12) points.push(edge);
    }
    if (!finite(a) || !finite(b)) continue;
    if (a === 0) points.push({ t: ts[i], v: 0 });
    else if (a * b < 0) {
      const crossing = root(fn, ts[i], ts[i + 1]);
      if (crossing) points.push(crossing);
    }
    if (i > 0 && finite(vs[i - 1])) {
      const [before, after] = [a - vs[i - 1], b - a];
      if (before * after < 0 && Math.abs(before) > noise && Math.abs(after) > noise)
        points.push({ t: ts[i], v: a });
    }
  }
  // Points closer together than a few samples are one.
  const gap = (4 * scale) / SAMPLES;
  return points.filter((p, i) => points.findIndex((q) => Math.abs(q.t - p.t) <= gap) === i);
}

/** Widens `[lo, hi]` to include 0 when 0 is not far off, and gives a single point some width. */
function frame([lo, hi]: [number, number]): [number, number] {
  if (hi - lo < 1e-12 * Math.max(1, Math.abs(lo), Math.abs(hi))) {
    const m = Math.max(Math.abs(lo), 1);
    return [lo - m, hi + m];
  }
  const span = hi - lo;
  if (lo > 0 && lo <= 3 * span) return [0, hi];
  if (hi < 0 && -hi <= 3 * span) return [lo, 0];
  return [lo, hi];
}

/** At least `MIN_SPAN` wide, around the middle of `[lo, hi]`. */
function atLeast([lo, hi]: [number, number], span: number): [number, number] {
  if (hi - lo >= span) return [lo, hi];
  const mid = (lo + hi) / 2;
  return [mid - span / 2, mid + span / 2];
}

/** The 1st to 99th percentile of the finite `values`, so a function that shoots off does not squash the rest. */
function percentiles(values: number[]): [number, number] | undefined {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  return [sorted[Math.floor(0.01 * (sorted.length - 1))], sorted[Math.ceil(0.99 * (sorted.length - 1))]];
}

/**
 * What to see of a function of one variable: `t` is the one it is given, `v` what it gives. The window in `t` is the
 * smallest look at which a few points of interest show (so a line crossing at 65 is found, a sine's wiggles stop
 * at the first few); in `v` it is what the function does over that window.
 */
function view(fn: PlotFn): { t: [number, number]; v: [number, number] } | undefined {
  // The narrowest look that shows the most: a few points settle it, and a function with fewer (a line has two)
  // gets the first look that finds them all, before a wider one runs them together.
  let found: Point[] = [];
  for (const scale of SCALES) {
    const here = interesting(fn, scale);
    if (here.length > found.length) found = here;
    if (found.length >= ENOUGH) break;
  }
  const ts = found.map((p) => p.t);
  const vs = found.map((p) => p.v);
  const t = atLeast(frame(ts.length ? [Math.min(...ts), Math.max(...ts)] : [0, 0]), MIN_SPAN);
  const room = (t[1] - t[0]) * PADDING;
  const [from, to] = [t[0] - room, t[1] + room];
  const seen = percentiles(
    Array.from({ length: SAMPLES }, (_, i) => fn(from + ((to - from) * i) / (SAMPLES - 1))),
  );
  if (!seen) return undefined;
  const v = frame([Math.min(seen[0], ...vs), Math.max(seen[1], ...vs)]);
  return { t, v };
}

/** The function a row draws over `y = fn(x)` or `x = fn(y)`, which is all that is fitted. */
const asFunction = (relation: Relation): { fn: PlotFn; swapped: boolean } | undefined => {
  if (relation.kind === 'y' || relation.kind === 'x') {
    const { fn, where } = relation;
    const swapped = relation.kind === 'x';
    // Where a restriction holds nowhere the function has no value, as outside its own domain.
    if (!where) return { fn, swapped };
    return {
      swapped,
      fn: (t) => {
        const v = fn(t);
        return (swapped ? where(v, t) : where(t, v)) ? v : Number.NaN;
      },
    };
  }
  if (relation.kind === 'region') return { fn: relation.fn, swapped: relation.axis === 'x' };
  return undefined;
};

/** `lo` and `hi` pushed out to numbers with two significant figures at the scale of the span, so a view holds still while typing. */
function tidy([lo, hi]: [number, number]): [number, number] {
  const step = 10 ** (Math.floor(Math.log10(hi - lo)) - 1);
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}

/**
 * The window that shows what matters of every row: where each curve crosses the axes and turns, around the origin
 * when that is near. Rows that are not a function of one variable (circles, shaded areas) add nothing; undefined
 * when no row does.
 */
export function fitBox(relations: ReadonlyArray<Relation | null>): Box | undefined {
  const x: number[] = [];
  const y: number[] = [];
  for (const relation of relations) {
    const f = relation && asFunction(relation);
    const seen = f && view(f.fn);
    if (!f || !seen) continue;
    const [xs, ys] = f.swapped ? [seen.v, seen.t] : [seen.t, seen.v];
    x.push(...xs);
    y.push(...ys);
  }
  if (x.length === 0) return undefined;
  const pad = ([lo, hi]: [number, number]): [number, number] => {
    const room = (hi - lo) * PADDING;
    return tidy([lo - room, hi + room]);
  };
  const box = { x: pad([Math.min(...x), Math.max(...x)]), y: pad([Math.min(...y), Math.max(...y)]) };
  return [...box.x, ...box.y].every(finite) && box.x[1] > box.x[0] && box.y[1] > box.y[0] ? box : undefined;
}

/** The grid step (1, 2 or 5 times a power of ten) that is at least `least` units wide. */
export function niceStep(least: number): number {
  if (!(least > 0) || !Number.isFinite(least)) return 1;
  const power = 10 ** Math.floor(Math.log10(least));
  return [1, 2, 5, 10].map((m) => m * power).find((step) => step >= least * (1 - 1e-9)) as number;
}
