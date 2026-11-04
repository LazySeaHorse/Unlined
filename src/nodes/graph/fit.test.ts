import { describe, expect, it } from 'vitest';
import { DEFAULT_BOX, fitBox, niceStep, sane } from './fit';
import type { Relation } from './relation';

const y = (fn: (x: number) => number): Relation => ({ kind: 'y', fn });
const x = (fn: (y: number) => number): Relation => ({ kind: 'x', fn });

describe('fitBox', () => {
  it('shows both intercepts of 13000 - 200x and nothing near 100 units', () => {
    const box = fitBox([y((t) => 13000 - 200 * t)]);
    expect(box).toBeDefined();
    const b = box as NonNullable<typeof box>;
    expect(b.x[0]).toBeLessThanOrEqual(0);
    expect(b.x[1]).toBeGreaterThanOrEqual(65);
    expect(b.x[1]).toBeLessThan(120);
    expect(b.y[0]).toBeLessThanOrEqual(0);
    expect(b.y[1]).toBeGreaterThanOrEqual(13000);
    expect(b.y[1]).toBeLessThan(20000);
  });

  it('keeps the usual window in x for x^2, and fits y to the parabola', () => {
    const b = fitBox([y((t) => t * t)]) as NonNullable<ReturnType<typeof fitBox>>;
    expect(b.x[0]).toBeLessThanOrEqual(-5);
    expect(b.x[1]).toBeGreaterThanOrEqual(5);
    expect(b.x[1]).toBeLessThan(8);
    expect(b.y[0]).toBeLessThanOrEqual(0);
    expect(b.y[1]).toBeGreaterThanOrEqual(25);
  });

  it('shows the roots of a parabola far from the origin', () => {
    const b = fitBox([y((t) => t * t - 10000)]) as NonNullable<ReturnType<typeof fitBox>>;
    expect(b.x[0]).toBeLessThanOrEqual(-100);
    expect(b.x[1]).toBeGreaterThanOrEqual(100);
    expect(b.x[1]).toBeLessThan(200);
    expect(b.y[0]).toBeLessThanOrEqual(-10000);
  });

  it('stops at the first few waves of a sine', () => {
    const b = fitBox([y(Math.sin)]) as NonNullable<ReturnType<typeof fitBox>>;
    expect(b.x[1]).toBeLessThan(12);
    expect(b.y[1]).toBeGreaterThanOrEqual(1);
    expect(b.y[1]).toBeLessThan(3);
  });

  it('is not thrown by a pole', () => {
    const b = fitBox([y((t) => 1 / t), y(Math.tan)]) as NonNullable<ReturnType<typeof fitBox>>;
    expect(b.x[1]).toBeLessThan(50);
    expect(b.y[1]).toBeLessThan(1e4);
  });

  it('takes a row of x = f(y) the other way round', () => {
    const b = fitBox([x(() => 3000)]) as NonNullable<ReturnType<typeof fitBox>>;
    expect(b.x[0]).toBeLessThanOrEqual(0);
    expect(b.x[1]).toBeGreaterThanOrEqual(3000);
    expect(b.y[0]).toBeLessThanOrEqual(-5);
  });

  it('covers every row', () => {
    const b = fitBox([y((t) => 13000 - 200 * t), y((t) => t)]) as NonNullable<ReturnType<typeof fitBox>>;
    expect(b.y[1]).toBeGreaterThanOrEqual(13000);
    expect(b.x[1]).toBeGreaterThanOrEqual(65);
  });

  it('has nothing to fit for rows that are not functions, or empty rows', () => {
    expect(fitBox([null, { kind: 'implicit', fn: () => 0 }])).toBeUndefined();
    expect(fitBox([y(() => Number.NaN)])).toBeUndefined();
    expect(DEFAULT_BOX.x).toEqual([-5, 5]);
  });

  it('gives the same window for small edits, so the view holds still while typing', () => {
    expect(fitBox([y((t) => 13000 - 200 * t)])).toEqual(fitBox([y((t) => 13001 - 200 * t)]));
  });
});

describe('fitBox with fast and steep functions', () => {
  const fit = (fn: (t: number) => number) => fitBox([y(fn)]) as NonNullable<ReturnType<typeof fitBox>>;
  const reasonable = (b: ReturnType<typeof fit>) => {
    expect([...b.x, ...b.y].every(Number.isFinite)).toBe(true);
    expect(b.y[1] - b.y[0]).toBeLessThan(1e7);
    expect(b.x[1] - b.x[0]).toBeLessThan(1e3);
  };
  it('shows e^x around the origin, not a window of hundreds', () => {
    const b = fit(Math.exp);
    reasonable(b);
    expect(b.x[0]).toBeLessThanOrEqual(-5);
    expect(b.x[1]).toBeGreaterThanOrEqual(5);
    expect(b.y[1]).toBeGreaterThanOrEqual(Math.exp(5));
  });
  it('shows 2^x and 10^x', () => {
    for (const base of [2, 10]) {
      const b = fit((t) => base ** t);
      reasonable(b);
      expect(b.x[0]).toBeLessThanOrEqual(-5);
      expect(b.x[1]).toBeGreaterThanOrEqual(5);
      expect(b.y[1]).toBeGreaterThanOrEqual(base ** 3);
    }
  });
  it('shows e^-x as e^x mirrored', () => {
    const b = fit((t) => Math.exp(-t));
    reasonable(b);
    expect(b.x[0]).toBeLessThanOrEqual(-5);
    expect(b.x[1]).toBeGreaterThanOrEqual(5);
    expect(b.y[1]).toBeGreaterThanOrEqual(Math.exp(5));
  });
  it('shows x^10 with a bounded height, and the bell e^-x^2 whole and centred', () => {
    const steep = fit((t) => t ** 10);
    reasonable(steep);
    expect(steep.x[1]).toBeLessThan(10);
    const bell = fit((t) => Math.exp(-t * t));
    reasonable(bell);
    expect(bell.x[0]).toBeGreaterThan(-10);
    expect(bell.x[1]).toBeLessThan(10);
    expect(bell.x[0] + bell.x[1]).toBeCloseTo(0, 5);
    expect(bell.y[1]).toBeGreaterThanOrEqual(1);
    expect(bell.y[1]).toBeLessThan(3);
  });
  it('gives tan and 1/x a window that is symmetric and small', () => {
    for (const fn of [Math.tan, (t: number) => 1 / t]) {
      const b = fit(fn);
      reasonable(b);
      expect(b.y[1] - b.y[0]).toBeLessThan(100);
      expect(Math.abs(b.y[0] + b.y[1])).toBeLessThan(0.3 * (b.y[1] - b.y[0]));
      expect(b.y[1]).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('fitBox with restrictions', () => {
  it('shows a restricted segment, from its ends', () => {
    const relation: Relation = { kind: 'y', fn: (t) => 100 * t, where: (px) => px > 20 && px < 50 };
    const b = fitBox([relation]) as NonNullable<ReturnType<typeof fitBox>>;
    expect(b.x[0]).toBeLessThanOrEqual(20);
    expect(b.x[1]).toBeGreaterThanOrEqual(50);
    expect(b.y[1]).toBeGreaterThanOrEqual(5000);
  });
  it('shows where a square root starts', () => {
    const b = fitBox([y(Math.sqrt)]) as NonNullable<ReturnType<typeof fitBox>>;
    expect(b.x[0]).toBeLessThanOrEqual(0);
    expect(b.x[1]).toBeGreaterThan(0);
  });
});

describe('fitBox with points', () => {
  it('shows a point with the axes when they are near, and a far one whole', () => {
    const near = fitBox([{ kind: 'points', points: [[1, 2]] }]) as NonNullable<ReturnType<typeof fitBox>>;
    expect(near.x[0]).toBeLessThanOrEqual(0);
    expect(near.x[1]).toBeGreaterThanOrEqual(2);
    expect(near.y[1]).toBeGreaterThanOrEqual(4);
    const far = fitBox([
      {
        kind: 'points',
        points: [
          [1000, 2000],
          [1200, 2500],
        ],
      },
    ]) as NonNullable<ReturnType<typeof fitBox>>;
    expect(far.x[0]).toBeLessThanOrEqual(1000);
    expect(far.x[1]).toBeGreaterThanOrEqual(1200);
    expect(far.y[1]).toBeGreaterThanOrEqual(2500);
  });
});

describe('niceStep', () => {
  it('rounds up to 1, 2 or 5 times a power of ten', () => {
    expect(niceStep(0.8)).toBe(1);
    expect(niceStep(1.1)).toBe(2);
    expect(niceStep(2.5)).toBe(5);
    expect(niceStep(6)).toBe(10);
    expect(niceStep(1300)).toBe(2000);
    expect(niceStep(0.013)).toBe(0.02);
    expect(niceStep(5)).toBe(5);
  });
});

describe('sane', () => {
  it('refuses windows that are not finite, empty or absurdly wide', () => {
    expect(sane(DEFAULT_BOX)).toBe(true);
    expect(sane({ x: [0, 1e12], y: [0, 1] })).toBe(false);
    expect(sane({ x: [0, 1], y: [Number.NaN, 1] })).toBe(false);
    expect(sane({ x: [1, 1], y: [0, 1] })).toBe(false);
  });
});
