import { describe, expect, it } from 'vitest';
import { gridView } from './inlineAsk';

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
