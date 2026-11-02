import { z } from 'zod';
import { oneLine } from '@/agent/format';
import type { AskSpec } from '@/ai/inlineAsk';
import { loadEngine } from '@/lib/math/engine';
import type { GraphEquation } from '@/model/types';
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
    if (latex.includes('\\text')) return { ok: false, reason: 'Write only maths, no \\text.' };
    if (!classifyRelation(await loadEngine(), latex))
      return { ok: false, reason: 'That is not a row the graph can draw, in x and y only.' };
    return { ok: true, value: latex };
  },
};
