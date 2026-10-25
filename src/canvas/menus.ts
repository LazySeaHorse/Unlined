import type { XYPosition } from '@xyflow/react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalJustifyStart,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpToLine,
  Calculator,
  Clipboard,
  Copy,
  CopyPlus,
  Eraser,
  Layers,
  Maximize,
  Minus,
  Moon,
  MousePointer2,
  PaintBucket,
  PencilLine,
  Pin,
  Play,
  Plus,
  Shapes,
  Sigma,
  SquareArrowOutUpRight,
  SquareDashed,
  Table2,
  Trash2,
  Ungroup,
} from 'lucide-react';
import { copyText } from '@/lib/clipboard';
import { MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, resizeGrid } from '@/lib/grid';
import { applyGridOp, applyToAll, columnLabel, GridOpError, gridOpLines } from '@/lib/gridOps';
import { frontOf, isStack } from '@/lib/stacks';
import {
  type AppEdge,
  type AppNode,
  type CardNode,
  LINK_ENDS,
  type LinkEnd,
  type NodeKind,
  type NodeOf,
  SECTION_COLORS,
  type SectionColor,
} from '@/model/types';
import { animateGridLines } from '@/motion/gridLines';
import { afterRender } from '@/motion/motion';
import { nodeSpecs } from '@/nodes/catalog';
import { mathPlusResultsText } from '@/nodes/mathPlus/useMathPlusResults';
import { withFill } from '@/nodes/sheet/fills';
import { sheetSelection } from '@/nodes/sheet/selection';
import { stackLayouts } from '@/nodes/stack/spec';
import {
  clearBlock,
  deleteBlockColumns,
  deleteBlockRows,
  isWholeColumns,
  isWholeRows,
} from '@/nodes/table/blocks';
import { selectedBlock, setTableSelection, tableSelection } from '@/nodes/table/selection';
import { type AlignEdge, alignSelected, bringToFront, sendToBack } from '@/store/arrange';
import { useCanvasStore } from '@/store/canvasStore';
import { organiseCanvas } from '@/store/groups';
import { deleteSectionWithContents } from '@/store/sections';
import { setStackLayout, stackSelection, takeOut, unstack } from '@/store/stacks';
import { useUiStore } from '@/store/uiStore';
import { askNumbers } from '@/ui/dialogs';
import type { MenuEntry } from '@/ui/Menu';
import { copySelection, pasteAt } from './clipboard';
import { deleteLink, editLink, linkColor, swapLink } from './links/actions';
import { mathMenu } from './mathMenu';

export interface MenuActions {
  addNode: (kind: NodeKind, at: XYPosition) => void;
  insertImage: () => void;
  insertVideo: () => void;
  insertWeb: () => void;
  insertPdf: () => void;
  fitView: () => void;
  /** Ctrl+G: wraps the selection in a section. */
  wrapInSection: () => void;
}

/** What right-clicking empty canvas offers; `at` is where the click landed, in canvas coordinates. */
export function canvasMenu(at: XYPosition, actions: MenuActions): MenuEntry[] {
  const insertActions: Partial<Record<NodeKind, () => void>> = {
    image: actions.insertImage,
    video: actions.insertVideo,
    web: actions.insertWeb,
    pdf: actions.insertPdf,
  };
  const add: MenuEntry[] = [];
  for (const spec of Object.values(nodeSpecs)) {
    if (spec.available?.() === false) continue;
    const insert = insertActions[spec.kind];
    if (spec.placement === 'place')
      add.push({ label: spec.label, icon: spec.icon, onSelect: () => actions.addNode(spec.kind, at) });
    else if (spec.placement === 'insert' && insert)
      add.push({ label: spec.label, icon: spec.icon, onSelect: insert });
  }
  return [
    { label: 'Add node', icon: Plus, items: add },
    { label: 'Paste', icon: Clipboard, hint: 'Ctrl+V', onSelect: () => void pasteAt(at) },
    { separator: true },
    { label: 'Organise', icon: Shapes, onSelect: organiseCanvas },
    { label: 'Fit view', icon: Maximize, onSelect: actions.fitView },
    {
      label: 'Select all',
      icon: MousePointer2,
      hint: 'Ctrl+A',
      onSelect: () => useCanvasStore.getState().setSelection(() => true),
    },
  ];
}

const copy: MenuEntry = { label: 'Copy', icon: Copy, hint: 'Ctrl+C', onSelect: () => void copySelection() };
const duplicate: MenuEntry = {
  label: 'Duplicate',
  icon: CopyPlus,
  hint: 'Ctrl+D',
  onSelect: () => useCanvasStore.getState().duplicateSelected(),
};
const remove: MenuEntry = {
  label: 'Delete',
  icon: Trash2,
  hint: 'Delete',
  danger: true,
  onSelect: () => useCanvasStore.getState().deleteSelected(),
};

const order: MenuEntry[] = [
  { label: 'Bring to front', icon: ArrowUpToLine, onSelect: bringToFront },
  { label: 'Send to back', icon: ArrowDownToLine, onSelect: sendToBack },
];

const copyLatex = (latex: string): MenuEntry => ({
  label: 'Copy LaTeX',
  icon: Sigma,
  onSelect: () => void copyText(latex, 'LaTeX'),
});

/** Extra items for particular kinds of node, shown above the common ones. */
const kindItems: { [K in NodeKind]?: (node: NodeOf<K>) => MenuEntry[] } = {
  math: (node) => [...mathMenu(node), { separator: true }, copyLatex(node.data.latex)],
  table: (node) => [tableSize(node)],
  web: (node) => [loadAutomatically(node), unloadOffscreen(node)],
  mathPlus: (node) => [
    ...mathMenu(node),
    { separator: true },
    copyLatex(node.data.latex),
    {
      label: 'Copy results',
      icon: Calculator,
      onSelect: async () => copyText(await mathPlusResultsText(node.id), 'results'),
    },
  ],
};

const tableSize = (node: NodeOf<'table'>): MenuEntry => {
  const rows = node.data.cells.length;
  const cols = node.data.cells[0]?.length ?? 1;
  return {
    label: `Size: ${rows} × ${cols} (rows × cols)…`,
    icon: Table2,
    onSelect: async () => {
      const size = await askNumbers({
        title: 'Table size',
        fields: [
          { label: 'Rows', initial: rows, min: 1, max: MAX_TABLE_ROWS },
          { label: 'Columns', initial: cols, min: 1, max: MAX_TABLE_COLUMNS },
        ],
      });
      if (!size) return;
      useCanvasStore
        .getState()
        .updateNodeData<'table'>(node.id, { cells: resizeGrid(node.data.cells, size[0], size[1]) });
    },
  };
};

const loadAutomatically = (node: NodeOf<'web'>): MenuEntry => ({
  label: 'Load automatically',
  icon: Play,
  checked: node.data.autoLoad === true,
  onSelect: () => useCanvasStore.getState().updateNodeData<'web'>(node.id, { autoLoad: !node.data.autoLoad }),
});

const unloadOffscreen = (node: NodeOf<'web'>): MenuEntry => ({
  label: 'Unload when off-screen',
  icon: Moon,
  checked: !node.data.keepLoaded,
  onSelect: () =>
    useCanvasStore.getState().updateNodeData<'web'>(node.id, { keepLoaded: !node.data.keepLoaded }),
});

const rename = (node: CardNode): MenuEntry => ({
  label: node.data.title ? 'Rename' : 'Add title',
  icon: PencilLine,
  // After the menu has closed and settled focus, or the title would lose it at once.
  onSelect: () => void setTimeout(() => useUiStore.getState().renameNode(node.id), 0),
});

/**
 * What right-clicking a sheet offers on its selection: a fill colour, and for a selected row or column
 * a box for operations on it (`-= 3*R2`, `*= 1/2`, `<-> R4`), formulas included.
 */
export function sheetMenu(node: NodeOf<'sheet'>): MenuEntry[] {
  const { cells, fills } = node.data;
  const range = sheetSelection(node.id)?.toRange(cells);
  const update = (patch: Partial<NodeOf<'sheet'>['data']>) =>
    useCanvasStore.getState().updateNodeData<'sheet'>(node.id, patch);
  if (!range) return [];

  const targets = [...range];
  const setFill = (color: SectionColor | null) => () => update({ fills: withFill(fills, targets, color) });
  const entries: MenuEntry[] = [
    {
      label: 'Fill',
      icon: PaintBucket,
      items: [
        { label: 'None', onSelect: setFill(null) },
        ...SECTION_COLORS.map((color) => ({
          label: titleCase(color),
          swatch: `var(--section-${color})`,
          onSelect: setFill(color),
        })),
      ],
    },
  ];

  const operate = (line: string) => (text: string) => {
    // A full command (`R3 -= R1`) is taken as typed; anything else continues the row or column named in front.
    const command = /^[RrCc]\d/.test(text.trim()) ? text : `${line} ${text}`;
    try {
      update({ cells: applyGridOp(cells, command, node.data.fractions ? 'fraction' : 'decimal') });
      const lines = gridOpLines(command);
      if (lines)
        afterRender(() =>
          animateGridLines(document.querySelector(`[data-sheet-id="${CSS.escape(node.id)}"]`), lines),
        );
    } catch (error) {
      if (error instanceof GridOpError) return error.message;
      throw error;
    }
  };
  const { start, end } = range;
  const rows = cells.length;
  const columns = cells[0]?.length ?? 0;
  if (start.row === end.row && start.column === 0 && end.column === columns - 1)
    entries.push(
      { separator: true },
      { heading: `Row ${start.row + 1}` },
      {
        field: {
          prefix: `R${start.row + 1}`,
          placeholder: '-= 3*R2',
          hint: 'Also *= 1/2, = R1 - R2, <-> R4. Formulas work too.',
          onSubmit: operate(`R${start.row + 1}`),
        },
      },
    );
  else if (start.column === end.column && start.row === 0 && end.row === rows - 1)
    entries.push(
      { separator: true },
      { heading: `Column ${columnLabel(start.column)}` },
      {
        field: {
          prefix: `C${start.column + 1}`,
          placeholder: '-= 3*C2',
          hint: `Columns are C1, C2… from the left (this is C${start.column + 1}). Also = C1 / C2; text is skipped.`,
          onSubmit: operate(`C${start.column + 1}`),
        },
      },
    );
  else if (start.row === 0 && start.column === 0 && end.row === rows - 1 && end.column === columns - 1) {
    const everyNumber = (op: '+' | '-' | '*' | '/', prefix: string, label: string, placeholder: string) => ({
      field: {
        prefix,
        label,
        placeholder,
        autoFocus: op === '+',
        onSubmit: (text: string) => {
          try {
            update({ cells: applyToAll(cells, op, text, node.data.fractions ? 'fraction' : 'decimal') });
          } catch (error) {
            if (error instanceof GridOpError) return error.message;
            throw error;
          }
        },
      },
    });
    entries.push(
      { separator: true },
      { heading: 'Every number' },
      everyNumber('+', '+', 'Add to every number', '5'),
      everyNumber('-', '−', 'Subtract from every number', '5'),
      everyNumber('*', '×', 'Multiply every number', '1/2'),
      everyNumber('/', '÷', 'Divide every number', '2'),
    );
  }
  return entries;
}

/** What right-clicking a table's selection offers: delete whole rows or columns, and clear contents. */
export function tableMenu(node: NodeOf<'table'>): MenuEntry[] {
  const rows = node.data.cells.length;
  const cols = node.data.cells[0]?.length ?? 0;
  const block = selectedBlock(tableSelection(node.id), rows, cols);
  if (!block) return [];
  const edit = (transform: (grid: string[][]) => string[][]) => () => {
    const current = useCanvasStore.getState().nodes.find((n) => n.id === node.id);
    if (current?.type !== 'table') return;
    useCanvasStore.getState().updateNodeData<'table'>(node.id, { cells: transform(current.data.cells) });
    setTableSelection(node.id, undefined);
  };
  const entries: MenuEntry[] = [];
  const count = (n: number, noun: string) => `Delete ${noun}${n > 1 ? 's' : ''}`;
  if (isWholeRows(block, cols) && block.r1 - block.r0 + 1 < rows)
    entries.push({
      label: count(block.r1 - block.r0 + 1, 'row'),
      icon: Trash2,
      danger: true,
      onSelect: edit((grid) => deleteBlockRows(grid, block)),
    });
  if (isWholeColumns(block, rows) && block.c1 - block.c0 + 1 < cols)
    entries.push({
      label: count(block.c1 - block.c0 + 1, 'column'),
      icon: Trash2,
      danger: true,
      onSelect: edit((grid) => deleteBlockColumns(grid, block)),
    });
  entries.push({ label: 'Clear contents', icon: Eraser, onSelect: edit((grid) => clearBlock(grid, block)) });
  return entries;
}

const kindExtras = (node: CardNode): MenuEntry[] => {
  const extra = (kindItems[node.type] as ((n: AppNode) => MenuEntry[]) | undefined)?.(node) ?? [];
  return extra.length > 0 ? [...extra, { separator: true }] : [];
};

/** What right-clicking a stack offers, for the card shown (or the tab right-clicked) and the stack as a whole. */
export function stackMenu(stack: NodeOf<'stack'>, card: CardNode): MenuEntry[] {
  return [
    rename(card),
    { separator: true },
    ...kindExtras(card),
    { label: 'Take out of stack', icon: SquareArrowOutUpRight, onSelect: () => takeOut(stack.id, card.id) },
    { label: 'Unstack all', icon: Ungroup, onSelect: () => unstack(stack.id) },
    {
      label: 'Pin open',
      icon: Pin,
      items: [
        {
          label: 'No, behind tabs',
          icon: Layers,
          checked: !stack.data.layout,
          onSelect: () => setStackLayout(stack.id, undefined),
        },
        ...stackLayouts.map(({ layout, label, icon }) => ({
          label,
          icon,
          checked: stack.data.layout === layout,
          onSelect: () => setStackLayout(stack.id, layout),
        })),
      ],
    },
    { separator: true },
    copy,
    duplicate,
    {
      label: 'Delete card',
      icon: Trash2,
      danger: true,
      onSelect: () => useCanvasStore.getState().deleteNodes([card.id]),
    },
    {
      label: 'Delete stack',
      icon: Trash2,
      hint: 'Delete',
      danger: true,
      onSelect: () => useCanvasStore.getState().deleteNodes([stack.id]),
    },
    { separator: true },
    ...order,
  ];
}

export function nodeMenu(node: CardNode): MenuEntry[] {
  return [
    rename(node),
    { separator: true },
    ...kindExtras(node),
    copy,
    duplicate,
    remove,
    { separator: true },
    ...order,
  ];
}

const titleCase = (word: string) => word[0].toUpperCase() + word.slice(1);

export function sectionMenu(node: NodeOf<'section'>): MenuEntry[] {
  return [
    {
      label: 'Rename',
      icon: PencilLine,
      // After the menu has closed and settled focus, or the title would lose it at once.
      onSelect: () => void setTimeout(() => useUiStore.getState().renameSection(node.id), 0),
    },
    {
      label: 'Colour',
      icon: PaintBucket,
      items: SECTION_COLORS.map((color) => ({
        label: titleCase(color),
        swatch: `var(--section-${color})`,
        checked: color === node.data.color,
        onSelect: () => useCanvasStore.getState().updateNodeData<'section'>(node.id, { color }),
      })),
    },
    { separator: true },
    copy,
    duplicate,
    {
      label: 'Remove section',
      icon: Ungroup,
      onSelect: () => useCanvasStore.getState().deleteNodes([node.id]),
    },
    {
      label: 'Delete section and contents',
      icon: Trash2,
      danger: true,
      onSelect: () => deleteSectionWithContents(node.id),
    },
  ];
}

/** What right-clicking a link offers. Every choice is its own undo step. */
export function linkMenu(edge: AppEdge): MenuEntry[] {
  const data = edge.data;
  const ends = (field: 'head' | 'tail', current: LinkEnd): MenuEntry[] =>
    LINK_ENDS.map((end) => ({
      label: titleCase(end),
      checked: end === current,
      onSelect: () => editLink(edge.id, { [field]: end }),
    }));
  return [
    {
      label: data?.label ? 'Rename' : 'Add label',
      icon: PencilLine,
      // After the menu has closed and settled focus, or the field would lose it at once.
      onSelect: () => void setTimeout(() => useUiStore.getState().renameLink(edge.id), 0),
    },
    { separator: true },
    { label: 'Head', icon: ArrowRight, items: ends('head', data?.head ?? 'arrow') },
    { label: 'Tail', icon: ArrowLeft, items: ends('tail', data?.tail ?? 'none') },
    {
      label: 'Colour',
      icon: PaintBucket,
      items: ['auto', ...SECTION_COLORS].map((color) => ({
        label: titleCase(color),
        swatch: linkColor(color),
        checked: color === (data?.color ?? 'auto'),
        onSelect: () => editLink(edge.id, { color: color === 'auto' ? undefined : (color as SectionColor) }),
      })),
    },
    {
      label: 'Dashed',
      icon: Minus,
      checked: !!data?.dashed,
      onSelect: () => editLink(edge.id, { dashed: !data?.dashed }),
    },
    { label: 'Swap direction', icon: ArrowRightLeft, onSelect: () => swapLink(edge.id) },
    { separator: true },
    { label: 'Delete link', icon: Trash2, hint: 'Delete', danger: true, onSelect: () => deleteLink(edge.id) },
  ];
}

/** The id of the link an element belongs to (its pipe or, later, its label), if it belongs to one. */
const linkIdOf = (target: Element | null): string | undefined =>
  target?.closest<HTMLElement>('[data-link-id]')?.dataset.linkId ??
  target?.closest<HTMLElement>('.react-flow__edge')?.dataset.id;

const alignItems: { edge: AlignEdge; label: string; icon: typeof AlignStartVertical }[] = [
  { edge: 'left', label: 'Left', icon: AlignStartVertical },
  { edge: 'center', label: 'Centre horizontally', icon: AlignCenterVertical },
  { edge: 'right', label: 'Right', icon: AlignEndVertical },
  { edge: 'top', label: 'Top', icon: AlignStartHorizontal },
  { edge: 'middle', label: 'Centre vertically', icon: AlignCenterHorizontal },
  { edge: 'bottom', label: 'Bottom', icon: AlignEndHorizontal },
];

export function selectionMenu(actions: MenuActions): MenuEntry[] {
  return [
    { label: 'Wrap in section', icon: SquareDashed, hint: 'Ctrl+G', onSelect: actions.wrapInSection },
    { label: 'Stack', icon: Layers, hint: 'Ctrl+Shift+G', onSelect: () => void stackSelection() },
    {
      label: 'Align',
      icon: AlignHorizontalJustifyStart,
      items: alignItems.map(({ edge, label, icon }) => ({
        label,
        icon,
        onSelect: () => alignSelected(edge),
      })),
    },
    { separator: true },
    copy,
    duplicate,
    remove,
    { separator: true },
    ...order,
  ];
}

/**
 * The menu for whatever was right-clicked: the selection box, a node (selected first if it was not
 * part of the selection) or the empty canvas.
 */
export function menuFor(target: Element | null, at: XYPosition, actions: MenuActions): MenuEntry[] {
  if (target?.closest('.react-flow__nodesselection-rect')) return selectionMenu(actions);
  const link = useCanvasStore.getState().edges.find((e) => e.id === linkIdOf(target));
  if (link) {
    // Select only this link, as a click on it would.
    useCanvasStore.getState().setSelection(
      () => false,
      (e) => e.id === link.id,
    );
    return linkMenu(link);
  }
  const id = target?.closest<HTMLElement>('.react-flow__node')?.dataset.id;
  const { nodes, fronts } = useCanvasStore.getState();
  const flowHit = nodes.find((n) => n.id === id);
  if (!flowHit) return canvasMenu(at, actions);
  if (!flowHit.selected) useCanvasStore.getState().setSelection((n) => n.id === flowHit.id);
  // In a stack, the menu is about the card under the pointer: the tab right-clicked, else the card (all show in a
  // pinned stack), else the one shown.
  const stack = isStack(flowHit) ? flowHit : undefined;
  const cardId = stack
    ? (target?.closest<HTMLElement>('[data-stack-tab]')?.dataset.stackTab ??
      target?.closest<HTMLElement>('[data-stack-card]')?.dataset.stackCard ??
      frontOf(stack, nodes, fronts))
    : undefined;
  const hit = stack ? nodes.find((n) => n.id === cardId) : flowHit;
  if (!hit || hit.type === 'stack') return [];
  const menu = (node: CardNode) => (stack ? stackMenu(stack, node) : nodeMenu(node));
  if (hit.type === 'sheet' && target?.closest('.Spreadsheet')) {
    const onSelection = sheetMenu(hit);
    if (onSelection.length > 0) return [...onSelection, { separator: true }, ...menu(hit)];
  }
  if (hit.type === 'table' && target?.closest('table')) {
    const onSelection = tableMenu(hit);
    if (onSelection.length > 0) return [...onSelection, { separator: true }, ...menu(hit)];
  }
  if (useCanvasStore.getState().nodes.filter((n) => n.selected).length > 1) return selectionMenu(actions);
  return hit.type === 'section' ? sectionMenu(hit) : menu(hit);
}
