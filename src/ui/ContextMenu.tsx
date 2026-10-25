import { DropdownMenu } from 'radix-ui';
import { useRef } from 'react';
import { type MenuEntry, panelClass, renderEntries } from './Menu';

interface ContextMenuProps {
  /** Where the menu opens, in screen coordinates; null keeps it closed. */
  at: { x: number; y: number } | null;
  items: MenuEntry[];
  onClose: () => void;
}

/** A menu of `items` opened at a point on screen, e.g. where the user right-clicked. */
export function ContextMenu({ at, items, onClose }: ContextMenuProps) {
  // The menu fades out after closing; it stays anchored where it was meanwhile, with the items it had.
  const last = useRef({ at, items });
  if (at) last.current = { at, items };
  const shown = last.current;
  return (
    <DropdownMenu.Root open={at !== null} onOpenChange={(open) => !open && onClose()}>
      {/* A zero-size anchor at the point; the menu is only ever opened from code. */}
      <DropdownMenu.Trigger asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed size-0"
          style={{ left: shown.at?.x, top: shown.at?.y }}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          // Focus stays wherever the action puts it (e.g. a title being renamed).
          onCloseAutoFocus={(event) => event.preventDefault()}
          collisionPadding={8}
          className={panelClass}
        >
          {renderEntries(DropdownMenu, shown.items, onClose)}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
