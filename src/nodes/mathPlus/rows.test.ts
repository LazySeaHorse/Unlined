import { describe, expect, it } from 'vitest';
import { around, atTopLevel, editRow, joinUp, latexOf, rowsOf, splitRow, withLines } from './rows';

describe('rows', () => {
  it('reads the rows of a node, blank ones too, and writes them back as MathLive does', () => {
    expect(rowsOf('a')).toEqual(['a']);
    expect(rowsOf('')).toEqual(['']);
    expect(rowsOf('\\displaylines{a\\\\ \\\\ b}')).toEqual(['a', '', 'b']);
    expect(latexOf(['a', '', 'b'])).toBe('\\displaylines{a\\\\ \\\\ b}');
    expect(latexOf(['a'])).toBe('a');
  });

  it('does not take the lines of a matrix for rows', () => {
    expect(rowsOf('\\displaylines{\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}\\\\ x}')).toHaveLength(2);
  });

  it('turns math pasted into a row as several lines into several rows', () => {
    expect(editRow(['a', 'b'], 0, '\\displaylines{x\\\\ y}')).toEqual({ rows: ['x', 'y', 'b'], row: 1 });
    expect(editRow(['a', 'b'], 1, 'c')).toEqual({ rows: ['a', 'c'], row: 1 });
  });

  it('splits a row at the caret and joins it back', () => {
    const split = splitRow(['a+b'], 0, 'a+', 'b');
    expect(split).toEqual({ rows: ['a+', 'b'], row: 1 });
    expect(joinUp(split.rows, 1)).toEqual({ rows: ['a+b'], row: 0 });
  });
});

describe('around a caret', () => {
  it('sees the lines above and below the row, whole', () => {
    expect(around(['a:=2', 'a', 'b'], 1, 'a', '')).toEqual({
      before: '\\displaylines{a:=2\\\\ a',
      after: '\\\\ b}',
    });
    expect(around(['x'], 0, 'x', '')).toEqual({ before: 'x', after: '' });
  });

  it('tells a caret at the top of a line from one inside a fraction', () => {
    expect(atTopLevel('a+\\frac{1}{2}')).toBe(true);
    expect(atTopLevel('a+\\frac{1')).toBe(false);
    expect(atTopLevel('\\left(a')).toBe(false);
    expect(atTopLevel('\\{')).toBe(true);
  });
});

it('puts an answer in place of its row', () => {
  expect(withLines('\\displaylines{a\\\\ }', 1, ['b', 'c'])).toBe('\\displaylines{a\\\\ b\\\\ c}');
});
