import { Popover } from 'radix-ui';
import { type ReactNode, useRef } from 'react';
import { cn } from '@/lib/cn';

interface BubbleProps {
  /** The element the bubble hangs from, read each time it is placed: a field that moves with the canvas is followed. */
  anchor: () => { getBoundingClientRect: () => DOMRect } | null | undefined;
  /** Accessible name of the bubble, when it holds something to interact with. */
  label?: string;
  /** Takes no focus and ignores the pointer: a hint beside a field the person is still typing in. */
  passive?: boolean;
  /** Pressed outside an interactive bubble: it is done. */
  onOutside?: () => void;
  className?: string;
  children: ReactNode;
}

/**
 * The one floating surface the on-device AI uses for a field (an ask to type into, a completion waiting for Tab).
 * It hangs below the field and is drawn in a portal over the canvas, so it never takes room in the node or moves
 * what is in it. It is placed by the field's box on screen, so it sits right at any zoom of the canvas, and
 * follows it while the canvas moves; its own size is not zoomed, so it stays legible.
 */
export function Bubble({ anchor, label, passive, onOutside, className, children }: BubbleProps) {
  const read = useRef(anchor);
  read.current = anchor;
  // A virtual anchor: Radix reads its box whenever it places the bubble.
  const virtual = useRef({
    getBoundingClientRect: () => read.current()?.getBoundingClientRect() ?? new DOMRect(),
  });
  return (
    <Popover.Root open>
      <Popover.Anchor virtualRef={virtual} />
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          updatePositionStrategy="always"
          aria-label={passive ? undefined : label}
          aria-hidden={passive || undefined}
          // Focus is the caller's: an ask puts it in its input, a completion never takes it.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          // Keys are the caller's, from its own elements.
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            event.preventDefault();
            if (!passive) onOutside?.();
          }}
          // Clicks in it are not the canvas's (no selecting, dragging or editing the node under it), though React
          // would pass them up through the portal to the node.
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
          className={cn('ai-bubble pop nodrag nopan nowheel', passive && 'ai-bubble-passive', className)}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
