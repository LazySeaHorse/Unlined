import { afterEach, describe, expect, it } from 'vitest';
import { askFor } from '@/ai/inlineAsk';
import { releaseSessions } from '@/ai/languageModel';
import { type FakeModel, installFakeLanguageModel } from '@/test/fakeLanguageModel';
import { type SheetAskContext, sheetAsk } from './ask';
import { formulaResult } from './evaluate';

let fake: FakeModel | undefined;
afterEach(() => {
  releaseSessions();
  fake?.uninstall();
  fake = undefined;
});

const context: SheetAskContext = {
  cells: [
    ['Item', 'Qty'],
    ['a', '3'],
    ['b', '5'],
    ['', ''],
  ],
  at: 'B4',
  fractions: false,
};

describe('sheetAsk', () => {
  it.each(sheetAsk.examples)('teaches only formulas that evaluate: $words', async ({ context, answer }) => {
    expect(sheetAsk.schema.safeParse(answer).success).toBe(true);
    const result = await sheetAsk.check(answer, context);
    expect(result.ok).toBe(true);
  });

  it('keeps the formula with what it shows in the cell', async () => {
    expect(await sheetAsk.check({ formula: '=AVERAGE(B2:B3)' }, context)).toEqual({
      ok: true,
      value: { formula: '=AVERAGE(B2:B3)', shown: '4' },
    });
  });

  it('rejects formulas that error, or are not formulas', async () => {
    for (const formula of ['=NOSUCH(B2)', '=SUM(', '=B4', '=1/0', 'B2+B3', '='])
      expect((await sheetAsk.check({ formula }, context)).ok, formula).toBe(false);
  });

  it('shows the model the grid, the cell, then the words', () => {
    expect(sheetAsk.input(context, ' sum  it ')).toBe(
      'Grid:\n  | A | B\n1 | Item | Qty\n2 | a | 3\n3 | b | 5\n4 |  | \nCell: B4\nDescription: sum it',
    );
  });

  it('retries once with the reason when the first formula errors', async () => {
    fake = installFakeLanguageModel(['{"formula":"=NOSUCH(B2)"}', '{"formula":"=SUM(B2:B3)"}']);
    expect(await askFor(sheetAsk, context, 'total')).toEqual({
      status: 'ok',
      value: { formula: '=SUM(B2:B3)', shown: '8' },
    });
    expect(fake.prompts[1]).toContain('gives an error');
  });
});

describe('formulaResult', () => {
  it('leaves the grid alone and refuses cells outside it', () => {
    const cells = [['1', '2']];
    expect(formulaResult(cells, { row: 0, column: 1 }, '=A1+1', false)).toBe('2');
    expect(cells).toEqual([['1', '2']]);
    expect(formulaResult(cells, { row: 3, column: 0 }, '=A1', false)).toBeNull();
  });
});
