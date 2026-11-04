import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { releaseSessions, setServer } from './languageModel';
import { aiAvailable, useAiAssist } from './store';

const models = (ids: string[]) =>
  new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), { status: 200 });

beforeEach(() => {
  useAiAssist.setState({
    enabled: true,
    provider: 'server',
    availability: 'unsupported',
    models: [],
    serverError: undefined,
    server: { url: 'http://localhost:1234/v1', model: '', key: '' },
  });
});
afterEach(() => {
  setServer(undefined);
  releaseSessions();
  vi.unstubAllGlobals();
});

describe('the local server provider', () => {
  it('lists the models, picks the first when none is chosen, and is available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => models(['b', 'a'])),
    );
    await useAiAssist.getState().refresh();
    const s = useAiAssist.getState();
    expect(s.models).toEqual(['a', 'b']);
    expect(s.server.model).toBe('a');
    expect(s.availability).toBe('available');
    expect(aiAvailable(s)).toBe(true);
  });

  it('keeps a model the user chose, even when the server does not list it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => models(['a'])),
    );
    useAiAssist.setState({ server: { url: 'http://localhost:1234/v1', model: 'other', key: '' } });
    await useAiAssist.getState().refresh();
    expect(useAiAssist.getState().server.model).toBe('other');
  });

  it('is unavailable, with a reason, when the server cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await useAiAssist.getState().refresh();
    const s = useAiAssist.getState();
    expect(s.availability).toBe('unavailable');
    expect(s.serverError).toBe('unreachable');
    expect(aiAvailable(s)).toBe(false);
  });

  it('is unavailable when the server has no chat models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => models(['nomic-embed-text'])),
    );
    await useAiAssist.getState().refresh();
    expect(useAiAssist.getState().availability).toBe('unavailable');
    expect(useAiAssist.getState().serverError).toContain('no chat models');
  });

  it('ignores an answer to a look that a later look has replaced', async () => {
    const answers: Array<(r: Response) => void> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((r) => answers.push(r))),
    );
    const first = useAiAssist.getState().refresh();
    const second = useAiAssist.getState().refresh();
    answers[1]?.(models(['new']));
    await second;
    answers[0]?.(models(['old']));
    await first;
    expect(useAiAssist.getState().models).toEqual(['new']);
  });

  it('clears the models when the provider changes', () => {
    useAiAssist.setState({ models: ['a'] });
    useAiAssist.getState().setProvider('chrome');
    expect(useAiAssist.getState().models).toEqual([]);
    expect(useAiAssist.getState().provider).toBe('chrome');
  });

  it('sends the model it picked in requests', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/models')
        ? models(['a'])
        : new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] })),
    );
    vi.stubGlobal('fetch', fetchMock);
    await useAiAssist.getState().refresh();
    const { ask } = await import('./languageModel');
    const { z } = await import('zod');
    await ask({
      feature: 'picked',
      system: 's',
      examples: [],
      input: 'i',
      schema: z.object({}),
      check: async () => ({ ok: true as const, value: 1 }),
    });
    const chat = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).find(([u]) =>
      u.endsWith('/chat/completions'),
    );
    expect(JSON.parse(chat?.[1].body as string).model).toBe('a');
  });

  it('sends nothing to a server while writing help is off', async () => {
    const fetchMock = vi.fn(async () => models(['a']));
    vi.stubGlobal('fetch', fetchMock);
    useAiAssist.setState({ enabled: false });
    await useAiAssist.getState().refresh();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
