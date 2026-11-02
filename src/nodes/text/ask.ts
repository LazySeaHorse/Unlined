import katex from 'katex';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { z } from 'zod';
import { oneLine } from '@/agent/format';
import type { AskSpec } from '@/ai/inlineAsk';
import remarkObsidianMath from '@/lib/remarkObsidianMath';
import { SYNTAX } from '../syntax';

// Parsed as the note renders it (lib/Markdown), so the spans found are the ones KaTeX will be given.
const parser = unified().use(remarkParse).use(remarkObsidianMath);

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

/** The LaTeX of every `$…$` and `$$…$$` span in `markdown`. */
export function mathSpans(markdown: string): { latex: string; display: boolean }[] {
  const spans: { latex: string; display: boolean }[] = [];
  const walk = (node: MdNode) => {
    if (node.type === 'math' || node.type === 'inlineMath')
      spans.push({ latex: node.value ?? '', display: node.type === 'math' });
    node.children?.forEach(walk);
  };
  walk(parser.parse(markdown) as MdNode);
  return spans;
}

/** The longest stretch of the note the model is shown. */
const NOTE_CHARS = 2000;

/**
 * A piece of a note from words, written in place of the line the `?` was typed on. Kept only if all its maths
 * renders. The note's own text is the context.
 */
export const textAsk: AskSpec<string, string, string> = {
  feature: 'text-note',
  format: 'fenced',
  system: `You write a short piece of a note from a request: ${oneLine(SYNTAX.text, Infinity)}
Write maths as LaTeX inside $…$, or $$…$$ for a formula on its own. Keep it short: a few lines at most.
Do not calculate anything, and do not repeat the note: write only the new text. The note comes first, for
requests that refer to it. End with the new text in a \`\`\` fenced block.`,
  examples: [
    {
      context: '',
      words: 'quadratic formula',
      answer: 'The roots of $ax^2+bx+c=0$ are\n$$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$$',
    },
    { context: '# Shopping\n- milk', words: 'add eggs and bread', answer: '- eggs\n- bread' },
    {
      context: 'Met Sam about the launch. Moved it to May.',
      words: 'a heading for this',
      answer: '## Launch meeting with Sam',
    },
    {
      context: '',
      words: 'pythagoras in one sentence',
      answer: 'In a right triangle with hypotenuse $c$, $a^2+b^2=c^2$.',
    },
  ],
  schema: z.string().max(1500),
  input: (note, words) => {
    const text = note.trim();
    const shown = text.length > NOTE_CHARS ? `${text.slice(0, NOTE_CHARS)}…` : text;
    return `Note:\n${shown || '(empty)'}\nRequest: ${oneLine(words, 300)}`;
  },
  check: async (markdown) => {
    const text = markdown.trim();
    if (!text) return { ok: false, reason: 'Write some text.' };
    for (const { latex, display } of mathSpans(text)) {
      try {
        katex.renderToString(latex, { throwOnError: true, displayMode: display });
      } catch {
        return { ok: false, reason: `$${latex}$ does not render. Write plain LaTeX between the $ signs.` };
      }
    }
    return { ok: true, value: text };
  },
};
