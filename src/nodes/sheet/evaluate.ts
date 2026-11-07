import FormulaParser, { type CellRef, type RangeRef } from 'fast-formula-parser';
import { Rational } from '@/lib/rational';
import { determinant, inverse, toRational } from './matrix';

const { DepParser, FormulaError, FormulaHelpers, Types } = FormulaParser;
const SHEET = 'Sheet1';

const isFormula = (text: string) => text.startsWith('=') && text.length > 1;

/** What a formula sees in a plain cell: a number (fractions such as `1/3` included), text, or nothing. */
function literal(text: string): unknown {
  if (text.trim() === '') return undefined;
  const exact = Rational.parse(text);
  if (exact) return exact.toNumber();
  const number = Number(text);
  return Number.isNaN(number) ? text : number;
}

/** A computed value as the cell shows it: with `fractions`, numbers read as fractions where a small one fits. */
function display(value: unknown, fractions: boolean): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number')
    return (fractions && Rational.fromNumber(value)?.toFraction()) || String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

/** A formula argument as a square matrix of exact fractions; #VALUE! when it is not square or not all numbers. */
function squareMatrix(argument: unknown): Rational[][] {
  const rows = FormulaHelpers.accept(argument, Types.ARRAY, undefined, false, true) as unknown[][];
  const numbers = rows.every((row) => row.length === rows.length && row.every(Number.isFinite));
  if (!numbers) throw FormulaError.VALUE;
  return rows.map((row) => row.map((value) => toRational(value as number)));
}

/** Matrix functions done exactly, replacing the parser's (its MDETERM is wrong past 3×3, MINVERSE is missing). */
const functions = {
  MDETERM: (argument: unknown) => determinant(squareMatrix(argument)).toNumber(),
  MINVERSE: (argument: unknown) => {
    const result = inverse(squareMatrix(argument));
    if (!result) throw FormulaError.NUM;
    return result.map((row) => row.map((value) => value.toNumber()));
  },
};

/** The grid being evaluated, which the shared parser reads through. Only set while `evaluateSheet` runs. */
interface Grid {
  rows: number;
  columns: number;
  values: unknown[][];
}
let grid: Grid | undefined;

const read = (row: number, col: number) => grid?.values[row - 1]?.[col - 1];

// Building a parser costs milliseconds (a dependency parser about as much as the formula parser), and a sheet has
// hundreds of formulas, so both are made once and used for every sheet.
let parser: InstanceType<typeof FormulaParser> | undefined;
let dependencies: InstanceType<typeof DepParser> | undefined;

const formulaParser = () =>
  (parser ??= new FormulaParser({
    functions,
    onCell: ({ row, col }) => read(row, col),
    onRange: ({ from, to }) => {
      const { rows = 0, columns = 0 } = grid ?? {};
      return Array.from({ length: Math.max(0, Math.min(to.row, rows) - from.row + 1) }, (_, r) =>
        Array.from({ length: Math.max(0, Math.min(to.col, columns) - from.col + 1) }, (_, c) =>
          read(from.row + r, from.col + c),
        ),
      );
    },
  }));

const dependencyParser = () => {
  dependencies ??= new DepParser();
  return dependencies;
};

/** The cells a formula reads, clipped to the grid; none when it does not parse (evaluating it reports that). */
function references(formula: string, at: CellRef, rows: number, columns: number): CellRef[] {
  let refs: (CellRef | RangeRef)[];
  try {
    refs = dependencyParser().parse(formula, { ...at, sheet: SHEET });
  } catch {
    return [];
  }
  return refs.flatMap((ref) => {
    const [from, to] = 'from' in ref ? [ref.from, ref.to] : [ref, ref];
    const cells: CellRef[] = [];
    for (let row = from.row; row <= Math.min(to.row, rows); row++)
      for (let col = from.col; col <= Math.min(to.col, columns); col++) cells.push({ row, col });
    return cells;
  });
}

/**
 * The text each formula cell shows (`undefined` for every other cell). Typed fractions such as `1/3` count as
 * numbers; with `fractions`, computed numbers show as fractions (0.5 is 1/2).
 *
 * Formulas are evaluated after the formulas they read, so each is evaluated once. Formulas in a circle of
 * references show #REF!, and errors pass on to the formulas that read them.
 *
 * The grid evaluates formulas itself, but takes `1/3` for text and drops a custom parser as soon as a cell is
 * pasted over, so the sheet evaluates here and the grid only draws the answers.
 */
export function evaluateSheet(cells: string[][], fractions: boolean): (string | undefined)[][] {
  const rows = cells.length;
  const columns = cells[0]?.length ?? 0;
  const values: unknown[][] = cells.map((row) =>
    row.map((text) => (isFormula(text) ? undefined : literal(text))),
  );
  const before = grid;
  grid = { rows, columns, values };
  try {
    evaluateFormulas(cells, values, rows, columns);
  } finally {
    grid = before;
  }
  return cells.map((row, r) =>
    row.map((text, c) => (isFormula(text) ? display(values[r][c], fractions) : undefined)),
  );
}

/** Fills in `values` for every formula cell. */
function evaluateFormulas(cells: string[][], values: unknown[][], rows: number, columns: number) {
  const formulaAt = (row: number, col: number) => isFormula(cells[row - 1]?.[col - 1] ?? '');
  const state = new Map<number, 'visiting' | 'done'>();
  const keyOf = ({ row, col }: CellRef) => (row - 1) * columns + (col - 1);

  interface Frame {
    at: CellRef;
    formula: string;
    /** The formulas it reads, which are evaluated first. */
    reads: CellRef[];
    next: number;
  }

  function compute(formula: string, at: CellRef): unknown {
    try {
      const result = formulaParser().parse(formula, { ...at, sheet: SHEET });
      return Array.isArray(result) ? result[0]?.[0] : result; // an array shows its first value
    } catch (error) {
      return error instanceof FormulaError ? error : FormulaError.REF;
    }
  }

  // A walk with a stack of its own: a chain of formulas as long as the sheet is big would overflow the call stack.
  function evaluate(root: CellRef) {
    const frames: Frame[] = [];

    const open = (at: CellRef) => {
      const key = keyOf(at);
      const seen = state.get(key);
      if (seen === 'done') return;
      if (seen === 'visiting') {
        // A circle: every formula on it, from where it closed, is an error.
        const from = frames.findIndex((frame) => frame.at.row === at.row && frame.at.col === at.col);
        for (const { at: cell } of frames.slice(from)) values[cell.row - 1][cell.col - 1] = FormulaError.REF;
        return;
      }
      state.set(key, 'visiting');
      const formula = cells[at.row - 1][at.col - 1].slice(1);
      const reads = references(formula, at, rows, columns).filter((ref) => formulaAt(ref.row, ref.col));
      frames.push({ at, formula, reads, next: 0 });
    };

    open(root);
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      if (frame.next < frame.reads.length) {
        open(frame.reads[frame.next++]);
        continue;
      }
      frames.pop();
      const { at } = frame;
      state.set(keyOf(at), 'done');
      if (values[at.row - 1][at.col - 1] === FormulaError.REF) continue; // closed a circle
      values[at.row - 1][at.col - 1] = compute(frame.formula, at);
    }
  }

  cells.forEach((row, r) => {
    row.forEach((text, c) => {
      if (isFormula(text)) evaluate({ row: r + 1, col: c + 1 });
    });
  });
}

/**
 * What `formula` would show in the cell `at` of the grid, or null when it is not a formula or shows an error
 * (#NAME?, #REF!, …). The grid itself is left as it is.
 */
export function formulaResult(
  cells: string[][],
  at: { row: number; column: number },
  formula: string,
  fractions: boolean,
): string | null {
  if (!isFormula(formula) || cells[at.row]?.[at.column] === undefined) return null;
  const next = cells.map((row, r) =>
    r === at.row ? row.map((t, c) => (c === at.column ? formula : t)) : row,
  );
  const shown = evaluateSheet(next, fractions)[at.row]?.[at.column] ?? '';
  return shown.startsWith('#') ? null : shown;
}
