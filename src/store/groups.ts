import { clusterRects, organiseLayout, reconcileGroups } from '@/lib/clusters';
import { nodeRect } from '@/lib/nodeRect';
import { containsCentre, sectionContents } from '@/lib/sections';
import type { CanvasGroup } from '@/model/types';
import { glide } from '@/motion/glide';
import { newId } from '@/nodes/factory';
import { asUndoStep, useCanvasStore } from './canvasStore';

export { nodeRect };

/**
 * Recomputes groups from the current node positions without moving anything, keeping the ids of
 * groups that still exist. Saved with the canvas. Returns the groups in reading order.
 */
export function refreshGroups(): CanvasGroup[] {
  const { nodes, groups, setGroups } = useCanvasStore.getState();
  // Sections are drawn by the user; groups are only about the nodes themselves.
  const clusters = clusterRects(nodes.filter((n) => n.type !== 'section').map(nodeRect)).map((c) =>
    c.map((r) => r.id),
  );
  const next = reconcileGroups(groups, clusters, newId);
  setGroups(next);
  return next;
}

/**
 * Packs nearby nodes into tidy groups with even padding, as one undo step, and saves the groups.
 * A top-level section moves as one block with everything inside it; its contents keep their layout.
 */
export function organiseCanvas(): void {
  const { nodes, moveNodes } = useCanvasStore.getState();
  const rects = nodes.map(nodeRect);
  const sections = rects.filter((_, i) => nodes[i].type === 'section');
  const topLevel = sections.filter((s) => !sections.some((o) => o.id !== s.id && containsCentre(o, s)));

  const carried = new Map<string, string[]>();
  const claimed = new Set<string>(topLevel.map((s) => s.id));
  for (const section of topLevel) {
    const members = sectionContents(section, rects).filter((id) => !claimed.has(id));
    for (const id of members) claimed.add(id);
    carried.set(section.id, members);
  }

  const layout = organiseLayout(clusterRects(rects.filter((r) => !claimed.has(r.id) || carried.has(r.id))));
  const byId = new Map(rects.map((r) => [r.id, r]));
  for (const [sectionId, members] of carried) {
    const to = layout.get(sectionId);
    const from = byId.get(sectionId);
    if (!to || !from) continue;
    for (const id of members) {
      const r = byId.get(id);
      if (r) layout.set(id, { x: r.x + to.x - from.x, y: r.y + to.y - from.y });
    }
  }

  glide(() => asUndoStep(() => moveNodes(layout)));
  refreshGroups();
}
