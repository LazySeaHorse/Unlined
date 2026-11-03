import { z } from 'zod';
import { oneLine } from '@/agent/format';
import { type AskSpec, type CompleteSpec, continuing, upToCursor } from '@/ai/inlineAsk';
import { loadEngine } from '@/lib/math/engine';
import type { GraphEquation } from '@/model/types';
import { LATEX_LINE, typesets } from '../math/ask';
import { SYNTAX } from '../syntax';
import { classifyRelation } from './relation';

/** A graph row from words: the model writes the LaTeX, and the row is kept only if the graph can draw it. */
export const graphAsk: AskSpec<GraphEquation[], { latex: string }, string> = {
  feature: 'graph-row',
  system: `You write one row of a graph as LaTeX, from a description. ${oneLine(SYNTAX.graph, Infinity)}
Use only the variables x and y. Inequalities may be chained, as in 1\\le|x|\\le2. Write \\le and \\ge, \\sqrt{}, \\sin,
\\cos, \\ln and |x| as LaTeX does. Never use \\text. Do not solve or explain anything, only write the row.
The graph's other rows come first, for descriptions that refer to them.`,
  examples: [
    {
      context: [],
      words: 'downward parabola through (1,-2) with vertex at origin',
      answer: { latex: 'y=-2x^2' },
    },
    { context: [], words: 'ring between radius 1 and 2', answer: { latex: '1\\le x^2+y^2\\le4' } },
    {
      context: [],
      words: 'everything above the line through the origin with slope 3',
      answer: { latex: 'y>3x' },
    },
    {
      context: [{ latex: 'y=\\sin(x)', color: 'blue' }],
      words: 'another one shifted up by 2',
      answer: { latex: 'y=\\sin(x)+2' },
    },
    { context: [], words: 'vertical line at 4', answer: { latex: 'x=4' } },
  ],
  schema: z.object({ latex: z.string().max(120) }),
  input: (rows, words) => {
    const others = rows.map((row) => row.latex).filter((latex) => latex.trim());
    return `Rows: ${others.length > 0 ? others.join('; ') : '(none)'}\nDescription: ${oneLine(words, 300)}`;
  },
  check: async ({ latex }) => {
    const checked = typesets(latex);
    if (!checked.ok) return checked;
    if (!classifyRelation(await loadEngine(), latex))
      return { ok: false, reason: 'That is not a row the graph can draw, in x and y only.' };
    return { ok: true, value: latex };
  },
};

/** The rest of a graph row at the caret, kept if the graph can draw the row. */
export const graphComplete: CompleteSpec<void> = {
  feature: 'graph-complete',
  system: continuing(
    `It is one row of a graph. ${oneLine(SYNTAX.graph, Infinity)} Use only the variables x and y. ${LATEX_LINE}`,
  ),
  examples: [
    { context: undefined, before: 'y=x^2', answer: '-2x+1' },
    { context: undefined, before: 'x^2+y^2', answer: '=4' },
    { context: undefined, before: 'y>', answer: '2x-1' },
  ],
  input: (_, before) => upToCursor('Row', before),
  check: async (text) => typesets(text).ok && classifyRelation(await loadEngine(), text) !== null,
};
