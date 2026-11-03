import { afterEach, describe, expect, it } from 'vitest';
import { askFor } from '@/ai/inlineAsk';
import { releaseSessions } from '@/ai/languageModel';
import { itTeachesOnlyLinesThatFit } from '@/test/completeSpec';
import { type FakeModel, installFakeLanguageModel } from '@/test/fakeLanguageModel';
import { mathAsk, mathComplete, typesets } from './ask';

let fake: FakeModel | undefined;
afterEach(() => {
  releaseSessions();
  fake?.uninstall();
  fake = undefined;
});

describe('typesets', () => {
  it('takes LaTeX that renders, lines and matrices too', () => {
    for (const latex of ['x^2', 'a=1\\\\b=2', '\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}'])
      expect(typesets(latex)).toEqual({ ok: true });
  });

  it('rejects LaTeX that does not render, dollar signs and words', () => {
    for (const latex of ['\\frac{1}{', '$x^2$', '\\notacommand', '\\text{a parabola}', 'x\\textbf{=}1'])
      expect(typesets(latex).ok).toBe(false);
  });
});

describe('mathAsk', () => {
  it.each(mathAsk.examples)('teaches only LaTeX that typesets: $words', async ({ answer, context }) => {
    expect(mathAsk.schema.safeParse(answer).success).toBe(true);
    expect(await mathAsk.check(answer, context)).toEqual({ ok: true, value: answer });
  });

  it('shows the model the words', () => {
    expect(mathAsk.input([], '  solve   it ')).toBe('Request: solve it');
  });

  it('shows the model the lines already there', () => {
    expect(mathAsk.input(['\\int x\\,dx', 'y=2'], 'solve this')).toBe(
      'Math so far:\n\\int x\\,dx\ny=2\nRequest: solve this',
    );
  });

  it('keeps the last fenced block of a reasoned reply', async () => {
    fake = installFakeLanguageModel([
      'Integrate by parts twice: ```\\int e^x``` then solve for I.\n```latex\n\\frac{e^x(\\sin x-\\cos x)}{2}+C\n```',
    ]);
    expect(await askFor(mathAsk, [], 'integrate e^x sin x')).toEqual({
      status: 'ok',
      value: '\\frac{e^x(\\sin x-\\cos x)}{2}+C',
    });
  });

  it('retries once with the reason when the answer does not typeset', async () => {
    fake = installFakeLanguageModel(['```\n\\text{two}\n```', 'No fence at all']);
    expect(await askFor(mathAsk, [], 'solve x-2=0')).toEqual({ status: 'invalid' });
    expect(fake.prompts[1]).toContain('no \\text');
  });
});

describe('mathComplete', () => {
  itTeachesOnlyLinesThatFit(mathComplete);

  it('shows the model the lines up to the caret, one to a line', () => {
    expect(mathComplete.input(undefined, '\\displaylines{a=1\\\\ \\frac{b')).toBe(
      'Math up to the cursor:\na=1\n \\frac{b',
    );
  });

  it('checks only the line at the caret', () => {
    const check = (before: string, line: string, after: string) =>
      mathComplete.check(before + line + after, undefined, { before, line, after });
    expect(check('\\displaylines{\\text{words}\\\\ x', '^2', '}')).toBe(true);
    expect(check('\\displaylines{x\\\\ y^', '{', '}')).toBe(false);
    expect(check('\\frac{1', '}{2}+', '}{3}')).toBe(false);
  });
});
