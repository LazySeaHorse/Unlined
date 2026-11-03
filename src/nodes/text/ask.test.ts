import { afterEach, describe, expect, it } from 'vitest';
import { askFor, completeFor } from '@/ai/inlineAsk';
import { releaseSessions } from '@/ai/languageModel';
import { itTeachesOnlyLinesThatFit } from '@/test/completeSpec';
import { type FakeModel, installFakeLanguageModel } from '@/test/fakeLanguageModel';
import { mathSpans, textAsk, textComplete } from './ask';

let fake: FakeModel | undefined;
afterEach(() => {
  releaseSessions();
  fake?.uninstall();
  fake = undefined;
});

describe('textAsk', () => {
  it.each(textAsk.examples)('teaches only text whose maths renders: $words', async ({ answer, context }) => {
    expect(textAsk.schema.safeParse(answer).success).toBe(true);
    expect(await textAsk.check(answer, context)).toEqual({ ok: true, value: answer });
  });

  it('finds the maths the note renders', () => {
    expect(mathSpans('a $x$ b $$y$$ and\n\n$$\nz\n$$\n\n`$no$`')).toEqual([
      { latex: 'x', display: false },
      { latex: 'y', display: false },
      { latex: 'z', display: true },
    ]);
  });

  it('rejects maths KaTeX cannot render, and nothing', async () => {
    for (const text of ['so $\\frac{1}{$ there', '$$\\notacommand$$', '  '])
      expect((await textAsk.check(text, '')).ok).toBe(false);
  });

  it('shows the model the note, then the words', () => {
    expect(textAsk.input('# Notes\n- a', ' more ')).toBe('Note:\n# Notes\n- a\nRequest: more');
    expect(textAsk.input('', 'hi')).toBe('Note:\n(empty)\nRequest: hi');
  });

  it('keeps the last fenced block of a reply that thinks first', async () => {
    fake = installFakeLanguageModel(['They want a list.\n```\n- eggs\n```']);
    expect(await askFor(textAsk, '', 'eggs')).toEqual({ status: 'ok', value: '- eggs' });
  });
});

describe('textComplete', () => {
  itTeachesOnlyLinesThatFit(textComplete);

  it('shows the model the note up to the caret', () => {
    expect(textComplete.input(undefined, '# Notes\nSo ')).toBe('Note up to the cursor:\n# Notes\nSo ');
  });

  it('keeps a line whose maths renders with the rest of the note, and drops one that breaks it', async () => {
    fake = installFakeLanguageModel(['x^2$ and more\nnext', '\\frac{1}{$']);
    expect(await completeFor(textComplete, undefined, 'So $', ' it is.')).toEqual({
      status: 'ok',
      value: 'x^2$ and more',
    });
    expect(fake.prompts.at(-1)).toBe('Note up to the cursor:\nSo $');
    expect((await completeFor(textComplete, undefined, 'So $', '')).status).toBe('invalid');
  });
});
