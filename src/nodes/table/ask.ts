import { z } from 'zod';
import { columnName, oneLine } from '@/agent/format';
import { type AskSpec, type CompleteSpec, continuing, gridView, upToCursor } from '@/ai/inlineAsk';
import { LATEX_LINE, typesets } from '../math/ask';

/** The table's own cells, and the cell being asked for. */
export interface TableAskContext {
  cells: string[][];
  row: number;
  col: number;
}

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
    `Table:\n${gridView(cells)}\nCell: ${columnName(col)}${row + 1}\nDescription: ${oneLine(words, 300)}`,
  check: async ({ latex }) => {
    const checked = typesets(latex);
    return checked.ok ? { ok: true, value: latex } : checked;
  },
};

/** The rest of a table cell at the caret, kept if the cell still typesets. */
export const tableComplete: CompleteSpec<void> = {
  feature: 'table-complete',
  system: continuing(`It is one cell of a table of maths. ${LATEX_LINE}`),
  examples: [
    { context: undefined, before: '\\pi r', answer: '^2' },
    { context: undefined, before: 'a^2+', answer: 'b^2' },
    { context: undefined, before: '\\frac{1}{', after: '}', answer: '2' },
  ],
  input: (_, before) => upToCursor('Cell', before),
  check: (text) => typesets(text).ok,
};
