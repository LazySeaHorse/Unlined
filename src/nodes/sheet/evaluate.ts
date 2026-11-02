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

/** The cells a formula reads, clipped to the grid; none when it does not parse (evaluating it reports that). */
function references(formula: string, at: CellRef, rows: number, columns: number): CellRef[] {
  let refs: (CellRef | RangeRef)[];
  try {
    refs = new DepParser().parse(formula, { ...at, sheet: SHEET });
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
  const read = (row: number, col: number) => values[row - 1]?.[col - 1];
  const parser = new FormulaParser({
    functions,
    onCell: ({ row, col }) => read(row, col),
    onRange: ({ from, to }) =>
      Array.from({ length: Math.max(0, Math.min(to.row, rows) - from.row + 1) }, (_, r) =>
        Array.from({ length: Math.max(0, Math.min(to.col, columns) - from.col + 1) }, (_, c) =>
          read(from.row + r, from.col + c),
        ),
      ),
  });

  const formulaAt = (row: number, col: number) => isFormula(cells[row - 1]?.[col - 1] ?? '');
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: CellRef[] = [];

  function evaluate(at: CellRef) {
    const key = `${at.row},${at.col}`;
    if (state.get(key) === 'done') return;
    if (state.get(key) === 'visiting') {
      // A circle: every formula on it, from where it closed, is an error.
      for (const cell of stack.slice(stack.findIndex((c) => c.row === at.row && c.col === at.col)))
        values[cell.row - 1][cell.col - 1] = FormulaError.REF;
      return;
    }
    state.set(key, 'visiting');
    stack.push(at);
    const formula = cells[at.row - 1][at.col - 1].slice(1);
    for (const ref of references(formula, at, rows, columns)) if (formulaAt(ref.row, ref.col)) evaluate(ref);
    stack.pop();
    state.set(key, 'done');
    if (values[at.row - 1][at.col - 1] === FormulaError.REF) return; // closed a circle
    values[at.row - 1][at.col - 1] = compute(formula, at);
  }

  function compute(formula: string, at: CellRef): unknown {
    try {
      const result = parser.parse(formula, { ...at, sheet: SHEET });
      return Array.isArray(result) ? result[0]?.[0] : result; // an array shows its first value
    } catch (error) {
      return error instanceof FormulaError ? error : FormulaError.REF;
    }
  }

  cells.forEach((row, r) => {
    row.forEach((text, c) => {
      if (isFormula(text)) evaluate({ row: r + 1, col: c + 1 });
    });
  });

  return cells.map((row, r) =>
    row.map((text, c) => (isFormula(text) ? display(values[r][c], fractions) : undefined)),
  );
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
