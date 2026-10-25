import { stackOf } from '@/lib/stacks';
import type { AppEdge, AppNode, NodeDataMap } from '@/model/types';
import { searchTextOf } from '@/nodes/factory';
import type { LineResult, LinkInput } from '@/nodes/mathPlus/evaluate';
import { splitLines } from '@/nodes/mathPlus/evaluate';
import { useCanvasStore } from '@/store/canvasStore';
import { nodeRect } from '@/store/groups';
import { alias } from './aliases';

/**
 * Compact text renderings of nodes for the agent. Every character here is paid for in tokens,
 * so lines are terse, numbers are rounded and image data is never included.
 */

export const PREVIEW_CHARS = 80;

export function oneLine(text: string, max = PREVIEW_CHARS): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export const columnName = (col: number): string => {
  let name = '';
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

/** "B3" -> { row: 2, col: 1 }, or null if it is not a cell reference. */
export function parseCellRef(ref: string): { row: number; col: number } | null {
  const match = /^([A-Z]+)([1-9]\d*)$/i.exec(ref.trim());
  if (!match) return null;
  const col = [...match[1].toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return { row: Number(match[2]) - 1, col };
}

function imageLabel(src: string): string {
  if (!src) return 'empty';
  if (src.startsWith('data:')) return `uploaded image, ${Math.round((src.length * 3) / 4 / 1024)} KB`;
  return oneLine(src);
}

/** A PDF node's metadata: its name, size and which pages are shown. The pages' text is added by read_nodes. */
export function pdfSummary(data: NodeDataMap['pdf']): string {
  const pages = data.pageCount === undefined ? 'page count unknown' : `${data.pageCount} pages`;
  const pinned =
    data.pinned.length > 0
      ? `pinned pages ${data.pinned.join(', ')}`
      : 'page 1 (cover) only, as nothing is pinned';
  return `${data.fileName}, ${pages}; shown to the user and readable by you: ${pinned}`;
}

const gridSize = (cells: string[][]) => `${cells.length}×${cells[0]?.length ?? 0}`;

/** A short preview of a node's content. */
export function preview(node: AppNode): string {
  switch (node.type) {
    case 'graph':
      return oneLine(node.data.functions.map((f) => `y=${f}`).join('; '));
    case 'table':
    case 'sheet':
      return `${gridSize(node.data.cells)}: ${oneLine(node.data.cells.flat().filter(Boolean).join(' | ') || '(empty)')}`;
    case 'code':
      return oneLine(node.data.source.split('\n').find((l) => l.trim()) ?? '');
    case 'image':
      return imageLabel(node.data.src);
    default:
      return oneLine(searchTextOf(node));
  }
}

const round = (n: number) => Math.round(n);

/** A label in quotes on one line, with any quote mark inside it escaped. */
const quoted = (label: string, max: number) => `"${oneLine(label, max).replace(/"/g, '\\"')}"`;

/** One line per link: `l2 n1 -> n4 "k" head=dot tail=bar color=blue dashed`. Only non-default looks are listed. */
export function linkLine(link: AppEdge): string {
  const { label, head, tail, color, dashed } = link.data ?? {};
  const look = [
    head && `head=${head}`,
    tail && `tail=${tail}`,
    color && `color=${color}`,
    dashed && 'dashed',
  ].filter(Boolean);
  return [
    alias(link.id, 'l'),
    alias(link.source),
    '->',
    alias(link.target),
    ...(label ? [quoted(label, 60)] : []),
    ...look,
  ].join(' ');
}

/** What a node is linked to: `-> n5 "k"; <- n2`. Empty when it has no links. */
export function linksOf(node: AppNode, links: AppEdge[]): string {
  return links
    .flatMap((e) => {
      const label = e.data?.label ? ` ${quoted(e.data.label, 40)}` : '';
      if (e.source === node.id) return [`-> ${alias(e.target)}${label}`];
      if (e.target === node.id) return [`<- ${alias(e.source)}${label}`];
      return [];
    })
    .join('; ');
}

/** Where a node is: "x,y w×h", or for a card in a stack, "in stack n7". */
export function placement(node: AppNode): string {
  const stack = stackOf(useCanvasStore.getState().nodes, node.id);
  if (stack) return `in stack ${alias(stack)}`;
  const r = nodeRect(node);
  return `${round(r.x)},${round(r.y)} ${round(r.width)}×${round(r.height)}`;
}

/** One line per node: `n3 text 120,40 300×200 g2 "preview" [2.3k chars]`. */
export function nodeLine(node: AppNode, groupId?: string): string {
  const length = node.type === 'image' ? 0 : searchTextOf(node).length;
  const size =
    length > PREVIEW_CHARS ? ` [${length >= 1000 ? `${(length / 1000).toFixed(1)}k` : length} chars]` : '';
  const group = groupId ? ` ${alias(groupId, 'g')}` : '';
  return `${alias(node.id)} ${node.type} ${placement(node)}${group} "${preview(node)}"${size}`;
}

function gridBody(cells: string[][]): string {
  const cols = cells[0]?.length ?? 0;
  const header = `  | ${Array.from({ length: cols }, (_, c) => columnName(c)).join(' | ')}`;
  return [header, ...cells.map((row, r) => `${r + 1} | ${row.join(' | ')}`)].join('\n');
}

/** `inputs: k = 5 (from n2); ans: the source has an error (from n4)`. */
function inputsLine(inputs: LinkInput[]): string {
  const parts = inputs.map((i) => {
    const from = `from ${alias(i.sourceId)}${i.error || i.used ? '' : ', unused'}`;
    return `${i.error ? `${i.name}: ${i.error}` : `${i.name} = ${i.value}`} (${from})`;
  });
  return `inputs: ${parts.join('; ')}`;
}

function mathPlusBody(latex: string, results: LineResult[] | undefined, inputs: LinkInput[] = []): string {
  const lines = splitLines(latex).map((line, i) => {
    const r = results?.[i];
    if (!r) return line;
    if (r.error) return `${line}  ⟶ error: ${r.error}`;
    if (r.assigned) return line;
    return `${line}  ⟶ ${r.value}${r.approx ? ` ≈ ${r.approx}` : ''}`;
  });
  const body = [...(inputs.length > 0 ? [inputsLine(inputs)] : []), ...lines];
  return body.length > 0 ? body.join('\n') : '(empty)';
}

/** The full content of a node as plain text. Math+ lines carry their computed results when given. */
export function nodeBody(node: AppNode, mathPlusResults?: LineResult[], inputs?: LinkInput[]): string {
  switch (node.type) {
    case 'text':
      return node.data.markdown;
    case 'math':
      return node.data.latex;
    case 'mathPlus':
      return mathPlusBody(node.data.latex, mathPlusResults, inputs);
    case 'graph':
      return node.data.functions.map((f) => `y = ${f}`).join('\n');
    case 'table':
    case 'sheet':
      return gridBody(node.data.cells);
    case 'code':
      return node.data.source;
    case 'image':
      return imageLabel(node.data.src);
    case 'video':
    case 'web':
      return node.data.url;
    case 'pdf':
      return pdfSummary(node.data);
    case 'section':
      return node.data.title;
    case 'stack':
      return `stack of ${node.data.members.map((id) => alias(id)).join(', ')}`;
  }
}
