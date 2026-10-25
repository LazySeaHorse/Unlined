import type { GridOpLines } from '@/lib/gridOps';
import { DUR_MOVE, EASE_SPRING, motionOK } from './motion';

/** How long a line a row or column operation rewrote stays lit. */
const GLOW_MS = 700;

/** The cells of line `index` (from 1) of a spreadsheet table: a row, or one cell from every row for a column. */
function cellsOf(table: HTMLTableElement, axis: 'R' | 'C', index: number): HTMLElement[] {
  if (axis === 'R') {
    const row = table.rows[index];
    return row ? [...row.cells].slice(1) : [];
  }
  return [...table.rows].slice(1).flatMap((row) => (row.cells[index] ? [row.cells[index]] : []));
}

/**
 * Shows what a row or column operation did to a spreadsheet: two swapped lines slide past each other into their
 * new places; a rewritten line glows and fades back. Runs on the table as drawn after the change; the cells'
 * contents are already the new ones.
 */
export function animateGridLines(root: Element | null, lines: GridOpLines): void {
  const table = root?.querySelector('table');
  if (!table || !motionOK()) return;
  const { axis, index, swap } = lines;
  if (swap !== undefined && swap !== index) {
    const a = cellsOf(table, axis, index);
    const b = cellsOf(table, axis, swap);
    if (a.length === 0 || b.length === 0) return;
    const gap = axis === 'R' ? b[0].offsetTop - a[0].offsetTop : b[0].offsetLeft - a[0].offsetLeft;
    const slide = (cells: HTMLElement[], from: number) => {
      for (const cell of cells)
        cell.animate([{ translate: axis === 'R' ? `0 ${from}px` : `${from}px 0` }, { translate: '0 0' }], {
          duration: DUR_MOVE,
          easing: EASE_SPRING,
        });
    };
    // Each line's new contents came from the other, so each slides in from there.
    slide(a, gap);
    slide(b, -gap);
    return;
  }
  const accent = getComputedStyle(table).getPropertyValue('--accent').trim() || '#3b82f6';
  for (const cell of cellsOf(table, axis, index))
    cell.animate([{ backgroundColor: `color-mix(in srgb, ${accent} 28%, transparent)`, offset: 0 }, {}], {
      duration: GLOW_MS,
      easing: 'ease-out',
    });
}
