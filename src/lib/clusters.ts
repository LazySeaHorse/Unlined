/**
 * Proximity clustering and tidy packing for canvas nodes. Pure geometry, no store or React:
 * the "Organise" button and the AI tools both build on it.
 */

export interface Rect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Group {
  id: string;
  nodeIds: string[];
}

/** Nodes closer than this (edge to edge) belong to the same cluster. */
export const CLUSTER_GAP = 80;
/** Spacing between nodes inside a cluster after organising. */
export const NODE_PADDING = 24;
/** Spacing between clusters after organising. */
export const CLUSTER_PADDING = 160;

const gapBetween = (a: Rect, b: Rect) =>
  Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width)) +
  Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));

/**
 * Splits rects into clusters: two rects share a cluster when they overlap or the gap between
 * them is at most `gap` (horizontal plus vertical gap), directly or through a chain of rects.
 * Clusters and their members come back in reading order (top to bottom, then left to right).
 */
export function clusterRects(rects: Rect[], gap = CLUSTER_GAP): Rect[][] {
  const parent = rects.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };

  // Sweep along x: only rects whose left edge is within reach of the current right edge can touch.
  const order = rects.map((_, i) => i).sort((a, b) => rects[a].x - rects[b].x);
  for (let i = 0; i < order.length; i++) {
    const a = rects[order[i]];
    for (let j = i + 1; j < order.length; j++) {
      const b = rects[order[j]];
      if (b.x > a.x + a.width + gap) break;
      if (gapBetween(a, b) <= gap) parent[find(order[i])] = find(order[j]);
    }
  }

  const byRoot = new Map<number, Rect[]>();
  rects.forEach((rect, i) => {
    const root = find(i);
    byRoot.set(root, [...(byRoot.get(root) ?? []), rect]);
  });
  const clusters = [...byRoot.values()].map((members) => members.sort(readingOrder));
  return clusters.sort((a, b) => readingOrder(boundsOf(a), boundsOf(b)));
}

export const readingOrder = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  a.y - b.y || a.x - b.x;

export function boundsOf(rects: Rect[]): Omit<Rect, 'id'> {
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Matches freshly computed clusters to existing groups so group ids stay stable: each cluster takes
 * the id of the unclaimed group it shares the most nodes with, or a new id from `newId`.
 */
export function reconcileGroups(existing: Group[], clusters: string[][], newId: () => string): Group[] {
  const groupOf = new Map<string, string>();
  for (const g of existing) for (const id of g.nodeIds) groupOf.set(id, g.id);

  const candidates = clusters.map((nodeIds, index) => {
    const shared = new Map<string, number>();
    for (const id of nodeIds) {
      const g = groupOf.get(id);
      if (g) shared.set(g, (shared.get(g) ?? 0) + 1);
    }
    return { index, shared: [...shared].sort((a, b) => b[1] - a[1]) };
  });

  // Biggest overlaps claim their group first, so a split keeps the id on the larger half.
  const claims = candidates
    .flatMap((c) => c.shared.map(([groupId, count]) => ({ index: c.index, groupId, count })))
    .sort((a, b) => b.count - a.count);
  const ids: (string | undefined)[] = clusters.map(() => undefined);
  const taken = new Set<string>();
  for (const { index, groupId } of claims) {
    if (ids[index] || taken.has(groupId)) continue;
    ids[index] = groupId;
    taken.add(groupId);
  }
  return clusters.map((nodeIds, i) => ({ id: ids[i] ?? newId(), nodeIds }));
}

/**
 * Lays rects out in rows with even `padding`, top-left at the origin. Rows come from the original
 * positions, so reading order (top to bottom, then left to right) is kept.
 * Returns positions keyed by id plus the packed size.
 */
function packRows(rects: Rect[], padding: number) {
  const rows: Rect[][] = [];
  let row: Rect[] = [];
  let rowTop = 0;
  let rowMinHeight = 0;
  for (const rect of [...rects].sort(readingOrder)) {
    // A rect starts a new row once its top is past the middle of the shortest rect in the row.
    if (row.length > 0 && rect.y >= rowTop + rowMinHeight / 2) {
      rows.push(row);
      row = [];
    }
    if (row.length === 0) {
      rowTop = rect.y;
      rowMinHeight = rect.height;
    }
    row.push(rect);
    rowMinHeight = Math.min(rowMinHeight, rect.height);
  }
  if (row.length > 0) rows.push(row);

  const positions = new Map<string, { x: number; y: number }>();
  let y = 0;
  let width = 0;
  for (const r of rows) {
    let x = 0;
    for (const rect of [...r].sort((a, b) => a.x - b.x)) {
      positions.set(rect.id, { x, y });
      x += rect.width + padding;
    }
    width = Math.max(width, x - padding);
    y += Math.max(...r.map((rect) => rect.height)) + padding;
  }
  return { positions, width, height: y - padding };
}

/**
 * Tidies a canvas: each cluster is packed into rows with `nodePadding` between nodes, then the
 * clusters themselves are packed into rows the same way with `clusterPadding` between them.
 * The top-left of the content stays where it was.
 */
export function organiseLayout(
  clusters: Rect[][],
  nodePadding = NODE_PADDING,
  clusterPadding = CLUSTER_PADDING,
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (clusters.length === 0) return result;
  const origin = boundsOf(clusters.flat());
  const packed = clusters.map((members) => ({ members, ...packRows(members, nodePadding) }));
  // Each cluster takes part as one rect: its original top-left with its packed size.
  const outer = packRows(
    packed.map((p, i) => ({ id: String(i), ...boundsOf(p.members), width: p.width, height: p.height })),
    clusterPadding,
  );
  packed.forEach((p, i) => {
    const at = outer.positions.get(String(i)) ?? { x: 0, y: 0 };
    for (const [id, pos] of p.positions)
      result.set(id, { x: origin.x + at.x + pos.x, y: origin.y + at.y + pos.y });
  });
  return result;
}

const overlaps = (a: Omit<Rect, 'id'>, b: Omit<Rect, 'id'>, padding: number) =>
  a.x < b.x + b.width + padding &&
  b.x < a.x + a.width + padding &&
  a.y < b.y + b.height + padding &&
  b.y < a.y + a.height + padding;

/**
 * The first candidate position where a box of `size` keeps `padding` clear of every obstacle.
 * If all candidates are taken, steps down from the first candidate until there is room.
 */
export function findFreeSpot(
  size: { width: number; height: number },
  candidates: { x: number; y: number }[],
  obstacles: Omit<Rect, 'id'>[],
  padding = NODE_PADDING,
): { x: number; y: number } {
  const free = (p: { x: number; y: number }) =>
    !obstacles.some((o) => overlaps({ ...p, ...size }, o, padding));
  const spot = candidates.find(free);
  if (spot) return spot;
  const start = candidates[0] ?? { x: 0, y: 0 };
  for (let y = start.y; ; y += padding) if (free({ x: start.x, y })) return { x: start.x, y };
}

/** Candidate spots next to `target` for a new box: to its right, then below it (or the other way round). */
export function besideCandidates(
  target: Omit<Rect, 'id'>,
  padding = NODE_PADDING,
  first: 'right' | 'below' = 'right',
) {
  const right = { x: target.x + target.width + padding, y: target.y };
  const below = { x: target.x, y: target.y + target.height + padding };
  return first === 'below' ? [below, right] : [right, below];
}
