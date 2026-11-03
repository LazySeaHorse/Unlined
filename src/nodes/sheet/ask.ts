import { z } from 'zod';
import { oneLine } from '@/agent/format';
import { type AskSpec, type CompleteSpec, continuing, gridView, upToCursor } from '@/ai/inlineAsk';
import { SYNTAX } from '../syntax';
import { formulaResult } from './evaluate';
import { parseCellKey } from './fills';

/** The sheet's own grid, the cell the formula is for (`B5`), and whether results show as fractions. */
export interface SheetAskContext {
  cells: string[][];
  at: string;
  fractions: boolean;
}

/** A formula to put in the cell, and what it would show there. */
export interface SheetFormula {
  formula: string;
  shown: string;
}

const grid = (rows: string[][]): SheetAskContext => ({ cells: rows, at: 'B5', fractions: false });
const items = grid([
  ['Item', 'Qty', 'Note'],
  ['a', '3', ''],
  ['b', '5', ''],
  ['c', '7', ''],
  ['', '', ''],
]);

/** A sheet formula from words: the model writes it, and it is kept only if it evaluates without an error. */
export const sheetAsk: AskSpec<SheetAskContext, { formula: string }, SheetFormula> = {
  feature: 'sheet-formula',
  system: `You write one spreadsheet formula for a cell, from a description; ${oneLine(SYNTAX.sheet, Infinity)}
Rows are numbered from 1 and columns are lettered from A. Use the grid shown and the cell it is for; do not
compute the answer yourself, only write the formula, starting with =.`,
  examples: [
    { context: items, words: 'average of column B', answer: { formula: '=AVERAGE(B2:B4)' } },
    { context: items, words: 'multiply the quantities', answer: { formula: '=PRODUCT(B2:B4)' } },
    { context: { ...items, at: 'C2' }, words: 'double the quantity', answer: { formula: '=B2*2' } },
    {
      context: items,
      words: 'how many items have more than 4',
      answer: { formula: '=COUNTIF(B2:B4,">4")' },
    },
    { context: { ...items, at: 'B1' }, words: 'total of the quantities', answer: { formula: '=SUM(B2:B4)' } },
  ],
  schema: z.object({ formula: z.string().startsWith('=').max(200) }),
  input: ({ cells, at }, words) =>
    `Grid:\n${gridView(cells)}\nCell: ${at}\nDescription: ${oneLine(words, 300)}`,
  check: ({ formula }, { cells, at, fractions }) => {
    const cell = parseCellKey(at);
    const shown = cell && formulaResult(cells, cell, formula, fractions);
    return Promise.resolve(
      shown === null || shown === undefined
        ? {
            ok: false,
            reason: 'That formula gives an error in this sheet. Use only the cells and functions it has.',
          }
        : { ok: true, value: { formula, shown } },
    );
  },
};

/**
 * The rest of what is typed in the formula bar, at the caret, for the active cell (`at`). A formula is kept if it
 * gives no error in the sheet; other text always is. The model sees only the bar's text, not the grid.
 */
export const sheetComplete: CompleteSpec<SheetAskContext> = {
  feature: 'sheet-complete',
  system: continuing(`It is a spreadsheet cell; ${oneLine(SYNTAX.sheet, Infinity)}`),
  examples: [
    { context: items, before: '=SUM(B2:', answer: 'B4)' },
    { context: items, before: '=AVERAGE(', answer: 'B2:B4)' },
    { context: { ...items, at: 'C2' }, before: '=B2', answer: '*2' },
  ],
  input: (_, before) => upToCursor('Formula', before),
  check: (text, { cells, at, fractions }) => {
    const cell = parseCellKey(at);
    return !text.startsWith('=') || (cell !== null && formulaResult(cells, cell, text, fractions) !== null);
  },
};
