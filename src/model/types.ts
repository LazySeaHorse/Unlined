import type { Edge, Node, Viewport } from '@xyflow/react';

/** Pastel fills for sections and node backgrounds; each theme maps the names to colours (see index.css). */
export const SECTION_COLORS = ['yellow', 'green', 'blue', 'purple', 'pink', 'orange', 'gray'] as const;
export type SectionColor = (typeof SECTION_COLORS)[number];

/**
 * Optional name and tint every node but a section can carry. Nodes show their kind until named, and are
 * plain (white in light mode) until tinted.
 */
export type Titled = { title?: string; color?: SectionColor };

/** One row of a graph: what the user typed (`y=x^2`, `x=3`, `y>x`, `x^2+y^2=1`) and the colour it is drawn in. */
export type GraphEquation = { latex: string; color: SectionColor };

/** Per-kind payload stored in `node.data`. This is the single source of truth for node shapes. */
export type NodeDataMap = {
  text: Titled & {
    markdown: string;
    /** Set once the "this is only a table / only math" offer has been waved away. */
    suggestionDismissed?: boolean;
  };
  math: Titled & { latex: string };
  mathPlus: Titled & { latex: string };
  graph: Titled & { equations: GraphEquation[] };
  table: Titled & { cells: string[][] };
  sheet: Titled & {
    cells: string[][];
    /** Keeps numbers as exact fractions: `1/3` is a number and row operations write fractions. */
    fractions?: boolean;
    /** Cell fill by A1 reference, e.g. `{ B2: 'yellow' }`. */
    fills?: Record<string, SectionColor>;
  };
  code: Titled & { source: string };
  image: Titled & { src: string };
  video: Titled & { url: string };
  /** A live web page in an iframe. `url` follows the page as it navigates; `pageTitle` is its last reported title.
   * `keepLoaded` stops the page being unloaded while it is far from the screen, which it otherwise is.
   * `autoLoad` lets the page load and come back by itself; otherwise it waits for a click each time. */
  web: Titled & { url: string; pageTitle?: string; keepLoaded?: boolean; autoLoad?: boolean };
  /** Links a PDF on the user's disk. Only metadata is stored here; the file handle lives in the `pdfFiles` table. */
  pdf: Titled & {
    /** Key into the `pdfFiles` table. */
    fileId: string;
    fileName: string;
    /** 1-based page numbers shown on the node, sorted and unique. The cover is shown instead while this is empty. */
    pinned: number[];
    /** Which way the filmstrip runs; `row` when omitted. */
    direction?: 'row' | 'column';
    /** Last seen in the file, to notice when it changed on disk. */
    pageCount?: number;
    lastModified?: number;
    size?: number;
  };
  section: { title: string; color: SectionColor };
  /**
   * Cards on one spot, one shown at a time behind tabs. The stack owns the place and size; its members are
   * ordinary nodes, in this order, whose own position and size wait unused until they leave the stack.
   * Pinned open (`layout`), every card shows instead, at its own size, and the stack takes the size of them all.
   */
  stack: { members: string[]; layout?: StackLayout };
};

export type NodeKind = keyof NodeDataMap;
/** Distributes over unions, so `NodeOf<NodeKind>` is the union of every node type. */
export type NodeOf<K extends NodeKind> = K extends NodeKind ? Node<NodeDataMap[K], K> : never;
export type AppNode = NodeOf<NodeKind>;
/** A node holding content of its own, with an optional title and tint: anything but a section or a stack. */
export type CardNode = Exclude<AppNode, NodeOf<'section'> | NodeOf<'stack'>>;
export const isCard = (node: AppNode): node is CardNode => node.type !== 'section' && node.type !== 'stack';

/** How a stack pinned open lays out its cards: side by side, one under another, or in columns. */
export const STACK_LAYOUTS = ['row', 'column', 'masonry'] as const;
export type StackLayout = (typeof STACK_LAYOUTS)[number];

/** What a link can have at either end. */
export const LINK_ENDS = ['arrow', 'dot', 'bar', 'none'] as const;
export type LinkEnd = (typeof LINK_ENDS)[number];

/**
 * A link's look. Only non-default fields are stored: no `head` means an arrow, no `tail` none, no `color`
 * the automatic one. (A type alias, not an interface, so it satisfies React Flow's record constraint.)
 */
export type LinkData = {
  label?: string;
  color?: SectionColor;
  dashed?: boolean;
  /** The end at the target node. */
  head?: LinkEnd;
  /** The end at the source node. */
  tail?: LinkEnd;
};

/** A link between two nodes in its persisted form. */
export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  data?: LinkData;
}

/** A link as the canvas holds it, with React Flow's runtime fields (selection). */
export type AppEdge = Edge<LinkData>;

export interface CanvasMeta {
  id: string;
  name: string;
  updatedAt: number;
}

/**
 * Nodes that sit close together. Groups are invisible: they are recomputed from node positions
 * (by Organise and by the AI tools) and saved so their ids stay stable between sessions.
 */
export interface CanvasGroup {
  id: string;
  nodeIds: string[];
}

export interface CanvasContent {
  nodes: AppNode[];
  viewport: Viewport;
  /** Omitted until the canvas has been organised or read by an AI agent. */
  groups?: CanvasGroup[];
  /** Omitted while the canvas has no links. */
  edges?: CanvasEdge[];
  /** Which card each stack shows, by stack id. Not undoable; omitted until a stack has switched cards. */
  fronts?: Record<string, string>;
}

export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };
