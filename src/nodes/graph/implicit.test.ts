import { describe, expect, it } from 'vitest';
import { implicitSegments, segmentsPath, shadedPath } from './implicit';

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
  it('joins pieces that meet end to end, whichever way round they come', () => {
    expect(
      segmentsPath([
        [0, 1, 2, 3],
        [6, 7, 2, 3],
        [6, 7, 8, 9],
      ]),
    ).toBe('M0 1L2 3L6 7L8 9');
    expect(
      segmentsPath([
        [4, 5, 6, 7],
        [0, 1, 4, 5],
      ]),
    ).toBe('M0 1L4 5L6 7');
  });

  it('keeps separate lines separate, and writes nothing for none', () => {
    expect(
      segmentsPath([
        [0, 1, 2, 3],
        [4, 5, 6, 7],
      ]),
    ).toBe('M0 1L2 3M4 5L6 7');
    expect(segmentsPath([])).toBe('');
  });

  it('turns a circle into a handful of lines, one per closed curve', () => {
    const segments = implicitSegments((x, y) => x * x + y * y - 1, window, window);
    expect(segmentsPath(segments).split('M').length - 1).toBe(1);
  });
});

/** The area of a path made only of `M … L … Z` polygons, by the shoelace formula. */
function area(path: string) {
  let total = 0;
  for (const polygon of path.split('M').filter(Boolean)) {
    const points = polygon
      .replace('Z', '')
      .split('L')
      .map((p) => p.split(' ').map(Number));
    for (let i = 0; i < points.length; i++) {
      const [xa, ya] = points[i];
      const [xb, yb] = points[(i + 1) % points.length];
      total += xa * yb - xb * ya;
    }
  }
  return Math.abs(total) / 2;
}

describe('shadedPath', () => {
  it('fills a disc to its area', () => {
    expect(area(shadedPath((x, y) => 1 - x * x - y * y, window, window))).toBeCloseTo(Math.PI, 1);
  });

  it('fills the bands of 1 ≤ |x| ≤ 2 and nothing between them', () => {
    const path = shadedPath((x) => Math.min(Math.abs(x) - 1, 2 - Math.abs(x)), window, window);
    expect(area(path)).toBeCloseTo(2 * 1 * 6, 0);
  });

  it('joins whole cells in a row into one rectangle, so a half plane is a few hundred pieces, not 20,000 cells', () => {
    const path = shadedPath((x) => x, window, window);
    expect(path.split('M').length - 1).toBeLessThan(500);
    expect(area(path)).toBeCloseTo(18, 5);
  });

  it('fills nothing where the function is never positive, or not a number', () => {
    expect(shadedPath((x, y) => -1 - x * x - y * y, window, window)).toBe('');
    expect(shadedPath(() => Number.NaN, window, window)).toBe('');
  });
});
