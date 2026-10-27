import type { GraphEquation, SectionColor } from '@/model/types';

/** The order new rows take colours in; a row keeps its colour when others come and go. */
const CURVE_COLORS: readonly SectionColor[] = ['blue', 'orange', 'green', 'purple', 'pink', 'yellow', 'gray'];

type Coloured = { color?: SectionColor };

/** The first colour no row uses yet, or the least used one once every colour is taken. */
export function nextColor(equations: readonly Coloured[]): SectionColor {
  const uses = (color: SectionColor) => equations.filter((e) => e.color === color).length;
  return CURVE_COLORS.reduce((best, color) => (uses(color) < uses(best) ? color : best));
}

export const newEquation = (equations: readonly GraphEquation[], latex = ''): GraphEquation => ({
  latex,
  color: nextColor(equations),
});

/** Gives rows that came without a colour (from the agent) the next free one. */
export function withColors(rows: readonly ({ latex: string } & Coloured)[]): GraphEquation[] {
  const taken: Coloured[] = rows.filter((row) => row.color);
  return rows.map((row) => {
    if (row.color) return { latex: row.latex, color: row.color };
    const color = nextColor(taken);
    taken.push({ color });
    return { latex: row.latex, color };
  });
}
