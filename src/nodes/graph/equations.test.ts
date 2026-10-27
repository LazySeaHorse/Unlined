import { describe, expect, it } from 'vitest';
import type { SectionColor } from '@/model/types';
import { newEquation, nextColor, withColors } from './equations';

describe('nextColor', () => {
  it('takes the first colour that is free', () => {
    expect(nextColor([])).toBe('blue');
    expect(nextColor([{ color: 'blue' }, { color: 'green' }])).toBe('orange');
  });

  it('reuses the least used colour once all are taken', () => {
    const all: SectionColor[] = ['blue', 'orange', 'green', 'purple', 'pink', 'yellow', 'gray'];
    expect(nextColor(all.map((color) => ({ color })))).toBe('blue');
    expect(nextColor([...all, 'blue' as const].map((color) => ({ color })))).toBe('orange');
  });
});

describe('newEquation', () => {
  it('is empty and does not take a colour another row has', () => {
    expect(newEquation([{ latex: 'x', color: 'blue' }])).toEqual({ latex: '', color: 'orange' });
  });

  it('keeps every row its colour when one in the middle is removed', () => {
    const rows = [
      { latex: 'a', color: 'blue' as const },
      { latex: 'b', color: 'orange' as const },
      { latex: 'c', color: 'green' as const },
    ];
    expect(rows.filter((r) => r.latex !== 'a').map((r) => r.color)).toEqual(['orange', 'green']);
    expect(newEquation(rows.slice(1)).color).toBe('blue');
  });
});

describe('withColors', () => {
  it('fills only the missing colours, avoiding the ones given', () => {
    expect(withColors([{ latex: 'a' }, { latex: 'b', color: 'blue' }, { latex: 'c' }])).toEqual([
      { latex: 'a', color: 'orange' },
      { latex: 'b', color: 'blue' },
      { latex: 'c', color: 'green' },
    ]);
  });
});
