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
}

export const useGraphView = create<GraphViewState>((set) => ({
  moved: {},
  fits: {},
  markMoved: (id) => set((s) => (s.moved[id] ? s : { moved: { ...s.moved, [id]: true } })),
  fit: (id) =>
    set((s) => {
      const { [id]: _, ...moved } = s.moved;
      return { moved, fits: { ...s.fits, [id]: (s.fits[id] ?? 0) + 1 } };
    }),
}));
