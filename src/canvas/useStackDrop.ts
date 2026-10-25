import { useReactFlow } from '@xyflow/react';
import { useCallback } from 'react';
import { nodeRect } from '@/lib/nodeRect';
import { isStack, placedNodes } from '@/lib/stacks';
import { type AppNode, isCard } from '@/model/types';
import { NODE_TAB_HEIGHT } from '@/nodes/spec';
import { useCanvasStore } from '@/store/canvasStore';
import { stackOnto } from '@/store/stacks';
import { useUiStore } from '@/store/uiStore';

/** How far above a tab strip a drop still counts, in canvas units: tabs are short targets. */
const REACH = 8;

const stackable = (n: AppNode) => isCard(n) || isStack(n);

type DragEvent = MouseEvent | TouchEvent;
const pointOf = (event: DragEvent) => ('changedTouches' in event ? event.changedTouches[0] : event);

/** The node whose tab strip is under `at`, among those not being dragged. Topmost first. */
function targetAt(at: { x: number; y: number }, dragged: ReadonlySet<string>): string | null {
  const candidates = placedNodes(useCanvasStore.getState().nodes);
  for (let i = candidates.length - 1; i >= 0; i--) {
    const node = candidates[i];
    if (dragged.has(node.id) || !stackable(node)) continue;
    const r = nodeRect(node);
    if (at.x >= r.x && at.x <= r.x + r.width && at.y >= r.y - REACH && at.y <= r.y + NODE_TAB_HEIGHT)
      return node.id;
  }
  return null;
}

/**
 * Dragging nodes onto another node's tabs stacks them there: the tabs light up while a drop would stack, and
 * letting go stacks the dragged nodes onto it, the first of them in front. A section never stacks.
 */
export function useStackDrop() {
  const { screenToFlowPosition } = useReactFlow();
  const setTarget = useUiStore((s) => s.setStackDropTarget);

  const hit = useCallback(
    (event: DragEvent, dragged: AppNode[]) => {
      const point = pointOf(event);
      if (!point || !dragged.every(stackable)) return null;
      const at = screenToFlowPosition({ x: point.clientX, y: point.clientY });
      return targetAt(at, new Set(dragged.map((n) => n.id)));
    },
    [screenToFlowPosition],
  );

  const onNodeDrag = useCallback(
    (event: DragEvent, _: AppNode, dragged: AppNode[]) => setTarget(hit(event, dragged)),
    [hit, setTarget],
  );

  const onNodeDragStop = useCallback(
    (event: DragEvent, node: AppNode, dragged: AppNode[]) => {
      setTarget(null);
      const target = hit(event, dragged);
      if (!target) return;
      // The node grabbed comes to the front, whatever order the selection is in.
      const ids = [node.id, ...dragged.map((n) => n.id).filter((id) => id !== node.id)];
      stackOnto(target, ids, isStack(node) ? undefined : node.id);
    },
    [hit, setTarget],
  );

  return { onNodeDrag, onNodeDragStop };
}
