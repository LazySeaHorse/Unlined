import { fromLinesBody, LINE_BREAK, linesBody, splitBody } from './evaluate';

/** What MathLive writes between lines: the break, and a space. */
const SEPARATOR = `${LINE_BREAK} `;

/** A Math+ node's lines, one per row, blank ones too. A node always has at least one row. */
export const rowsOf = (latex: string): string[] => splitBody(linesBody(latex)).map((row) => row.trim());

/** The LaTeX a node stores for its rows (see rowsOf). */
export const latexOf = (rows: string[]): string => fromLinesBody(rows.join(SEPARATOR));

/**
 * The rows after row `at` was edited to `latex`. Several lines in it (math pasted in) become rows of their own;
 * `row` is the last of them, where the caret belongs.
 */
export function editRow(rows: string[], at: number, latex: string): { rows: string[]; row: number } {
  const lines = rowsOf(latex);
  return { rows: rows.toSpliced(at, 1, ...lines), row: at + lines.length - 1 };
}

/** Row `at` split in two, at a caret that has `before` of it behind it and `after` ahead: the second is the new row. */
export function splitRow(
  rows: string[],
  at: number,
  before: string,
  after: string,
): { rows: string[]; row: number } {
  return { rows: rows.toSpliced(at, 1, before, after), row: at + 1 };
}

/** Row `at` joined onto the row above it; the caret belongs at `row`, after what the row above held. */
export function joinUp(rows: string[], at: number): { rows: string[]; row: number } {
  return { rows: rows.toSpliced(at - 1, 2, rows[at - 1] + rows[at]), row: at - 1 };
}

/** The node's LaTeX with its row at `at` replaced by `lines` (an answer to an ask). */
export const withLines = (latex: string, at: number, lines: string[]): string =>
  latexOf(rowsOf(latex).toSpliced(at, 1, ...lines));

/** Whether the LaTeX behind a caret leaves it at the top of the line: no group, `\left`...`\right` or environment open. */
export function atTopLevel(before: string): boolean {
  let depth = 0;
  for (const [token] of before.matchAll(/\\(?:left|right|begin|end)(?![a-zA-Z])|\\.|[{}]/g)) {
    if (token === '{' || token === '\\left' || token === '\\begin') depth++;
    else if (token === '}' || token === '\\right' || token === '\\end') depth--;
  }
  return depth === 0;
}

/**
 * The whole node's LaTeX either side of a caret in row `at`, given what the row has either side of it: the text a
 * completion is asked from, which is the lines above the caret, not just the line.
 */
export function around(rows: string[], at: number, before: string, after: string) {
  const several = rows.length > 1;
  return {
    before:
      (several ? '\\displaylines{' : '') +
      rows
        .slice(0, at)
        .map((row) => row + SEPARATOR)
        .join('') +
      before,
    after:
      after +
      rows
        .slice(at + 1)
        .map((row) => SEPARATOR + row)
        .join('') +
      (several ? '}' : ''),
  };
}
