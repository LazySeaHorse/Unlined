import type { NodeProps } from '@xyflow/react';
import { GalleryHorizontalEnd } from 'lucide-react';
import { type ComponentType, type CSSProperties, useMemo, useRef, type WheelEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { stackIndex } from '@/lib/stacks';
import type { CardNode, NodeOf } from '@/model/types';
import { useCanvasStore } from '@/store/canvasStore';
import { cycleFront, openFan } from '@/store/stacks';
import { useUiStore } from '@/store/uiStore';
import { swatch } from '../ColorSwatches';
import { CornerResizer } from '../CornerResizer';
import { cardComponents } from '../cards';
import { nodeSpecs } from '../catalog';
import { searchTextOf } from '../factory';
import { NodeTitle } from '../NodeShell';
import { CardContext } from './cardContext';
import { stackSpec } from './spec';
import { useFan } from './useFan';

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
 * Cards on one spot behind tabs, in the stack's order like a browser's: the front card's tab with its title, the
 * others as icons either side of it. Every card stays mounted (out of sight and inert unless in front) so
 * switching keeps its state: scroll, selection, history. A video card is the exception, as it would keep playing.
 *
 * Fanned out (Space, or the button by the tabs), the cards spread into a row over the canvas to pick from: click
 * one to show it, drag one along the row to reorder, or away from it to take it out.
 */
export function StackNode(props: NodeProps<NodeOf<'stack'>>) {
  const { id, data, selected } = props;
  const cards = useCards(id, data.members);
  const front = useFront(id, cards);
  const focus = useUiStore((s) => (s.fanned === id ? s.fanFocus : -1));
  const box = {
    x: props.positionAbsoluteX,
    y: props.positionAbsoluteY,
    width: props.width ?? stackSpec.size?.width ?? 0,
    height: props.height ?? stackSpec.size?.height ?? 0,
  };
  const { fan, dragging, transformOf, pickHandlers } = useFan(
    id,
    cards.map((c) => c.id),
    box,
  );
  const strip = <StackTabs stackId={id} cards={cards} front={front} />;
  return (
    <>
      <CornerResizer selected={selected && !fan} minWidth={200} minHeight={140} />
      <div className="stack-node" data-depth={Math.min(cards.length - 1, 2)} data-fan={fan}>
        {cards.map((card, i) => {
          const isFront = card.id === front;
          const Card = cardComponents[card.type] as ComponentType<NodeProps>;
          const name = card.data.title || nodeSpecs[card.type].label;
          // Spread out, each card wears its own tab; stacked, the front one wears the stack's.
          const tabs = fan ? <CardTab card={card} /> : isFront ? strip : null;
          return (
            <div
              key={card.id}
              className="stack-card"
              data-front={isFront || undefined}
              data-dragging={dragging === card.id || undefined}
              style={{ transform: transformOf(card.id, i), zIndex: dragging === card.id ? 2 : undefined }}
            >
              <div className="stack-card-body" inert={!isFront || !!fan}>
                <CardContext.Provider value={{ stackId: id, cardId: card.id, front: isFront, tabs }}>
                  {(isFront || card.type !== 'video') && (
                    <Card
                      {...props}
                      id={card.id}
                      type={card.type}
                      data={card.data}
                      selected={selected && isFront && !fan}
                      width={undefined}
                      height={undefined}
                    />
                  )}
                </CardContext.Provider>
              </div>
              {fan === 'open' && (
                <button
                  type="button"
                  className="stack-pick nodrag nopan"
                  data-focused={i === focus || undefined}
                  aria-label={`Show ${name}`}
                  {...pickHandlers(card.id)}
                />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** A fanned card's own tab: its kind and title. */
function CardTab({ card }: { card: CardNode }) {
  const { icon: Icon, label } = nodeSpecs[card.type];
  return (
    <div className="node-tab">
      <Icon className="size-3.5 shrink-0 opacity-70" />
      <span className={cn('min-w-0 truncate', !card.data.title && 'opacity-70')}>
        {card.data.title || label}
      </span>
    </div>
  );
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
      {cards.map((card, i) => {
        const { icon: Icon, label } = nodeSpecs[card.type];
        const name = card.data.title || label;
        return card.id === front ? (
          <div key={card.id} className="node-tab cursor-grab" data-stack-tab={card.id}>
            {/* With tabs before it, it curves into the tile on its left too. */}
            {i > 0 && <span className="node-tab-fillet" />}
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
      {cards.length > 1 && (
        <button
          type="button"
          className="stack-fan nodrag"
          title="Spread out the cards (Space)"
          aria-label="Spread out the cards"
          onClick={() => openFan(stackId)}
        >
          <GalleryHorizontalEnd className="size-3.5" />
        </button>
      )}
    </div>
  );
}
