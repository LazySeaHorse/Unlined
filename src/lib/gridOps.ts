import { Rational } from './rational';

/** Raised for a command that cannot be applied; the message is meant for the person who typed it. */
export class GridOpError extends Error {}

type Axis = 'R' | 'C';
/**
 * What a cell holds: an exact number (`blank` when the cell was empty, which adds as 0 but is skipped when
 * multiplying or dividing), a formula (without its `=`) that stays live, or text, which every operation skips.
 */
type Term =
  | { kind: 'number'; value: Rational; blank?: true }
  | { kind: 'formula'; text: string }
  | { kind: 'text'; text: string };
type Scalar = { kind: 'scalar'; scalar: Rational };
type Line = { kind: 'line'; axis: Axis; cells: Term[] };
type Value = Scalar | Line;

const ZERO: Term = { kind: 'number', value: Rational.ZERO };
const BLANK: Term = { kind: 'number', value: Rational.ZERO, blank: true };
/** What an operation leaves where a cell cannot take part in it. */
const SKIPPED: Term = { kind: 'text', text: '' };
export type NumberFormat = 'fraction' | 'decimal';

type Token =
  | { type: 'number'; value: Rational }
  | { type: 'line'; axis: Axis; index: number }
  | { type: 'op'; value: '+' | '-' | '*' | '/' | '(' | ')' };

/** Spreadsheet column letters for a zero-based index: 0 is A, 26 is AA. */
export const columnLabel = (index: number) => {
  let label = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  return label;
};

const normalise = (text: string) =>
  text
    .replace(/[−–—]/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/←/g, '=')
    .replace(/↔/g, '<->')
    .trim();

function tokenise(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\s*(?:(\d+(?:\.\d+)?)|([RrCc])(\d+)|([-+*/()]))/y;
  let at = 0;
  while (at < text.length) {
    pattern.lastIndex = at;
    const match = pattern.exec(text);
    if (!match) throw new GridOpError(`Unexpected "${text.slice(at).trim()[0]}" in "${text}".`);
    at = pattern.lastIndex;
    const [, number, axis, index, op] = match;
    if (number !== undefined) tokens.push({ type: 'number', value: Rational.parse(number) as Rational });
    else if (axis) tokens.push({ type: 'line', axis: axis.toUpperCase() as Axis, index: Number(index) });
    else tokens.push({ type: 'op', value: op as '+' });
  }
  return tokens;
}

/** Reads and writes whole rows or columns of a grid of strings as exact numbers. */
class Lines {
  constructor(private readonly grid: string[][]) {}

  private size(axis: Axis) {
    return axis === 'R' ? this.grid.length : (this.grid[0]?.length ?? 0);
  }

  private check(axis: Axis, index: number) {
    const size = this.size(axis);
    if (index < 1 || index > size)
      throw new GridOpError(`${axis === 'R' ? 'Row' : 'Column'} ${axis}${index} does not exist (1–${size}).`);
  }

  private at(axis: Axis, index: number, position: number): [number, number] {
    return axis === 'R' ? [index - 1, position] : [position, index - 1];
  }

  /** A line of the right length with nothing read from the grid, for writing over whatever is there. */
  blank(axis: Axis, index: number): Line {
    this.check(axis, index);
    return { kind: 'line', axis, cells: Array(this.size(axis === 'R' ? 'C' : 'R')).fill(ZERO) };
  }

  read(axis: Axis, index: number): Line {
    this.check(axis, index);
    const cells = Array.from({ length: this.size(axis === 'R' ? 'C' : 'R') }, (_, position): Term => {
      const [row, col] = this.at(axis, index, position);
      return parseCell(this.grid[row][col]);
    });
    return { kind: 'line', axis, cells };
  }

  write(axis: Axis, index: number, cells: Term[], format: NumberFormat): string[][] {
    this.check(axis, index);
    const out = this.grid.map((row) => [...row]);
    cells.forEach((value, position) => {
      const [row, col] = this.at(axis, index, position);
      out[row][col] = cellText(value, format);
    });
    return out;
  }
}

function parseCell(text: string): Term {
  if (text.trim() === '') return BLANK;
  const value = Rational.parse(text);
  if (value) return { kind: 'number', value };
  if (text.startsWith('=') && text.length > 1) return { kind: 'formula', text: text.slice(1) };
  return { kind: 'text', text };
}

function cellText(value: Term, format: NumberFormat): string {
  if (value.kind === 'text') return value.text;
  if (value.kind === 'formula') return `=${value.text}`;
  return format === 'fraction' ? value.value.toFraction() : value.value.toDecimal();
}

const name = (axis: Axis) => (axis === 'R' ? 'row' : 'column');

/** A number as it reads inside a formula: `3`, `(1/3)`, `(-2)`. */
const numberText = (value: Rational) => {
  const text = value.toFraction();
  return value.isInteger && value.num >= 0n ? text : `(${text})`;
};

/** A term as an operand of `+ - * /`: cell references and numbers stay bare, other formulas get parentheses. */
const operand = (term: Term) => {
  if (term.kind === 'number') return numberText(term.value);
  return /^[A-Z]+\d+$/.test(term.text) ? term.text : `(${term.text})`;
};

const formula = (text: string): Term => ({ kind: 'formula', text });

/** Combines two cells exactly when both are numbers, and into a formula as soon as one is a formula. */
function combineTerms(op: '+' | '-', a: Term, b: Term): Term {
  if (a.kind === 'text' || b.kind === 'text') return SKIPPED;
  if (a.kind === 'number' && b.kind === 'number')
    return { kind: 'number', value: op === '+' ? a.value.add(b.value) : a.value.sub(b.value) };
  if (b.kind === 'number' && b.value.isZero) return a;
  if (a.kind === 'number' && a.value.isZero) return op === '+' ? b : formula(`-${operand(b)}`);
  return formula(`${operand(a)}${op}${operand(b)}`);
}

function scaleTerm(op: '*' | '/', a: Term, by: Rational): Term {
  if (a.kind === 'text') return SKIPPED;
  if (a.kind === 'number') return { kind: 'number', value: op === '*' ? a.value.mul(by) : a.value.div(by) };
  if (op === '*' && by.isZero) return ZERO;
  if (by.num === 1n && by.den === 1n) return a;
  return formula(`${operand(a)}${op}${numberText(by)}`);
}

/** A number added to or subtracted from a cell, either way round. Text and empty cells are left as they are. */
function offsetTerm(op: '+' | '-', a: Term, by: Rational, numberFirst: boolean): Term {
  if (a.kind === 'text') return a;
  if (a.kind === 'number' && a.blank) return SKIPPED;
  if (a.kind === 'number') {
    const [x, y] = numberFirst ? [by, a.value] : [a.value, by];
    return { kind: 'number', value: op === '+' ? x.add(y) : x.sub(y) };
  }
  if (numberFirst) return formula(`${numberText(by)}${op}${operand(a)}`);
  return by.isZero ? a : formula(`${operand(a)}${op}${numberText(by)}`);
}

/** Cell by cell product or quotient of two lines. Text, empty cells and a zero divisor leave the cell empty. */
function pairTerms(op: '*' | '/', a: Term, b: Term): Term {
  const unusable = (t: Term) => t.kind === 'text' || (t.kind === 'number' && t.blank);
  if (unusable(a) || unusable(b)) return SKIPPED;
  if (op === '/' && b.kind === 'number' && b.value.isZero) return SKIPPED;
  if (a.kind === 'number' && b.kind === 'number')
    return { kind: 'number', value: op === '*' ? a.value.mul(b.value) : a.value.div(b.value) };
  return formula(`${operand(a)}${op}${operand(b)}`);
}

function combine(op: '+' | '-' | '*' | '/', left: Value, right: Value): Value {
  if (left.kind === 'scalar' && right.kind === 'scalar') {
    const [a, b] = [left.scalar, right.scalar];
    if (op === '/' && b.isZero) throw new GridOpError('Cannot divide by zero.');
    return {
      kind: 'scalar',
      scalar: op === '+' ? a.add(b) : op === '-' ? a.sub(b) : op === '*' ? a.mul(b) : a.div(b),
    };
  }
  if (left.kind === 'line' && right.kind === 'line') {
    if (left.axis !== right.axis)
      throw new GridOpError(`Cannot mix a ${name(left.axis)} and a ${name(right.axis)}.`);
    return {
      kind: 'line',
      axis: left.axis,
      cells: left.cells.map((a, i) =>
        op === '*' || op === '/' ? pairTerms(op, a, right.cells[i]) : combineTerms(op, a, right.cells[i]),
      ),
    };
  }
  if (op === '+' || op === '-') {
    if (left.kind === 'line' && right.kind === 'scalar')
      return {
        kind: 'line',
        axis: left.axis,
        cells: left.cells.map((a) => offsetTerm(op, a, right.scalar, false)),
      };
    if (left.kind === 'scalar' && right.kind === 'line')
      return {
        kind: 'line',
        axis: right.axis,
        cells: right.cells.map((a) => offsetTerm(op, a, left.scalar, true)),
      };
    throw new GridOpError('That cannot be combined.');
  }
  if (left.kind === 'line' && right.kind === 'scalar') {
    if (op === '/' && right.scalar.isZero) throw new GridOpError('Cannot divide by zero.');
    return { kind: 'line', axis: left.axis, cells: left.cells.map((a) => scaleTerm(op, a, right.scalar)) };
  }
  if (left.kind === 'scalar' && right.kind === 'line') {
    if (op === '/') throw new GridOpError('Cannot divide a number by a whole row or column.');
    return { kind: 'line', axis: right.axis, cells: right.cells.map((a) => scaleTerm('*', a, left.scalar)) };
  }
  throw new GridOpError('That cannot be combined.');
}

/** Precedence climbing over `+ - * /`, unary minus and parentheses. */
function evaluate(tokens: Token[], lines: Lines): Value {
  let at = 0;
  const peek = () => tokens[at];
  const op = (...values: string[]) => {
    const token = peek();
    return token?.type === 'op' && values.includes(token.value) ? (token.value as '+') : null;
  };

  function primary(): Value {
    const token = tokens[at++];
    if (!token) throw new GridOpError('The expression ends too soon.');
    if (token.type === 'number') return { kind: 'scalar', scalar: token.value };
    if (token.type === 'line') return lines.read(token.axis, token.index);
    if (token.value === '(') {
      const inner = sum();
      if (!op(')')) throw new GridOpError('Missing a closing parenthesis.');
      at++;
      return inner;
    }
    if (token.value === '-') return combine('*', { kind: 'scalar', scalar: new Rational(-1n) }, primary());
    if (token.value === '+') return primary();
    throw new GridOpError(`Unexpected "${token.value}".`);
  }

  function product(): Value {
    let value = primary();
    for (let o = op('*', '/'); o; o = op('*', '/')) {
      at++;
      value = combine(o, value, primary());
    }
    return value;
  }

  function sum(): Value {
    let value = product();
    for (let o = op('+', '-'); o; o = op('+', '-')) {
      at++;
      value = combine(o, value, product());
    }
    return value;
  }

  const value = sum();
  if (at < tokens.length) throw new GridOpError('Something is left over after the expression.');
  return value;
}

const TARGET = /^([RrCc])(\d+)\s*(<->|\+=|-=|\*=|\/=|=)\s*(.+)$/;

/** The lines a command writes, counted from 1: its target, and for a swap the other line too. */
export interface GridOpLines {
  axis: Axis;
  index: number;
  swap?: number;
}

/** Which lines `command` writes, or null when it does not parse. Says nothing of whether it would succeed. */
export function gridOpLines(command: string): GridOpLines | null {
  const match = TARGET.exec(normalise(command));
  if (!match) return null;
  const [, axisText, indexText, operator, rest] = match;
  const axis = axisText.toUpperCase() as Axis;
  const other = operator === '<->' ? /^[RrCc](\d+)$/.exec(rest.trim()) : null;
  return { axis, index: Number(indexText), ...(other ? { swap: Number(other[1]) } : {}) };
}

/**
 * Applies one row or column command to a grid and returns the new grid, or throws a GridOpError.
 *
 *   R1 -= 3*R2     R2 = R2/2     R1 = R1 - R3 + 2*R2     C2 += C1/3     R1 <-> R3
 *
 * Rows are `R1`, `R2`… and columns `C1`, `C2`… counted from 1, whatever the column letters say.
 * Numbers and fractions (empty counts as 0) are combined exactly. Text is never an error: it is skipped and
 * the result there is empty, as it is for an empty cell or a zero divisor when a line is multiplied or divided
 * by another (`C3 = C1/C2`). A cell that holds a formula makes the result
 * a formula too, built from the originals' text, so the new cell stays live: R2 -= R1 over `=SUM(B1:B3)`
 * and `4` writes `=4-(SUM(B1:B3))`.
 */
export function applyGridOp(grid: string[][], command: string, format: NumberFormat): string[][] {
  const match = TARGET.exec(normalise(command));
  if (!match) throw new GridOpError('Try something like R1 -= 3*R2, R2 *= 1/2 or R1 <-> R3.');
  const [, axisText, indexText, operator, rest] = match;
  const axis = axisText.toUpperCase() as Axis;
  const index = Number(indexText);
  const lines = new Lines(grid);

  if (operator === '<->') {
    const other = /^([RrCc])(\d+)$/.exec(rest.trim());
    if (!other)
      throw new GridOpError(
        `Swap ${axis}${index} with another ${name(axis)}, e.g. ${axis}${index} <-> ${axis}${index + 1}.`,
      );
    if (other[1].toUpperCase() !== axis)
      throw new GridOpError(`Cannot swap a ${name(axis)} with a ${name(axis === 'R' ? 'C' : 'R')}.`);
    const [a, b] = [lines.read(axis, index), lines.read(axis, Number(other[2]))];
    const swapped = lines.write(axis, index, b.cells, format);
    return new Lines(swapped).write(axis, Number(other[2]), a.cells, format);
  }

  // `R1 -= x` is `R1 = R1 - (x)`.
  const compound = operator === '=' ? '' : `${axis}${index}${operator[0]}`;
  const value = evaluate(tokenise(`${compound}(${rest})`), lines);
  if (value.kind === 'scalar') {
    if (operator !== '=') throw new GridOpError('That does not leave a whole row or column to write back.');
    const { cells } = lines.blank(axis, index);
    return lines.write(
      axis,
      index,
      cells.map((): Term => ({ kind: 'number', value: value.scalar })),
      format,
    );
  }
  if (value.axis !== axis)
    throw new GridOpError(`A ${name(value.axis)} cannot be written into a ${name(axis)}.`);
  return lines.write(axis, index, value.cells, format);
}

/**
 * Adds, subtracts, multiplies or divides every number in the grid by `amount` (an integer, decimal or
 * fraction). Formulas get the operation written into them; text and empty cells stay as they are.
 */
export function applyToAll(
  grid: string[][],
  op: '+' | '-' | '*' | '/',
  amount: string,
  format: NumberFormat,
): string[][] {
  const by = Rational.parse(amount);
  if (!by) throw new GridOpError('Enter a number, such as 5, 0.25 or 1/3.');
  if (op === '/' && by.isZero) throw new GridOpError('Cannot divide by zero.');
  return grid.map((row) =>
    row.map((text) => {
      const cell = parseCell(text);
      if (cell.kind === 'text' || (cell.kind === 'number' && cell.blank)) return text;
      const next = op === '+' || op === '-' ? offsetTerm(op, cell, by, false) : scaleTerm(op, cell, by);
      return cellText(next, format);
    }),
  );
}
