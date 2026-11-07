import { z } from 'zod';
import { besideCandidates, boundsOf, CLUSTER_PADDING, findFreeSpot, type Rect } from '@/lib/clusters';
import { setCell } from '@/lib/grid';
import { sectionContents } from '@/lib/sections';
import { placedId, placedNodes } from '@/lib/stacks';
import { type AppNode, GRAPH_NAME_MAX, type NodeDataMap, type NodeKind, SECTION_COLORS } from '@/model/types';
import { createNode } from '@/nodes/factory';
import { withColors } from '@/nodes/graph/equations';
import { splitLines } from '@/nodes/mathPlus/evaluate';
import { toEmbedUrl } from '@/nodes/video/embedUrl';
import { normaliseWebUrl } from '@/nodes/web/url';
import { redo, undo, useCanvasStore } from '@/store/canvasStore';
import { nodeRect } from '@/store/groups';
import { alias } from '../aliases';
import { defineTool } from '../defineTool';
import { ToolError } from '../errors';
import { parseCellRef } from '../format';
import {
  canvasNodes,
  commitAiWrite,
  currentGroups,
  groupHandleSchema,
  handleSchema,
  plural,
  requireGroup,
  requireNode,
  viewportRect,
} from './shared';

const MAX_GRID = { rows: 200, cols: 52 };
/** Kinds whose size can be set; the others size to their content. */
const RESIZABLE = new Set<NodeKind>(['code', 'graph', 'video', 'web', 'section', 'stack']);

const cellsSchema = z
  .array(z.array(z.string().max(2000)).max(MAX_GRID.cols))
  .min(1)
  .max(MAX_GRID.rows);
const tint = z
  .enum(SECTION_COLORS)
  .optional()
  .describe('Background tint. Omit it, unless the tint carries a meaning (see get_guide).');
const title = z
  .string()
  .max(200)
  .optional()
  .describe('Optional name that the user sees on the node. Omit it for no name.');
const content = {
  text: {
    markdown: z.string().max(100_000).describe('Markdown. Use $...$ and $$...$$ for LaTeX math.'),
    title,
    color: tint,
  },
  math: { latex: z.string().max(20_000).describe('LaTeX. It is typeset only.'), title, color: tint },
  mathPlus: {
    title,
    color: tint,
    latex: z
      .string()
      .max(20_000)
      .describe(
        'LaTeX. The app evaluates it line by line. Separate lines with \\\\. "a := 2" defines a variable.',
      ),
  },
  graph: {
    equations: z
      .array(
        z.object({
          latex: z
            .string()
            .max(500)
            .describe('Write it as on a graphing calculator: "y=x^2", "x^2", "x=3", "y>x", "x^2+y^2=1".'),
          color: z
            .enum(SECTION_COLORS)
            .optional()
            .describe('Colour of the curve. Omit it to get the next free colour.'),
          name: z
            .string()
            .max(GRAPH_NAME_MAX)
            .optional()
            .describe(
              'Optional name of the line. The app writes it along the line in its colour (y= and x= curves, and points) ' +
                'and shows it when the user hovers over the line. Plain text; $math$ is typeset.',
            ),
        }),
      )
      .min(1)
      .max(20)
      .transform(withColors),
    equalAxes: z
      .boolean()
      .optional()
      .describe('Make a unit the same length on both axes. Omit it to scale each axis to fit the curves.'),
    title,
    color: tint,
  },
  table: {
    cells: cellsSchema.describe('Rows of cells. Each cell is a LaTeX math expression.'),
    title,
    color: tint,
  },
  sheet: {
    cells: cellsSchema.describe('Rows of cells. A formula starts with "=" and uses A1 references.'),
    title,
    color: tint,
    fractions: z
      .boolean()
      .optional()
      .describe(
        'Fraction mode. Results and row operations show fractions. A cell such as 1/3 is a number in both modes.',
      ),
    fills: z
      .record(z.string(), z.enum(SECTION_COLORS))
      .optional()
      .describe('Cell background by A1 reference, for example {"B2": "yellow"}.'),
  },
  code: {
    source: z.string().max(100_000).describe('JavaScript. It runs in a sandboxed worker.'),
    title,
    color: tint,
  },
  video: {
    url: z.string().max(2000).describe('A YouTube or Vimeo link, or an https embed URL.'),
    title,
    color: tint,
  },
  web: {
    url: z
      .string()
      .max(2000)
      .describe('The http(s) address of a web page. A bare domain such as example.com is also correct.'),
    title,
    color: tint,
  },
} satisfies {
  // `suggestionDismissed`, `keepLoaded` and `autoLoad` are UI flags and `pageTitle` what the page reported, not content.
  [K in Exclude<NodeKind, 'image' | 'pdf' | 'section' | 'stack'>]: Record<
    Exclude<keyof NodeDataMap[K], 'suggestionDismissed' | 'keepLoaded' | 'autoLoad' | 'pageTitle'>,
    z.ZodType
  >;
};

const placementShape = {
  near: handleSchema
    .optional()
    .describe('Place the node next to this node: on the side in `side`, or else on the other side.'),
  side: z
    .enum(['right', 'below'])
    .optional()
    .describe(
      'With `near` or `group`: the side to try first. Default is right. Use below for a sequence of steps.',
    ),
  group: groupHandleSchema.optional().describe('Place the node next to the nodes of this group.'),
  x: z.number().optional().describe('Exact position. Omit it to let the app find free space.'),
  y: z.number().optional(),
  width: z
    .number()
    .min(40)
    .max(4000)
    .optional()
    .describe('For code, graph, video and web nodes only. The size of other nodes follows their content.'),
  height: z.number().min(40).max(4000).optional(),
};

const newNodeSchema = z.discriminatedUnion(
  'kind',
  (Object.keys(content) as (keyof typeof content)[]).map((kind) =>
    z.object({ kind: z.literal(kind), ...content[kind], ...placementShape }),
  ) as unknown as [z.ZodObject, ...z.ZodObject[]],
);
type NewNode = { kind: Exclude<NodeKind, 'image' | 'pdf' | 'section' | 'stack'> } & z.infer<
  z.ZodObject<typeof placementShape>
> &
  Record<string, unknown>;

/** Multi-line Math+ input is stored the way MathLive writes it, as \displaylines{a \\ b}. */
export function normaliseMathPlus(latex: string): string {
  const text = latex.trim();
  if (/^\\displaylines\s*\{/.test(text) || splitLines(text).length < 2) return text;
  return `\\displaylines{${splitLines(text).join(' \\\\ ')}}`;
}

function checkVideo(url: unknown) {
  if (typeof url === 'string' && !toEmbedUrl(url))
    throw new ToolError('invalid_url', `"${url}" is not a video URL or an https embed URL.`);
}

/** The address in the form the Web node stores it. */
function checkWeb(url: unknown): string {
  const normalised = typeof url === 'string' ? normaliseWebUrl(url) : null;
  if (!normalised) throw new ToolError('invalid_url', `"${url}" is not an http(s) web address.`);
  return normalised;
}

export const createNodes = defineTool({
  name: 'create_nodes',
  title: 'Create nodes',
  description:
    'Add up to 20 nodes. Each node has a kind and its content fields. If you give no x and y, the app puts the node ' +
    'in free space: next to `near`, beside the nodes of `group`, or to the right of all nodes. The app places the ' +
    'nodes of one call one after the other. A list with the same `near` makes a row (or a column, with side below). ' +
    'Returns the new handles.',
  input: z.object({ nodes: z.array(newNodeSchema).min(1).max(20) }),
  readOnly: false,
  handler: ({ nodes: specs }) => {
    const { groups } = currentGroups();
    const obstacles: Omit<Rect, 'id'>[] = placedNodes(canvasNodes()).map(nodeRect);
    const created: AppNode[] = [];

    for (const spec of specs as NewNode[]) {
      const { kind, near, group, side, x, y, width, height, ...data } = spec;
      if (kind === 'video') checkVideo(data.url);
      if (kind === 'web') data.url = checkWeb(data.url);
      if (kind === 'mathPlus') data.latex = normaliseMathPlus(String(data.latex));
      if ((width || height) && !RESIZABLE.has(kind))
        throw new ToolError('not_resizable', `${kind} nodes size to their content; omit width and height.`);
      const draft = createNode(kind, { x: 0, y: 0 }, data as Partial<NodeDataMap[typeof kind]>);
      const size = { width: width ?? nodeRect(draft).width, height: height ?? nodeRect(draft).height };

      let position: { x: number; y: number };
      if (x !== undefined && y !== undefined) position = { x, y };
      else if (near)
        position = findFreeSpot(
          size,
          besideCandidates(nodeRect(requireNode(near)), undefined, side),
          obstacles,
        );
      else if (group) {
        const members = requireGroup(group, groups).nodeIds.map((id) => nodeRect(requireNode(id)));
        const candidates = [...members].reverse().flatMap((m) => besideCandidates(m, undefined, side));
        position = findFreeSpot(size, candidates, obstacles);
      } else if (obstacles.length > 0) {
        const all = boundsOf(obstacles.map((o) => ({ id: '', ...o })));
        position = findFreeSpot(size, [{ x: all.x + all.width + CLUSTER_PADDING, y: all.y }], obstacles);
      } else {
        const view = viewportRect();
        position = { x: view.x + (view.width - size.width) / 2, y: view.y + (view.height - size.height) / 2 };
      }

      const node = { ...draft, position, ...(RESIZABLE.has(kind) ? size : {}) } as AppNode;
      created.push(node);
      obstacles.push({ ...position, ...size });
    }

    // Appended without touching the selection, which is the user's.
    commitAiWrite(() => useCanvasStore.setState((s) => ({ nodes: [...s.nodes, ...created] })));
    const handles = created.map(
      (n) => `${alias(n.id)} ${n.type} at ${Math.round(n.position.x)},${Math.round(n.position.y)}`,
    );
    return {
      text: `Created ${handles.join('; ')}.`,
      summary: `Created ${plural(created.length, 'node')}`,
      affectedNodeIds: created.map((n) => n.id),
    };
  },
});

/** The plain-text field that find/replace edits apply to, per kind. */
const TEXT_FIELD: Partial<Record<NodeKind, string>> = {
  text: 'markdown',
  math: 'latex',
  mathPlus: 'latex',
  code: 'source',
  video: 'url',
  web: 'url',
  section: 'title',
};

const updateSchema = z.object({
  id: handleSchema,
  set: z
    .object({
      markdown: z.string().max(100_000),
      latex: z.string().max(20_000),
      source: z.string().max(100_000),
      url: z.string().max(2000),
      equations: content.graph.equations,
      cells: cellsSchema,
      title: z.string().max(200),
      color: z.enum(SECTION_COLORS),
    })
    .partial()
    .optional()
    .describe('Replace whole fields. Use only the fields of the node kind (see create_nodes).'),
  edits: z
    .array(
      z.object({
        find: z.string().min(1),
        replace: z.string(),
        all: z
          .boolean()
          .default(false)
          .describe('Replace every match. Without this, there must be exactly one match.'),
      }),
    )
    .max(50)
    .optional()
    .describe(
      'Exact find and replace in the text of text, math, Math+, code, video, web and section nodes. Use it for small changes. It costs less than set.',
    ),
  cells: z
    .array(
      z.object({
        cell: z.string().describe('A1-style reference, for example "B3".'),
        value: z.string().max(2000),
      }),
    )
    .max(500)
    .optional()
    .describe('Set cells of a table or sheet. The grid grows to fit.'),
});

function applyEdits(text: string, edits: { find: string; replace: string; all: boolean }[], handle: string) {
  let out = text;
  for (const { find, replace, all } of edits) {
    const count = out.split(find).length - 1;
    if (count === 0)
      throw new ToolError(
        'edit_not_found',
        `${handle}: "${find}" is not in the node. Read the node and copy the text exactly.`,
      );
    if (count > 1 && !all)
      throw new ToolError(
        'edit_ambiguous',
        `${handle}: "${find}" occurs ${count} times. Add more text around it, or pass all: true.`,
      );
    out = all ? out.split(find).join(replace) : out.replace(find, () => replace);
  }
  return out;
}

function setCells(grid: string[][], cells: { cell: string; value: string }[], handle: string) {
  let out = grid;
  for (const { cell, value } of cells) {
    const ref = parseCellRef(cell);
    if (!ref || ref.row >= MAX_GRID.rows || ref.col >= MAX_GRID.cols)
      throw new ToolError(
        'invalid_cell',
        `${handle}: "${cell}" is not a cell reference in a grid of ${MAX_GRID.cols} columns × ${MAX_GRID.rows} rows.`,
      );
    const cols = Math.max(out[0]?.length ?? 0, ref.col + 1);
    out = out.map((row) => [...row, ...Array<string>(cols - row.length).fill('')]);
    while (out.length <= ref.row) out = [...out, Array<string>(cols).fill('')];
    out = setCell(out, ref.row, ref.col, value);
  }
  return out;
}

export const updateNodes = defineTool({
  name: 'update_nodes',
  title: 'Update nodes',
  description:
    'Change the content of up to 20 nodes in one undo step. Use `edits` (exact find and replace) for small ' +
    'changes, `cells` (cells of a table or sheet, by A1 reference) or `set` (replace whole fields). The app checks all ' +
    'updates before it applies any of them.',
  input: z.object({ updates: z.array(updateSchema).min(1).max(20) }),
  readOnly: false,
  handler: ({ updates }) => {
    const patches = updates.map(({ id, set, edits, cells }) => {
      const node = requireNode(id);
      const data = { ...(node.data as Record<string, unknown>) };
      for (const [key, value] of Object.entries(set ?? {})) {
        // Which pages of a PDF are shown (and so readable) is the user's call alone.
        if (node.type === 'pdf' && key !== 'title')
          throw new ToolError('invalid_field', `${id} is a pdf node. You can change only its title.`);
        if (
          !(key in data) &&
          !(key in ((node.type === 'pdf' ? { title } : (content as Record<string, object>)[node.type]) ?? {}))
        )
          throw new ToolError('invalid_field', `${id} is a ${node.type} node. It has no "${key}" field.`);
        data[key] = value;
      }
      if (edits?.length) {
        const field = TEXT_FIELD[node.type];
        if (!field)
          throw new ToolError('invalid_edit', `${id} is a ${node.type} node. Use set or cells, not edits.`);
        data[field] = applyEdits(String(data[field]), edits, id);
      }
      if (cells?.length) {
        if (node.type !== 'table' && node.type !== 'sheet')
          throw new ToolError(
            'invalid_edit',
            `${id} is a ${node.type} node. Use cells only for table and sheet nodes.`,
          );
        data.cells = setCells(data.cells as string[][], cells, id);
      }
      if (node.type === 'video') checkVideo(data.url);
      if (node.type === 'web' && data.url !== node.data.url) data.url = checkWeb(data.url);
      if (node.type === 'mathPlus') data.latex = normaliseMathPlus(String(data.latex));
      return { node, data };
    });

    commitAiWrite(() => {
      const store = useCanvasStore.getState();
      for (const { node, data } of patches) store.updateNodeData(node.id, data);
    });
    return {
      text: `Updated ${patches.map((p) => alias(p.node.id)).join(', ')}.`,
      summary: `Updated ${plural(patches.length, 'node')}`,
      affectedNodeIds: patches.map((p) => p.node.id),
    };
  },
});

export const moveNodes = defineTool({
  name: 'move_nodes',
  title: 'Move or resize nodes',
  description:
    'Move nodes to x and y, or by dx and dy. Resize code, graph, image, video, web and section nodes. When you move a ' +
    'section, the nodes inside it move too. One undo step.',
  input: z.object({
    moves: z
      .array(
        z.object({
          id: handleSchema,
          x: z.number().optional(),
          y: z.number().optional(),
          dx: z.number().optional(),
          dy: z.number().optional(),
          width: z.number().min(40).max(4000).optional(),
          height: z.number().min(40).max(4000).optional(),
        }),
      )
      .min(1)
      .max(200),
  }),
  readOnly: false,
  handler: ({ moves }) => {
    // A card in a stack has no place of its own: moving or resizing it moves or resizes the stack.
    const placedNode = (handle: string) => requireNode(placedId(canvasNodes(), requireNode(handle).id));
    const changes = new Map(
      moves.map((m) => {
        const node = placedNode(m.id);
        if ((m.width || m.height) && !RESIZABLE.has(node.type) && node.type !== 'image')
          throw new ToolError(
            'not_resizable',
            `${m.id} is a ${node.type} node. Its size follows its content.`,
          );
        const position = {
          x: (m.x ?? node.position.x) + (m.dx ?? 0),
          y: (m.y ?? node.position.y) + (m.dy ?? 0),
        };
        return [node.id, { position, width: m.width, height: m.height }];
      }),
    );
    // A moved section takes the nodes inside it along, unless those are being moved explicitly too.
    const rects = placedNodes(canvasNodes()).map(nodeRect);
    for (const m of moves) {
      const node = placedNode(m.id);
      const to = changes.get(node.id)?.position;
      const rect = rects.find((r) => r.id === node.id);
      if (node.type !== 'section' || !to || !rect) continue;
      const delta = { x: to.x - node.position.x, y: to.y - node.position.y };
      for (const id of sectionContents(rect, rects)) {
        const inner = requireNode(id);
        if (changes.has(inner.id)) continue;
        changes.set(inner.id, {
          position: { x: inner.position.x + delta.x, y: inner.position.y + delta.y },
          width: undefined,
          height: undefined,
        });
      }
    }
    commitAiWrite(() =>
      useCanvasStore.setState((s) => ({
        nodes: s.nodes.map((n) => {
          const c = changes.get(n.id);
          if (!c) return n;
          return {
            ...n,
            position: c.position,
            ...(c.width ? { width: c.width } : {}),
            ...(c.height ? { height: c.height } : {}),
          };
        }),
      })),
    );
    return {
      text: `Moved ${plural(changes.size, 'node')}.`,
      summary: `Moved ${plural(changes.size, 'node')}`,
      affectedNodeIds: [...changes.keys()],
    };
  },
});

export const deleteNodes = defineTool({
  name: 'delete_nodes',
  title: 'Delete nodes',
  description:
    'Delete nodes. This is one undo step, and the user can undo it. When you delete a section, only the box goes. ' +
    'The nodes inside it stay.',
  input: z.object({ ids: z.array(handleSchema).min(1).max(200) }),
  readOnly: false,
  destructive: true,
  handler: ({ ids }) => {
    const doomed = new Set(ids.map((id) => requireNode(id).id));
    commitAiWrite(() => useCanvasStore.getState().deleteNodes([...doomed]));
    return {
      text: `Deleted ${plural(doomed.size, 'node')}.`,
      summary: `Deleted ${plural(doomed.size, 'node')}`,
    };
  },
});

const historyInput = z.object({ steps: z.number().int().min(1).max(20).default(1) });

export const undoTool = defineTool({
  name: 'undo',
  title: 'Undo',
  description: 'Undo the latest changes to the canvas. Each write call of yours is one step.',
  input: historyInput,
  readOnly: false,
  handler: ({ steps }) => {
    for (let i = 0; i < steps; i++) undo();
    return { text: `Undid ${plural(steps, 'step')}.`, summary: `Undid ${plural(steps, 'step')}` };
  },
});

export const redoTool = defineTool({
  name: 'redo',
  title: 'Redo',
  description: 'Redo the changes that undo reverted.',
  input: historyInput,
  readOnly: false,
  handler: ({ steps }) => {
    for (let i = 0; i < steps; i++) redo();
    return { text: `Redid ${plural(steps, 'step')}.`, summary: `Redid ${plural(steps, 'step')}` };
  },
});
