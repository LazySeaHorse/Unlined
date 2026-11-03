/** A scripted stand-in for Chrome's `LanguageModel`, so AI code is tested without a model. */
export interface FakeModel {
  /** Answers handed out in order, one per prompt(). */
  answers: string[];
  prompts: string[];
  /** Calls to LanguageModel.create(), and the initial prompts the last one was given. */
  creates: number;
  initialPrompts: Array<{ role: string; content: string }>;
  /** Sessions made (bases and clones) and destroyed. */
  created: number;
  destroyed: number;
  /** Prompts running at once, and the most there ever were. */
  running: number;
  peak: number;
  /** How long create() takes, and how many clone() calls fail before they work again. */
  createMs: number;
  cloneFailures: number;
  /** How many characters promptStreaming() sends at a time, and how much of its replies were read before it was stopped. */
  chunkChars: number;
  streamed: string[];
  /** Streamed replies stopped (cancelled or aborted) before their end. */
  stopped: number;
  uninstall: () => void;
}

/** Resolves after `ms`, or rejects as an abort when `signal` goes first. */
const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const aborted = () => reject(new DOMException('aborted', 'AbortError'));
    if (signal?.aborted) return aborted();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      aborted();
    });
  });

export function installFakeLanguageModel(
  answers: string[] = [],
  availability = 'available',
  delayMs = 0,
): FakeModel {
  const model: FakeModel = {
    answers,
    prompts: [],
    creates: 0,
    initialPrompts: [],
    created: 0,
    destroyed: 0,
    running: 0,
    peak: 0,
    createMs: 0,
    cloneFailures: 0,
    chunkChars: 4,
    streamed: [],
    stopped: 0,
    uninstall: () => {},
  };
  const session = (): object => {
    model.created++;
    return {
      clone: async (options?: { signal?: AbortSignal }) => {
        await wait(0, options?.signal);
        if (model.cloneFailures > 0) {
          model.cloneFailures--;
          throw new Error('clone failed');
        }
        return session();
      },
      destroy: () => {
        model.destroyed++;
      },
      prompt: async (input: string, options?: { signal?: AbortSignal }) => {
        model.prompts.push(input);
        model.running++;
        model.peak = Math.max(model.peak, model.running);
        try {
          await wait(delayMs, options?.signal);
          return model.answers.shift() ?? '{}';
        } finally {
          model.running--;
        }
      },
      // The answer in pieces of chunkChars, `delayMs` before the first.
      promptStreaming: (input: string, options?: { signal?: AbortSignal }) => {
        model.prompts.push(input);
        const answer = model.answers.shift() ?? '';
        const index = model.streamed.push('') - 1;
        let at = 0;
        let ended = false;
        const stop = () => {
          if (!ended) model.stopped++;
          ended = true;
        };
        options?.signal?.addEventListener('abort', stop);
        return new ReadableStream<string>({
          pull: async (controller) => {
            try {
              await wait(at === 0 ? delayMs : 0, options?.signal);
            } catch (e) {
              return controller.error(e);
            }
            if (ended) return;
            if (at >= answer.length) {
              ended = true;
              return controller.close();
            }
            const chunk = answer.slice(at, at + model.chunkChars);
            at += chunk.length;
            model.streamed[index] += chunk;
            controller.enqueue(chunk);
          },
          cancel: stop,
        });
      },
    };
  };
  (globalThis as { LanguageModel?: object }).LanguageModel = {
    availability: async () => availability,
    create: async (options?: { initialPrompts?: FakeModel['initialPrompts']; signal?: AbortSignal }) => {
      model.creates++;
      model.initialPrompts = options?.initialPrompts ?? [];
      await wait(model.createMs, options?.signal);
      return session();
    },
  };
  model.uninstall = () => {
    delete (globalThis as { LanguageModel?: object }).LanguageModel;
  };
  return model;
}
