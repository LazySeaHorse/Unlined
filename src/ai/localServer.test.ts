import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ask, checkAvailability, releaseSessions, setServer } from './languageModel';
import { forgetQuirks, isLoopback, listModels, sseText, stripThinking } from './localServer';

const config = { url: 'http://localhost:1234/v1/', model: 'qwen', key: '' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const reply = (content: string) => json({ choices: [{ message: { content } }] });
const sse = (...events: string[]) =>
  new Response(events.map((e) => `data: ${e}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
const delta = (content: string) => JSON.stringify({ choices: [{ delta: { content } }] });

type Call = { url: string; body: Record<string, unknown> | undefined; auth: string | null };
let calls: Call[] = [];
/** Replaces fetch: `models` for GET /models, then `answers` in turn for each chat request. */
function fakeServer(
  answers: Array<Response | ((body: Record<string, unknown>) => Response)>,
  models = ['qwen'],
) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ url, body, auth: headers.get('Authorization') });
      if (url.endsWith('/models')) return json({ data: models.map((id) => ({ id })) });
      const next = answers.shift();
      return typeof next === 'function' ? next(body) : (next ?? reply('{}'));
    }),
  );
}

afterEach(() => {
  forgetQuirks();
  setServer(undefined);
  releaseSessions();
  vi.unstubAllGlobals();
});

const schema = z.object({ word: z.string() });
const base = {
  feature: 'local-test',
  system: 'Say a word.',
  examples: [['hi', { word: 'hello' }]] as Array<[string, { word: string }]>,
  input: 'greet',
  schema,
  check: async (v: { word: string }) =>
    v.word === 'good' ? { ok: true as const, value: v.word } : { ok: false as const, reason: 'Not good.' },
};

describe('listModels', () => {
  it('lists chat models, sorted, without embedding models, from {url}/models', async () => {
    fakeServer([], ['b-chat', 'nomic-embed-text', 'a-chat']);
    expect(await listModels(config)).toEqual(['a-chat', 'b-chat']);
    expect(calls[0]?.url).toBe('http://localhost:1234/v1/models');
  });
  it('sends the key as a bearer token', async () => {
    fakeServer([]);
    await listModels({ ...config, key: ' sk-1 ' });
    expect(calls[0]?.auth).toBe('Bearer sk-1');
  });
  it('rejects when the server answers an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({}, 401)),
    );
    await expect(listModels(config)).rejects.toThrow('401');
  });
});

describe('isLoopback', () => {
  it('knows this computer from another', () => {
    for (const u of ['http://localhost:1/v1', 'http://127.0.0.1:1/v1', 'http://[::1]:1/v1'])
      expect(isLoopback(u)).toBe(true);
    for (const u of [
      'http://192.168.1.4:1/v1',
      'http://127.evil.com/v1',
      'https://api.example.com/v1',
      'nonsense',
    ])
      expect(isLoopback(u)).toBe(false);
  });
});

describe('stripThinking', () => {
  it('removes closed and open think blocks', () => {
    expect(stripThinking('<think>hmm</think>answer')).toBe('answer');
    expect(stripThinking('answer<think>still going')).toBe('answer');
    expect(stripThinking('reasoning</think>answer')).toBe('answer');
  });
});

describe('sseText', () => {
  const read = async (stream: ReadableStream<string>) => {
    const out: string[] = [];
    const r = stream.getReader();
    for (let c = await r.read(); !c.done; c = await r.read()) out.push(c.value);
    return out;
  };
  const body = (text: string) => new Response(text).body as ReadableStream<Uint8Array>;

  it('yields each delta, and stops at [DONE]', async () => {
    const text = `data: ${delta('Hel')}\n\ndata: ${delta('lo')}\n\ndata: [DONE]\n\ndata: ${delta('never')}\n\n`;
    expect((await read(sseText(body(text), () => {}))).join('')).toBe('Hello');
  });
  it('drops thinking, even when its tags arrive in pieces', async () => {
    const text = [delta('<thi'), delta('nk>plan</th'), delta('ink>Hi'), '[DONE]'].map(
      (d) => `data: ${d}\n\n`,
    );
    expect((await read(sseText(body(text.join('')), () => {}))).join('')).toBe('Hi');
  });
  it('ignores lines that are not events', async () => {
    const text = `: keep-alive\n\ndata: not json\n\ndata: ${delta('ok')}\n\n`;
    expect((await read(sseText(body(text), () => {}))).join('')).toBe('ok');
  });
});

describe('the server as a model', () => {
  it('is available when it lists models, unavailable when it does not answer', async () => {
    fakeServer([]);
    setServer(config);
    expect(await checkAvailability()).toBe('available');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    expect(await checkAvailability()).toBe('unavailable');
  });

  it('asks with the system prompt, the examples and a JSON schema, and returns the checked answer', async () => {
    fakeServer([reply('{"word":"good"}')]);
    setServer(config);
    expect(await ask(base)).toEqual({ status: 'ok', value: 'good' });
    const chat = calls.find((c) => c.url.endsWith('/chat/completions'));
    expect(chat?.url).toBe('http://localhost:1234/v1/chat/completions');
    const body = chat?.body as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      response_format: { type: string };
    };
    expect(body.model).toBe('qwen');
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(body.messages[3]?.content).toBe('greet');
    expect(body.response_format.type).toBe('json_schema');
  });

  it('leaves the model out when none is chosen', async () => {
    fakeServer([reply('{"word":"good"}')]);
    setServer({ ...config, model: '' });
    await ask(base);
    expect(calls.find((c) => c.body)?.body).not.toHaveProperty('model');
  });

  it('sends a failed check back with the earlier turns kept', async () => {
    fakeServer([reply('{"word":"bad"}'), reply('{"word":"good"}')]);
    setServer(config);
    expect(await ask(base)).toEqual({ status: 'ok', value: 'good' });
    const second = calls.filter((c) => c.url.endsWith('/chat/completions'))[1]?.body as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(second.messages.at(-3)?.content).toBe('greet');
    expect(second.messages.at(-2)?.content).toBe('{"word":"bad"}');
    expect(second.messages.at(-1)?.content).toContain('Not good.');
  });

  it('reads a fenced or thinking reply, and falls back when the server refuses a schema', async () => {
    fakeServer([
      json({ error: 'response_format not supported' }, 400),
      reply('<think>hm</think>```json\n{"word":"good"}\n```'),
    ]);
    setServer(config);
    expect(await ask(base)).toEqual({ status: 'ok', value: 'good' });
    const chats = calls.filter((c) => c.url.endsWith('/chat/completions'));
    expect(chats[0]?.body).toHaveProperty('response_format');
    expect(chats[1]?.body).not.toHaveProperty('response_format');
    // Remembered: the next request does not try the schema again.
    fakeServer([reply('{"word":"good"}')]);
    await ask(base);
    expect(calls.find((c) => c.body)?.body).not.toHaveProperty('response_format');
  });

  it('is unavailable when the server cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    setServer(config);
    expect(await ask(base)).toEqual({ status: 'unavailable' });
  });

  it('streams a line and stops reading after it', async () => {
    fakeServer([sse(delta('first line\nsecond'), '[DONE]')]);
    setServer(config);
    const result = await ask({
      ...base,
      examples: [['hi', 'hello']] as Array<[string, string]>,
      schema: z.string(),
      format: 'line',
      check: async (v: string) => ({ ok: true as const, value: v }),
    });
    expect(result).toEqual({ status: 'ok', value: 'first line' });
    expect(calls.find((c) => c.body)?.body).toMatchObject({ stream: true });
  });

  it('stops for an abort', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) =>
        url.endsWith('/models')
          ? Promise.resolve(json({ data: [{ id: 'qwen' }] }))
          : new Promise((_, reject) =>
              init?.signal?.addEventListener('abort', () =>
                reject(new DOMException('aborted', 'AbortError')),
              ),
            ),
      ),
    );
    setServer(config);
    const controller = new AbortController();
    const pending = ask({ ...base, signal: controller.signal });
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    expect(await pending).toEqual({ status: 'aborted' });
  });

  it('does not give up on schemas for a server that fails either way', async () => {
    fakeServer([json({}, 400), json({}, 400)]);
    setServer(config);
    expect(await ask(base)).toEqual({ status: 'unavailable' });
    fakeServer([reply('{"word":"good"}')]);
    await ask(base);
    expect(calls.find((c) => c.body)?.body).toHaveProperty('response_format');
  });
});
