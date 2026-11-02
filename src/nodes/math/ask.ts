import katex from 'katex';
import { z } from 'zod';
import { oneLine } from '@/agent/format';
import type { AskSpec } from '@/ai/inlineAsk';

/** Whether `latex` is maths that typesets: KaTeX renders it, and it is maths, not words in \text. */
export function typesets(latex: string): { ok: true } | { ok: false; reason: string } {
  if (latex.includes('\\text')) return { ok: false, reason: 'Write only maths, no \\text.' };
  try {
    katex.renderToString(latex, { throwOnError: true });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'That LaTeX does not render. Write plain LaTeX, without $ signs.' };
  }
}

/**
 * A Math node's content from words: a translation, or a worked answer when the words ask for one. The model may
 * reason first; the last fenced block is kept if it typesets. The context is the node's other lines, so the words
 * can refer to them ("solve this").
 */
export const mathAsk: AskSpec<string[], string, string> = {
  feature: 'math-node',
  format: 'fenced',
  system: `You write maths as LaTeX for a typeset note. The user describes something to write, or asks you to
solve, simplify, integrate or otherwise work something out. Think it through first, as long as you need.
Then end with the final answer as LaTeX in a \`\`\` fenced block: brief, only the maths, without $ signs and
without \\text. The note may already hold lines of maths; the request can refer to them.`,
  examples: [
    { context: [], words: 'quadratic formula', answer: 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}' },
    {
      context: [],
      words: 'integrate e^x sin x',
      answer: '\\int e^x\\sin x\\,dx=\\frac{e^x(\\sin x-\\cos x)}{2}+C',
    },
    { context: [], words: 'solve x^2-5x+6=0', answer: 'x=2,\\quad x=3' },
    {
      context: ['\\int e^x\\cos x\\,dx'],
      words: 'solve this',
      answer: '=\\frac{e^x(\\sin x+\\cos x)}{2}+C',
    },
    {
      context: [],
      words: 'sum of 1 over n squared to infinity',
      answer: '\\sum_{n=1}^{\\infty}\\frac{1}{n^2}',
    },
    { context: [], words: '2 by 2 identity matrix', answer: '\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}' },
  ],
  schema: z.string().max(400),
  input: (lines, words) =>
    `${lines.length > 0 ? `Math so far:\n${lines.map((l) => oneLine(l, 300)).join('\n')}\n` : ''}Request: ${oneLine(words, 300)}`,
  check: async (latex) => {
    const checked = typesets(latex);
    return checked.ok ? { ok: true, value: latex } : checked;
  },
};
