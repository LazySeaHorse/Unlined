import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { releaseSessions } from '@/ai/languageModel';
import { useAiAssist } from '@/ai/store';
import { useInlineAsk } from '@/ai/useInlineAsk';
import { useInlineComplete } from '@/ai/useInlineComplete';
import { setCell } from '@/lib/grid';
import { type FakeModel, installFakeLanguageModel } from '@/test/fakeLanguageModel';
import { sheetAsk, sheetComplete } from './ask';
import { parseCellKey } from './fills';
import { FormulaBar } from './SheetToolbar';

const start = [
  ['Item', 'Qty'],
  ['a', '3'],
  ['b', '5'],
  ['', ''],
];
let written: string[][] = start;
let committed: string | undefined;

/** The formula bar wired to its ask the way SheetNode wires it. */
function Bar({ label, cell }: { label: string; cell: string }) {
  const [cells, setCells] = useState(start);
  const ask = useInlineAsk(sheetAsk, {
    data: cells,
    context: (at: string) => ({ cells, at, fractions: false }),
    apply: ({ formula }, at) => {
      const target = parseCellKey(at);
      if (!target) return;
      written = setCell(cells, target.row, target.column, formula);
      setCells(written);
    },
  });
  const complete = useInlineComplete(sheetComplete, {
    data: cells,
    context: (at: string) => ({ cells, at, fractions: false }),
  });
  return (
    <FormulaBar
      label={label}
      cell={cell}
      value=""
      readOnly={false}
      ask={ask}
      complete={complete}
      onCommit={(text) => {
        committed = text;
      }}
    />
  );
}

let fake: FakeModel | undefined;
beforeEach(() => {
  written = start;
  committed = undefined;
  useAiAssist.setState({ enabled: true, availability: 'available' });
});
afterEach(() => {
  releaseSessions();
  fake?.uninstall();
  fake = undefined;
  useAiAssist.setState({ enabled: false, availability: 'unsupported' });
});

describe('FormulaBar ask', () => {
  it('stays with the cell it was asked from when the selection moves to a range', async () => {
    fake = installFakeLanguageModel(['{"formula":"=SUM(B2:B3)"}']);
    const { rerender } = render(<Bar label="B4" cell="B4" />);
    await userEvent.type(screen.getByLabelText('Formula bar'), '?');
    rerender(<Bar label="A1:B3" cell="A1" />);
    expect(screen.getByText('B4')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Describe it'), 'total{Enter}');
    expect(await screen.findByText('→ 8', { exact: false })).toBeTruthy();
    expect(fake.prompts[0]).toContain('Cell: B4');
    await userEvent.keyboard('{Enter}');
    expect(written[3]?.[1]).toBe('=SUM(B2:B3)');
    expect(written[0]?.[0]).toBe('Item');
  });

  it('asks for the active cell when a range is selected', async () => {
    fake = installFakeLanguageModel(['{"formula":"=B2+B3"}']);
    render(<Bar label="B3:B4" cell="B4" />);
    await userEvent.type(screen.getByLabelText('Formula bar'), '?');
    await userEvent.type(screen.getByLabelText('Describe it'), 'add them{Enter}');
    await screen.findByText('→ 8', { exact: false });
    await userEvent.keyboard('{Enter}');
    expect(written[3]?.[1]).toBe('=B2+B3');
  });
});

describe('FormulaBar completion', () => {
  it('offers the rest of a formula that evaluates for the active cell, which Enter then commits', async () => {
    fake = installFakeLanguageModel(['B3)']);
    render(<Bar label="B4" cell="B4" />);
    await userEvent.type(screen.getByLabelText('Formula bar'), '=SUM(B2:');
    await userEvent.keyboard('{Tab}');
    expect(await screen.findByText('B3)')).toBeTruthy();
    expect(fake.prompts.at(-1)).toBe('Formula up to the cursor:\n=SUM(B2:');
    await userEvent.keyboard('{Tab}');
    expect(screen.getByLabelText('Formula bar')).toHaveProperty('value', '=SUM(B2:B3)');
    await userEvent.keyboard('{Enter}');
    expect(committed).toBe('=SUM(B2:B3)');
  });

  it('shows nothing for a formula that gives an error', async () => {
    fake = installFakeLanguageModel(['C9']);
    render(<Bar label="B4" cell="B4" />);
    await userEvent.type(screen.getByLabelText('Formula bar'), '=NOPE(');
    await userEvent.keyboard('{Tab}');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fake.prompts).toHaveLength(1);
    expect(document.querySelector('.complete-copy')).toBeNull();
  });
});
