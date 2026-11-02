import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { installFakeLanguageModel } from '@/test/fakeLanguageModel';
import { ask, checkAvailability, releaseSessions } from './languageModel';

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
