import type { NodeProps } from '@xyflow/react';
import { Popover } from 'radix-ui';
import type { CSSProperties } from 'react';
import { useReadOnly } from '@/canvas/readOnly';
import type { NodeOf, SectionColor } from '@/model/types';
import { useUiStore } from '@/store/uiStore';
import { ColorSwatches, swatch } from '../ColorSwatches';
import { CornerResizer } from '../CornerResizer';
import { NODE_TAB_HEIGHT } from '../spec';
import { useUpdateNodeData } from '../useNodeData';

/** A titled, tinted box behind other nodes. Only its tab grabs it; the tile lets clicks through to the canvas. */
export function SectionNode({ id, data, selected }: NodeProps<NodeOf<'section'>>) {
  const readOnly = useReadOnly();
  const update = useUpdateNodeData<'section'>(id);
  const editing = useUiStore((s) => s.renamingSection === id) && !readOnly;
  const stopEditing = () => useUiStore.getState().stopRenaming(id);

  const commit = (title: string) => {
    update({ title: title.trim() || 'Section' });
    stopEditing();
  };

  return (
    <>
      <CornerResizer selected={selected} minWidth={160} minHeight={100} />
      <div
        className="node flex h-full w-full flex-col"
        style={
          // See-through, so the dot grid shows under the section.
          { '--tone-base': `color-mix(in srgb, ${swatch(data.color)} 18%, transparent)` } as CSSProperties
        }
      >
        <div className="flex shrink-0 items-end" style={{ height: NODE_TAB_HEIGHT }}>
          <div className="node-tab section-handle pointer-events-auto cursor-grab">
            {editing ? (
              <input
                // biome-ignore lint/a11y/noAutofocus: entering edit mode is an explicit user action.
                autoFocus
                defaultValue={data.title}
                maxLength={200}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => commit(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') stopEditing();
                }}
                className="nodrag nokey min-w-0 max-w-56 rounded bg-surface px-1.5 py-0.5 text-xs font-medium text-fg [field-sizing:content] outline-none"
              />
            ) : (
              // biome-ignore lint/a11y/noStaticElementInteractions: double-click to rename mirrors desktop canvas apps.
              <span
                className="min-w-0 truncate"
                onDoubleClick={() => !readOnly && useUiStore.getState().renameSection(id)}
              >
                {data.title}
              </span>
            )}
            {!readOnly && <ColorPicker value={data.color} onChange={(color) => update({ color })} />}
          </div>
        </div>
        <div className="node-tile node-section min-h-0 flex-1" />
      </div>
    </>
  );
}

function ColorPicker({ value, onChange }: { value: SectionColor; onChange: (color: SectionColor) => void }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Section colour"
          className="nodrag size-3.5 shrink-0 cursor-pointer rounded-full border border-fg/25"
          style={{ backgroundColor: swatch(value) }}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="pop z-50 rounded-xl border border-border bg-surface p-2 shadow-xl"
        >
          <ColorSwatches value={value} onChange={onChange} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
