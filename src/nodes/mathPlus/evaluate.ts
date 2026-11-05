import type { BoxedExpression, ComputeEngine } from '@cortex-js/compute-engine';
import { type MathLink, orderDocuments } from './order';

export interface LineResult {
  /** Exact result as LaTeX. */
  value: string | null;
  /** Decimal approximation when it adds information (e.g. √2 ≈ 1.414…). */
  approx: string | null;
  error: string | null;
  /** The line defined a variable or function (`a := 2`). */
  assigned: boolean;
  /** The line is part of equations the node solved: its last line holds the answer, the lines above it none. */
  solved: boolean;
}

/** What separates lines in Math+ LaTeX. */
export const LINE_BREAK = '\\\\';

/** MathLive stores multi-line input as `\displaylines{a \\ b}`: the lines inside, blank ones included. */
export const linesBody = (latex: string): string =>
  latex.trim().match(/^\\displaylines\s*\{([\s\S]*)\}$/)?.[1] ?? latex;

/** Lines (as linesBody gives them) stored the way MathLive writes them. */
export const fromLinesBody = (body: string): string =>
  body.includes(LINE_BREAK) ? `\\displaylines{${body}}` : body;

/**
 * The lines of a body (as linesBody gives it), blank ones included. A `\\` inside braces or an environment (the
 * rows of a matrix, of `cases`) is not a line break.
 */
export function splitBody(body: string): string[] {
  const lines: string[] = [];
  let depth = 0;
  let from = 0;
  for (const [token, at] of Array.from(
    body.matchAll(/\\\\|\\(?:begin|end)(?![a-zA-Z])|\\.|[{}]/g),
    (m) => [m[0], m.index] as const,
  )) {
    if (token === LINE_BREAK && depth === 0) {
      lines.push(body.slice(from, at));
      from = at + token.length;
    } else if (token === '{' || token === '\\begin') depth++;
    else if (token === '}' || token === '\\end') depth = Math.max(0, depth - 1);
  }
  return [...lines, body.slice(from)];
}

/** How the lines of a Math or Math+ body are told apart, for the helpers of an ask from a line (askedLine). */
export const MATH_LINES = { separator: LINE_BREAK, split: splitBody };

/** The line of `latex` (as MathLive writes it) that `offset` is in, and its index among the body's lines. */
export function lineAt(latex: string, offset: number): { index: number; line: string } {
  const body = linesBody(latex);
  const lines = splitBody(body);
  let end = body === latex ? 0 : latex.indexOf('{') + 1;
  for (const [index, line] of lines.entries()) {
    end += line.length;
    if (offset <= end || index === lines.length - 1) return { index, line };
    end += LINE_BREAK.length;
  }
  return { index: 0, line: '' };
}

/** The start of a field's LaTeX, up to its caret, as lines on '\n', for a model to read. */
export const linesUpTo = (before: string): string =>
  splitBody(before.replace(/^\s*\\displaylines\s*\{/, '')).join('\n');

/** The lines that hold something, trimmed. */
export function splitLines(latex: string): string[] {
  return splitBody(linesBody(latex))
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Why a linked value could not be passed on. */
export const LOOP_IGNORED = 'loop: link ignored';

/** One link into a Math+ node, as the node shows it: the value it brings, or why it brings none. */
export interface LinkInput {
  linkId: string;
  sourceId: string;
  name: string;
  /** The value as LaTeX; null when the input failed. */
  value: string | null;
  error: string | null;
  /** Some line of the node reads this name (before the node assigns it itself). */
  used: boolean;
}

export interface Evaluation {
  lines: Record<string, LineResult[]>;
  inputs: Record<string, LinkInput[]>;
}

/**
 * The name `ans` written the way the parser reads it as one symbol: typed, it would read as a times n times s.
 * Text-mode groups (`\text{ans}`, `\mathrm{ans}`...) are left alone. Only done in a document that a link named
 * `ans` feeds, so documents without one evaluate exactly as they always did.
 */
const spellNames = (latex: string) =>
  latex.replace(/\\(?:text|mathrm|operatorname|mathbf)\{[^{}]*\}|(?<![\\a-zA-Z])ans(?![a-zA-Z])/g, (m) =>
    m.startsWith('\\') ? m : '\\mathrm{ans}',
  );

/** The operands of an expression that is a function (a list, a tuple, an equation), none for any other. */
const opsOf = (expr: BoxedExpression): readonly BoxedExpression[] =>
  (expr as unknown as { ops?: readonly BoxedExpression[] }).ops ?? [];

/** The operands of an expression known to be a function with two (`Assign`). */
type Operands = { readonly op1: BoxedExpression; readonly op2: BoxedExpression };

interface ParsedLine {
  expr: BoxedExpression;
  /** The part of the line that reads variables: all of it, or the right of `:=`. */
  reads: BoxedExpression;
  assigns: string | null;
  /** The left of `:=`. */
  target: BoxedExpression | null;
}

function parseLine(ce: ComputeEngine, latex: string, spellAns: boolean): ParsedLine | LineResult {
  try {
    const expr = ce.parse(spellAns ? spellNames(latex) : latex);
    if (!expr.isValid)
      return { value: null, approx: null, error: 'Syntax error', assigned: false, solved: false };
    if (expr.operator !== 'Assign') return { expr, reads: expr, assigns: null, target: null };
    const { op1, op2 } = expr as unknown as Operands;
    return { expr, reads: op2, assigns: (op1 as unknown as { symbol?: string }).symbol ?? null, target: op1 };
  } catch (err) {
    return {
      value: null,
      approx: null,
      error: err instanceof Error ? err.message : 'Evaluation error',
      assigned: false,
      solved: false,
    };
  }
}

const isFailure = (line: ParsedLine | LineResult): line is LineResult => 'error' in line;

/** A decimal for a result that is not a whole number already (√2 ≈ 1.414…), or null. */
function approxOf(evaluated: BoxedExpression): string | null {
  const numeric = evaluated.N().re;
  if (!Number.isFinite(numeric) || Number.isInteger(numeric)) return null;
  const approx = String(Number(numeric.toPrecision(10)));
  return approx === evaluated.latex ? null : approx;
}

/** The line's expression with the values links bring put in for their names. */
function substituted(
  ce: ComputeEngine,
  line: ParsedLine,
  substitutions: Record<string, BoxedExpression>,
): BoxedExpression {
  if (Object.keys(substitutions).length === 0) return line.expr;
  // Not the left of `:=`, or a link named like the variable being assigned would overwrite its own name.
  return line.target
    ? ce.box(['Assign', line.target.json, line.reads.subs(substitutions).json] as never)
    : line.expr.subs(substitutions);
}

/** A line's result, and the evaluated expression for passing on along a link. */
function runLine(
  ce: ComputeEngine,
  line: ParsedLine,
  substitutions: Record<string, BoxedExpression>,
): { result: LineResult; value: BoxedExpression | null } {
  try {
    const evaluated = substituted(ce, line, substitutions).evaluate();
    return {
      result: {
        value: evaluated.latex,
        approx: approxOf(evaluated),
        error: null,
        assigned: line.assigns !== null,
        solved: false,
      },
      value: evaluated,
    };
  } catch (err) {
    return {
      result: {
        value: null,
        approx: null,
        error: err instanceof Error ? err.message : 'Evaluation error',
        assigned: false,
        solved: false,
      },
      value: null,
    };
  }
}

/** The equations a line states: itself, or each line of a `cases` block. Null when it is not equations. */
function equationsOf(expr: BoxedExpression): BoxedExpression[] | null {
  if (expr.operator === 'Equal') return [expr];
  const items = expr.operator === 'List' ? opsOf(expr) : [];
  return items.length > 0 && items.every((item: BoxedExpression) => item.operator === 'Equal')
    ? [...items]
    : null;
}

/** The entries of a list, matrices included, row by row. */
const entriesOf = (expr: BoxedExpression): BoxedExpression[] =>
  expr.operator === 'List' ? opsOf(expr).flatMap(entriesOf) : [expr];

/**
 * An equation between two lists or matrices (`A·(u, v) = b`) is one equation for each entry. Any other equation,
 * or one whose sides do not line up, is left as it is.
 */
function rowEquations(ce: ComputeEngine, equation: BoxedExpression): BoxedExpression[] {
  const [left, right] = opsOf(equation).map((side) => side.evaluate());
  if (left?.operator !== 'List' || right?.operator !== 'List') return [equation];
  const lefts = entriesOf(left);
  const rights = entriesOf(right);
  if (lefts.length !== rights.length) return [equation];
  return lefts.map((l, i) => ce.box(['Equal', l.json, rights[i].json] as never));
}

/**
 * A side that applies a function of the user's, `f(x) = x^2`: someone writing a definition without `:=`, not an
 * equation to solve for x. The engine's own functions are capitalised (`Sin`, `Add`), the user's are not.
 */
const writesFunction = (equation: BoxedExpression) =>
  opsOf(equation).some((side) => /^[a-z]/.test(side.operator));

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/**
 * Solves `equations` for `unknowns` and words the answer: "x = 3", "x \in \{3, 2\}", "u = 1,\; v = 2" or, for
 * a system with several solutions, "(x, y) \in \{(4,3), (-3,-4)\}". The engine hands back nothing it could not
 * solve, a list with no solutions, or a new symbol where any value would do; each of those is told as an error.
 */
function solveEquations(
  ce: ComputeEngine,
  equations: BoxedExpression[],
  unknowns: readonly string[],
): { result: LineResult; value: BoxedExpression | null } {
  const failed = (error: string) => ({
    result: { value: null, approx: null, error, assigned: false, solved: true },
    value: null,
  });
  try {
    const solved = ce
      .box([
        'Solve',
        equations.length === 1 ? equations[0].json : ['List', ...equations.map((e) => e.json)],
        unknowns.length === 1 ? unknowns[0] : ['List', ...unknowns],
      ] as never)
      .evaluate();
    if (solved.operator !== 'List') {
      return failed(
        unknowns.length > equations.length
          ? `${plural(unknowns.length, 'unknown')}, ${plural(equations.length, 'equation')}`
          : 'no unique solution found',
      );
    }
    const solutions = opsOf(solved);
    if (solutions.length === 0) return failed('no solution');
    const known = new Set(equations.flatMap((e) => e.symbols));
    if (solved.symbols.some((symbol) => !known.has(symbol))) return failed('infinitely many solutions');

    const names = unknowns.map((name) => ce.box(name).latex);
    const component = (solution: BoxedExpression, i: number) =>
      unknowns.length === 1 ? solution : (opsOf(solution)[i] ?? solution);
    const value =
      solutions.length === 1
        ? // A name left free (z in `x = z-1, y = 4-z`) is not said again as `z = z`.
          names
            .map((name, i) => `${name} = ${component(solutions[0], i).latex}`)
            .filter((said, i) => said !== `${names[i]} = ${names[i]}`)
            .join(',\\; ')
        : `${unknowns.length === 1 ? names[0] : `(${names.join(', ')})`} \\in \\{${solutions
            .map((solution) => solution.latex)
            .join(', ')}\\}`;
    return {
      result: {
        value,
        approx: solutions.length === 1 && unknowns.length === 1 ? approxOf(solutions[0]) : null,
        error: null,
        assigned: false,
        solved: true,
      },
      value: solved,
    };
  } catch (err) {
    return failed(err instanceof Error ? err.message : 'Evaluation error');
  }
}

/** A line that states equations with names to solve for, waiting for the lines around it. */
interface PendingEquation {
  line: ParsedLine;
  substitutions: Record<string, BoxedExpression>;
  equations: BoxedExpression[];
  unknowns: readonly string[];
}

/**
 * The results of consecutive equation lines, in order: solved together as one system, the answer on the last line
 * and the lines above it marked as part of it. An equation between matrices is solved entry by entry. One equation with several unknowns (`y = mx + b`) is no system to
 * solve for, so it is evaluated as any line is.
 */
function solvePending(
  ce: ComputeEngine,
  pending: PendingEquation[],
): { result: LineResult; value: BoxedExpression | null }[] {
  if (pending.length === 0) return [];
  const equations = pending.flatMap((p) => p.equations.flatMap((e) => rowEquations(ce, e)));
  const unknowns = [...new Set(pending.flatMap((p) => p.unknowns))];
  if (equations.length === 1 && unknowns.length > 1) {
    return pending.map((p) => runLine(ce, p.line, p.substitutions));
  }
  const answer = solveEquations(ce, equations, unknowns);
  const part = {
    result: { value: null, approx: null, error: null, assigned: false, solved: true },
    value: null,
  };
  return [...pending.slice(1).map(() => part), answer];
}

/** What a Math+ node hands on: the exact result of its last line, or why there is none. */
type Outcome = { value: BoxedExpression } | { error: string };

function outcomeOf(
  lines: LineResult[],
  values: (BoxedExpression | null)[],
  parsed: (ParsedLine | LineResult)[],
) {
  const last = lines.length - 1;
  if (last < 0) return { error: 'the source is empty' } satisfies Outcome;
  if (lines[last].error) return { error: 'the source has an error' } satisfies Outcome;
  const line = parsed[last];
  const definition = !isFailure(line) && line.assigns !== null && line.reads.operator === 'Function';
  const value = values[last];
  if (definition || !value) return { error: 'the source ends in a function definition' } satisfies Outcome;
  return { value } satisfies Outcome;
}

/**
 * Evaluates Math+ documents inside a fresh scope, so variables flow from earlier documents to later ones and
 * nothing leaks between evaluations. `documents` are in reading order. That is also the evaluation order, except
 * that a document waits for the documents linked into it (see `orderDocuments`).
 *
 * A link hands the exact result of the source's last line to the target as a variable, by substitution line by
 * line. Nothing is assigned for it, so the only names that reach later documents are those a document assigns
 * itself; and such an assignment of the same name replaces the link from that line on.
 */
export function evaluateLinked(
  ce: ComputeEngine,
  documents: { id: string; latex: string }[],
  links: MathLink[],
): Evaluation {
  const ids = documents.map((d) => d.id);
  const known = new Set(ids);
  const usable = links.filter((l) => l.source !== l.target && known.has(l.source) && known.has(l.target));
  const { order, broken } = orderDocuments(ids, usable);
  const latexOf = new Map(documents.map((d) => [d.id, d.latex]));

  const lines: Record<string, LineResult[]> = {};
  const inputs: Record<string, LinkInput[]> = {};
  const outcomes = new Map<string, Outcome>();

  ce.pushScope();
  try {
    for (const id of order) {
      const incoming = usable.filter((l) => l.target === id);
      const spellAns = incoming.some((l) => l.name === 'ans');
      const parsed = splitLines(latexOf.get(id) ?? '').map((line) => parseLine(ce, line, spellAns));

      // What each incoming link brings, before anything is known about whether the node uses it.
      const copies = new Map<string, number>();
      for (const l of incoming) copies.set(l.name, (copies.get(l.name) ?? 0) + 1);
      const brought = incoming.map((l) => {
        const outcome = broken.has(l.id) ? { error: LOOP_IGNORED } : outcomes.get(l.source);
        return {
          link: l,
          outcome: outcome ?? { error: LOOP_IGNORED },
          ambiguous: (copies.get(l.name) ?? 0) > 1,
        };
      });
      const usedNames = new Set<string>();

      const results: LineResult[] = [];
      const values: (BoxedExpression | null)[] = [];
      const active = new Set(incoming.map((l) => l.name));
      // Equations wait here until the line after them, so consecutive ones are solved together.
      let pending: PendingEquation[] = [];
      const flush = () => {
        for (const line of solvePending(ce, pending)) {
          results.push(line.result);
          values.push(line.value);
        }
        pending = [];
      };
      for (const line of parsed) {
        if (isFailure(line)) {
          flush();
          results.push(line);
          values.push(null);
          continue;
        }
        const reads = new Set(line.reads.symbols);
        const reading = [...active].filter((name) => reads.has(name));
        for (const name of reading) usedNames.add(name);
        const substitutions: Record<string, BoxedExpression> = {};
        let blocked: string | null = null;
        for (const name of reading) {
          const sources = brought.filter((b) => b.link.name === name);
          const first = sources[0];
          if (first.ambiguous) blocked ??= `${sources.length} links named ${name}`;
          else if ('error' in first.outcome) blocked ??= `${name}: ${first.outcome.error}`;
          else substitutions[name] = first.outcome.value;
        }
        const expr = blocked || line.target ? null : substituted(ce, line, substitutions);
        const equations = expr && equationsOf(expr);
        if (expr && equations && expr.unknowns.length > 0 && !equations.some(writesFunction)) {
          pending.push({ line, substitutions, equations, unknowns: expr.unknowns });
        } else {
          flush();
          if (blocked) {
            results.push({ value: null, approx: null, error: blocked, assigned: false, solved: false });
            values.push(null);
          } else {
            const run = runLine(ce, line, substitutions);
            results.push(run.result);
            values.push(run.value);
          }
        }
        if (line.assigns) active.delete(line.assigns);
      }
      flush();
      lines[id] = results;
      outcomes.set(id, outcomeOf(results, values, parsed));
      inputs[id] = brought.map(({ link, outcome, ambiguous }) => {
        const used = usedNames.has(link.name);
        const error =
          'error' in outcome
            ? outcome.error
            : ambiguous && used
              ? `${copies.get(link.name)} links named ${link.name}`
              : null;
        return {
          linkId: link.id,
          sourceId: link.source,
          name: link.name,
          value: error || !('value' in outcome) ? null : outcome.value.latex,
          error,
          used,
        };
      });
    }
  } finally {
    ce.popScope();
  }
  return { lines, inputs };
}

/** Evaluates Math+ documents in reading order, without links. */
export function evaluateDocuments(
  ce: ComputeEngine,
  documents: { id: string; latex: string }[],
): Record<string, LineResult[]> {
  return evaluateLinked(ce, documents, []).lines;
}
