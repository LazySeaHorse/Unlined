import type { z } from 'zod';
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
  check: Check<Answer, Value>;
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
    check: spec.check,
    signal,
  });
}
