import { useMemo } from 'react';
import { SECTION_Z } from '@/lib/sections';
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
}

export function projectNodes(nodes: AppNode[], view: View): AppNode[] {
  return nodes.map((n) => {
    const miss = view.matches && !view.matches.has(n.id);
    const marks = view.marks.get(n.id);
    const className = miss ? (marks ? `search-miss ${marks}` : 'search-miss') : marks;
    const node = className ? { ...n, className } : n;
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

/**
 * Links as drawn: dimmed by a search unless one of their ends matches or their label does. A link between two
 * sections would sit under them (both are at the sections' depth), so it is lifted just above.
 */
export function projectEdges(edges: AppEdge[], nodes: AppNode[], view: View): AppEdge[] {
  if (edges.length === 0) return edges;
  const { matches, query } = view;
  const sections = new Set(nodes.filter((n) => n.type === 'section').map((n) => n.id));
  return edges.map((e) => {
    const lifted = sections.has(e.source) && sections.has(e.target);
    const miss =
      matches &&
      !matches.has(e.source) &&
      !matches.has(e.target) &&
      !e.data?.label?.toLowerCase().includes(query);
    if (!lifted && !miss) return e;
    return {
      ...e,
      ...(lifted ? { zIndex: SECTION_Z + 1 } : {}),
      ...(miss ? { className: 'search-miss' } : {}),
    };
  });
}

/** The view state the projection depends on, gathered from the stores. */
export function useView(nodes: AppNode[]): View {
  const matches = useSearchMatches(nodes);
  const query = useUiStore((s) => s.searchQuery.trim().toLowerCase());
  const marks = useMarks((s) => s.marks);
  return useMemo(() => ({ matches, query, marks }), [matches, query, marks]);
}

/** The nodes and links to hand React Flow. */
export function useProjection(nodes: AppNode[], edges: AppEdge[], view: View) {
  const displayNodes = useMemo(() => projectNodes(nodes, view), [nodes, view]);
  const displayEdges = useMemo(() => projectEdges(edges, nodes, view), [edges, nodes, view]);
  return { displayNodes, displayEdges };
}
