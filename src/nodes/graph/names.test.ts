import { describe, expect, it } from 'vitest';
import { exportNodes, parseExportFile } from '@/persistence/io';
import { createNode } from '../factory';
import { cleanName, withColors } from './equations';
import { buildProbe, probeAt, runsOf } from './hover';
import { longestStretch, placeAlongCurve, placeBesidePoint, placeNames, straightestSpan } from './names';
import type { Relation } from './relation';

const frame = { x: [-10, 10], y: [-10, 10], width: 400, height: 400 } as const;
/** Every character is 7px wide, so widths in tests are easy to reason about. */
const measure = (t: string) => t.length * 7;
const y = (fn: (x: number) => number, where?: (x: number, y: number) => boolean): Relation => ({
  kind: 'y',
  fn,
  where,
});
const runs = (r: Relation, f = frame) => runsOf(r, 0, f);

describe('longestStretch', () => {
  it('takes the longest visible piece, in pixels, and skips what is outside the window', () => {
    // Only x in (-8, -6) and (0, 8) satisfy the restriction: the second piece is longer.
    const r = y(
      (x) => x,
      (x) => (x > -8 && x < -6) || (x > 0 && x < 8),
    );
    const stretch = longestStretch(runs(r), frame);
    expect(stretch).toBeDefined();
    const xs = (stretch ?? []).map((p) => p[0]);
    expect(Math.min(...xs)).toBeGreaterThan(200);
  });

  it('is none when nothing is on screen', () => {
    expect(longestStretch(runs(y(() => 100)), frame)).toBeUndefined();
  });
});

describe('straightestSpan', () => {
  const line = Array.from({ length: 101 }, (_, i): [number, number] => [i * 3, 0]);
  it('centres the text on a straight stretch', () => {
    const span = straightestSpan(line, 80);
    expect((span ? span.from + span.to : 0) / 2).toBeCloseTo(150, -1);
  });
  it('is none when the stretch is too short for the text', () => {
    expect(straightestSpan(line, 290)).toBeUndefined();
  });
  it('is none when the curve bends too much everywhere under the text', () => {
    // A zig-zag with a right-angle every 6 px.
    const zig = Array.from({ length: 80 }, (_, i): [number, number] => [i * 6, i % 2 ? 6 : 0]);
    expect(straightestSpan(zig, 60)).toBeUndefined();
  });
  it('slides away from the middle to a straighter place', () => {
    // Straight for 150 px, a sharp hairpin in the middle, straight again.
    const pts: [number, number][] = [];
    for (let i = 0; i <= 50; i++) pts.push([i * 3, 0]);
    for (let i = 1; i <= 8; i++) pts.push([150 + Math.sin((i * Math.PI) / 8) * 10, i * 2]);
    for (let i = 1; i <= 50; i++) pts.push([150 - i * 3, 16]);
    const span = straightestSpan(pts, 60);
    expect(span).toBeDefined();
  });
});

describe('placeAlongCurve', () => {
  it('lays plain text along the curve, upright for a rising and a falling line', () => {
    for (const fn of [(x: number) => x, (x: number) => -x]) {
      const spot = placeAlongCurve(runs(y(fn)), frame, 'Revenue', measure);
      expect(spot?.kind).toBe('along');
      if (spot?.kind !== 'along') continue;
      const nums = [...spot.d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
      // Read left to right: the path never starts to the right of where it ends.
      expect(nums[0][0]).toBeLessThan(nums[nums.length - 1][0]);
      expect(spot.text).toBe('Revenue');
    }
  });

  it('reads a vertical line bottom to top', () => {
    const spot = placeAlongCurve(runs({ kind: 'x', fn: () => 3 }), frame, 'wall', measure);
    expect(spot?.kind).toBe('along');
    if (spot?.kind !== 'along') return;
    const nums = [...spot.d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => Number(m[2]));
    expect(nums[0]).toBeGreaterThan(nums[nums.length - 1]);
  });

  it('cuts a long name to the room, and hides when there is none', () => {
    const short = (x: number) => (x > 0 && x < 1.2 ? x : Number.NaN);
    const spot = placeAlongCurve(runs(y(short)), frame, 'a very long name indeed', measure);
    expect(spot === undefined || (spot.kind === 'along' && spot.text.endsWith('…'))).toBe(true);
    expect(placeAlongCurve(runs(y(() => 100)), frame, 'x', measure)).toBeUndefined();
  });

  it('tilts a formula to the slope, upright', () => {
    const spot = placeAlongCurve(runs(y((x) => -x)), frame, '$f(x)$', measure);
    expect(spot?.kind).toBe('tilted');
    if (spot?.kind === 'tilted') expect(Math.abs(spot.angle)).toBeLessThanOrEqual(90);
  });
});

describe('placeBesidePoint', () => {
  it('goes on the side with more room', () => {
    expect(placeBesidePoint([50, 200], frame, 'a', measure)?.side).toBe('right');
    expect(placeBesidePoint([350, 200], frame, 'a', measure)?.side).toBe('left');
  });
  it('is none outside the window', () => {
    expect(placeBesidePoint([-5, 200], frame, 'a', measure)).toBeUndefined();
  });
});

describe('placeNames', () => {
  it('names curves and the first visible point of a list, and not implicit curves', () => {
    const rows: (Relation | null)[] = [
      y((x) => x),
      {
        kind: 'points',
        points: [
          [50, 50],
          [1, 1],
          [2, 2],
        ],
      },
      { kind: 'implicit', fn: (x, yy) => x * x + yy * yy - 4 },
      null,
    ];
    const spots = placeNames(rows, ['line', 'dots', 'circle', 'none'], frame, measure);
    expect([...spots.keys()]).toEqual([0, 1]);
    const dot = spots.get(1);
    expect(dot?.kind === 'beside' && dot.x).toBeCloseTo(220, 0);
  });
  it('skips unnamed and blank rows', () => {
    expect(placeNames([y((x) => x), y((x) => x)], [undefined, '  '], frame, measure).size).toBe(0);
  });
});

describe('hits carry their row', () => {
  it('on a curve and on a point, and on neither crossing nor axis', () => {
    const probe = buildProbe(
      [y((x) => 0.1 * x + 5), { kind: 'points', points: [[-5, -5]] }, y((x) => -x)],
      frame,
    );
    const px = (a: number, b: number): [number, number] => [(a + 10) * 20, (10 - b) * 20];
    expect(probeAt(probe, ...px(5, 5.5))).toMatchObject({ kind: 'curve', row: 0 });
    expect(probeAt(probe, ...px(-5, -5))).toMatchObject({ kind: 'point', row: 1 });
    expect(probeAt(probe, ...px(0, 0))?.row).toBeUndefined();
  });
});

describe('names are kept', () => {
  it('withColors keeps and trims names, and drops blank ones', () => {
    expect(
      withColors([
        { latex: 'y=x', name: ' A ' },
        { latex: 'y=2x', name: '  ' },
        { latex: 'y=3x', color: 'gray' },
      ]),
    ).toEqual([
      { latex: 'y=x', color: 'blue', name: 'A' },
      { latex: 'y=2x', color: 'orange' },
      { latex: 'y=3x', color: 'gray' },
    ]);
    expect(cleanName('  ')).toBeUndefined();
  });

  it('survive export and import, and reject names that are too long', () => {
    const node = createNode(
      'graph',
      { x: 0, y: 0 },
      { equations: [{ latex: 'y=x', color: 'blue', name: '$f$ line' }] },
    );
    const back = parseExportFile(JSON.stringify(exportNodes([node], [])));
    expect(back.kind === 'nodes' && back.nodes[0].data).toMatchObject({
      equations: [{ latex: 'y=x', color: 'blue', name: '$f$ line' }],
    });
    const long = createNode(
      'graph',
      { x: 0, y: 0 },
      { equations: [{ latex: 'y=x', color: 'blue', name: 'x'.repeat(61) }] },
    );
    expect(() => parseExportFile(JSON.stringify(exportNodes([long], [])))).toThrow();
  });
});
