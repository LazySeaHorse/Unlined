import { toast } from 'sonner';
import type { LinkData } from '@/model/types';
import { asUndoStep, useCanvasStore } from '@/store/canvasStore';
import { useUiStore } from '@/store/uiStore';

/** Said when a link would repeat one that exists in the same direction. */
export const ALREADY_LINKED = 'Those two are already linked that way. Selected the existing link.';

/** What the link toolbar and the link menu do. Each edit is its own undo step, however fast they come. */

export const editLink = (id: string, patch: Partial<LinkData>) => {
  // The colour picked last is the one the next new link gets.
  if ('color' in patch) useUiStore.getState().setLinkColor(patch.color ?? null);
  asUndoStep(() => useCanvasStore.getState().updateEdgeData(id, patch));
};

/** Turns a link round, unless the other way is already linked, which is selected instead. */
export function swapLink(id: string) {
  if (!asUndoStep(() => useCanvasStore.getState().reverseEdge(id))) toast(ALREADY_LINKED);
}

export const deleteLink = (id: string) => useCanvasStore.getState().deleteElements([], [id]);

/** The colour a link draws in; `undefined` is the automatic one. */
export const linkColor = (color?: string) => `var(--link-${color ?? 'auto'})`;
