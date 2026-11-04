import { describe, expect, it } from 'vitest';
import { restrictedPath } from './restricted';

describe('restrictedPath', () => {
  it('draws only the part where the restriction holds', () => {
    const d = restrictedPath(
      (x) => x,
      (x) => x > 1 && x < 5,
      false,
      [-10, 10],
      [-10, 10],
    );
    const xs = [...d.matchAll(/[ML]([-\d.e]+) /g)].map((m) => Number(m[1]));
    expect(xs.length).toBeGreaterThan(100);
    expect(Math.min(...xs)).toBeGreaterThan(1);
    expect(Math.max(...xs)).toBeLessThan(5);
    expect(d.match(/M/g)).toHaveLength(1);
  });
  it('starts a new piece after a gap, and across a jump', () => {
    const gap = restrictedPath(
      (x) => x,
      (x) => Math.abs(x) > 1,
      false,
      [-3, 3],
      [-3, 3],
    );
    expect(gap.match(/M/g)).toHaveLength(2);
    const pole = restrictedPath(
      (x) => 1 / x,
      () => true,
      false,
      [-3, 3],
      [-3, 3],
    );
    expect(pole.match(/M/g)?.length).toBeGreaterThanOrEqual(2);
  });
  it('swaps the coordinates for an x = f(y) curve', () => {
    expect(
      restrictedPath(
        () => 3,
        () => true,
        true,
        [0, 1],
        [-5, 5],
      ).startsWith('M3 0'),
    ).toBe(true);
  });
  it('is empty when nothing holds', () => {
    expect(
      restrictedPath(
        (x) => x,
        () => false,
        false,
        [0, 1],
        [0, 1],
      ),
    ).toBe('');
  });
});
