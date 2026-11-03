import { javascriptLanguage } from '@codemirror/lang-javascript';
import { z } from 'zod';
import { oneLine } from '@/agent/format';
import { type AskSpec, type CompleteSpec, continuing, upToCursor } from '@/ai/inlineAsk';

/** The longest stretch of the script the model is shown. */
const SOURCE_CHARS = 3000;

/** How many places `code` does not parse as JavaScript, by the same grammar the editor highlights with. Never
 * runs it. */
export function parseErrors(code: string): number {
  let errors = 0;
  javascriptLanguage.parser.parse(code).iterate({
    enter: (node) => {
      if (node.type.isError) errors++;
    },
  });
  return errors;
}

/** Whether `code` parses as JavaScript. */
export const parsesAsJavaScript = (code: string): boolean => parseErrors(code) === 0;

/**
 * JavaScript from words, written in place of the line the `?` was typed on. Kept only if it parses. The script's
 * own source is the context.
 */
export const codeAsk: AskSpec<string, string, string> = {
  feature: 'code-script',
  format: 'fenced',
  system: `You write JavaScript for a small sandbox: it runs the script and shows what console.log prints, with a 5 second limit.
There is no DOM, no network and no imports. Use plain modern JavaScript and console.log to show results.
Keep it short. Do not repeat the script: write only the new code, which goes in where the request was typed.
The script comes first, for requests that refer to it. End with the new code in a \`\`\` fenced block.`,
  examples: [
    {
      context: '',
      words: 'reverse a string',
      answer: "const reverse = (s) => [...s].reverse().join('');\nconsole.log(reverse('hello'));",
    },
    {
      context: 'const nums = [3, 1, 2];',
      words: 'print them sorted',
      answer: 'console.log([...nums].sort((a, b) => a - b));',
    },
    {
      context: '',
      words: 'first 8 fibonacci numbers',
      answer:
        'let [a, b] = [0, 1];\nfor (let i = 0; i < 8; i++) {\n  console.log(a);\n  [a, b] = [b, a + b];\n}',
    },
  ],
  schema: z.string().max(2000),
  input: (source, words) => {
    const text = source.trim();
    const shown = text.length > SOURCE_CHARS ? `${text.slice(0, SOURCE_CHARS)}…` : text;
    return `Script:\n${shown || '(empty)'}\nRequest: ${oneLine(words, 300)}`;
  },
  check: async (code) =>
    code.trim() && parsesAsJavaScript(code)
      ? { ok: true, value: code }
      : { ok: false, reason: 'That is not valid JavaScript. Write plain JavaScript.' },
};

/**
 * The rest of a script's line at the caret. A script being typed seldom parses, so the line is kept if the script
 * parses no worse with it than without.
 */
export const codeComplete: CompleteSpec<void> = {
  feature: 'code-complete',
  system: continuing('It is JavaScript run in a small sandbox, which shows what console.log prints.'),
  examples: [
    {
      context: undefined,
      before: 'const nums = [3, 1, 2];\nconsole.log(nums.',
      answer: 'sort((a, b) => a - b));',
    },
    { context: undefined, before: 'for (let i = 0; i < 10; ', answer: 'i++) {' },
    { context: undefined, before: "const greet = (name) => 'Hello, ' + ", answer: "name + '!';" },
  ],
  input: (_, before) => upToCursor('Script', before),
  check: (text, _, { before, after }) => parseErrors(text) <= parseErrors(before + after),
};
