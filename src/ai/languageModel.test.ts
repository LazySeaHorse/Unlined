import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { installFakeLanguageModel } from '@/test/fakeLanguageModel';
import { ask, checkAvailability, lastFence, releaseSessions, TURN_LIMIT_MS } from './languageModel';

const schema = z.object({ word: z.string() });
const base = {
  feature: 'test',
  system: 'Say a word.',
  examples: [['hi', { word: 'hello' }]] as Array<[string, { word: string }]>,
  input: 'greet',
  schema,
  check: async (v: { word: string }) =>
    v.word === 'good' ? { ok: true as const, value: v.word } : { ok: false as const, reason: 'Not good.' },
};

let fake: ReturnType<typeof installFakeLanguageModel> | undefined;
afterEach(() => {
  releaseSessions();
  fake?.uninstall();
  fake = undefined;
});

describe('checkAvailability', () => {
  it('is unsupported without the API', async () => {
    expect(await checkAvailability()).toBe('unsupported');
  });
  it('passes the known states through and maps anything else to unavailable', async () => {
    fake = installFakeLanguageModel([], 'downloadable');
    expect(await checkAvailability()).toBe('downloadable');
    fake.uninstall();
    fake = installFakeLanguageModel([], 'weird');
    expect(await checkAvailability()).toBe('unavailable');
  });
});

describe('ask', () => {
  it('returns a checked answer and destroys its clone', async () => {
    fake = installFakeLanguageModel(['{"word":"good"}']);
    expect(await ask(base)).toEqual({ status: 'ok', value: 'good' });
    expect(fake.destroyed).toBe(1);
  });

  it('sends a failed check back once, then accepts the second answer', async () => {
    fake = installFakeLanguageModel(['{"word":"bad"}', '{"word":"good"}']);
    expect(await ask(base)).toEqual({ status: 'ok', value: 'good' });
    expect(fake.prompts).toHaveLength(2);
    expect(fake.prompts[1]).toContain('Not good.');
  });

  it('gives up after one retry', async () => {
    fake = installFakeLanguageModel(['{"word":"bad"}', '{"word":"bad"}', '{"word":"good"}']);
    expect(await ask(base)).toEqual({ status: 'invalid', reason: 'Not good.' });
    expect(fake.prompts).toHaveLength(2);
  });

  it('treats an answer of the wrong shape as invalid', async () => {
    fake = installFakeLanguageModel(['nonsense', '{"nope":1}']);
    expect((await ask(base)).status).toBe('invalid');
  });

  it('is unavailable without the API', async () => {
    expect(await ask(base)).toEqual({ status: 'unavailable' });
  });

  it('never starts a download', async () => {
    fake = installFakeLanguageModel(['{"word":"good"}'], 'downloadable');
    expect(await ask(base)).toEqual({ status: 'unavailable' });
    expect(fake.creates).toBe(0);
  });

  it('teaches the base session the system prompt and examples once', async () => {
    fake = installFakeLanguageModel(['{"word":"good"}', '{"word":"good"}']);
    await ask(base);
    await ask(base);
    expect(fake.creates).toBe(1);
    expect(fake.initialPrompts).toEqual([
      { role: 'system', content: 'Say a word.' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '{"word":"hello"}' },
    ]);
  });

  it('makes the base afresh when it cannot be cloned', async () => {
    fake = installFakeLanguageModel(['{"word":"good"}']);
    fake.cloneFailures = 1;
    expect(await ask(base)).toEqual({ status: 'unavailable' });
    expect(await ask(base)).toEqual({ status: 'ok', value: 'good' });
    expect(fake.creates).toBe(2);
  });

  it('runs one request at a time', async () => {
    fake = installFakeLanguageModel(
      ['{"word":"good"}', '{"word":"good"}', '{"word":"good"}'],
      'available',
      5,
    );
    await Promise.all([ask(base), ask(base), ask(base)]);
    expect(fake.peak).toBe(1);
  });

  it('skips a request aborted before it starts and stops one in flight', async () => {
    fake = installFakeLanguageModel(['{"word":"good"}'], 'available', 30);
    const first = ask(base);
    const queued = new AbortController();
    const second = ask({ ...base, signal: queued.signal });
    queued.abort();
    expect(await second).toEqual({ status: 'aborted' });
    expect((await first).status).toBe('ok');

    const running = new AbortController();
    const third = ask({ ...base, signal: running.signal });
    setTimeout(() => running.abort(), 5);
    expect(await third).toEqual({ status: 'aborted' });
  });
});

describe('lastFence', () => {
  it('takes the last fenced block and ignores the reasoning before it', () => {
    expect(lastFence('so ```\nnot this\n``` and then\n```\n(1/2)e^x\n```')).toBe('(1/2)e^x');
    expect(lastFence('```latex\nx^2\n```')).toBe('x^2');
  });
  it('is undefined without a block', () => {
    expect(lastFence('just words')).toBeUndefined();
    expect(lastFence('```\n\n```')).toBeUndefined();
  });
});

describe('ask, fenced and timed', () => {
  const fenced = {
    feature: 'fenced',
    system: 'Reason, then fence the answer.',
    examples: [['2+2', '4']] as Array<[string, string]>,
    input: 'integrate x',
    schema: z.string(),
    format: 'fenced' as const,
    check: async (v: string) => ({ ok: true as const, value: v }),
  };

  it('lets the model reason and reads the last fenced block', async () => {
    fake = installFakeLanguageModel(['Let me think. x^2/2 it is.\n```\nx^2/2+C\n```']);
    expect(await ask(fenced)).toEqual({ status: 'ok', value: 'x^2/2+C' });
  });

  it('asks again when the reply has no fenced block', async () => {
    fake = installFakeLanguageModel(['rambling', '```\nx^2/2\n```']);
    expect(await ask(fenced)).toEqual({ status: 'ok', value: 'x^2/2' });
    expect(fake.prompts).toHaveLength(2);
  });

  it('ends a call that runs past the turn limit', async () => {
    vi.useFakeTimers();
    try {
      fake = installFakeLanguageModel(['{"word":"good"}'], 'available', 60_000);
      const result = ask(base);
      await vi.advanceTimersByTimeAsync(TURN_LIMIT_MS + 1);
      expect(await result).toEqual({ status: 'invalid', reason: 'It took too long.' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('ends a session that takes too long to make, and makes it afresh for the next request', async () => {
    vi.useFakeTimers();
    try {
      fake = installFakeLanguageModel(['{"word":"good"}']);
      fake.createMs = 60_000;
      const hung = ask(base);
      await vi.advanceTimersByTimeAsync(TURN_LIMIT_MS + 1);
      expect(await hung).toEqual({ status: 'invalid', reason: 'It took too long.' });
      fake.createMs = 0;
      const next = ask(base);
      await vi.advanceTimersByTimeAsync(10);
      expect(await next).toEqual({ status: 'ok', value: 'good' });
      expect(fake.creates).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
