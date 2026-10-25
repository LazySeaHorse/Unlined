import { useNodeId } from '@xyflow/react';
import { Popover } from 'radix-ui';
import type { CSSProperties, FocusEvent, ReactNode } from 'react';
import { isTextField } from '@/canvas/keyboard';
import { useReadOnly } from '@/canvas/readOnly';
import { cn } from '@/lib/cn';
import type { NodeKind, SectionColor } from '@/model/types';
import { useCanvasStore } from '@/store/canvasStore';
import { useUiStore } from '@/store/uiStore';
import { ColorSwatches, swatch } from './ColorSwatches';
import { CornerResizer } from './CornerResizer';
import { nodeSpecs } from './catalog';
import { NODE_TAB_HEIGHT } from './spec';
import { useCardInStack } from './stack/cardContext';

interface NodeShellProps {
  /** Picks the label and icon of the tab. */
  kind: NodeKind;
  selected: boolean;
  /** The tab's text until the node has a title of its own; defaults to the kind's label. */
  title?: string;
  /** The node's own title (`data.title`). */
  customTitle?: string;
  /** Fills the top of the tile under the tab, e.g. a formula bar. Stays in read-only mode. */
  toolbar?: ReactNode;
  /** Controls on the tab line, shown while the node is hovered or selected; hidden in read-only mode. */
  actions?: ReactNode;
  /** The actions stay when the canvas is zoomed out, where editing controls go: a video's play button. */
  steadyActions?: boolean;
  resize?: {
    minWidth: number;
    minHeight: number;
    keepAspectRatio?: boolean;
    onResizing?: (resizing: boolean) => void;
  };
  /** The node's own tint (`data.color`), from the section palette; plain surface when omitted. */
  tint?: SectionColor;
  /** The embedded page or video is taking the mouse, so the node says so. */
  live?: boolean;
  /** Classes for the tile, e.g. its padding and minimum width. */
  className?: string;
  children: ReactNode;
}

/**
 * Common chrome for every node: a tab (kind icon and title, which doubles as the drag handle) fused to a
 * flat tile, plain or tinted. Both sit inside the node's box, so selection, resizing and layout see one rectangle.
 */
export function NodeShell({
  kind,
  selected,
  title,
  customTitle,
  toolbar,
  actions,
  steadyActions,
  resize,
  tint,
  live,
  className,
  children,
}: NodeShellProps) {
  const readOnly = useReadOnly();
  // Inside a stack, React Flow's node is the stack; the card is this node, and the stack draws the tabs.
  const card = useCardInStack();
  const flowId = useNodeId();
  const id = card?.cardId ?? flowId;
  const { icon: Icon, label } = nodeSpecs[kind];
  // Typing into a node's field selects the node, so Escape can hand the keys back to it (Ctrl+D, Ctrl+C...).
  const selectOnFocus = (event: FocusEvent) => {
    if (flowId && isTextField(event.target)) useCanvasStore.getState().setSelection((n) => n.id === flowId);
  };
  const tone = tint ? `color-mix(in srgb, ${swatch(tint)} 35%, var(--surface))` : 'var(--surface)';
  return (
    <>
      {resize && !card && <CornerResizer selected={selected} {...resize} />}
      <div
        className="node node-card flex h-full w-full flex-col"
        data-live={live || undefined}
        style={{ '--tone-base': tone } as CSSProperties}
      >
        <div className="flex shrink-0 items-end" style={{ height: NODE_TAB_HEIGHT }}>
          {card ? (
            card.tabs
          ) : (
            <div className="node-tab cursor-grab">
              <Icon className="size-3.5 shrink-0 opacity-70" />
              {id && <NodeTitle id={id} fallback={title ?? label} value={customTitle} color={tint} />}
              {live && <span className="shrink-0 text-2xs font-normal opacity-80">· Live</span>}
            </div>
          )}
          {!readOnly && actions && (
            <div
              className="node-actions nodrag ml-auto flex items-center gap-1 self-center"
              data-steady={steadyActions || undefined}
            >
              {actions}
            </div>
          )}
        </div>
        <div
          className={cn('node-tile flex min-h-0 flex-1 flex-col', className)}
          onFocusCapture={selectOnFocus}
        >
          {toolbar && (
            <header className="nodrag nokey flex h-9 shrink-0 items-center gap-1 px-2">{toolbar}</header>
          )}
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
      </div>
    </>
  );
}

/**
 * A node's title: its own, else `fallback` (the node kind). Double-click renames; so does Rename in the node's menu.
 * An empty name restores the fallback. While renaming, swatches above the tab recolour the node.
 */
export function NodeTitle({
  id,
  fallback,
  value,
  color,
}: {
  id: string;
  fallback: string;
  value?: string;
  color?: SectionColor;
}) {
  const readOnly = useReadOnly();
  const editing = useUiStore((s) => s.renamingNode === id) && !readOnly;

  const stopEditing = () => useUiStore.getState().stopRenamingNode(id);
  const commit = (name: string) => {
    useCanvasStore.getState().updateNodeData(id, { title: name.trim() || undefined });
    stopEditing();
  };
  const recolour = (next?: SectionColor) => useCanvasStore.getState().updateNodeData(id, { color: next });

  // No onOpenChange: the field's blur commits and closes, so a click outside never drops a half-typed name.
  return editing ? (
    <Popover.Root open>
      <Popover.Anchor asChild>
        <input
          // biome-ignore lint/a11y/noAutofocus: entering edit mode is an explicit user action.
          autoFocus
          defaultValue={value ?? ''}
          placeholder={fallback}
          maxLength={200}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') stopEditing();
          }}
          className="nodrag nokey min-w-0 max-w-56 rounded bg-surface px-1.5 py-0.5 text-xs font-medium text-fg [field-sizing:content] outline-none"
        />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          aria-label="Node colour"
          className="pop z-50 rounded-xl border border-border bg-surface p-2 shadow-xl"
        >
          <ColorSwatches value={color} onChange={recolour} onClear={() => recolour(undefined)} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  ) : (
    // biome-ignore lint/a11y/noStaticElementInteractions: double-click to rename mirrors desktop canvas apps.
    <span
      className={cn('min-w-0 truncate', !value && 'opacity-70')}
      onDoubleClick={() => !readOnly && useUiStore.getState().renameNode(id)}
    >
      {value || fallback}
    </span>
  );
}

/** Small "− label +" stepper used for row/column counts. */
export function Stepper({
  label,
  onDecrement,
  onIncrement,
}: {
  label: string;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const button = 'cursor-pointer px-2 py-0.5 hover:bg-surface-2 hover:text-fg';
  return (
    <div className="flex items-center overflow-hidden rounded border border-border bg-surface text-xs font-medium text-muted">
      <button type="button" className={button} onClick={onDecrement} aria-label={`Remove ${label}`}>
        −
      </button>
      <span className="px-1">{label}</span>
      <button type="button" className={button} onClick={onIncrement} aria-label={`Add ${label}`}>
        +
      </button>
    </div>
  );
}
