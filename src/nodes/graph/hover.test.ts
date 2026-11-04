import { describe, expect, it } from 'vitest';
import { buildProbe, coordinate, probeAt } from './hover';
import type { Relation } from './relation';

const frame = { x: [-10, 10], y: [-10, 10], width: 400, height: 400 } as const;
const y = (fn: (x: number) => number): Relation => ({ kind: 'y', fn });
/** Pixel position of a graph point in the test frame (20 px per unit, y up). */
const px = (x: number, yy: number): [number, number] => [(x + 10) * 20, (10 - yy) * 20];

describe('probe', () => {
  it('snaps to where two curves cross', () => {
    const probe = buildProbe([y((x) => x), y((x) => -x + 4)], frame);
    const [sx, sy] = px(2, 2);
    const hit = probeAt(probe, sx + 5, sy - 4);
    expect(hit?.kind).toBe('crossing');
    expect(hit?.x).toBeCloseTo(2, 1);
    expect(hit?.y).toBeCloseTo(2, 1);
  });

  it('snaps to where a curve crosses each axis, and to the origin', () => {
    const probe = buildProbe([y((x) => 2 * x - 6)], frame);
    const onX = probeAt(probe, ...px(3, 0));
    expect(onX).toMatchObject({ kind: 'axis' });
    expect(onX?.x).toBeCloseTo(3, 1);
    expect(onX?.y).toBeCloseTo(0, 1);
    const onY = probeAt(probe, ...px(0, -6));
    expect(onY?.kind).toBe('axis');
    expect(onY?.y).toBeCloseTo(-6, 1);
    expect(probeAt(buildProbe([], frame), ...px(0, 0))).toMatchObject({ kind: 'axis', x: 0, y: 0 });
  });

  it('follows the curve when nothing is near to snap to', () => {
    const probe = buildProbe([y((x) => x * x * 0.1 + 5)], frame);
    const [sx, sy] = px(5, 7.5);
    const hit = probeAt(probe, sx + 3, sy + 3);
    expect(hit?.kind).toBe('curve');
    expect(hit?.y).toBeCloseTo((hit?.x ?? 0) ** 2 * 0.1 + 5, 1);
  });

  it('finds nothing away from every curve', () => {
    const probe = buildProbe([y(() => 5)], frame);
    expect(probeAt(probe, ...px(0, -8))).toBeUndefined();
  });

  it('snaps to a drawn point before a crossing as near', () => {
    const probe = buildProbe([{ kind: 'points', points: [[1, 1]] }, y((x) => x)], frame);
    expect(probeAt(probe, ...px(1, 1))?.kind).toBe('point');
  });

  it('does not join a curve across a pole, nor show where a restriction cuts it out', () => {
    // At x=0 the curve jumps from -inf to +inf: two pieces, not one joined through the pole.
    expect(buildProbe([y((x) => 1 / x)], frame).runs.length).toBeGreaterThanOrEqual(2);
    const cut = buildProbe([{ kind: 'y', fn: (x) => x, where: (x) => x > 2 }], frame);
    expect(probeAt(cut, ...px(-5, -5))).toBeUndefined();
  });

  it('finds the crossing of a y curve and an x curve', () => {
    const probe = buildProbe([y((x) => x), { kind: 'x', fn: () => 3 }], frame);
    const hit = probeAt(probe, ...px(3, 3));
    expect(hit).toMatchObject({ kind: 'crossing' });
    expect(hit?.x).toBeCloseTo(3, 1);
  });
});

describe('coordinate', () => {
  it('rounds to five figures and drops dust', () => {
    expect(coordinate(0.30000000000000004)).toBe('0.3');
    expect(coordinate(66.66666666)).toBe('66.667');
    expect(coordinate(1e-12)).toBe('0');
    expect(coordinate(-2000)).toBe('-2000');
  });
});
