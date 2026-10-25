import type { NodeProps } from '@xyflow/react';
import { GalleryHorizontalEnd, Layers, Pin, PinOff } from 'lucide-react';
import { type ComponentType, type CSSProperties, useMemo, useRef, type WheelEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useReadOnly } from '@/canvas/readOnly';
import { cn } from '@/lib/cn';
import { masonryColumns, stackIndex } from '@/lib/stacks';
import type { CardNode, NodeOf, StackLayout } from '@/model/types';
import { useCanvasStore } from '@/store/canvasStore';
import { cycleFront, openFan, setStackLayout } from '@/store/stacks';
import { useUiStore } from '@/store/uiStore';
import { IconButton } from '@/ui/Button';
import { swatch } from '../ColorSwatches';
import { CornerResizer } from '../CornerResizer';
import { cardComponents } from '../cards';
import { nodeSpecs } from '../catalog';
import { searchTextOf } from '../factory';
import { NodeTitle } from '../NodeShell';
import { CardContext, type CardInStack } from './cardContext';
import { stackLayouts, stackSpec } from './spec';
import { useFan } from './useFan';

/** Wheel travel over the tabs that moves on one card. */
const WHEEL_STEP = 60;

type StackProps = NodeProps<NodeOf<'stack'>>;

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

/** Card `card` drawn by its own kind's component, told it is inside the stack. */
function CardView({
  props,
  card,
  context,
  selected,
}: {
  props: StackProps;
  card: CardNode;
  context: CardInStack;
  selected: boolean;
}) {
  const Card = cardComponents[card.type] as ComponentType<NodeProps>;
  return (
    <CardContext.Provider value={context}>
      <Card
        {...props}
        id={card.id}
        type={card.type}
        data={card.data}
        selected={selected}
        width={undefined}
        height={undefined}
      />
    </CardContext.Provider>
  );
}

export function StackNode(props: StackProps) {
  const cards = useCards(props.id, props.data.members);
  const front = useFront(props.id, cards);
  return props.data.layout ? (
    <PinnedStack props={props} cards={cards} front={front} layout={props.data.layout} />
  ) : (
    <TabbedStack props={props} cards={cards} front={front} />
  );
}

/**
 * Cards on one spot behind tabs, in the stack's order like a browser's: the front card's tab with its title, the
 * others as icons either side of it. Every card stays mounted (out of sight and inert unless in front) so
 * switching keeps its state: scroll, selection, history. A video card is the exception, as it would keep playing.
 *
 * Fanned out (Space, or the button by the tabs), the cards spread into a row over the canvas to pick from: click
 * one to show it, drag one along the row to reorder, or away from it to take it out.
 */
function TabbedStack({ props, cards, front }: { props: StackProps; cards: CardNode[]; front?: string }) {
  const { id, selected } = props;
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
          const name = card.data.title || nodeSpecs[card.type].label;
          // Spread out, each card wears its own tab; stacked, the front one wears the stack's.
          const tabs = fan ? <CardTab card={card} /> : isFront ? strip : null;
          return (
            <div
              key={card.id}
              className="stack-card"
              data-stack-card={card.id}
              data-front={isFront || undefined}
              data-dragging={dragging === card.id || undefined}
              style={{ transform: transformOf(card.id, i), zIndex: dragging === card.id ? 2 : undefined }}
            >
              <div className="stack-card-body" inert={!isFront || !!fan}>
                {(isFront || card.type !== 'video') && (
                  <CardView
                    props={props}
                    card={card}
                    context={{ stackId: id, cardId: card.id, hidden: !isFront, tabs }}
                    selected={selected && isFront && !fan}
                  />
                )}
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

/**
 * A stack pinned open: every card shows, under a bar that picks how they are laid out. Each keeps its own size
 * (a resizable card the size it had alone, the rest as their content takes them), and they line up across the
 * layout: a row as tall as its tallest card, a column as wide as its widest. The stack is as big as they make it.
 *
 * The card last clicked is the stack's front one: it takes the stack's selection, so a video in it plays, and a
 * link or an edit aimed at the stack lands on it.
 */
function PinnedStack({
  props,
  cards,
  front,
  layout,
}: {
  props: StackProps;
  cards: CardNode[];
  front?: string;
  layout: StackLayout;
}) {
  const { id, selected } = props;
  const pinned = (card: CardNode) => {
    const isFront = card.id === front;
    const fixed = nodeSpecs[card.type].size;
    const size = fixed && { width: card.width ?? fixed.width, height: card.height ?? fixed.height };
    return (
      <div
        key={card.id}
        className="stack-card"
        data-stack-card={card.id}
        data-front={isFront || undefined}
        style={size}
        onPointerDownCapture={() => useCanvasStore.getState().setFront(id, card.id)}
      >
        <CardView
          props={props}
          card={card}
          context={{ stackId: id, cardId: card.id, hidden: false, tabs: undefined }}
          selected={selected && isFront}
        />
      </div>
    );
  };
  return (
    <div className="stack-node" data-layout={layout}>
      <StackBar stackId={id} layout={layout} count={cards.length} />
      <div className="stack-cards">
        {layout === 'masonry'
          ? masonryColumns(cards).map((column) => (
              // A column is known by its first card: dealt in order, each column starts with a different one.
              <div key={column[0]?.id} className="stack-column">
                {column.map(pinned)}
              </div>
            ))
          : cards.map(pinned)}
      </div>
    </div>
  );
}

/** A pinned stack's grip: what it is, and the layouts to pick from or the way back behind tabs. */
function StackBar({ stackId, layout, count }: { stackId: string; layout: StackLayout; count: number }) {
  const readOnly = useReadOnly();
  return (
    <div className="stack-bar cursor-grab">
      <Layers className="size-3.5 shrink-0 opacity-70" />
      <span>Stack · {count}</span>
      {!readOnly && (
        <div className="stack-bar-actions nodrag ml-auto flex items-center gap-1">
          {stackLayouts.map((choice) => (
            <IconButton
              key={choice.layout}
              icon={choice.icon}
              label={choice.label}
              size="sm"
              active={choice.layout === layout}
              onClick={() => setStackLayout(stackId, choice.layout)}
            />
          ))}
          <IconButton
            icon={PinOff}
            label="Unpin, back to tabs"
            size="sm"
            onClick={() => setStackLayout(stackId, undefined)}
          />
        </div>
      )}
    </div>
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
  const readOnly = useReadOnly();
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
          className="stack-strip-button nodrag"
          title="Spread out the cards (Space)"
          aria-label="Spread out the cards"
          onClick={() => openFan(stackId)}
        >
          <GalleryHorizontalEnd className="size-3.5" />
        </button>
      )}
      {!readOnly && (
        <button
          type="button"
          className="stack-strip-button nodrag"
          title="Pin open, every card in sight"
          aria-label="Pin open"
          onClick={() => setStackLayout(stackId, 'row')}
        >
          <Pin className="size-3.5" />
        </button>
      )}
    </div>
  );
}
