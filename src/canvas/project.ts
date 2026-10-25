import { useMemo } from 'react';
import { SECTION_Z } from '@/lib/sections';
import { stackIndex } from '@/lib/stacks';
import type { AppEdge, AppNode } from '@/model/types';
import { useMarks } from '@/motion/marks';
import { useUiStore } from '@/store/uiStore';
import { useSearchMatches } from './useSearch';

/**
 * The canvas as React Flow draws it, from the canvas as the store holds it. The store keeps content; everything
 * that only concerns the current view (search dimming, short-lived marks, how sections take the pointer) is
 * added here, so no view state ever reaches the store, undo or the saved file. Pure apart from the hook.
 */
export interface View {
  /** Ids of the nodes matching the search, or null when not searching. */
  matches: ReadonlySet<string> | null;
  /** The search query, trimmed and lower-cased. */
  query: string;
  /** Short-lived classes by node id (see `motion/marks`). */
  marks: ReadonlyMap<string, string>;
  /** The node a dragged node would stack onto if dropped now. */
  dropTarget: string | null;
  /** The stack whose cards are spread out, drawn above everything else. */
  fanned: string | null;
}

/** A fanned stack spreads over its neighbours, so it is drawn above them (and above a selected node's 1000). */
const FANNED_Z = 2000;

/**
 * Cards inside stacks are left out: their stack draws them. A stack is a search miss only when none of its cards
 * match.
 */
export function projectNodes(nodes: AppNode[], view: View): AppNode[] {
  const { placed } = stackIndex(nodes);
  const matches = view.matches && withStacksOfMatches(nodes, view.matches);
  const marksOf = placedMarks(nodes, view.marks);
  return placed.map((n) => {
    const miss = matches && !matches.has(n.id);
    const marks = marksOf.get(n.id);
    const fanned = n.id === view.fanned;
    const className =
      [miss && 'search-miss', n.id === view.dropTarget && 'stack-drop', fanned && 'fanned', marks]
        .filter(Boolean)
        .join(' ') || undefined;
    const node = className ? { ...n, className, ...(fanned ? { zIndex: FANNED_Z } : {}) } : n;
    // Sections sit behind everything and only their header takes the pointer, so the canvas
    // underneath (marquee, double-click to add a node, panning) keeps working inside them.
    return node.type === 'section'
      ? {
          ...node,
          zIndex: SECTION_Z,
          dragHandle: '.section-handle',
          style: { pointerEvents: 'none' as const },
        }
      : node;
  });
}

/** Marks by the id of the node drawn: a card's marks show on its stack. */
function placedMarks(nodes: AppNode[], marks: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
  const { stackOf } = stackIndex(nodes);
  if (stackOf.size === 0 || marks.size === 0) return marks;
  const out = new Map<string, Set<string>>();
  for (const [id, classes] of marks) {
    const at = stackOf.get(id) ?? id;
    out.set(at, new Set([...(out.get(at) ?? []), ...classes.split(' ')]));
  }
  return new Map([...out].map(([id, classes]) => [id, [...classes].join(' ')]));
}

/** The matching ids, plus the stacks holding a matching card. */
function withStacksOfMatches(nodes: AppNode[], matches: ReadonlySet<string>): ReadonlySet<string> {
  const { stackOf } = stackIndex(nodes);
  if (stackOf.size === 0) return matches;
  const out = new Set(matches);
  for (const id of matches) {
    const stack = stackOf.get(id);
    if (stack) out.add(stack);
  }
  return out;
}

/**
 * Links as drawn: dimmed by a search unless one of their ends matches or their label does. A link between two
 * sections would sit under them (both are at the sections' depth), so it is lifted just above. A link to a card
 * inside a stack is drawn to the stack, and one between two cards of the same stack is not drawn.
 */
export function projectEdges(edges: AppEdge[], nodes: AppNode[], view: View): AppEdge[] {
  if (edges.length === 0) return edges;
  const { query } = view;
  const { stackOf } = stackIndex(nodes);
  const matches = view.matches && withStacksOfMatches(nodes, view.matches);
  const sections = new Set(nodes.filter((n) => n.type === 'section').map((n) => n.id));
  return edges.flatMap((link) => {
    const source = stackOf.get(link.source) ?? link.source;
    const target = stackOf.get(link.target) ?? link.target;
    if (source === target) return [];
    const e = source === link.source && target === link.target ? link : { ...link, source, target };
    const lifted = sections.has(e.source) && sections.has(e.target);
    const miss =
      matches &&
      !matches.has(e.source) &&
      !matches.has(e.target) &&
      !e.data?.label?.toLowerCase().includes(query);
    const className = [miss && 'search-miss', view.marks.get(e.id)].filter(Boolean).join(' ');
    if (!lifted && !className) return [e];
    return [
      {
        ...e,
        ...(lifted ? { zIndex: SECTION_Z + 1 } : {}),
        ...(className ? { className } : {}),
      },
    ];
  });
}

/** The view state the projection depends on, gathered from the stores. */
export function useView(nodes: AppNode[]): View {
  const matches = useSearchMatches(nodes);
  const query = useUiStore((s) => s.searchQuery.trim().toLowerCase());
  const marks = useMarks((s) => s.marks);
  const dropTarget = useUiStore((s) => s.stackDropTarget);
  const fanned = useUiStore((s) => s.fanned);
  return useMemo(
    () => ({ matches, query, marks, dropTarget, fanned }),
    [matches, query, marks, dropTarget, fanned],
  );
}

/** The nodes and links to hand React Flow. */
export function useProjection(nodes: AppNode[], edges: AppEdge[], view: View) {
  const displayNodes = useMemo(() => projectNodes(nodes, view), [nodes, view]);
  const displayEdges = useMemo(() => projectEdges(edges, nodes, view), [edges, nodes, view]);
  return { displayNodes, displayEdges };
}
