import type { NodeKind } from '@/model/types';

/**
 * How a node's content is written, said once for everyone who has to write it: the agent guide (agent/guide.ts)
 * and the on-device prompts (each node's ask.ts). The line breaks are the guide's layout, where these sit inside
 * its indented list; a prompt flattens them with oneLine.
 */
export const SYNTAX = {
  text: 'Markdown with $inline$ and $$display$$ LaTeX.',
  mathPlus:
    'Each line (separated by \\\\) is evaluated; "a := 2" defines a variable that later Math+\n  nodes can use. An equation with unknowns ("x^2-5x+6=0") is solved; consecutive equations, a cases\n  block, or a matrix times a column of unknowns are solved as a system.',
  graph: 'A row is typed as on a graphing calculator: "y=x^2" or just "x^2", "x=3", "y>x+1",\n  "x^2+y^2=1".',
  sheet: 'formulas start with "=" and use A1 references (=SUM(A1:A3)).',
} as const satisfies Partial<Record<NodeKind, string>>;
