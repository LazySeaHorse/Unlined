import { z } from 'zod';

/**
 * The only file that touches Chrome's built-in Prompt API (`LanguageModel`, Gemini Nano). Everything else asks
 * through `ask()` and gets a typed, validated answer or a reason it could not have one.
 *
 * The model translates (words to LaTeX, to a formula, to a title) or continues a field's text by a line. Whatever it
 * returns is checked by the app's own parsers before anyone sees it, via the `check` each caller passes.
 */

export type Availability = 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface Session {
  prompt: (input: string, options?: { signal?: AbortSignal; responseConstraint?: object }) => Promise<string>;
  /** The reply as it is written, in pieces (each one new text, as Chrome streams it). */
  promptStreaming: (input: string, options?: { signal?: AbortSignal }) => ReadableStream<string>;
  clone: (options?: { signal?: AbortSignal }) => Promise<Session>;
  destroy: () => void;
}

type Turn = { role: 'system' | 'user' | 'assistant'; content: string };

interface Api {
  availability: (options?: object) => Promise<string>;
  create: (options?: {
    initialPrompts?: Turn[];
    signal?: AbortSignal;
    monitor?: (m: EventTarget) => void;
    expectedInputs?: object[];
    expectedOutputs?: object[];
  }) => Promise<Session>;
}

// English in, English out. Declaring it lets Chrome pick a supported model and silences its language warning.
const LANGUAGES = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

const getApi = (): Api | undefined => (globalThis as { LanguageModel?: Api }).LanguageModel;

export async function checkAvailability(): Promise<Availability> {
  const api = getApi();
  if (!api) return 'unsupported';
  try {
    const state = await api.availability(LANGUAGES);
    return state === 'available' || state === 'downloadable' || state === 'downloading'
      ? state
      : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/** Downloads the model. Only call from a click: Chrome needs a user gesture to start it. */
export async function downloadModel(
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const api = getApi();
  if (!api) throw new Error('On-device AI is not supported in this browser.');
  const session = await api.create({
    ...LANGUAGES,
    signal,
    monitor: (m) =>
      m.addEventListener('downloadprogress', (e) => onProgress((e as Event & { loaded: number }).loaded)),
  });
  session.destroy();
}

// One warm base session per feature (system prompt and examples already read). Requests run on a clone, so the
// examples are not re-sent and one request never leaks into the next.
const bases = new Map<string, Promise<Session>>();

/** Drops `base` from the cache, unless another has taken its place since. */
const forget = (feature: string, base: Promise<Session>) => {
  if (bases.get(feature) === base) bases.delete(feature);
};

function baseSession(feature: string, initialPrompts: Turn[], signal: AbortSignal): Promise<Session> {
  const cached = bases.get(feature);
  if (cached) return cached;
  const api = getApi();
  if (!api) return Promise.reject(new Error('unsupported'));
  const base = (async () => {
    // Creating a session for a model not on the device starts its download, which only a click in the
    // On-device tab may do.
    if ((await api.availability(LANGUAGES)) !== 'available') throw new Error('unavailable');
    return api.create({ ...LANGUAGES, initialPrompts, signal });
  })();
  base.catch(() => forget(feature, base));
  bases.set(feature, base);
  return base;
}

/** Frees the model's memory, e.g. when the setting is switched off. */
export function releaseSessions(): void {
  for (const base of bases.values()) base.then((s) => s.destroy()).catch(() => {});
  bases.clear();
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', releaseSessions);

// One request at a time: the model runs on the user's GPU, and a queue of small jobs finishes sooner than a pile of
// parallel ones.
let tail: Promise<unknown> = Promise.resolve();
const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
  const run = tail.then(job, job);
  tail = run.catch(() => {});
  return run;
};

/** The longest one call to the model (getting a session, or one prompt) may take. A small model can loop, and
 * setting one up can hang; this ends either. */
export const TURN_LIMIT_MS = 30_000;

/**
 * How the model answers: constrained JSON (for syntax), free text whose last fenced block is the answer, or one
 * line of text read as it streams (see firstLine).
 */
export type ReplyFormat = 'json' | 'fenced' | 'line';

/** The most of a `line` reply that is kept. */
export const LINE_CHARS = 120;

/**
 * A streamed reply up to its first line break, or its first LINE_CHARS: reading stops there and `stop` ends the
 * reply, so the model does not go on writing what nobody will read. What arrived before is kept.
 */
export async function firstLine(stream: ReadableStream<string>, stop: () => void): Promise<string> {
  const reader = stream.getReader();
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return text;
      text += value;
      const end = text.indexOf('\n');
      if (end >= 0 || text.length >= LINE_CHARS) {
        stop();
        return text.slice(0, end >= 0 ? Math.min(end, LINE_CHARS) : LINE_CHARS);
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

/**
 * The text between the last two ``` of a free-text reply, without a language tag (a word alone on the opening
 * line) and the blank lines around it, indentation kept; undefined when there is none. The last two, so that a
 * ``` mentioned in the reasoning before the block does not throw it off.
 */
export function lastFence(reply: string): string | undefined {
  const close = reply.lastIndexOf('```');
  const open = close < 3 ? -1 : reply.lastIndexOf('```', close - 3);
  if (open < 0) return undefined;
  const text = reply
    .slice(open + 3, close)
    .replace(/^[\w+#.-]*[ \t]*\n/, '')
    .replace(/^\s*\n/, '')
    .trimEnd();
  return text.trim() ? text : undefined;
}

export type AskResult<T> =
  | { status: 'ok'; value: T }
  /** The answers failed their check, even after the reason was sent back. */
  | { status: 'invalid' }
  /** A call ran past its limit (TURN_LIMIT_MS, or the caller's `limitMs`). */
  | { status: 'timeout' }
  | { status: 'aborted' }
  | { status: 'unavailable' };

export type Check<T, U> = (value: T) => Promise<{ ok: true; value: U } | { ok: false; reason: string }>;

export interface AskOptions<T, U> {
  /** Names the warm session; one per feature. */
  feature: string;
  system: string;
  /** Worked examples as [what the user typed, what the model should answer]. */
  examples: Array<[input: string, output: T]>;
  input: string;
  /** The shape of the answer. The model is constrained to it, then the answer is parsed against it. */
  schema: z.ZodType<T>;
  /** Validates the answer with the app's own engine. A failure is sent back to the model once. */
  check: Check<T, U>;
  /**
   * `json` (the default) constrains the reply to `schema`. `fenced` lets the model reason first and reads the last
   * ``` block; `line` takes the reply's first line as it streams, with no second try. `T` is then a string.
   */
  format?: ReplyFormat;
  /** The longest one call may take; TURN_LIMIT_MS unless said. */
  limitMs?: number;
  signal?: AbortSignal;
}

const isAbort = (e: unknown, signal?: AbortSignal) =>
  signal?.aborted || (e instanceof DOMException && e.name === 'AbortError');

export function ask<T, U>(options: AskOptions<T, U>): Promise<AskResult<U>> {
  const { feature, system, examples, input, schema, check, signal } = options;
  const { format = 'json', limitMs = TURN_LIMIT_MS } = options;
  if (signal?.aborted) return Promise.resolve({ status: 'aborted' });
  return enqueue(async (): Promise<AskResult<U>> => {
    if (signal?.aborted) return { status: 'aborted' };
    if (!getApi()) return { status: 'unavailable' };
    let session: Session | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    /** A signal for the next call, aborted once it has run `limitMs`. */
    const limited = () => {
      clearTimeout(timer);
      const turn = new AbortController();
      timer = setTimeout(() => {
        timedOut = true;
        turn.abort();
      }, limitMs);
      return turn.signal;
    };
    const orAborted = (limit: AbortSignal) => (signal ? AbortSignal.any([signal, limit]) : limit);
    try {
      const initialPrompts: Turn[] = [
        { role: 'system', content: system },
        ...examples.flatMap(([user, out]): Turn[] => [
          { role: 'user', content: user },
          {
            role: 'assistant',
            content:
              format === 'fenced'
                ? `\`\`\`\n${out}\n\`\`\``
                : format === 'line'
                  ? String(out)
                  : JSON.stringify(out),
          },
        ]),
      ];
      const setup = limited();
      // The base is shared, so only the time limit may end its making, not this one request's abort.
      const base = baseSession(feature, initialPrompts, setup);
      try {
        session = await (await base).clone({ signal: orAborted(setup) });
      } catch (e) {
        // A base that cannot be cloned, or took too long, is made afresh next time.
        if (!signal?.aborted) forget(feature, base);
        throw e;
      }
      const responseConstraint = format === 'json' ? z.toJSONSchema(schema) : undefined;
      let message = input;
      // A line is a guess at what comes next: one that fails is not worth the wait for another.
      for (let attempt = 0; attempt < (format === 'line' ? 1 : 2); attempt++) {
        const raw = await reply(session, message, orAborted(limited()), format, responseConstraint);
        clearTimeout(timer);
        const parsed = schema.safeParse(
          format === 'json' ? safeJson(raw) : format === 'fenced' ? lastFence(raw) : raw,
        );
        const checked = parsed.success
          ? await check(parsed.data)
          : { ok: false as const, reason: 'The answer did not match the required shape.' };
        if (checked.ok) return { status: 'ok', value: checked.value };
        message = `${checked.reason} Answer again for: ${input}`;
      }
      return { status: 'invalid' };
    } catch (e) {
      if (timedOut) return { status: 'timeout' };
      if (isAbort(e, signal)) return { status: 'aborted' };
      return { status: 'unavailable' };
    } finally {
      clearTimeout(timer);
      session?.destroy();
    }
  });
}

/** One reply to `message`: whole, or for a `line` its first line, streamed. */
function reply(
  session: Session,
  message: string,
  signal: AbortSignal,
  format: ReplyFormat,
  responseConstraint?: object,
): Promise<string> {
  if (format !== 'line') return session.prompt(message, { signal, responseConstraint });
  const cut = new AbortController();
  const stream = session.promptStreaming(message, { signal: AbortSignal.any([signal, cut.signal]) });
  return firstLine(stream, () => cut.abort());
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
