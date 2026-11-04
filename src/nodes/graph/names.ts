import { fitText, hasMath, LABEL_END_MARGIN, type Measure, splitLabel } from '@/canvas/links/labels';
import { type Frame, type Run, runsOf, toPx } from './hover';
import type { Relation } from './relation';

/** Where the name of one row goes, in pixels from the window's top left. */
export type NameSpot =
  | {
      /** Plain text along the curve: the stretch as an SVG path, read left to right (or bottom to top). */
      kind: 'along';
      d: string;
      text: string;
      /** Distance along `d` to the middle of the text. */
      offset: number;
    }
  | {
      /** A formula, which cannot bend: HTML at `x`,`y`, turned to `angle` degrees. */
      kind: 'tilted';
      x: number;
      y: number;
      angle: number;
    }
  | {
      /** Beside a point: `x`,`y` is the dot, the text grows away from it to `side`. */
      kind: 'beside';
      x: number;
      y: number;
      side: 'left' | 'right';
      text: string;
      room: number;
    };

type Pt = readonly [number, number];

/** Room kept clear inside the window: the rulers sit on the left and bottom edges when they show. */
const INSET = { left: 34, right: 8, top: 8, bottom: 26 };
/** The most a curve may turn, in radians, under its name: text on a path with more of a bend looks broken. */
export const MAX_BEND = 0.5;
/** Gap, in pixels, between the curve and its name. */
export const NAME_GAP = 7;
/** Gap between a point and its name. */
const POINT_GAP = 10;
/** The least room a name beside a point may be cut to. */
const MIN_BESIDE = 28;
/** The vertex spacing, in pixels, of the path a name is set on. */
const PATH_STEP = 8;
/** Spacing, in pixels, of the places along a stretch tried for the name. */
const STEP = 6;

/** The width of a name with formulas in it, guessed (KaTeX is not measured until it is on screen): about a character per source symbol. */
export function mathWidth(name: string, measure: Measure): number {
  let width = 0;
  for (const part of splitLabel(name)) {
    if (part.math) width += part.text.replace(/\\[a-zA-Z]+|[{}^_\s]/g, '').length * 9 + 6;
    else width += measure(part.text);
  }
  return width;
}

const inside = (p: Pt, f: Frame) =>
  p[0] >= INSET.left && p[0] <= f.width - INSET.right && p[1] >= INSET.top && p[1] <= f.height - INSET.bottom;

/** The pieces of the runs that lie inside the window (less its insets), in pixels. */
function visiblePieces(runs: Run[], f: Frame): Pt[][] {
  const pieces: Pt[][] = [];
  for (const { pts } of runs) {
    let piece: Pt[] | undefined;
    for (const p of pts) {
      const q = toPx(f, p);
      if (!Number.isFinite(q[0] + q[1]) || !inside(q, f)) {
        piece = undefined;
        continue;
      }
      if (!piece) {
        piece = [];
        pieces.push(piece);
      }
      piece.push(q);
    }
  }
  return pieces;
}

const lengthOf = (pts: Pt[]) => {
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return total;
};

/** The longest stretch of the curve that is on screen, in pixels, or none if none of it is. */
export function longestStretch(runs: Run[], f: Frame): Pt[] | undefined {
  let best: Pt[] | undefined;
  let bestLength = 0;
  for (const piece of visiblePieces(runs, f)) {
    const length = lengthOf(piece);
    if (length > bestLength) {
      best = piece;
      bestLength = length;
    }
  }
  return best;
}

/** The stretch with a vertex every few pixels at most: it is sampled finer than glyphs placed on a path can use, and on such a short zig-zag they crowd and jitter. */
function thinned(pts: Pt[]): Pt[] {
  const kept: Pt[] = [];
  pts.forEach((p, i) => {
    const last = kept[kept.length - 1];
    if (!last || i === pts.length - 1 || Math.hypot(p[0] - last[0], p[1] - last[1]) >= PATH_STEP)
      kept.push(p);
  });
  return kept;
}

const pathOf = (pts: Pt[]) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');

/** Text along a path must not run upside down: right-to-left and top-to-bottom stretches read from their other end. */
const upsideDown = (from: Pt, to: Pt) => to[0] < from[0] || (to[0] === from[0] && to[1] > from[1]);

/**
 * Where, along a stretch, a label `width` long can sit with the curve under it bending no more than MAX_BEND: the
 * place nearest the middle that does. The distances along the stretch to its start and end, or none when it is
 * too short or too bent everywhere.
 */
export function straightestSpan(
  pts: Pt[],
  width: number,
): { from: number; to: number; start: number; end: number } | undefined {
  // Distance along the stretch at each vertex, and the turn accumulated up to it.
  const along = [0];
  const turned = [0];
  for (let i = 1; i < pts.length; i++) {
    along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    if (i > 1) {
      const a = Math.atan2(pts[i - 1][1] - pts[i - 2][1], pts[i - 1][0] - pts[i - 2][0]);
      const b = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
      let turn = Math.abs(b - a);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      turned.push(turned[i - 1] + (Number.isFinite(turn) ? turn : 0));
    } else turned.push(0);
  }
  const total = along[along.length - 1];
  const need = width + 2 * LABEL_END_MARGIN;
  if (!(total >= need)) return undefined;
  const indexAt = (s: number) => {
    let lo = 0;
    let hi = along.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (along[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  // Middle first, then outwards, so the label stays as central as the bends allow.
  const room = total - need;
  const tries = Math.floor(room / STEP / 2);
  for (let k = 0; k <= tries + 1; k++)
    for (const sign of k === 0 ? [1] : [1, -1]) {
      const centre = Math.min(total - need / 2, Math.max(need / 2, total / 2 + sign * k * STEP));
      const [from, to] = [centre - width / 2, centre + width / 2];
      const [i, j] = [indexAt(from), indexAt(to)];
      if (turned[j] - turned[i] <= MAX_BEND) return { from, to, start: i, end: j };
    }
  return undefined;
}

/** Where a curve's name goes, or none when the curve has no stretch that is long and straight enough. */
export function placeAlongCurve(runs: Run[], f: Frame, name: string, measure: Measure): NameSpot | undefined {
  const stretch = longestStretch(runs, f);
  if (!stretch) return undefined;
  const math = hasMath(name);
  // Cut plain text to the stretch first, so a long name is shortened rather than dropped.
  const text = math ? '' : fitText(name, lengthOf(stretch) - 2 * LABEL_END_MARGIN, measure);
  if (!math && !text) return undefined;
  const width = math ? mathWidth(name, measure) : measure(text);
  const span = straightestSpan(stretch, width);
  if (!span) return undefined;
  const a = stretch[span.start];
  const b = stretch[span.end];
  const reverse = upsideDown(a, b);
  if (math) {
    const mid = (span.from + span.to) / 2;
    // The point of the stretch at distance `mid`: the vertex nearest to it is exact enough at one vertex a pixel or so.
    let at = 0;
    let walked = 0;
    for (let i = 1; i < stretch.length && walked < mid; i++) {
      walked += Math.hypot(stretch[i][0] - stretch[i - 1][0], stretch[i][1] - stretch[i - 1][1]);
      at = i;
    }
    const angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    return {
      kind: 'tilted',
      x: stretch[at][0],
      y: stretch[at][1],
      angle: reverse ? angle + 180 : angle,
    };
  }
  const middle = (span.from + span.to) / 2;
  // The span was measured on the fine samples, the path is the thinned ones, a hair shorter: scale to match.
  const path = thinned(reverse ? [...stretch].reverse() : stretch);
  const [fine, thin] = [lengthOf(stretch), lengthOf(path)];
  const scaled = (middle / fine) * thin;
  return { kind: 'along', d: pathOf(path), text, offset: reverse ? thin - scaled : scaled };
}

/** Where a point's name goes: beside it, on the side with more room, cut to fit; none when there is no room. */
export function placeBesidePoint(
  at: Pt,
  f: Frame,
  name: string,
  measure: Measure,
): Extract<NameSpot, { kind: 'beside' }> | undefined {
  const [x, y] = at;
  if (x < INSET.left || x > f.width - INSET.right || y < INSET.top || y > f.height - INSET.bottom)
    return undefined;
  const left = x - POINT_GAP - INSET.left;
  const right = f.width - INSET.right - x - POINT_GAP;
  const side = right >= left ? 'right' : 'left';
  const room = Math.max(side === 'right' ? right : left, 0);
  if (room < MIN_BESIDE) return undefined;
  // A formula cannot be cut: it goes beside the point only when the guess of its width fits.
  if (hasMath(name))
    return mathWidth(name, measure) <= room ? { kind: 'beside', x, y, side, text: '', room } : undefined;
  const text = fitText(name, room, measure);
  return text ? { kind: 'beside', x, y, side, text, room } : undefined;
}

/**
 * Where each named row's name goes in the window, by row. Only `y=` and `x=` curves (restricted or not) and
 * points are named on the graph: implicit curves, inequalities and shaded regions have no single line to write
 * along, so their name shows in the hover chip only. A list of points is named once, at its first point in view.
 */
export function placeNames(
  relations: ReadonlyArray<Relation | null>,
  names: ReadonlyArray<string | undefined>,
  f: Frame,
  measure: Measure,
): Map<number, NameSpot> {
  const spots = new Map<number, NameSpot>();
  relations.forEach((relation, row) => {
    const name = names[row]?.trim();
    if (!relation || !name || !(f.width > 0 && f.height > 0)) return;
    let spot: NameSpot | undefined;
    if (relation.kind === 'y' || relation.kind === 'x')
      spot = placeAlongCurve(runsOf(relation, row, f), f, name, measure);
    else if (relation.kind === 'points')
      for (const p of relation.points) {
        spot = placeBesidePoint(toPx(f, p), f, name, measure);
        if (spot) break;
      }
    if (spot) spots.set(row, spot);
  });
  return spots;
}
