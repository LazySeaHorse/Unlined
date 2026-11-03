import { describe, expect, it } from 'vitest';
import { MATH_LINES } from '@/nodes/mathPlus/evaluate';
import { askedLine, replaceLine } from './useInlineAsk';

describe('askedLine', () => {
  it('finds ? typed at the start of an empty line', () => {
    expect(askedLine('', '?')).toEqual({ index: 0, start: 0, end: 0 });
    expect(askedLine('a\n', 'a\n?')).toEqual({ index: 1, start: 2, end: 2 });
    expect(askedLine('a\n\nb', 'a\n?\nb')).toEqual({ index: 1, start: 2, end: 2 });
    expect(askedLine('\nb', '?\nb')).toEqual({ index: 0, start: 0, end: 0 });
    expect(askedLine('a\n  \nb', 'a\n?  \nb')).toEqual({ index: 1, start: 2, end: 4 });
  });

  it('ignores ? anywhere else, and other edits', () => {
    expect(askedLine('a', 'a?')).toBeUndefined();
    expect(askedLine('a\nb', 'a\n?b')).toBeUndefined();
    expect(askedLine('a\n', 'a\n!')).toBeUndefined();
    expect(askedLine('a\n', 'a\n??')).toBeUndefined();
    expect(askedLine('?\n', '??\n')).toBeUndefined();
  });

  it('takes the lines of maths', () => {
    expect(askedLine('a:=2\\\\', 'a:=2\\\\?', MATH_LINES)).toEqual({ index: 1, start: 6, end: 6 });
    expect(askedLine('a\\\\\\\\b', 'a\\\\?\\\\b', MATH_LINES)).toEqual({ index: 1, start: 3, end: 3 });
    // Inside a separator is not a line.
    expect(askedLine('\\\\', '\\?\\', MATH_LINES)).toBeUndefined();
    // A matrix's rows are not lines.
    const matrix = '\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}';
    expect(askedLine(`${matrix}\\\\`, `${matrix}\\\\?`, MATH_LINES)).toEqual({
      index: 1,
      start: matrix.length + 2,
      end: matrix.length + 2,
    });
    expect(
      askedLine(`${matrix}\\\\`, `\\begin{bmatrix}1&2\\\\3&4?\\end{bmatrix}\\\\`, MATH_LINES),
    ).toBeUndefined();
  });
});

describe('replaceLine', () => {
  it('puts lines in place of one', () => {
    expect(replaceLine('a\n\nb', 1, 'x\ny')).toBe('a\nx\ny\nb');
    expect(replaceLine('', 0, 'x')).toBe('x');
    expect(replaceLine('a\\\\', 1, 'b\\\\c', MATH_LINES)).toBe('a\\\\b\\\\c');
  });
});
