import { type ReactFlowState, useStoreApi, type XYPosition } from '@xyflow/react';
import { useEffect } from 'react';
import { setGlideDriver, takeGlide } from './glide';
import { DUR_MOVE, EASE_SPRING } from './motion';

/** Gap between one node starting to glide and the next, in reading order, and the most it may add up to. */
const STAGGER_MS = 12;
const MAX_STAGGER_MS = 120;
const GLIDE_ID = 'glide';

/** The part of a running glide's offset still to go, so a new glide carries on from where the node is drawn. */
function remainingOffset(el: HTMLElement): XYPosition {
  const running = el.getAnimations().filter((a) => a.id === GLIDE_ID);
  if (running.length === 0) return { x: 0, y: 0 };
  const [x = '0', y = '0'] = getComputedStyle(el).translate.split(' ');
  for (const a of running) a.cancel();
  return { x: Number.parseFloat(x) || 0, y: Number.parseFloat(y) || 0 };
}

function play(before: Map<string, XYPosition>, state: ReactFlowState) {
  const root = state.domNode;
  if (!root) return;
  const moved: { el: HTMLElement; dx: number; dy: number; at: XYPosition }[] = [];
  for (const [id, was] of before) {
    const node = state.nodeLookup.get(id);
    if (!node || node.dragging) continue;
    const at = node.internals.positionAbsolute;
    if (at.x === was.x && at.y === was.y) continue;
    const el = root.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
    if (el) moved.push({ el, dx: was.x - at.x, dy: was.y - at.y, at });
  }
  if (moved.length === 0) return;
  moved.sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x);
  // Translations are in the node's own space, inside the viewport's zoom: canvas units, not screen pixels.
  moved.forEach(({ el, dx, dy }, i) => {
    const off = remainingOffset(el);
    el.animate([{ translate: `${dx + off.x}px ${dy + off.y}px` }, { translate: '0px 0px' }], {
      id: GLIDE_ID,
      duration: DUR_MOVE,
      easing: EASE_SPRING,
      delay: Math.min(i * STAGGER_MS, MAX_STAGGER_MS),
      fill: 'backwards',
    });
  });
  // Links are routed from where nodes end up, so they would race ahead; they fade out until the nodes arrive.
  root.classList.add('gliding');
  clearTimeout(Number(root.dataset.glideTimer));
  root.dataset.glideTimer = String(
    setTimeout(
      () => root.classList.remove('gliding'),
      DUR_MOVE + Math.min(moved.length * STAGGER_MS, MAX_STAGGER_MS),
    ),
  );
}

/** Installs the glide driver for this canvas. Call inside the React Flow provider. */
export function useGlide(): void {
  const flow = useStoreApi();
  useEffect(() => {
    setGlideDriver({
      capture: () => {
        const at = new Map<string, XYPosition>();
        for (const [id, node] of flow.getState().nodeLookup)
          at.set(id, { ...node.internals.positionAbsolute });
        return at;
      },
    });
    // React Flow takes new nodes before it redraws them, so the animation is in place by the next paint.
    const unsubscribe = flow.subscribe((state, prev) => {
      if (state.nodes === prev.nodes) return;
      const before = takeGlide();
      if (before) play(before, state);
    });
    return () => {
      unsubscribe();
      setGlideDriver(null);
    };
  }, [flow]);
}
