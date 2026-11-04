/**
 * A local model server that speaks the OpenAI API (LM Studio, Ollama, Jan, llama.cpp, KoboldCpp, ...), made to look
 * like Chrome's `LanguageModel` so `ask()` in languageModel.ts needs to know nothing about which one it is talking
 * to. The page calls the server directly; the server must allow the page's origin (CORS).
 */

export interface LocalServerConfig {
  /** The API root, e.g. `http://localhost:1234/v1`. */
  url: string;
  /** Sent as `model`; empty leaves it out, for servers that answer with whichever model is loaded. */
  model: string;
  /** Sent as a bearer token when set. Local servers mostly need none. */
  key: string;
}

export interface LocalPreset {
  name: string;
  url: string;
}

/** The default addresses of the popular local servers. */
export const LOCAL_PRESETS: LocalPreset[] = [
  { name: 'LM Studio', url: 'http://localhost:1234/v1' },
  { name: 'Ollama', url: 'http://localhost:11434/v1' },
  { name: 'Jan', url: 'http://localhost:1337/v1' },
  { name: 'llama.cpp', url: 'http://localhost:8080/v1' },
  { name: 'KoboldCpp', url: 'http://localhost:5001/v1' },
];

/** How long listing the models may take. */
const LIST_MS = 4_000;
/** The most a reply may write, so a model that loops ends. */
const MAX_TOKENS = 1024;

// Structurally the same as the types in languageModel.ts, which imports this file.
type Turn = { role: 'system' | 'user' | 'assistant'; content: string };
interface LocalSession {
  prompt: (input: string, options?: { signal?: AbortSignal; responseConstraint?: object }) => Promise<string>;
  promptStreaming: (input: string, options?: { signal?: AbortSignal }) => ReadableStream<string>;
  clone: (options?: { signal?: AbortSignal }) => Promise<LocalSession>;
  destroy: () => void;
}
export interface LocalApi {
  availability: () => Promise<string>;
  create: (options?: { initialPrompts?: Turn[]; signal?: AbortSignal }) => Promise<LocalSession>;
}

/** `url` without trailing slashes. */
const root = (url: string) => url.trim().replace(/\/+$/, '');

const headers = (config: LocalServerConfig): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(config.key.trim() ? { Authorization: `Bearer ${config.key.trim()}` } : {}),
});

/** Whether `url` points at this computer. A server elsewhere sees what is asked, so the UI says so. */
export function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    return (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '::1' ||
      /^127(\.\d{1,3}){3}$/.test(host)
    );
  } catch {
    return false;
  }
}

/** Embedding models are listed beside chat models by most servers and cannot answer a prompt. */
const isChatModel = (id: string) => !/embed|rerank/i.test(id);

/** The model ids the server offers (`GET /models`, which every OpenAI-compatible server has), chat models only. */
export async function listModels(
  config: Pick<LocalServerConfig, 'url' | 'key'>,
  signal?: AbortSignal,
): Promise<string[]> {
  const timeout = AbortSignal.timeout(LIST_MS);
  const res = await fetch(`${root(config.url)}/models`, {
    headers: headers({ ...config, model: '' }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!res.ok) {
    void res.body?.cancel().catch(() => {});
    throw new Error(`The server answered ${res.status}.`);
  }
  const body = (await res.json()) as { data?: Array<{ id?: unknown }> };
  const ids = (body.data ?? []).flatMap((m) => (typeof m.id === 'string' ? [m.id] : []));
  return ids.filter(isChatModel).sort((a, b) => a.localeCompare(b));
}

/** `<think>…</think>` blocks that reasoning models write into their content, off; a block still open goes too. */
export function stripThinking(text: string): string {
  // Some chat templates open the block in the prompt, so only its end shows in the reply.
  return text
    .replace(/^(?:(?!<think>)[\s\S])*?<\/think>/, '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/, '');
}

/** The JSON inside a ```json fence, for models that fence their answer even when asked for bare JSON. */
const unfence = (text: string): string => {
  const m = text.trim().match(/^```[\w-]*\s*\n([\s\S]*?)\n?```$/);
  return m ? (m[1] as string) : text;
};

/** What of `raw` is shown: thinking cut, and while the reply goes on, an end that may yet become a tag held back. */
const visible = (raw: string, finished: boolean): string => {
  const text = stripThinking(raw);
  return finished ? text : text.replace(/<(t(h(i(n(k)?)?)?)?)?$/, '');
};

/** The text of an SSE stream's `data:` events, as it arrives. Ends at `[DONE]` or the end of the body. */
export function sseText(body: ReadableStream<Uint8Array>, onStop: () => void): ReadableStream<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let raw = '';
  let shown = 0;
  let finished = false;
  return new ReadableStream<string>({
    async pull(controller) {
      while (true) {
        if (!finished) {
          const { done, value } = await reader.read();
          if (done) finished = true;
          else pending += decoder.decode(value, { stream: true });
          const lines = pending.split(/\r?\n/);
          pending = done ? '' : (lines.pop() ?? '');
          for (const line of lines) {
            const data = line.match(/^data:\s?(.*)$/)?.[1]?.trim();
            if (data === '[DONE]') {
              finished = true;
              break;
            }
            if (!data) continue;
            try {
              const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
              if (typeof delta === 'string') raw += delta;
            } catch {
              // A keep-alive or a half-sent event: nothing to read.
            }
          }
        }
        const text = visible(raw, finished);
        // Reasoning that showed before its closing tag cannot be taken back; later text still follows on.
        if (text.length > shown) {
          const next = text.slice(shown);
          shown = text.length;
          return controller.enqueue(next);
        }
        if (finished) {
          reader.cancel().catch(() => {});
          return controller.close();
        }
      }
    },
    cancel() {
      onStop();
      return reader.cancel().catch(() => {});
    },
  });
}

/** A request body's messages for `history` plus the user's `input`. */
const withInput = (history: Turn[], input: string): Turn[] => [...history, { role: 'user', content: input }];

/**
 * Servers that cannot constrain a reply to a schema answer 400 or 422 to `response_format`. Those hosts are
 * remembered, and asked in plain words from then on (the examples already show the shape).
 */
const noSchema = new Set<string>();

/** Forgets which servers refused a schema, e.g. after one is upgraded. */
export const forgetQuirks = () => noSchema.clear();

/** The server as a `LanguageModel`. `read` is called for every request, so a changed setting applies at once. */
export function localApi(read: () => LocalServerConfig): LocalApi {
  const post = async (
    messages: Turn[],
    signal: AbortSignal | undefined,
    extra: object,
  ): Promise<Response> => {
    const config = read();
    const res = await fetch(`${root(config.url)}/chat/completions`, {
      method: 'POST',
      headers: headers(config),
      signal,
      body: JSON.stringify({
        ...(config.model ? { model: config.model } : {}),
        messages,
        temperature: 0.2,
        max_tokens: MAX_TOKENS,
        ...extra,
      }),
    });
    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      throw new Error(`The server answered ${res.status}.`);
    }
    return res;
  };

  const session = (history: Turn[]): LocalSession => {
    const live = new Set<AbortController>();
    return {
      // A chat that goes on: what was asked and answered stays, as with Chrome's sessions, so a retry sees why.
      async prompt(input, options) {
        const messages = withInput(history, input);
        const schema = options?.responseConstraint as Record<string, unknown> | undefined;
        const host = root(read().url);
        const constrained = schema && !noSchema.has(host);
        let res: Response;
        try {
          res = await post(messages, options?.signal, {
            stream: false,
            ...(constrained && {
              response_format: {
                type: 'json_schema',
                json_schema: { name: 'answer', strict: true, schema: { ...schema, $schema: undefined } },
              },
            }),
          });
        } catch (e) {
          if (!constrained || options?.signal?.aborted || !/answered (400|422)\b/.test(String(e))) throw e;
          res = await post(messages, options?.signal, { stream: false });
          // Only a request that works without the schema shows the schema was the trouble.
          noSchema.add(host);
        }
        const body = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
        const content = body.choices?.[0]?.message?.content;
        if (typeof content !== 'string') throw new Error('The server gave no answer.');
        const text = stripThinking(content).trim();
        const answer = schema ? unfence(text) : text;
        history.push({ role: 'user', content: input }, { role: 'assistant', content: answer });
        return answer;
      },
      promptStreaming(input, options) {
        const stop = new AbortController();
        live.add(stop);
        const signal = options?.signal ? AbortSignal.any([options.signal, stop.signal]) : stop.signal;
        let inner: ReadableStreamDefaultReader<string> | undefined;
        return new ReadableStream<string>({
          async pull(controller) {
            try {
              if (!inner) {
                const res = await post(withInput(history, input), signal, { stream: true });
                if (!res.body) throw new Error('The server sent no stream.');
                inner = sseText(res.body, () => stop.abort()).getReader();
              }
              const { done, value } = await inner.read();
              if (done) controller.close();
              else controller.enqueue(value);
            } catch (e) {
              controller.error(e);
            }
          },
          cancel() {
            stop.abort();
          },
        });
      },
      async clone() {
        return session([...history]);
      },
      destroy() {
        for (const c of live) c.abort();
        live.clear();
      },
    };
  };

  return {
    // Reachable and answering the model list is as ready as a server gets: models are the server's to load.
    availability: async () => {
      try {
        await listModels(read());
        return 'available';
      } catch {
        return 'unavailable';
      }
    },
    create: async (options) => session([...(options?.initialPrompts ?? [])]),
  };
}
