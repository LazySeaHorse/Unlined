/**
 * Stacks: several nodes on one spot, one shown at a time behind tabs. A stack node's `data.members` is the only
 * record of who is in it (members carry nothing), so it can never disagree with itself; everything else is
 * derived here. A member's own position and size are kept for when it leaves, and ignored while it is stacked.
 * Pure: no store or React.
 */
import type { XYPosition } from '@xyflow/react';
import { type AppNode, type CardNode, isCard, type NodeOf } from '@/model/types';
import { nodeRect } from './nodeRect';

export type StackNodeT = NodeOf<'stack'>;
export const isStack = (node: AppNode | undefined): node is StackNodeT => node?.type === 'stack';

/** Room left between cards laid out side by side when they leave a stack. */
export const UNSTACK_GAP = 48;

interface StackIndex {
  byId: Map<string, AppNode>;
  /** Card id → the id of the stack it is in. */
  stackOf: Map<string, string>;
  /** Everything but the cards inside stacks. */
  placed: AppNode[];
}

// Derived once per nodes array: the store replaces the array on every change, so this is always current.
const indexes = new WeakMap<readonly AppNode[], StackIndex>();

export function stackIndex(nodes: readonly AppNode[]): StackIndex {
  const cached = indexes.get(nodes);
  if (cached) return cached;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const stackOf = new Map<string, string>();
  for (const node of nodes) {
    if (node.type !== 'stack') continue;
    for (const id of node.data.members) {
      const member = byId.get(id);
      // Only cards stack, each in one stack: the first that lists it.
      if (member && isCard(member) && !stackOf.has(id)) stackOf.set(id, node.id);
    }
  }
  const placed = stackOf.size > 0 ? nodes.filter((n) => !stackOf.has(n.id)) : (nodes as AppNode[]);
  const index = { byId, stackOf, placed };
  indexes.set(nodes, index);
  return index;
}

/** Nodes with a place of their own on the canvas: everything but the cards inside stacks. */
export const placedNodes = (nodes: readonly AppNode[]): AppNode[] => stackIndex(nodes).placed;

/** The id of the stack holding card `id`, if it is in one. */
export const stackOf = (nodes: readonly AppNode[], id: string): string | undefined =>
  stackIndex(nodes).stackOf.get(id);

/** The node standing for `id` on the canvas: its stack when it is a card in one, else itself. */
export const placedId = (nodes: readonly AppNode[], id: string): string => stackOf(nodes, id) ?? id;

/** A stack's cards that exist, in order. */
export function membersOf(stack: StackNodeT, nodes: readonly AppNode[]): CardNode[] {
  const { byId, stackOf: owner } = stackIndex(nodes);
  return stack.data.members.flatMap((id) => {
    const member = byId.get(id);
    return member && owner.get(id) === stack.id ? [member as CardNode] : [];
  });
}

/** The card a stack shows: the one chosen while it is still a member, else the first. */
export function frontOf(
  stack: StackNodeT,
  nodes: readonly AppNode[],
  fronts: Readonly<Record<string, string>>,
): string | undefined {
  const members = membersOf(stack, nodes).map((m) => m.id);
  const chosen = fronts[stack.id];
  return chosen && members.includes(chosen) ? chosen : members[0];
}

/** `id`, or the card a stack shows when `id` is a stack: what a link or an edit aimed at it really means. */
export function cardFor(
  nodes: readonly AppNode[],
  fronts: Readonly<Record<string, string>>,
  id: string,
): string {
  const node = stackIndex(nodes).byId.get(id);
  return isStack(node) ? (frontOf(node, nodes, fronts) ?? id) : id;
}

/** Where a node is: a card in a stack is where its stack is. */
export function placedPosition(nodes: readonly AppNode[], node: AppNode): XYPosition {
  const stack = stackOf(nodes, node.id);
  return (stack && stackIndex(nodes).byId.get(stack)?.position) || node.position;
}

/** `ids` together with the cards of any stacks among them. */
export function withStackMembers(nodes: readonly AppNode[], ids: ReadonlySet<string>): Set<string> {
  const { byId } = stackIndex(nodes);
  const out = new Set(ids);
  for (const id of ids) {
    const node = byId.get(id);
    if (isStack(node)) for (const member of membersOf(node, nodes)) out.add(member.id);
  }
  return out;
}

/**
 * The canvas once `doomed` nodes are gone, stacks included: a removed stack takes its cards with it, and a stack
 * left with one card dissolves, that card taking the stack's place (none: the stack just goes).
 */
export function removeNodes(nodes: AppNode[], doomed: ReadonlySet<string>): AppNode[] {
  const gone = withStackMembers(nodes, doomed);
  const dissolved = new Map<string, XYPosition>(); // last card → where its stack was
  const next: AppNode[] = [];
  for (const node of nodes) {
    if (gone.has(node.id)) continue;
    if (node.type === 'stack') {
      const members = membersOf(node, nodes).filter((m) => !gone.has(m.id));
      if (members.length < 2) {
        if (members[0]) dissolved.set(members[0].id, node.position);
        continue;
      }
      if (members.length < node.data.members.length) {
        next.push({ ...node, data: { ...node.data, members: members.map((m) => m.id) } });
        continue;
      }
    }
    next.push(node);
  }
  return dissolved.size === 0
    ? next
    : next.map((n) => {
        const at = dissolved.get(n.id);
        return at ? ({ ...n, position: at } as AppNode) : n;
      });
}

/** The size a new stack takes: big enough for its largest card. */
export function stackSize(cards: AppNode[]): { width: number; height: number } {
  const rects = cards.map(nodeRect);
  return {
    width: Math.max(240, ...rects.map((r) => r.width)),
    height: Math.max(160, ...rects.map((r) => r.height)),
  };
}

/** Where cards leaving a stack go: in a row from `from`, left to right in stack order. */
export function rowFrom(from: XYPosition, cards: AppNode[]): Map<string, XYPosition> {
  const at = new Map<string, XYPosition>();
  let x = from.x;
  for (const card of cards) {
    at.set(card.id, { x, y: from.y });
    x += nodeRect(card).width + UNSTACK_GAP;
  }
  return at;
}

/**
 * A stack pinned open as masonry: its cards dealt into about as many columns as rows, left to right in stack
 * order, so a card's column never depends on how tall the cards before it are and editing one never moves another.
 */
export function masonryColumns<T>(cards: readonly T[]): T[][] {
  const columns = Math.ceil(Math.sqrt(cards.length));
  return Array.from({ length: columns }, (_, c) => cards.filter((_, i) => i % columns === c));
}

/** Space between fanned-out cards, and the most a fanned card is scaled to, in canvas units. */
export const FAN_GAP = 24;
export const FAN_SCALE = 0.62;

export interface FanSlot {
  /** Top-left of the card, relative to the stack's top-left. */
  x: number;
  y: number;
  scale: number;
}

/**
 * Where each of `count` cards of a stack sized `size` goes when the stack fans out: scaled down in a row centred
 * on the stack, shrunk further if the row would be wider than `maxWidth`.
 */
export function fanLayout(
  count: number,
  size: { width: number; height: number },
  maxWidth: number,
): FanSlot[] {
  const fit = (maxWidth - (count - 1) * FAN_GAP) / (count * size.width);
  const scale = Math.max(0.15, Math.min(FAN_SCALE, fit));
  const w = size.width * scale;
  const h = size.height * scale;
  const left = (size.width - (count * w + (count - 1) * FAN_GAP)) / 2;
  const top = (size.height - h) / 2;
  return Array.from({ length: count }, (_, i) => ({ x: left + i * (w + FAN_GAP), y: top, scale }));
}

/**
 * Slides a fanned row sideways (all slots alike) so it lies within [`left`, `right`] in canvas units, given the
 * stack's own left edge `x`: a stack near the edge of the screen fans out into view. A row wider than the room
 * is centred on it.
 */
export function keepInView(
  slots: FanSlot[],
  width: number,
  x: number,
  left: number,
  right: number,
): FanSlot[] {
  if (slots.length === 0) return slots;
  const last = slots[slots.length - 1];
  const from = x + slots[0].x;
  const to = x + last.x + width * last.scale;
  const shift =
    to - from > right - left
      ? (left + right) / 2 - (from + to) / 2
      : Math.max(left - from, Math.min(0, right - to));
  return shift === 0 ? slots : slots.map((s) => ({ ...s, x: s.x + shift }));
}

/** The slot of a fanned row nearest to `x` (relative to the stack), for dropping a card back into the row. */
export function nearestSlot(slots: FanSlot[], width: number, x: number): number {
  let best = 0;
  slots.forEach((s, i) => {
    const centre = (slot: FanSlot) => slot.x + (width * slot.scale) / 2;
    if (Math.abs(centre(s) - x) < Math.abs(centre(slots[best]) - x)) best = i;
  });
  return best;
}
