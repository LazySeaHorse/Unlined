import type { NodeProps } from '@xyflow/react';
import { type ComponentType, type CSSProperties, useMemo, useRef, type WheelEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { stackIndex } from '@/lib/stacks';
import type { CardNode, NodeOf } from '@/model/types';
import { useCanvasStore } from '@/store/canvasStore';
import { cycleFront } from '@/store/stacks';
import { useUiStore } from '@/store/uiStore';
import { swatch } from '../ColorSwatches';
import { CornerResizer } from '../CornerResizer';
import { cardComponents } from '../cards';
import { nodeSpecs } from '../catalog';
import { searchTextOf } from '../factory';
import { NodeTitle } from '../NodeShell';
import { CardContext } from './cardContext';

/** Wheel travel over the tabs that moves on one card. */
const WHEEL_STEP = 60;

/**
 * The stack's cards, as the store has them. Only re-renders when one of them changes, not on every edit elsewhere.
 */
function useCards(stackId: string, ids: string[]): CardNode[] {
  return useCanvasStore(
    useShallow((s) => {
      const { byId, stackOf } = stackIndex(s.nodes);
      return ids.flatMap((id) => (stackOf.get(id) === stackId ? [byId.get(id) as CardNode] : []));
    }),
  );
}

/** The card shown: the chosen one, unless a search matches another card and not it, which then shows instead. */
function useFront(stackId: string, cards: CardNode[]): string | undefined {
  const chosen = useCanvasStore((s) => s.fronts[stackId]);
  const query = useUiStore((s) => s.searchQuery.trim().toLowerCase());
  const front = cards.some((c) => c.id === chosen) ? chosen : cards[0]?.id;
  return useMemo(() => {
    if (!query) return front;
    const hit = (c: CardNode) => searchTextOf(c).toLowerCase().includes(query);
    const shown = cards.find((c) => c.id === front);
    return shown && hit(shown) ? front : (cards.find(hit)?.id ?? front);
  }, [cards, front, query]);
}

/**
 * Cards on one spot behind tabs: the front card's tab with its title, the others as icons to its right in the
 * order cycling reaches them. Every card stays mounted (out of sight and inert unless in front) so switching keeps
 * its state: scroll, selection, history. A video card is the exception, as it would keep playing.
 */
export function StackNode(props: NodeProps<NodeOf<'stack'>>) {
  const { id, data, selected } = props;
  const cards = useCards(id, data.members);
  const front = useFront(id, cards);
  const tabs = <StackTabs stackId={id} cards={cards} front={front} />;
  return (
    <>
      <CornerResizer selected={selected} minWidth={200} minHeight={140} />
      <div className="stack-node" data-depth={Math.min(cards.length - 1, 2)}>
        {cards.map((card) => {
          const isFront = card.id === front;
          const Card = cardComponents[card.type] as ComponentType<NodeProps>;
          return (
            <div key={card.id} className="stack-card" data-front={isFront || undefined} inert={!isFront}>
              <CardContext.Provider value={{ stackId: id, cardId: card.id, front: isFront, tabs }}>
                {(isFront || card.type !== 'video') && (
                  <Card
                    {...props}
                    id={card.id}
                    type={card.type}
                    data={card.data}
                    selected={selected && isFront}
                    width={undefined}
                    height={undefined}
                  />
                )}
              </CardContext.Provider>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** The cards in the order their tabs show: the front one, then the rest as cycling forward reaches them. */
function tabOrder(cards: CardNode[], front: string | undefined): CardNode[] {
  const at = Math.max(
    0,
    cards.findIndex((c) => c.id === front),
  );
  return [...cards.slice(at), ...cards.slice(0, at)];
}

function StackTabs({ stackId, cards, front }: { stackId: string; cards: CardNode[]; front?: string }) {
  const wheel = useRef(0);
  // Scrolling over the tabs flips through the cards instead of zooming.
  const onWheel = (event: WheelEvent) => {
    wheel.current += event.deltaY || event.deltaX;
    if (Math.abs(wheel.current) < WHEEL_STEP) return;
    cycleFront(stackId, wheel.current > 0 ? 1 : -1);
    wheel.current = 0;
  };
  return (
    <div className="stack-tabs nowheel" onWheel={onWheel}>
      {tabOrder(cards, front).map((card) => {
        const { icon: Icon, label } = nodeSpecs[card.type];
        const name = card.data.title || label;
        return card.id === front ? (
          <div key={card.id} className="node-tab cursor-grab" data-stack-tab={card.id}>
            <Icon className="size-3.5 shrink-0 opacity-70" />
            <NodeTitle id={card.id} fallback={label} value={card.data.title} color={card.data.color} />
          </div>
        ) : (
          <button
            key={card.id}
            type="button"
            data-stack-tab={card.id}
            title={name}
            aria-label={`Show ${name}`}
            className={cn('stack-tab', card.data.color && 'stack-tab-tinted')}
            style={card.data.color ? ({ '--tab-tint': swatch(card.data.color) } as CSSProperties) : undefined}
            onClick={() => useCanvasStore.getState().setFront(stackId, card.id)}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
