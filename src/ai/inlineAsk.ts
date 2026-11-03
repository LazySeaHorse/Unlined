import { z } from 'zod';
import { gridBody, oneLine } from '@/agent/format';
import { type AskResult, ask, type Check, type ReplyFormat } from './languageModel';

/**
 * What one kind of field asks the model when `?` is typed into it (see useInlineAsk). Kept free of React so the
 * prompt, its examples and its check can be tested on their own.
 *
 * `Context` is the node's own data, the only thing besides the user's words the model sees; `Answer` is the shape
 * the model fills in; `Value` is what the check makes of it, ready to apply.
 */
export interface AskSpec<Context, Answer, Value> {
  /** Names the warm session; one per spec. */
  feature: string;
  system: string;
  /** Worked examples. Each answer must pass `check` (a test holds every spec to that). */
  examples: Array<{ context: Context; words: string; answer: Answer }>;
  schema: z.ZodType<Answer>;
  /** `json` (the default) for syntax; `fenced` when the model should reason first, with `Answer` a string. */
  format?: ReplyFormat;
  /** Sees the node's context too, for answers that only make sense in it (a formula in its grid). */
  check: (answer: Answer, context: Context) => ReturnType<Check<Answer, Value>>;
  /** The message for one request: the node's data first, then the user's words. Used for the examples too. */
  input: (context: Context, words: string) => string;
}

/** Asks the model for `words` in `context`, with the spec's examples. */
export function askFor<Context, Answer, Value>(
  spec: AskSpec<Context, Answer, Value>,
  context: Context,
  words: string,
  signal?: AbortSignal,
): Promise<AskResult<Value>> {
  return ask({
    feature: spec.feature,
    system: spec.system,
    examples: spec.examples.map((e) => [spec.input(e.context, e.words), e.answer]),
    input: spec.input(context, words),
    schema: spec.schema,
    format: spec.format,
    check: (answer) => spec.check(answer, context),
    signal,
  });
}

/**
 * What one kind of field asks the model when Tab is pressed in it (see useInlineComplete): the rest of the line at
 * the caret. The model sees only the field's text up to the caret (and `Context`, when a node has more of its own
 * to tell, such as the values its links bring in). A continuation is kept only if the field's text with it put in
 * still passes `check`, the same usability check the field's AskSpec makes; nothing is judged on what it says.
 */
export interface CompleteSpec<Context> {
  /** Names the warm session; one per spec. */
  feature: string;
  system: string;
  /** Worked examples: the text before and after the caret, and what goes at the caret. Each must pass `check`. */
  examples: Array<{ context: Context; before: string; after?: string; answer: string }>;
  /** The message for one request: the text up to the caret (cut to its last COMPLETE_CHARS), and `context`. */
  input: (context: Context, before: string) => string;
  /** Whether `text`, the field's text with the continuation in it, is still something the field can use. */
  check: (text: string, context: Context, caret: number) => boolean | Promise<boolean>;
  /** Lets the model reason before it answers (a fenced block, of which the first line is kept); off by default,
   * as a continuation is not a translation. */
  reasoning?: boolean;
}

/** A completion's system prompt: what is being typed (`what`), then the rules every completion keeps. */
export const continuing = (what: string) => `You continue what someone is typing, from where their cursor is. ${what}
Reply with only what comes next at the cursor, on one short line: the rest of the line, a few words or symbols.
Never repeat what is already there, and never explain.`;

/** A completion's message: the text up to the cursor, under a line naming it. */
export const upToCursor = (name: string, before: string) => `${name} up to the cursor:\n${before}`;

/** The longest one completion may take. */
export const COMPLETE_LIMIT_MS = 8_000;
/** The most of a field's text, up to the caret, a completion is sent. */
export const COMPLETE_CHARS = 2000;

/** The text before a caret as the model is shown it: its end, at most COMPLETE_CHARS of it. */
const shownBefore = (before: string) =>
  before.length > COMPLETE_CHARS ? `…${before.slice(-COMPLETE_CHARS)}` : before;

/** Asks the model what comes at the caret between `before` and `after`: one line, kept if the text with it passes. */
export function completeFor<Context>(
  spec: CompleteSpec<Context>,
  context: Context,
  before: string,
  after: string,
  signal?: AbortSignal,
): Promise<AskResult<string>> {
  return ask({
    feature: spec.feature,
    system: spec.system,
    examples: spec.examples.map((e) => [spec.input(e.context, e.before), e.answer]),
    input: spec.input(context, shownBefore(before)),
    schema: z.string(),
    format: spec.reasoning ? 'fenced' : 'line',
    limitMs: COMPLETE_LIMIT_MS,
    check: async (answer) => {
      let line = answer.split('\n')[0].trimEnd();
      // A space typed already is not typed twice.
      if (/\s$/.test(before)) line = line.trimStart();
      const text = before + line + after;
      return line.trim() && (await spec.check(text, context, before.length + line.length))
        ? { ok: true, value: line }
        : { ok: false, reason: 'That does not fit here.' };
    },
    signal,
  });
}

/** Enough of a grid (a table, a sheet) for a small model: its top left corner, one line per cell. */
export const gridView = (cells: string[][]): string =>
  gridBody(cells.slice(0, 20).map((row) => row.slice(0, 10).map((text) => oneLine(text, 40))));
