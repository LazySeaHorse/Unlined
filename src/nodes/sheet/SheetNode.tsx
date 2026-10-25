import type { NodeProps } from '@xyflow/react';
import isEqual from 'fast-deep-equal';
import { createContext, type MouseEvent, useContext, useEffect, useMemo, useState } from 'react';
import Spreadsheet, {
  type CellBase,
  DataViewer,
  type DataViewerProps,
  type Matrix,
  type Point,
  type Selection,
} from 'react-spreadsheet';
import { useReadOnly } from '@/canvas/readOnly';
import { cn } from '@/lib/cn';
import { addColumn, addRow, removeColumn, removeRow, setCell } from '@/lib/grid';
import type { NodeOf } from '@/model/types';
import { NodeShell, Stepper } from '../NodeShell';
import { useUpdateNodeData } from '../useNodeData';
import { evaluateSheet } from './evaluate';
import { cellKey, pruneFills, rangeLabel } from './fills';
import { ColumnIndicator, CornerIndicator, RowIndicator } from './indicators';
import { FormulaBar } from './SheetToolbar';
import { publishSheetSelection } from './selection';

type Cell = CellBase<string>;

/** What each formula cell shows, from `evaluateSheet`; the grid's own answers are never drawn. */
const Results = createContext<(string | undefined)[][] | null>(null);

/** Draws the answer of a formula cell, and any other cell as the grid would. */
function ResultViewer(props: DataViewerProps<Cell>) {
  const shown = useContext(Results)?.[props.row]?.[props.column];
  if (shown === undefined) return <DataViewer<Cell, string> {...props} />;
  return <span className="Spreadsheet__data-viewer">{shown}</span>;
}

export default function SheetNode({ id, data, selected }: NodeProps<NodeOf<'sheet'>>) {
  const readOnly = useReadOnly();
  const update = useUpdateNodeData<'sheet'>(id);
  const { cells, fills } = data;
  const fractions = data.fractions ?? false;
  const [active, setActive] = useState<Point>();
  const [selection, setSelection] = useState<Selection>();

  const results = useMemo(() => evaluateSheet(cells, fractions), [cells, fractions]);
  const matrix = useMemo<Matrix<Cell>>(
    () =>
      cells.map((row, r) =>
        row.map((value, column) => {
          const fill = fills?.[cellKey({ row: r, column })];
          return { value, readOnly, className: fill && `sheet-fill sheet-fill-${fill}` };
        }),
      ),
    [cells, fills, readOnly],
  );

  // The right-click menu works on what is selected here; forget it when the node goes.
  useEffect(() => () => publishSheetSelection(id, undefined), [id]);

  const handleChange = (next: Matrix<Cell>) => {
    const nextCells = next.map((row) => row.map((cell) => String(cell?.value ?? '')));
    // The grid reports changes for prop updates too; ignore those to avoid update loops.
    if (!isEqual(nextCells, cells)) update({ cells: nextCells });
  };

  const shrink = (transform: (grid: string[][]) => string[][]) => {
    const next = transform(cells);
    update({ cells: next, fills: pruneFills(fills, next.length, next[0]?.length ?? 0) });
  };

  const block = selection?.toRange(matrix);
  const label = block ? rangeLabel(block.start, block.end) : active ? cellKey(active) : '';
  // A right-click inside the selection acts on it. Inside the grid it would otherwise reselect the one cell.
  const keepSelectionOnRightClick = (event: MouseEvent) => {
    const cell = (event.target as HTMLElement).closest('td');
    const row = cell?.parentElement;
    if (event.button !== 2 || !selection || !cell || !(row instanceof HTMLTableRowElement)) return;
    if (selection.has(matrix, { row: row.rowIndex - 1, column: cell.cellIndex - 1 })) event.stopPropagation();
  };
  const toggleFractions = () => update({ fractions: fractions ? undefined : true });

  return (
    <NodeShell
      kind="sheet"
      selected={selected}
      customTitle={data.title}
      tint={data.color}
      className="min-w-[32rem]"
      toolbar={
        <FormulaBar
          label={label}
          value={active ? (cells[active.row]?.[active.column] ?? '') : ''}
          readOnly={readOnly}
          onCommit={(text) => active && update({ cells: setCell(cells, active.row, active.column, text) })}
        />
      }
      actions={
        <>
          <button
            type="button"
            aria-pressed={fractions}
            title="Fractions: results show as fractions (1/2, not 0.5), and row operations write fractions"
            onClick={toggleFractions}
            className={cn(
              'cursor-pointer rounded border px-2 py-0.5 text-xs font-medium',
              fractions
                ? 'border-accent/50 bg-accent/15 text-accent'
                : 'border-border bg-surface text-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            a/b
          </button>
          <Stepper label="Row" onDecrement={() => shrink(removeRow)} onIncrement={() => shrink(addRow)} />
          <Stepper
            label="Col"
            onDecrement={() => shrink(removeColumn)}
            onIncrement={() => shrink(addColumn)}
          />
        </>
      }
    >
      {/* nokey: keep Delete/Backspace inside the grid instead of deleting the node. */}
      <div
        className="nodrag nowheel nokey p-2 text-sm"
        data-sheet-id={id}
        onMouseDownCapture={keepSelectionOnRightClick}
      >
        <Results value={results}>
          <Spreadsheet
            data={matrix}
            onChange={handleChange}
            onActivate={setActive}
            // Leaving the grid (for the formula bar, say) empties its selection; keep the last block.
            onSelect={(next) => {
              if (!next.toRange(matrix)) return;
              setSelection(next);
              publishSheetSelection(id, next);
            }}
            RowIndicator={RowIndicator}
            ColumnIndicator={ColumnIndicator}
            CornerIndicator={CornerIndicator}
            DataViewer={ResultViewer}
          />
        </Results>
      </div>
    </NodeShell>
  );
}
