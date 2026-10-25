import { boundsOf } from '@/lib/clusters';
import { nodeRect } from '@/lib/nodeRect';
import type { AppNode } from '@/model/types';
import { glide } from '@/motion/glide';
import { asUndoStep, useCanvasStore } from './canvasStore';

export type AlignEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** Lines the selected nodes up along one edge or centre of their combined bounds, as one undo step. */
export function alignSelected(edge: AlignEdge): void {
  const { nodes, moveNodes } = useCanvasStore.getState();
  const rects = nodes.filter((n) => n.selected).map(nodeRect);
  if (rects.length < 2) return;
  const b = boundsOf(rects);
  const positions = new Map(
    rects.map((r) => {
      const at = { x: r.x, y: r.y };
      if (edge === 'left') at.x = b.x;
      else if (edge === 'right') at.x = b.x + b.width - r.width;
      else if (edge === 'center') at.x = b.x + (b.width - r.width) / 2;
      else if (edge === 'top') at.y = b.y;
      else if (edge === 'bottom') at.y = b.y + b.height - r.height;
      else at.y = b.y + (b.height - r.height) / 2;
      return [r.id, at];
    }),
  );
  glide(() => asUndoStep(() => moveNodes(positions)));
}

/** Reorders the selected nodes within their layer: sections stay behind every other node. */
function reorder(toFront: boolean): void {
  const { nodes } = useCanvasStore.getState();
  const layer = (isSection: boolean) => {
    const inLayer = nodes.filter((n) => (n.type === 'section') === isSection);
    const moved = inLayer.filter((n) => n.selected);
    const rest = inLayer.filter((n) => !n.selected);
    return toFront ? [...rest, ...moved] : [...moved, ...rest];
  };
  const next: AppNode[] = [...layer(true), ...layer(false)];
  if (next.every((n, i) => n === nodes[i])) return;
  asUndoStep(() => useCanvasStore.setState({ nodes: next }));
}

export const bringToFront = () => reorder(true);
export const sendToBack = () => reorder(false);
