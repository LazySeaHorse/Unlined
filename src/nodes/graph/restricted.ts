import type { Interval } from './implicit';
import type { PlotFn, Where } from './relation';

/** Samples along a restricted curve. */
const SAMPLES = 1200;

/**
 * The path (in graph coordinates) of `fn` over `along` where `where` holds: `y = fn(x)`, or for `swapped` the curve
 * `x = fn(y)`. It breaks where the curve leaves the restriction, where the function has no value and where it jumps
 * across more than a few windows' height (`across` is the window in the value's direction, as for `tan`).
 */
export function restrictedPath(
  fn: PlotFn,
  where: Where,
  swapped: boolean,
  along: Interval,
  across: Interval,
): string {
  const [from, to] = along;
  const jump = 3 * Math.abs(across[1] - across[0]);
  let d = '';
  let pen: number | undefined;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = from + ((to - from) * i) / SAMPLES;
    const v = fn(t);
    const [x, y] = swapped ? [v, t] : [t, v];
    if (!Number.isFinite(v) || !where(x, y)) {
      pen = undefined;
      continue;
    }
    d += pen === undefined || Math.abs(v - pen) > jump ? `M${x} ${y}` : `L${x} ${y}`;
    pen = v;
  }
  return d;
}
