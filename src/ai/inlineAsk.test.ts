import { afterEach, describe, expect, it } from 'vitest';
import { type FakeModel, installFakeLanguageModel } from '@/test/fakeLanguageModel';
import { COMPLETE_CHARS, type CompleteSpec, completeFor, gridView } from './inlineAsk';
import { releaseSessions } from './languageModel';

describe('gridView', () => {
  it('shows a grid of up to 20 rows and 10 columns, each cell on one short line', () => {
    const cells = Array.from({ length: 25 }, (_, r) => Array.from({ length: 12 }, (_, c) => `${r}.${c}`));
    cells[0][0] = `a\nb ${'x'.repeat(60)}`;
    const lines = gridView(cells).split('\n');
    expect(lines).toHaveLength(21);
    expect(lines[0]).toBe('  | A | B | C | D | E | F | G | H | I | J');
    expect(lines[1]?.split(' | ')[1]?.length).toBeLessThanOrEqual(40);
    expect(lines[1]).not.toContain('\n');
    expect(lines[20]?.startsWith('20 | 19.0 |')).toBe(true);
  });
});

describe('completeFor', () => {
  let fake: FakeModel | undefined;
  afterEach(() => {
    releaseSessions();
    fake?.uninstall();
    fake = undefined;
  });
  const spec: CompleteSpec<void> = {
    feature: 'complete-test',
    system: 'Continue.',
    examples: [{ context: undefined, before: 'a', answer: 'b' }],
    input: (_, before) => `>${before}`,
    check: (text) => !text.includes('!'),
  };

  it('streams one line, without reasoning, and shows the model only the end of a long text', async () => {
    fake = installFakeLanguageModel(['cd\nef']);
    const long = 'x'.repeat(COMPLETE_CHARS + 50);
    expect(await completeFor(spec, undefined, long, '')).toEqual({ status: 'ok', value: 'cd' });
    expect(fake.prompts[0]).toBe(`>…${'x'.repeat(COMPLETE_CHARS)}`);
    expect(fake.initialPrompts.at(-1)).toEqual({ role: 'assistant', content: 'b' });
  });

  it('can let the model reason first, keeping the first line of its fenced answer', async () => {
    fake = installFakeLanguageModel(['Hmm, a c then.\n```\ncd\nef\n```']);
    const reasoning = { ...spec, feature: 'complete-reasoning', reasoning: true };
    expect(await completeFor(reasoning, undefined, 'ab', '')).toEqual({ status: 'ok', value: 'cd' });
  });
});
