import { afterEach, describe, expect, it } from 'vitest';
import { askFor } from '@/ai/inlineAsk';
import { releaseSessions } from '@/ai/languageModel';
import { itTeachesOnlyLinesThatFit } from '@/test/completeSpec';
import { type FakeModel, installFakeLanguageModel } from '@/test/fakeLanguageModel';
import { mathPlusAsk, mathPlusComplete } from './ask';
import { lineAt } from './evaluate';

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

describe('lineAt', () => {
  it('finds the line an offset is in', () => {
    const latex = '\\displaylines{a\\\\ bc\\\\ d}';
    expect(lineAt(latex, 15)).toEqual({ index: 0, line: 'a' });
    expect(lineAt(latex, 19)).toEqual({ index: 1, line: ' bc' });
    expect(lineAt(latex, 22)).toEqual({ index: 2, line: ' d' });
    expect(lineAt('x+1', 2)).toEqual({ index: 0, line: 'x+1' });
  });
});

describe('mathPlusComplete', () => {
  itTeachesOnlyLinesThatFit(mathPlusComplete);

  it('shows the model the linked values, then the lines up to the caret', () => {
    expect(
      mathPlusComplete.input({ inputs: [{ name: 'k', value: '5' }] }, '\\displaylines{a:=2\\\\ a+'),
    ).toBe('Values from links: k = 5\nMath+ up to the cursor:\na:=2\n a+');
    expect(mathPlusComplete.input({ inputs: [] }, 'a+')).toBe('Math+ up to the cursor:\na+');
  });

  it('keeps a line Math+ evaluates, after the lines before it, and drops one it does not', async () => {
    const check = (before: string, line: string, after: string) =>
      mathPlusComplete.check(before + line + after, { inputs: [] }, { before, line, after });
    expect(await check('\\displaylines{a:=2\\\\ \\\\ a', '+1', '}')).toBe(true);
    expect(await check('\\displaylines{a:=2\\\\ a', '+', '}')).toBe(false);
  });
});
