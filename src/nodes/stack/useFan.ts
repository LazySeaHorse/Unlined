import { useReactFlow, useStore, useStoreApi } from '@xyflow/react';
import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { type FanSlot, fanLayout, keepInView, nearestSlot } from '@/lib/stacks';
import { DUR_MOVE } from '@/motion/motion';
import { moveCard, pickFromFan, takeOut } from '@/store/stacks';
import { useUiStore } from '@/store/uiStore';

/** Share of the screen's width a fanned row may take. */
const FAN_SCREEN_SHARE = 0.9;
/** Pointer travel, in screen pixels, that turns a press on a fanned card into a drag. */
const DRAG_START = 6;

/**
 * Fanning out: `open` while the cards are spread, `closing` while they fold back (so the cards behind stay in
 * sight until they are home), and undefined at rest.
 */
export type FanState = 'open' | 'closing' | undefined;

function useFanState(stackId: string): FanState {
  const open = useUiStore((s) => s.fanned === stackId);
  const [closing, setClosing] = useState(false);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) {
      setClosing(true);
      const timer = setTimeout(() => setClosing(false), DUR_MOVE);
      wasOpen.current = open;
      return () => clearTimeout(timer);
    }
    wasOpen.current = open;
    if (open) setClosing(false);
  }, [open]);
  return open ? 'open' : closing ? 'closing' : undefined;
}

interface Drag {
  id: string;
  /** Pointer travel so far, in canvas units. */
  dx: number;
  dy: number;
}

/**
 * Everything a stack needs to fan out: its state, where each card goes, and the pointer handling that picks a
 * card (click), moves it along the row (drag sideways) or takes it out of the stack (drag away from the row).
 * Positions are view state only: the store hears about a pick, a move or a take-out, never about the fan itself.
 */
export function useFan(
  stackId: string,
  cardIds: string[],
  box: { x: number; y: number; width: number; height: number },
) {
  const fan = useFanState(stackId);
  const flow = useStoreApi();
  const zoom = useStore((s) => s.transform[2]);
  const { screenToFlowPosition } = useReactFlow();
  const [drag, setDrag] = useState<Drag | null>(null);
  const press = useRef<{ id: string; x: number; y: number; dragging: boolean } | null>(null);

  const count = cardIds.length;
  const { x, width, height } = box;
  const open = fan === 'open';
  // Laid out for the view as it was when the fan opened, so panning does not shuffle the cards about.
  const slots = useMemo(() => {
    if (!open) return [];
    const { transform, width: screen } = flow.getState();
    const [tx, , k] = transform;
    const margin = (screen * (1 - FAN_SCREEN_SHARE)) / 2;
    const row = fanLayout(count, { width, height }, (screen * FAN_SCREEN_SHARE) / k);
    return keepInView(row, width, x, (margin - tx) / k, (screen - margin - tx) / k);
  }, [open, count, x, width, height, flow]);

  /** Where card `index` is drawn while fanned: its slot, plus the drag if it is the one being dragged. */
  const transformOf = (id: string, index: number): string | undefined => {
    const slot: FanSlot | undefined = slots[index];
    if (!slot) return undefined;
    const moved = drag?.id === id ? drag : { dx: 0, dy: 0 };
    return `translate(${slot.x + moved.dx}px, ${slot.y + moved.dy}px) scale(${slot.scale})`;
  };

  const onPointerDown = (id: string) => (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = { id, x: event.clientX, y: event.clientY, dragging: false };
  };

  const onPointerMove = (event: PointerEvent) => {
    const p = press.current;
    if (!p) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    if (!p.dragging && Math.hypot(dx, dy) < DRAG_START) return;
    p.dragging = true;
    setDrag({ id: p.id, dx: dx / zoom, dy: dy / zoom });
  };

  const onPointerUp = (event: PointerEvent) => {
    const p = press.current;
    press.current = null;
    setDrag(null);
    if (!p) return;
    if (!p.dragging) {
      pickFromFan(stackId, p.id);
      return;
    }
    const at = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const slot = slots[0];
    if (!slot) return;
    const rowTop = box.y + slot.y;
    const rowHeight = height * slot.scale;
    // Well above or below the row, the card leaves the stack, landing under the pointer; else it moves along it.
    if (at.y < rowTop - rowHeight * 0.75 || at.y > rowTop + rowHeight * 1.75) {
      takeOut(stackId, p.id, { x: at.x - width / 2, y: at.y - 14 });
      useUiStore.getState().closeFan();
      return;
    }
    moveCard(stackId, p.id, nearestSlot(slots, width, at.x - box.x));
  };

  return {
    fan,
    dragging: drag?.id,
    transformOf,
    pickHandlers: (id: string) => ({
      onPointerDown: onPointerDown(id),
      onPointerMove,
      onPointerUp,
      onPointerCancel: () => {
        press.current = null;
        setDrag(null);
      },
    }),
  };
}
