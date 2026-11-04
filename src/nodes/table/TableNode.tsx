import type { NodeProps } from '@xyflow/react';
import { Minus, Plus } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { AskSlot } from '@/ai/AskSlot';
import { CompleteSlot } from '@/ai/CompleteSlot';
import { useInlineAsk } from '@/ai/useInlineAsk';
import { useInlineComplete } from '@/ai/useInlineComplete';
import { useReadOnly } from '@/canvas/readOnly';
import { cn } from '@/lib/cn';
import { insertColumn, insertRow, removeColumnAt, removeRowAt, setCell } from '@/lib/grid';
import { columnLabel } from '@/lib/gridOps';
import { MathField } from '@/lib/math/MathField';
import { Tex } from '@/lib/math/Tex';
import type { NodeOf } from '@/model/types';
import { WithTooltip } from '@/ui/Button';
import { NodeShell } from '../NodeShell';
import { useUpdateNodeData } from '../useNodeData';
import { tableAsk, tableComplete } from './ask';
import { inBlock } from './blocks';
import { useTableSelection } from './useTableSelection';

interface Layout {
  /** Table offset inside the wrapper. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Positions of the horizontal and vertical gridlines, relative to the table. */
  ys: number[];
  xs: number[];
}

type CellAt = `${number}:${number}`;
const cellAt = (at: CellAt) => {
  const [row = 0, col = 0] = at.split(':').map(Number);
  return { row, col };
};

/** Measures the gridlines in unscaled layout pixels, so the canvas zoom does not matter. */
function measure(table: HTMLTableElement): Layout {
  const rows = Array.from(table.rows);
  const cols = rows[0] ? Array.from(rows[0].cells) : [];
  return {
    left: table.offsetLeft,
    top: table.offsetTop,
    width: table.offsetWidth,
    height: table.offsetHeight,
    ys: [0, ...rows.map((row) => row.offsetTop + row.offsetHeight)],
    xs: [0, ...cols.map((cell) => cell.offsetLeft + cell.offsetWidth)],
  };
}

function PillButton({
  label,
  disabled,
  onClick,
  onPreview,
  children,
}: {
  label: string;
  disabled?: boolean;
  /** Called with true while the button is hovered or focused, false when that ends. */
  onPreview?: (on: boolean) => void;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <WithTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        // Keep the caret in the cell: a mousedown on a button would take focus away.
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        onMouseEnter={() => !disabled && onPreview?.(true)}
        onMouseLeave={() => onPreview?.(false)}
        onFocus={() => !disabled && onPreview?.(true)}
        onBlur={() => onPreview?.(false)}
        className="flex size-5 cursor-pointer items-center justify-center rounded-full hover:bg-accent hover:text-white disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
      >
        {children}
      </button>
    </WithTooltip>
  );
}

/**
 * A gridline's hover zone: a thin strip that lights the whole line and shows a "− +" pill on it.
 * "+" inserts at this boundary; "−" removes the row/column just before it (the first one on the outer edge).
 */
function Gridline({
  vertical,
  position,
  length,
  canRemove,
  onInsert,
  onRemove,
  onPreview,
}: {
  vertical: boolean;
  position: number;
  length: number;
  canRemove: boolean;
  onInsert: () => void;
  onRemove: () => void;
  onPreview: (on: boolean) => void;
}) {
  const noun = vertical ? 'column' : 'row';
  return (
    <div
      className={cn(
        'nodrag nopan group/line pointer-events-auto absolute z-10',
        vertical ? 'h-(--len) w-2 -translate-x-1/2' : 'h-2 w-(--len) -translate-y-1/2',
      )}
      style={{ [vertical ? 'left' : 'top']: position, '--len': `${length}px` } as React.CSSProperties}
    >
      <div
        className={cn(
          'pointer-events-none absolute bg-accent opacity-0 group-hover/line:opacity-100',
          vertical ? 'inset-y-0 left-1/2 w-0.5 -translate-x-1/2' : 'inset-x-0 top-1/2 h-0.5 -translate-y-1/2',
        )}
      />
      <div
        className={cn(
          'pointer-events-none absolute flex items-center rounded-full border border-border bg-surface text-muted opacity-0 shadow-sm group-hover/line:pointer-events-auto group-hover/line:opacity-100',
          vertical
            ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex-col'
            : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
        )}
      >
        <PillButton
          label={`Remove ${noun}`}
          disabled={!canRemove}
          onClick={() => {
            onPreview(false);
            onRemove();
          }}
          onPreview={onPreview}
        >
          <Minus className="size-3" />
        </PillButton>
        <PillButton label={`Insert ${noun}`} onClick={onInsert}>
          <Plus className="size-3" />
        </PillButton>
      </div>
    </div>
  );
}

/** A row number, column letter or corner handle in the table's margin; selects what it names. */
function HeaderHandle({
  label,
  style,
  active,
  visible,
  onSelect,
  children,
}: {
  label: string;
  style: React.CSSProperties;
  active: boolean;
  visible: boolean;
  onSelect: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      style={style}
      // Keep focus where it is until the selection takes it over.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
      className={cn(
        'nodrag nopan absolute z-20 flex cursor-pointer items-center justify-center rounded-sm text-[10px] leading-none font-medium transition-opacity',
        active ? 'bg-accent text-white' : 'bg-surface-2 text-muted hover:bg-accent/25 hover:text-fg',
        visible
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0 group-hover/table:pointer-events-auto group-hover/table:opacity-100',
      )}
    >
      {children}
    </button>
  );
}

export default function TableNode({ id, data, selected }: NodeProps<NodeOf<'table'>>) {
  const readOnly = useReadOnly();
  const update = useUpdateNodeData<'table'>(id);
  const { cells } = data;
  const edit = (transform: (grid: string[][]) => string[][]) => update({ cells: transform(cells) });
  const tableRef = useRef<HTMLTableElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // The row or column the pointer is about to remove, shown tinted.
  const [doomed, setDoomed] = useState<{ axis: 'row' | 'col'; index: number } | null>(null);
  const preview = (axis: 'row' | 'col', index: number) => (on: boolean) =>
    setDoomed(on ? { axis, index } : null);
  const [layout, setLayout] = useState<Layout | null>(null);
  // An ask is for a cell, as `row:col`; the model is told which, along with the whole table.
  const ask = useInlineAsk(tableAsk, {
    data,
    context: (at: CellAt) => ({ cells, ...cellAt(at) }),
    apply: (latex, at) => {
      const { row, col } = cellAt(at);
      edit((grid) => setCell(grid, row, col, latex));
    },
  });
  // Tab asks for the rest of a cell at the caret, shown under it.
  const complete = useInlineComplete(tableComplete, { data, context: () => undefined });
  const rowCount = cells.length;
  const colCount = cells[0]?.length ?? 0;
  const { block, selectRows, selectColumns, selectAll, cellHandlers } = useTableSelection({
    id,
    wrapper: wrapperRef,
    cells,
    readOnly,
    edit,
  });

  // Cells grow with their content, so measure again whenever the table's size changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the grid shape changes the lines.
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table || readOnly) return;
    const run = () => setLayout(measure(table));
    run();
    const observer = new ResizeObserver(run);
    observer.observe(table);
    return () => observer.disconnect();
  }, [readOnly, rowCount, colCount]);

  return (
    <NodeShell kind="table" selected={selected} customTitle={data.title} tint={data.color}>
      <div ref={wrapperRef} className="group/table relative w-fit p-4">
        <table ref={tableRef} className="border-collapse">
          <tbody>
            {cells.map((row, r) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: grid cells are addressed by position.
              <tr key={r}>
                {row.map((value, c) => (
                  <td
                    // biome-ignore lint/suspicious/noArrayIndexKey: grid cells are addressed by position.
                    key={c}
                    data-r={r}
                    data-c={c}
                    {...cellHandlers(r, c)}
                    className={cn(
                      'min-w-20 border border-border p-0 transition-colors duration-150',
                      block && inBlock(block, r, c) && 'bg-accent/20',
                      (doomed?.axis === 'row' ? doomed.index === r : doomed?.index === c) && 'bg-danger/15',
                    )}
                  >
                    <CompleteSlot
                      complete={complete}
                      at={`${r}:${c}`}
                      renderGhost={(latex) => <Tex latex={latex} className="text-base" />}
                    >
                      <AskSlot
                        ask={ask}
                        at={`${r}:${c}`}
                        renderGhost={(latex) => <Tex latex={latex} className="text-base" />}
                        placeholder="Describe the cell"
                      >
                        <MathField
                          value={value}
                          onChange={(latex) => {
                            if (!ask.trigger(`${r}:${c}`, value, latex))
                              edit((grid) => setCell(grid, r, c, latex));
                          }}
                          readOnly={readOnly}
                          modeToggle
                          className="min-h-8 px-1.5 py-1 text-base"
                        />
                      </AskSlot>
                    </CompleteSlot>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!readOnly && layout && (
          <div className="pointer-events-none absolute" style={{ left: layout.left, top: layout.top }}>
            <HeaderHandle
              label="Select whole table"
              style={{ left: -16, top: -16, width: 12, height: 12 }}
              active={
                block?.r0 === 0 && block.c0 === 0 && block.r1 === rowCount - 1 && block.c1 === colCount - 1
              }
              visible={block !== null}
              onSelect={selectAll}
            />
            {layout.ys.slice(0, -1).map((y, r) => (
              <HeaderHandle
                // biome-ignore lint/suspicious/noArrayIndexKey: headers are addressed by position.
                key={`hr${r}`}
                label={`Select row ${r + 1}`}
                style={{ left: -16, top: y + 1, width: 12, height: (layout.ys[r + 1] ?? y) - y - 2 }}
                active={
                  block !== null &&
                  block.c0 === 0 &&
                  block.c1 === colCount - 1 &&
                  r >= block.r0 &&
                  r <= block.r1
                }
                visible={block !== null}
                onSelect={() => selectRows(r)}
              >
                {r + 1}
              </HeaderHandle>
            ))}
            {layout.xs.slice(0, -1).map((x, c) => (
              <HeaderHandle
                // biome-ignore lint/suspicious/noArrayIndexKey: headers are addressed by position.
                key={`hc${c}`}
                label={`Select column ${columnLabel(c)}`}
                style={{ top: -16, left: x + 1, height: 12, width: (layout.xs[c + 1] ?? x) - x - 2 }}
                active={
                  block !== null &&
                  block.r0 === 0 &&
                  block.r1 === rowCount - 1 &&
                  c >= block.c0 &&
                  c <= block.c1
                }
                visible={block !== null}
                onSelect={() => selectColumns(c)}
              >
                {columnLabel(c)}
              </HeaderHandle>
            ))}
            {layout.ys.map((y, b) => (
              <Gridline
                // biome-ignore lint/suspicious/noArrayIndexKey: boundaries are addressed by position.
                key={`r${b}`}
                vertical={false}
                position={y}
                length={layout.width}
                canRemove={rowCount > 1}
                onInsert={() => edit((grid) => insertRow(grid, b))}
                onRemove={() => edit((grid) => removeRowAt(grid, Math.max(0, b - 1)))}
                onPreview={preview('row', Math.max(0, b - 1))}
              />
            ))}
            {layout.xs.map((x, b) => (
              <Gridline
                // biome-ignore lint/suspicious/noArrayIndexKey: boundaries are addressed by position.
                key={`c${b}`}
                vertical
                position={x}
                length={layout.height}
                canRemove={colCount > 1}
                onInsert={() => edit((grid) => insertColumn(grid, b))}
                onRemove={() => edit((grid) => removeColumnAt(grid, Math.max(0, b - 1)))}
                onPreview={preview('col', Math.max(0, b - 1))}
              />
            ))}
          </div>
        )}
      </div>
    </NodeShell>
  );
}
