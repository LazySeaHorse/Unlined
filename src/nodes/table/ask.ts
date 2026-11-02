import { z } from 'zod';
import { columnName, gridBody, oneLine } from '@/agent/format';
import type { AskSpec } from '@/ai/inlineAsk';
import { typesets } from '../math/ask';

/** The table's own cells, and the cell being asked for. */
export interface TableAskContext {
  cells: string[][];
  row: number;
  col: number;
}

const MAX_ROWS = 20;
const MAX_COLUMNS = 10;

const view = (cells: string[][]) =>
  gridBody(cells.slice(0, MAX_ROWS).map((row) => row.slice(0, MAX_COLUMNS).map((text) => oneLine(text, 40))));

const identity: TableAskContext = {
  cells: [
    ['1', '0', '0'],
    ['0', '', '0'],
    ['0', '0', '1'],
  ],
  row: 1,
  col: 1,
};
const squares: TableAskContext = {
  cells: [
    ['n', 'n^2'],
    ['1', '1'],
    ['2', '4'],
    ['3', ''],
  ],
  row: 3,
  col: 1,
};

/** One table cell from words: the model writes its LaTeX, kept if it typesets. */
export const tableAsk: AskSpec<TableAskContext, { latex: string }, string> = {
  feature: 'table-cell',
  system: `You write the LaTeX for one cell of a table of maths, from a description. The table comes first, with
columns lettered from A and rows numbered from 1, then the cell to fill, for descriptions that follow a pattern
in its row or column. Write only the cell's maths: brief, without $ signs and without \\text.`,
  examples: [
    { context: identity, words: 'identity matrix entry', answer: { latex: '1' } },
    { context: squares, words: 'next term of the column above', answer: { latex: '9' } },
    {
      context: {
        cells: [
          ['n', ''],
          ['1', '1'],
          ['2', '4'],
        ],
        row: 0,
        col: 1,
      },
      words: 'n squared',
      answer: { latex: 'n^2' },
    },
    {
      context: { cells: [['', '']], row: 0, col: 1 },
      words: 'area of a circle',
      answer: { latex: '\\pi r^2' },
    },
    {
      context: { cells: [['\\sin x', '']], row: 0, col: 1 },
      words: 'its derivative',
      answer: { latex: '\\cos x' },
    },
  ],
  schema: z.object({ latex: z.string().min(1).max(200) }),
  input: ({ cells, row, col }, words) =>
    `Table:\n${view(cells)}\nCell: ${columnName(col)}${row + 1}\nDescription: ${oneLine(words, 300)}`,
  check: async ({ latex }) => {
    const checked = typesets(latex);
    return checked.ok ? { ok: true, value: latex } : checked;
  },
};
