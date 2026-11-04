import { create } from 'zustand';

/**
 * Per graph node, whether the user has panned or zoomed it (so edits stop refitting the window), and how many times
 * Fit was asked for. Lives here, not in node data: a window is neither saved nor undoable.
 */
interface GraphViewState {
  moved: Record<string, true>;
  fits: Record<string, number>;
  markMoved: (id: string) => void;
  /** Fits the window to the equations again, whatever the user did to it. */
  fit: (id: string) => void;
  /** The window is gone (the plot unmounted), so the next one fits again. */
  unmove: (id: string) => void;
  /** The node is gone. */
  forget: (id: string) => void;
}

const without = <T>(record: Record<string, T>, id: string) => {
  if (!(id in record)) return record;
  const { [id]: _, ...rest } = record;
  return rest;
};

export const useGraphView = create<GraphViewState>((set) => ({
  moved: {},
  fits: {},
  markMoved: (id) => set((s) => (s.moved[id] ? s : { moved: { ...s.moved, [id]: true } })),
  fit: (id) =>
    set((s) => {
      const { [id]: _, ...moved } = s.moved;
      return { moved, fits: { ...s.fits, [id]: (s.fits[id] ?? 0) + 1 } };
    }),
  unmove: (id) => set((s) => (s.moved[id] ? { moved: without(s.moved, id) } : s)),
  forget: (id) => set((s) => ({ moved: without(s.moved, id), fits: without(s.fits, id) })),
}));
