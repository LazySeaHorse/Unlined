import type { Expression } from '@cortex-js/compute-engine';
import type { Engine } from '@/lib/math/engine';

export type PlotFn = (t: number) => number;
export type PlotFn2 = (x: number, y: number) => number;

/** The comparisons Mafs can shade, as it spells them. */
export type Comparison = '<' | '<=' | '>' | '>=';

/** What a row of the graph draws. `x`-kinds take y and give x, so `x=3` is a vertical line. `implicit` is where fn = 0. */
export type Relation =
  | { kind: 'y'; fn: PlotFn }
  | { kind: 'x'; fn: PlotFn }
  | { kind: 'implicit'; fn: PlotFn2 }
  | { kind: 'region'; axis: 'x' | 'y'; op: Comparison; fn: PlotFn };

const COMPARISONS: Record<string, Comparison | '='> = {
  Equal: '=',
  Less: '<',
  LessEqual: '<=',
  Greater: '>',
  GreaterEqual: '>=',
};

const FLIPPED: Record<Comparison, Comparison> = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' };

/**
 * `symbol` and `ops` exist only on the engine's narrowed symbol and function types. Its guards for them are
 * runtime exports, which would load the engine with the app, so the parts are read structurally instead.
 */
type Parts = Expression & { symbol?: string; ops?: readonly Parts[] };

const isXorY = (name: string) => name === 'x' || name === 'y';

const onlyUses = (expr: Expression, allowed: string) =>
  expr.unknowns.every((name: string) => name === allowed);

/** A single-letter operator is a function the user names (`f(x)`); the engine's own are longer (`Sin`). */
const isNamedCall = (expr: Parts, variable: string) =>
  /^[a-zA-Z]$/.test(expr.operator) && expr.ops?.length === 1 && expr.ops[0].symbol === variable;

function compileIn({ compile }: Engine, expr: Expression, variable: 'x' | 'y'): PlotFn | null {
  const compiled = compile(expr);
  if (!compiled.success) return null;
  return (t) => {
    const value = compiled.run({ [variable]: t });
    return typeof value === 'number' ? value : Number.NaN;
  };
}

function compileXY({ compile }: Engine, expr: Expression): PlotFn2 | null {
  const compiled = compile(expr);
  if (!compiled.success) return null;
  return (x, y) => {
    const value = compiled.run({ x, y });
    return typeof value === 'number' ? value : Number.NaN;
  };
}

/**
 * Reads a row as a graphing calculator would: `y=x^2`, `f(x)=…` or a bare `x^2` is a curve y of x; `x=3` is x of y;
 * `y>x`, `x≤2y` shade a side of one; `x^2+y^2=1` is the curve where both sides agree. Anything it cannot draw (empty, invalid, other letters) gives null.
 */
export function classifyRelation(engine: Engine, latex: string): Relation | null {
  if (!latex.trim()) return null;
  try {
    const expr: Parts = engine.ce.parse(latex);
    if (!expr.isValid) return null;
    const comparison = COMPARISONS[expr.operator];
    if (!comparison) return onlyUses(expr, 'x') ? curve(engine, expr, 'y') : null;

    const [left, right] = expr.ops ?? [];
    if (!left || !right) return null;
    // Solved for y if it can be (so `y>x` is a region of y though the engine stores it as `x<y`), else for x,
    // with the variable on either side: `y<x+1`, or `x+1>y` written the other way round.
    const sides = [
      [left, right, comparison],
      [right, left, comparison === '=' ? comparison : FLIPPED[comparison]],
    ] as const;
    for (const [axis, other] of [
      ['y', 'x'],
      ['x', 'y'],
    ] as const) {
      for (const [side, rest, op] of sides) {
        if (side.symbol === axis && onlyUses(rest, other)) return build(engine, axis, rest, op);
      }
    }
    // `f(x)=…`: only an equation, and only of x.
    if (comparison === '=' && isNamedCall(left, 'x') && onlyUses(right, 'x'))
      return curve(engine, right, 'y');
    if (comparison === '=' && expr.unknowns.length > 0 && expr.unknowns.every(isXorY)) {
      const fn = compileXY(engine, left.sub(right));
      return fn && { kind: 'implicit', fn };
    }
    return null;
  } catch {
    return null;
  }
}

function curve(engine: Engine, expr: Expression, kind: 'x' | 'y'): Relation | null {
  const fn = compileIn(engine, expr, kind === 'y' ? 'x' : 'y');
  return fn && { kind, fn };
}

function build(engine: Engine, axis: 'x' | 'y', expr: Expression, op: Comparison | '='): Relation | null {
  const fn = compileIn(engine, expr, axis === 'y' ? 'x' : 'y');
  if (!fn) return null;
  return op === '=' ? { kind: axis, fn } : { kind: 'region', axis, op, fn };
}
