import { z } from 'zod';
import { oneLine } from '@/agent/format';
import { type AskSpec, type CompleteSpec, continuing, upToCursor } from '@/ai/inlineAsk';
import { loadEngine } from '@/lib/math/engine';
import { SYNTAX } from '../syntax';
import {
  evaluateDocuments,
  fromLinesBody,
  LINE_BREAK,
  lineAt,
  linesBody,
  linesUpTo,
  splitBody,
  splitLines,
} from './evaluate';

/** What the model sees of a Math+ node: its own lines, and the values its links bring in by name. */
export interface MathPlusContext {
  lines: string[];
  inputs: { name: string; value: string }[];
}

/** The values a node's links bring in, for the model; empty when there are none. */
const linkedValues = (inputs: MathPlusContext['inputs']) =>
  inputs.length > 0
    ? `Values from links: ${oneLine(inputs.map(({ name, value }) => `${name} = ${value}`).join('; '), 300)}`
    : '';

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
    const linked = linkedValues(inputs);
    return [
      `Lines:\n${lines.length > 0 ? lines.map((line) => oneLine(line, 200)).join('\n') : '(none)'}`,
      ...(linked ? [linked] : []),
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

/** The rest of a Math+ line at the caret, kept if Math+ evaluates that line. The model sees the linked values too. */
export const mathPlusComplete: CompleteSpec<Pick<MathPlusContext, 'inputs'>> = {
  feature: 'mathplus-complete',
  system: continuing(
    `It is a line of Math+, a calculator that works out each line itself. ${oneLine(SYNTAX.mathPlus, Infinity)}
A line is a LaTeX expression, or a definition with :=. Write the expression, never its result; use the names of
the values links bring in. Never use \\text.`,
  ),
  examples: [
    { context: { inputs: [] }, before: '\\displaylines{r:=3\\\\ A:=', after: '}', answer: '\\pi r^2' },
    { context: { inputs: [{ name: 'k', value: '5' }] }, before: 'k^2', answer: '+1' },
    { context: { inputs: [] }, before: 'f(x):=x^3', answer: '-x' },
  ],
  input: ({ inputs }, before) =>
    [linkedValues(inputs), upToCursor('Math+', linesUpTo(before))].filter(Boolean).join('\n'),
  check: async (text, _, { before, line }) => {
    const { index } = lineAt(text, before.length + line.length);
    // Results are for the lines that hold something.
    const at = splitBody(linesBody(text))
      .slice(0, index)
      .filter((l) => l.trim()).length;
    const results = evaluateDocuments((await loadEngine()).ce, [{ id: 'complete', latex: text }]).complete;
    return results?.[at] !== undefined && !results[at].error;
  },
};
