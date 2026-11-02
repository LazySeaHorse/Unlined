import { afterEach, describe, expect, it } from 'vitest';
import { askFor } from '@/ai/inlineAsk';
import { releaseSessions } from '@/ai/languageModel';
import { type FakeModel, installFakeLanguageModel } from '@/test/fakeLanguageModel';
import { mathPlusAsk } from './ask';

let fake: FakeModel | undefined;
afterEach(() => {
  releaseSessions();
  fake?.uninstall();
  fake = undefined;
});

const empty = { lines: [], inputs: [] };

describe('mathPlusAsk', () => {
  it.each(mathPlusAsk.examples)('teaches only lines Math+ evaluates: $words', async ({ answer, context }) => {
    expect(mathPlusAsk.schema.safeParse(answer).success).toBe(true);
    expect(await mathPlusAsk.check(answer, context)).toEqual({ ok: true, value: answer.lines });
  });

  it('rejects lines that do not evaluate, and no lines', async () => {
    for (const lines of [['x^2+'], ['a:=2', '\\frac{1}{'], ['', ' ']])
      expect((await mathPlusAsk.check({ lines }, empty)).ok).toBe(false);
  });

  it('splits a line holding a line break into lines', async () => {
    expect(await mathPlusAsk.check({ lines: ['a:=1\\\\a+1'] }, empty)).toEqual({
      ok: true,
      value: ['a:=1', 'a+1'],
    });
  });

  it("shows the model the node's lines and its linked values, then the words", () => {
    const context = { lines: ['a:=2', '3'], inputs: [{ name: 'k', value: '5' }] };
    expect(mathPlusAsk.input(context, ' add  k ')).toBe(
      'Lines:\na:=2\n3\nValues from links: k = 5\nDescription: add k',
    );
    expect(mathPlusAsk.input(empty, 'pi')).toBe('Lines:\n(none)\nDescription: pi');
  });

  it('retries once with the reason when a line does not evaluate', async () => {
    fake = installFakeLanguageModel(['{"lines":["s:=a+"]}', '{"lines":["s:=a+b"]}']);
    expect(await askFor(mathPlusAsk, { lines: ['a:=1', 'b:=2'], inputs: [] }, 'sum')).toEqual({
      status: 'ok',
      value: ['s:=a+b'],
    });
    expect(fake.prompts[1]).toContain('does not evaluate');
  });
});
