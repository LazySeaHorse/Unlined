import { afterEach, describe, expect, it } from 'vitest';
import { askFor } from '@/ai/inlineAsk';
import { releaseSessions } from '@/ai/languageModel';
import { itTeachesOnlyLinesThatFit } from '@/test/completeSpec';
import { type FakeModel, installFakeLanguageModel } from '@/test/fakeLanguageModel';
import { tableAsk, tableComplete } from './ask';

let fake: FakeModel | undefined;
afterEach(() => {
  releaseSessions();
  fake?.uninstall();
  fake = undefined;
});

const table = {
  cells: [
    ['n', 'n^2'],
    ['1', '1'],
    ['2', ''],
  ],
  row: 2,
  col: 1,
};

describe('tableAsk', () => {
  it.each(tableAsk.examples)('teaches only cells that typeset: $words', async ({ answer, context }) => {
    expect(tableAsk.schema.safeParse(answer).success).toBe(true);
    expect(await tableAsk.check(answer, context)).toEqual({ ok: true, value: answer.latex });
  });

  it('asks only for empty cells', () => {
    for (const { context } of tableAsk.examples) expect(context.cells[context.row]?.[context.col]).toBe('');
  });

  it('rejects cells that do not typeset, and words', async () => {
    for (const latex of ['\\frac{1}{', '\\text{four}', '$4$'])
      expect((await tableAsk.check({ latex }, table)).ok).toBe(false);
    expect(tableAsk.schema.safeParse({ latex: '' }).success).toBe(false);
  });

  it('shows the model the whole table and the cell, then the words', () => {
    expect(tableAsk.input(table, ' next  one ')).toBe(
      'Table:\n  | A | B\n1 | n | n^2\n2 | 1 | 1\n3 | 2 | \nCell: B3\nDescription: next one',
    );
  });

  it('retries once with the reason when the cell does not typeset', async () => {
    fake = installFakeLanguageModel(['{"latex":"\\\\text{four}"}', '{"latex":"4"}']);
    expect(await askFor(tableAsk, table, 'next term')).toEqual({ status: 'ok', value: '4' });
    expect(fake.prompts[1]).toContain('no \\text');
  });
});

describe('tableComplete', () => {
  itTeachesOnlyLinesThatFit(tableComplete);

  it('shows the model the cell up to the caret, and keeps only a cell that typesets', () => {
    expect(tableComplete.input(undefined, 'a^')).toBe('Cell up to the cursor:\na^');
    const parts = { before: 'a', line: '^', after: '' };
    expect(tableComplete.check('a^', undefined, parts)).toBe(false);
    expect(tableComplete.check('a^2', undefined, { ...parts, line: '^2' })).toBe(true);
  });
});
