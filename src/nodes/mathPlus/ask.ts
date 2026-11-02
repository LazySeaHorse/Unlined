import { z } from 'zod';
import { oneLine } from '@/agent/format';
import type { AskSpec } from '@/ai/inlineAsk';
import { loadEngine } from '@/lib/math/engine';
import { SYNTAX } from '../syntax';
import { evaluateDocuments, fromLinesBody, LINE_BREAK, splitLines } from './evaluate';

/** What the model sees of a Math+ node: its own lines, and the values its links bring in by name. */
export interface MathPlusContext {
  lines: string[];
  inputs: { name: string; value: string }[];
}

/**
 * Math+ lines from words, put in place of the line the `?` was typed on. The model writes expressions and
 * definitions; Math+ works out their results itself, so the lines are kept only if every one of them evaluates.
 */
export const mathPlusAsk: AskSpec<MathPlusContext, { lines: string[] }, string[]> = {
  feature: 'mathplus-lines',
  system: `You write lines for Math+, a calculator that works out each line itself. ${oneLine(SYNTAX.mathPlus, Infinity)}
Each line is a LaTeX expression, or a definition with :=, such as s:=a+b, \\frac{1}{3}, \\sqrt{2}, x^{2}, f(x):=x^2.
Never write a result or a number you worked out: write the expression and Math+ computes it.
The node's lines come first, with the values its links bring in by name; use those names. Never use \\text.
At most 6 lines. Do not explain anything, only write the lines.`,
  examples: [
    {
      context: { lines: [], inputs: [] },
      words: 'area of a circle with radius 3',
      answer: { lines: ['r:=3', 'A:=\\pi r^2'] },
    },
    {
      context: { lines: ['a:=2', 'b:=7.5', 'c:=2.25'], inputs: [] },
      words: 'their sum and mean',
      answer: { lines: ['s:=a+b+c', '\\frac{s}{3}'] },
    },
    {
      context: { lines: ['12', '7.5', '30'], inputs: [] },
      words: 'sum them up',
      answer: { lines: ['12+7.5+30'] },
    },
    {
      context: { lines: [], inputs: [{ name: 'k', value: '5' }] },
      words: 'k squared plus one',
      answer: { lines: ['k^2+1'] },
    },
    {
      context: { lines: [], inputs: [] },
      words: 'f of x is x cubed minus x, then f at 4',
      answer: { lines: ['f(x):=x^3-x', 'f(4)'] },
    },
  ],
  schema: z.object({ lines: z.array(z.string().max(160)).min(1).max(6) }),
  input: ({ lines, inputs }, words) => {
    const linked = inputs.map(({ name, value }) => `${name} = ${value}`).join('; ');
    return [
      `Lines:\n${lines.length > 0 ? lines.map((line) => oneLine(line, 200)).join('\n') : '(none)'}`,
      ...(linked ? [`Values from links: ${oneLine(linked, 300)}`] : []),
      `Description: ${oneLine(words, 300)}`,
    ].join('\n');
  },
  check: async (answer, context) => {
    const lines = answer.lines.flatMap(splitLines);
    if (lines.length === 0) return { ok: false, reason: 'Write at least one line.' };
    // After the node's own lines, on a scratch copy, so their variables are known.
    const latex = fromLinesBody([...context.lines, ...lines].join(LINE_BREAK));
    const results = evaluateDocuments((await loadEngine()).ce, [{ id: 'ask', latex }]).ask ?? [];
    const failed = results.slice(context.lines.length).find((result) => result.error);
    if (failed)
      return { ok: false, reason: `A line does not evaluate (${failed.error}). Write Math+ LaTeX lines.` };
    return { ok: true, value: lines };
  },
};
