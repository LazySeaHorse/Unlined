import { createContext, type ReactNode, useContext } from 'react';

/** What a card drawn inside a stack knows about it. Absent for a node drawn by itself. */
export interface CardInStack {
  stackId: string;
  /** The card's own id: React Flow's node id here is the stack's. */
  cardId: string;
  /** Whether this is the card shown. */
  front: boolean;
  /** The stack's tab strip, drawn in place of the card's own tab. */
  tabs: ReactNode;
}

export const CardContext = createContext<CardInStack | null>(null);

export const useCardInStack = () => useContext(CardContext);

/** The node standing for card `id` on the canvas: its stack while it is in one. */
export const usePlacedId = (id: string) => useContext(CardContext)?.stackId ?? id;

/** Whether card `id` is out of sight behind another card of its stack. */
export const useHiddenInStack = () => {
  const card = useContext(CardContext);
  return !!card && !card.front;
};
