import { afterEach, describe, expect, it } from 'vitest';
import { askFor } from '@/ai/inlineAsk';
import { releaseSessions } from '@/ai/languageModel';
import { type FakeModel, installFakeLanguageModel } from '@/test/fakeLanguageModel';
import { mathAsk, typesets } from './ask';

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

  it("shows the model the node's LaTeX, then the words", () => {
    expect(mathAsk.input('', '  solve   it ')).toBe('Math: (empty)\nRequest: solve it');
    expect(mathAsk.input('x^2', 'derivative')).toBe('Math: x^2\nRequest: derivative');
  });

  it('keeps the last fenced block of a reasoned reply', async () => {
    fake = installFakeLanguageModel([
      'Integrate by parts twice: ```\\int e^x``` then solve for I.\n```latex\n\\frac{e^x(\\sin x-\\cos x)}{2}+C\n```',
    ]);
    expect(await askFor(mathAsk, '', 'integrate e^x sin x')).toEqual({
      status: 'ok',
      value: '\\frac{e^x(\\sin x-\\cos x)}{2}+C',
    });
  });

  it('retries once with the reason when the answer does not typeset', async () => {
    fake = installFakeLanguageModel(['```\n\\text{two}\n```', 'No fence at all']);
    expect(await askFor(mathAsk, '', 'solve x-2=0')).toEqual({
      status: 'invalid',
      reason: expect.any(String),
    });
    expect(fake.prompts[1]).toContain('no \\text');
  });
});
