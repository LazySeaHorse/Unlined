import { useStoreApi } from '@xyflow/react';
import { useEffect } from 'react';
import type { Rect } from '@/lib/clusters';
import { NODE_TAB_HEIGHT } from '@/nodes/spec';
import { DUR, motionOK } from './motion';

/**
 * Deleted nodes leave a ghost behind: an outline of the tile that fades and shrinks a touch where the node was.
 * The node itself is gone from the store at once; the ghost is a plain element in React Flow's viewport (so it
 * pans and zooms with the canvas) that removes itself when its animation ends. Never a copy of the node: canvases
 * would come out blank and frames would reload.
 */
let viewport: (() => HTMLElement | null) | null = null;

/** Draws a ghost at each of `rects` (canvas units, the node's whole box including its tab). */
export function exitGhosts(rects: Omit<Rect, 'id'>[]): void {
  const host = viewport?.();
  if (!host || !motionOK() || rects.length === 0) return;
  for (const r of rects) {
    const ghost = document.createElement('div');
    ghost.className = 'exit-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, {
      left: `${r.x}px`,
      top: `${r.y + NODE_TAB_HEIGHT}px`,
      width: `${r.width}px`,
      height: `${Math.max(0, r.height - NODE_TAB_HEIGHT)}px`,
    });
    host.append(ghost);
    const fade = ghost.animate(
      [
        { opacity: 1, scale: 1 },
        { opacity: 0, scale: 0.97 },
      ],
      { duration: DUR, easing: 'cubic-bezier(0.4, 0, 1, 1)' },
    );
    fade.onfinish = () => ghost.remove();
    fade.oncancel = () => ghost.remove();
  }
}

/** Gives ghosts this canvas's viewport to appear in. Call inside the React Flow provider. */
export function useGhostLayer(): void {
  const flow = useStoreApi();
  useEffect(() => {
    viewport = () => flow.getState().domNode?.querySelector<HTMLElement>('.react-flow__viewport') ?? null;
    return () => {
      viewport = null;
    };
  }, [flow]);
}
