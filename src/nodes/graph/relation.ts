import type { Expression } from '@cortex-js/compute-engine';
import type { Engine } from '@/lib/math/engine';

export type PlotFn = (t: number) => number;
export type PlotFn2 = (x: number, y: number) => number;
/** A restriction, `{1<x<5}`: whether the point (x, y) is part of the row. */
export type Where = (x: number, y: number) => boolean;

/** The comparisons Mafs can shade, as it spells them. */
export type Comparison = '<' | '<=' | '>' | '>=';

/**
 * What a row of the graph draws. `x`-kinds take y and give x, so `x=3` is a vertical line. `implicit` is where fn = 0.
 * `shade` is where fn > 0: the margin by which every comparison in the row holds, `strict` when the boundary is not
 * part of it.
 */
export type Relation =
  | { kind: 'y'; fn: PlotFn; where?: Where }
  | { kind: 'x'; fn: PlotFn; where?: Where }
  | { kind: 'implicit'; fn: PlotFn2 }
  | { kind: 'shade'; fn: PlotFn2; strict: boolean }
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
 * `y>x`, `x≤2y` shade a side of one; `x^2+y^2=1` is the curve where both sides agree, and `1≤|x|≤2` or `x^2+y^2<4`
 * shade where every comparison holds. Anything it cannot draw (empty, invalid, other letters) gives null.
 */
function classifyBody(engine: Engine, latex: string): Relation | null {
  if (!latex.trim()) return null;
  try {
    const expr: Parts = engine.ce.parse(latex);
    if (!expr.isValid) return null;
    const comparison = COMPARISONS[expr.operator];
    if (!comparison) return onlyUses(expr, 'x') ? curve(engine, expr, 'y') : null;

    const operands = expr.ops ?? [];
    // More than two operands is a chain, `1<x<2`.
    if (operands.length !== 2) return comparison === '=' ? null : shade(engine, expr, comparison, operands);
    const [left, right] = operands;
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
    return comparison === '=' ? null : shade(engine, expr, comparison, operands);
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

/** Where every comparison of the row holds, as the smallest margin by which any one does. */
function shade(
  engine: Engine,
  expr: Expression,
  op: Comparison,
  operands: readonly Parts[],
): Relation | null {
  if (expr.unknowns.length === 0 || !expr.unknowns.every(isXorY)) return null;
  const ascending = op === '<' || op === '<=';
  const margins: PlotFn2[] = [];
  for (let i = 0; i + 1 < operands.length; i++) {
    const [a, b] = [operands[i], operands[i + 1]];
    const margin = compileXY(engine, ascending ? b.sub(a) : a.sub(b));
    if (!margin) return null;
    margins.push(margin);
  }
  return {
    kind: 'shade',
    fn: (x, y) => Math.min(...margins.map((margin) => margin(x, y))),
    strict: op === '<' || op === '>',
  };
}

const OPEN = /\\left\s*(?:\\\{|\\lbrace)|\\lbrace|\\\{/g;
const CLOSE = /\\right\s*(?:\\\}|\\rbrace)|\\rbrace|\\\}/g;

/**
 * The row without its restrictions, and the restrictions' text. A restriction is a group in braces at the end of
 * the row, as `\{1<x<5\}`, `\left\{…\right\}` or `\lbrace…\rbrace`; there may be several, and all must hold.
 */
export function splitRestrictions(latex: string): { body: string; where: string[] } {
  const where: string[] = [];
  let body = latex.trim().replace(/(\\[,;:! ]|\s)+$/, '');
  for (;;) {
    const marks = [
      ...[...body.matchAll(OPEN)].map((m) => ({ open: true, at: m.index, end: m.index + m[0].length })),
      ...[...body.matchAll(CLOSE)].map((m) => ({ open: false, at: m.index, end: m.index + m[0].length })),
    ].sort((a, b) => a.at - b.at);
    const last = marks.at(-1);
    if (!last || last.open || last.end !== body.length) break;
    // The opening mark that pairs with the last closing one.
    let depth = 0;
    let start: (typeof marks)[number] | undefined;
    for (let i = marks.length - 1; i >= 0; i--) {
      depth += marks[i].open ? -1 : 1;
      if (depth === 0) {
        start = marks[i];
        break;
      }
    }
    if (!start) break;
    where.unshift(
      body
        .slice(start.end, last.at)
        .replace(/\\[,;:! ]/g, ' ')
        .trim(),
    );
    body = body.slice(0, start.at).replace(/(\\[,;:! ]|\s)+$/, '');
  }
  return { body, where: where.filter(Boolean) };
}

/** A comparison or a chain of them, or several joined by "and" or commas, as something to test a point against. */
function condition(engine: Engine, expr: Parts): Where | null {
  if (!expr.isValid || !expr.unknowns.every(isXorY)) return null;
  const operands = expr.ops ?? [];
  if (expr.operator === 'And' || expr.operator === 'Tuple') {
    const parts = operands.map((part) => condition(engine, part));
    return parts.every((part) => part !== null) ? (x, y) => parts.every((part) => part(x, y)) : null;
  }
  const op = COMPARISONS[expr.operator];
  if (!op || op === '=') return null;
  const ascending = op === '<' || op === '<=';
  const margins: PlotFn2[] = [];
  for (let i = 0; i + 1 < operands.length; i++) {
    const [a, b] = [operands[i], operands[i + 1]];
    const margin = compileXY(engine, ascending ? b.sub(a) : a.sub(b));
    if (!margin) return null;
    margins.push(margin);
  }
  if (margins.length === 0) return null;
  const strict = op === '<' || op === '>';
  return (x, y) =>
    margins.every((margin) => {
      const m = margin(x, y);
      return strict ? m > 0 : m >= -1e-9;
    });
}

/** `relation` drawn only where `where` holds. Areas and implicit curves leave the rest out; curves keep `where`. */
function restrict(relation: Relation, where: Where): Relation {
  switch (relation.kind) {
    case 'y':
    case 'x':
      return { ...relation, where };
    case 'implicit':
      return { kind: 'implicit', fn: (x, y) => (where(x, y) ? relation.fn(x, y) : Number.NaN) };
    case 'shade':
      return {
        kind: 'shade',
        strict: relation.strict,
        fn: (x, y) => (where(x, y) ? relation.fn(x, y) : Number.NaN),
      };
    case 'region': {
      // An area of one variable against the other becomes the margin by which it holds.
      const { axis, op, fn } = relation;
      const below = op === '<' || op === '<=';
      const margin: PlotFn2 =
        axis === 'y' ? (x, y) => (below ? fn(x) - y : y - fn(x)) : (x, y) => (below ? fn(y) - x : x - fn(y));
      return restrict({ kind: 'shade', fn: margin, strict: op === '<' || op === '>' }, where);
    }
  }
}

/**
 * A row as `classifyBody` reads it, drawn only where its restrictions hold: `y=x\{1<x<5\}` is the line y=x for
 * 1<x<5 (see `splitRestrictions`). A restriction that cannot be read gives null.
 */
export function classifyRelation(engine: Engine, latex: string): Relation | null {
  const { body, where } = splitRestrictions(latex);
  const relation = classifyBody(engine, body);
  if (!relation || where.length === 0) return relation;
  try {
    const tests = where.map((text) => condition(engine, engine.ce.parse(text) as Parts));
    if (tests.some((test) => test === null)) return null;
    return restrict(relation, (x, y) => tests.every((test) => (test as Where)(x, y)));
  } catch {
    return null;
  }
}
