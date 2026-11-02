import { afterEach, describe, expect, it } from 'vitest';
import { askFor } from '@/ai/inlineAsk';
import { releaseSessions } from '@/ai/languageModel';
import { type FakeModel, installFakeLanguageModel } from '@/test/fakeLanguageModel';
import { graphAsk } from './ask';

let fake: FakeModel | undefined;
afterEach(() => {
  releaseSessions();
  fake?.uninstall();
  fake = undefined;
});

describe('graphAsk', () => {
  it.each(graphAsk.examples)('teaches only rows the graph draws: $words', async ({ answer }) => {
    expect(graphAsk.schema.safeParse(answer).success).toBe(true);
    expect(await graphAsk.check(answer)).toEqual({ ok: true, value: answer.latex });
  });

  it('rejects rows the graph cannot draw, and words', async () => {
    for (const latex of ['y=x+z', 'x^2+', '\\text{a parabola}', ''])
      expect((await graphAsk.check({ latex })).ok).toBe(false);
  });

  it("shows the model the graph's other rows, then the words", () => {
    const rows = [
      { latex: 'y=x^2', color: 'blue' as const },
      { latex: '', color: 'green' as const },
    ];
    expect(graphAsk.input(rows, '  shifted   up ')).toBe('Rows: y=x^2\nDescription: shifted up');
    expect(graphAsk.input([], 'a line')).toBe('Rows: (none)\nDescription: a line');
  });

  it('retries once with the reason when the first row does not draw', async () => {
    fake = installFakeLanguageModel(['{"latex":"y=x+z"}', '{"latex":"y=x+2"}']);
    expect(await askFor(graphAsk, [], 'a line')).toEqual({ status: 'ok', value: 'y=x+2' });
    expect(fake.prompts[1]).toContain('not a row the graph can draw');
  });
});
