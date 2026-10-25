import { type NodeChange, useStoreApi } from '@xyflow/react';
import { useCallback, useEffect, useRef } from 'react';
import { nodeRect } from '@/lib/nodeRect';
import { encloses, type SectionDragSnapshot, snapshotSectionDrag, withSectionDrag } from '@/lib/sections';
import { placedNodes } from '@/lib/stacks';
import type { AppNode } from '@/model/types';
import { useCanvasStore } from '@/store/canvasStore';
import { wrapSelectionInSection } from '@/store/sections';

/**
 * Behaviour that makes sections work as boxes: dragging one carries the nodes inside it, and a
 * marquee only keeps a section selected when it surrounds the whole box (otherwise it would grab
 * every section it merely touched).
 */
type Box = { x: number; y: number; width: number; height: number };

/** Ctrl+G: wraps the selection in a section and drops the leftover marquee box, which would sit on top of it. */
export function useWrapInSection() {
  const flow = useStoreApi();
  return useCallback(() => {
    wrapSelectionInSection();
    flow.setState({ nodesSelectionActive: false });
  }, [flow]);
}

export function useSections() {
  const flow = useStoreApi();
  const drags = useRef(new Map<string, SectionDragSnapshot>());

  const startDrag = useCallback((dragged: AppNode[]) => {
    const rects = placedNodes(useCanvasStore.getState().nodes).map(nodeRect);
    drags.current.clear();
    for (const node of dragged) {
      if (node.type !== 'section') continue;
      const rect = rects.find((r) => r.id === node.id);
      if (rect) drags.current.set(node.id, snapshotSectionDrag(rect, rects));
    }
  }, []);
  const endDrag = useCallback(() => drags.current.clear(), []);

  // The marquee's last rectangle in canvas coordinates; React Flow clears its own before the end event.
  const marquee = useRef<Box | null>(null);
  useEffect(
    () =>
      flow.subscribe((state) => {
        const rect = state.userSelectionRect;
        if (!state.userSelectionActive || !rect) return;
        const [tx, ty, zoom] = state.transform;
        marquee.current = {
          x: (rect.x - tx) / zoom,
          y: (rect.y - ty) / zoom,
          width: rect.width / zoom,
          height: rect.height / zoom,
        };
      }),
    [flow],
  );

  const onSelectionEnd = useCallback(() => {
    const box = marquee.current;
    marquee.current = null;
    if (!box) return;
    // A marquee also grabs every link touching a node it covers; a link stays only when both its ends do.
    useCanvasStore.getState().setSelection(
      (n) => !!n.selected && (n.type !== 'section' || encloses(box, nodeRect(n))),
      (e, picked) => !!e.selected && picked.has(e.source) && picked.has(e.target),
    );
  }, []);

  const onNodesChange = useCallback((changes: NodeChange<AppNode>[]) => {
    useCanvasStore.getState().onNodesChange(withSectionDrag(changes, drags.current));
  }, []);

  return {
    onNodesChange,
    onSelectionEnd,
    onNodeDragStart: (_: unknown, __: AppNode, dragged: AppNode[]) => startDrag(dragged),
    onSelectionDragStart: (_: unknown, dragged: AppNode[]) => startDrag(dragged),
    onNodeDragStop: endDrag,
    onSelectionDragStop: endDrag,
  };
}
