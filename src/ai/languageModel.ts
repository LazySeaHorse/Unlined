import { z } from 'zod';

/**
 * The only file that touches Chrome's built-in Prompt API (`LanguageModel`, Gemini Nano). Everything else asks
 * through `ask()` and gets a typed, validated answer or a reason it could not have one.
 *
 * The model only ever translates (words to LaTeX, to a formula, to a title). Whatever it returns is checked by the
 * app's own parsers before anyone sees it, via the `check` each caller passes.
 */

export type Availability = 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface Session {
  prompt: (input: string, options?: { signal?: AbortSignal; responseConstraint?: object }) => Promise<string>;
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

function baseSession(feature: string, initialPrompts: Turn[]): Promise<Session> {
  let base = bases.get(feature);
  if (!base) {
    const api = getApi();
    if (!api) return Promise.reject(new Error('unsupported'));
    base = api.create({ ...LANGUAGES, initialPrompts });
    base.catch(() => bases.delete(feature));
    bases.set(feature, base);
  }
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

export type AskResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'invalid'; reason: string }
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
  signal?: AbortSignal;
}

const isAbort = (e: unknown, signal?: AbortSignal) =>
  signal?.aborted || (e instanceof DOMException && e.name === 'AbortError');

export function ask<T, U>(options: AskOptions<T, U>): Promise<AskResult<U>> {
  const { feature, system, examples, input, schema, check, signal } = options;
  if (signal?.aborted) return Promise.resolve({ status: 'aborted' });
  return enqueue(async (): Promise<AskResult<U>> => {
    if (signal?.aborted) return { status: 'aborted' };
    if (!getApi()) return { status: 'unavailable' };
    let session: Session | undefined;
    try {
      const initialPrompts: Turn[] = [
        { role: 'system', content: system },
        ...examples.flatMap(([user, out]): Turn[] => [
          { role: 'user', content: user },
          { role: 'assistant', content: JSON.stringify(out) },
        ]),
      ];
      session = await (await baseSession(feature, initialPrompts)).clone({ signal });
      const responseConstraint = z.toJSONSchema(schema);
      let message = input;
      let reason = 'no answer';
      for (let attempt = 0; attempt < 2; attempt++) {
        const raw = await session.prompt(message, { signal, responseConstraint });
        const parsed = schema.safeParse(safeJson(raw));
        const checked = parsed.success
          ? await check(parsed.data)
          : { ok: false as const, reason: 'The answer did not match the required shape.' };
        if (checked.ok) return { status: 'ok', value: checked.value };
        reason = checked.reason;
        message = `${checked.reason} Answer again for: ${input}`;
      }
      return { status: 'invalid', reason };
    } catch (e) {
      return isAbort(e, signal) ? { status: 'aborted' } : { status: 'unavailable' };
    } finally {
      session?.destroy();
    }
  });
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
