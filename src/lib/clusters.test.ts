import { describe, expect, it } from 'vitest';
import {
  besideCandidates,
  clusterRects,
  findFreeSpot,
  organiseLayout,
  type Rect,
  reconcileGroups,
} from './clusters';

const rect = (id: string, x: number, y: number, width = 100, height = 50): Rect => ({
  id,
  x,
  y,
  width,
  height,
});
const ids = (clusters: Rect[][]) => clusters.map((c) => c.map((r) => r.id));

describe('clusterRects', () => {
  it('groups nodes within the gap, directly or through a chain', () => {
    const rects = [rect('a', 0, 0), rect('b', 150, 0), rect('c', 300, 0), rect('far', 2000, 0)];
    expect(ids(clusterRects(rects, 60))).toEqual([['a', 'b', 'c'], ['far']]);
  });

  it('separates nodes further apart than the gap', () => {
    expect(ids(clusterRects([rect('a', 0, 0), rect('b', 0, 200)], 60))).toEqual([['a'], ['b']]);
  });

  it('measures the gap diagonally as horizontal plus vertical distance', () => {
    // 40 right and 40 down from a's corner: 80 total.
    expect(clusterRects([rect('a', 0, 0), rect('b', 140, 90)], 79)).toHaveLength(2);
    expect(clusterRects([rect('a', 0, 0), rect('b', 140, 90)], 80)).toHaveLength(1);
  });

  it('returns clusters and members in reading order', () => {
    const rects = [rect('low', 0, 900), rect('right', 120, 0), rect('left', 0, 0)];
    expect(ids(clusterRects(rects, 60))).toEqual([['left', 'right'], ['low']]);
  });

  it('handles an empty canvas', () => {
    expect(clusterRects([])).toEqual([]);
  });
});

describe('reconcileGroups', () => {
  let counter = 0;
  const newId = () => `new${++counter}`;

  it('keeps ids of groups that still exist', () => {
    const groups = reconcileGroups(
      [
        { id: 'g1', nodeIds: ['a', 'b'] },
        { id: 'g2', nodeIds: ['c'] },
      ],
      [
        ['c', 'd'],
        ['a', 'b'],
      ],
      newId,
    );
    expect(groups).toEqual([
      { id: 'g2', nodeIds: ['c', 'd'] },
      { id: 'g1', nodeIds: ['a', 'b'] },
    ]);
  });

  it('gives the id to the larger half of a split group and a new id to the other', () => {
    counter = 0;
    const groups = reconcileGroups([{ id: 'g1', nodeIds: ['a', 'b', 'c'] }], [['a'], ['b', 'c']], newId);
    expect(groups).toEqual([
      { id: 'new1', nodeIds: ['a'] },
      { id: 'g1', nodeIds: ['b', 'c'] },
    ]);
  });

  it('merging two groups keeps the id of the bigger one', () => {
    const groups = reconcileGroups(
      [
        { id: 'g1', nodeIds: ['a'] },
        { id: 'g2', nodeIds: ['b', 'c'] },
      ],
      [['a', 'b', 'c']],
      newId,
    );
    expect(groups).toEqual([{ id: 'g2', nodeIds: ['a', 'b', 'c'] }]);
  });
});

describe('organiseLayout', () => {
  it('packs a cluster into rows with even padding, keeping its top-left', () => {
    const cluster = [rect('a', 10, 10), rect('b', 130, 30), rect('c', 15, 100, 100, 50)];
    const layout = organiseLayout([cluster], 20, 100);
    expect(layout.get('a')).toEqual({ x: 10, y: 10 });
    expect(layout.get('b')).toEqual({ x: 130, y: 10 });
    expect(layout.get('c')).toEqual({ x: 10, y: 80 });
  });

  it('keeps reading order inside a cluster', () => {
    const cluster = [rect('second', 200, 5), rect('first', 0, 0), rect('third', 0, 200)];
    const layout = organiseLayout([cluster], 20, 100);
    const order = [...layout].sort(([, a], [, b]) => a.y - b.y || a.x - b.x).map(([id]) => id);
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('spaces clusters by the cluster padding and keeps their rows', () => {
    const clusters = [[rect('a', 0, 0)], [rect('b', 400, 0)], [rect('c', 0, 400)]];
    const layout = organiseLayout(clusters, 20, 100);
    expect(layout.get('a')).toEqual({ x: 0, y: 0 });
    expect(layout.get('b')).toEqual({ x: 200, y: 0 });
    expect(layout.get('c')).toEqual({ x: 0, y: 150 });
  });

  it('measures cluster spacing from the packed cluster size', () => {
    // b and c sit far right of a; after packing, a's row is 100 wide so b moves in to 100 + padding.
    const clusters = [[rect('a', 0, 0)], [rect('b', 900, 0), rect('c', 1000, 0)]];
    const layout = organiseLayout(clusters, 20, 100);
    expect(layout.get('b')).toEqual({ x: 200, y: 0 });
    expect(layout.get('c')).toEqual({ x: 320, y: 0 });
  });
});

describe('findFreeSpot', () => {
  const size = { width: 100, height: 50 };

  it('takes the first free candidate', () => {
    const obstacles = [rect('a', 0, 0)];
    expect(
      findFreeSpot(
        size,
        [
          { x: 50, y: 0 },
          { x: 200, y: 0 },
        ],
        obstacles,
        10,
      ),
    ).toEqual({ x: 200, y: 0 });
  });

  it('keeps the padding clear', () => {
    expect(
      findFreeSpot(
        size,
        [
          { x: 105, y: 0 },
          { x: 110, y: 0 },
        ],
        [rect('a', 0, 0)],
        10,
      ),
    ).toEqual({
      x: 110,
      y: 0,
    });
  });

  it('steps down from the first candidate when every candidate is taken', () => {
    const spot = findFreeSpot(size, [{ x: 0, y: 0 }], [rect('a', 0, 0), rect('b', 0, 60)], 10);
    expect(spot).toEqual({ x: 0, y: 120 });
  });

  it('suggests spots right of and below a target', () => {
    expect(besideCandidates(rect('a', 10, 20), 5)).toEqual([
      { x: 115, y: 20 },
      { x: 10, y: 75 },
    ]);
  });

  it('tries the spot below a target first when asked', () => {
    expect(besideCandidates(rect('a', 10, 20), 5, 'below')).toEqual([
      { x: 10, y: 75 },
      { x: 115, y: 20 },
    ]);
  });
});
