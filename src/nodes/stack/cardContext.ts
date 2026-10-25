import { createContext, type ReactNode, useContext } from 'react';

/** What a card drawn inside a stack knows about it. Absent for a node drawn by itself. */
export interface CardInStack {
  stackId: string;
  /** The card's own id: React Flow's node id here is the stack's. */
  cardId: string;
  /** Whether the card is out of sight behind another card of its stack. */
  hidden: boolean;
  /** Drawn in place of the card's own tab (the stack's tab strip, say); undefined keeps the card's own. */
  tabs: ReactNode;
}

export const CardContext = createContext<CardInStack | null>(null);

export const useCardInStack = () => useContext(CardContext);

/** The node standing for card `id` on the canvas: its stack while it is in one. */
export const usePlacedId = (id: string) => useContext(CardContext)?.stackId ?? id;

/** Whether card `id` is out of sight behind another card of its stack. */
export const useHiddenInStack = () => !!useContext(CardContext)?.hidden;
