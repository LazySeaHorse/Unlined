/** A scripted stand-in for Chrome's `LanguageModel`, so AI code is tested without a model. */
export interface FakeModel {
  /** Answers handed out in order, one per prompt(). */
  answers: string[];
  prompts: string[];
  created: number;
  destroyed: number;
  /** Prompts running at once, and the most there ever were. */
  running: number;
  peak: number;
  uninstall: () => void;
}

export function installFakeLanguageModel(
  answers: string[] = [],
  availability = 'available',
  delayMs = 0,
): FakeModel {
  const model: FakeModel = {
    answers,
    prompts: [],
    created: 0,
    destroyed: 0,
    running: 0,
    peak: 0,
    uninstall: () => {},
  };
  const session = (): object => {
    model.created++;
    return {
      clone: async () => session(),
      destroy: () => {
        model.destroyed++;
      },
      prompt: async (input: string, options?: { signal?: AbortSignal }) => {
        model.prompts.push(input);
        model.running++;
        model.peak = Math.max(model.peak, model.running);
        try {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, delayMs);
            options?.signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new DOMException('aborted', 'AbortError'));
            });
          });
          return model.answers.shift() ?? '{}';
        } finally {
          model.running--;
        }
      },
    };
  };
  (globalThis as { LanguageModel?: object }).LanguageModel = {
    availability: async () => availability,
    create: async () => session(),
  };
  model.uninstall = () => {
    delete (globalThis as { LanguageModel?: object }).LanguageModel;
  };
  return model;
}
