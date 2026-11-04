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

  it('ignores an answer for an address that has since changed', async () => {
    let release: (r: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((r) => (release = r))),
    );
    const pending = useAiAssist.getState().refresh();
    useAiAssist.setState({ server: { url: 'http://localhost:11434/v1', model: '', key: '' } });
    release(models(['old']));
    await pending;
    expect(useAiAssist.getState().models).toEqual([]);
  });

  it('clears the models when the provider changes', () => {
    useAiAssist.setState({ models: ['a'] });
    useAiAssist.getState().setProvider('chrome');
    expect(useAiAssist.getState().models).toEqual([]);
    expect(useAiAssist.getState().provider).toBe('chrome');
  });
});
