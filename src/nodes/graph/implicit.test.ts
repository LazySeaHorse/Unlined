import { describe, expect, it } from 'vitest';
import { implicitSegments, segmentsPath } from './implicit';

const window = [-3, 3] as const;

describe('implicitSegments', () => {
  it('traces a circle at its radius', () => {
    const segments = implicitSegments((x, y) => x * x + y * y - 1, window, window);
    expect(segments.length).toBeGreaterThan(100);
    for (const [x1, y1, x2, y2] of segments) {
      expect(Math.hypot(x1, y1)).toBeCloseTo(1, 1);
      expect(Math.hypot(x2, y2)).toBeCloseTo(1, 1);
    }
  });

  it('traces both branches of a hyperbola, and not the saddle between them', () => {
    const segments = implicitSegments((x, y) => x * y - 1, window, window);
    const points = segments.flatMap(([x1, y1, x2, y2]) => [
      [x1, y1],
      [x2, y2],
    ]);
    expect(points.some(([x, y]) => x > 0 && y > 0)).toBe(true);
    expect(points.some(([x, y]) => x < 0 && y < 0)).toBe(true);
    for (const [x, y] of points) expect(x * y).toBeCloseTo(1, 1);
  });

  it('crosses with both lines of x² = y², through the saddle at the origin', () => {
    const segments = implicitSegments((x, y) => x * x - y * y, window, window);
    const points = segments.flatMap(([x1, y1, x2, y2]) => [
      [x1, y1],
      [x2, y2],
    ]);
    for (const [x, y] of points) expect(Math.abs(x) - Math.abs(y)).toBeCloseTo(0, 1);
    expect(points.some(([x, y]) => x > 1 && y < -1)).toBe(true);
    expect(points.some(([x, y]) => x > 1 && y > 1)).toBe(true);
  });

  it('draws nothing where the function never reaches zero or is not a number', () => {
    expect(implicitSegments((x, y) => x * x + y * y + 1, window, window)).toEqual([]);
    expect(implicitSegments(() => Number.NaN, window, window)).toEqual([]);
  });

  it('does not join the two sides of an asymptote', () => {
    // y = tan(x) as y - tan(x) = 0: the function flips sign across x = π/2 without passing through zero.
    const segments = implicitSegments((x, y) => y - Math.tan(x), [-2, 2], [-3, 3]);
    for (const [x1, y1, x2, y2] of segments) {
      expect(y1).toBeCloseTo(Math.tan(x1), 0);
      expect(y2).toBeCloseTo(Math.tan(x2), 0);
      expect(Math.abs(x1 - x2)).toBeLessThan(0.2);
    }
  });
});

describe('segmentsPath', () => {
  it('writes each segment as its own piece', () => {
    expect(
      segmentsPath([
        [0, 1, 2, 3],
        [4, 5, 6, 7],
      ]),
    ).toBe('M0 1L2 3M4 5L6 7');
    expect(segmentsPath([])).toBe('');
  });
});
