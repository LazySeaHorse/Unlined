import type { XYPosition } from '@xyflow/react';
import { nodeRect } from '@/lib/nodeRect';
import {
  frontOf,
  isStack,
  membersOf,
  placedNodes,
  rowFrom,
  stackIndex,
  stackSize,
  UNSTACK_GAP,
} from '@/lib/stacks';
import { type AppNode, isCard, type StackLayout } from '@/model/types';
import { glide } from '@/motion/glide';
import { createNode } from '@/nodes/factory';
import { asUndoStep, useCanvasStore } from './canvasStore';
import { useUiStore } from './uiStore';

/** Every change here but switching cards is one undo step. */

const state = () => useCanvasStore.getState();

/** Writes the nodes as one undo step and selects only `select`. */
function commit(nodes: AppNode[], select?: string) {
  asUndoStep(() =>
    useCanvasStore.setState({
      nodes: select
        ? nodes.map((n) => (!!n.selected === (n.id === select) ? n : { ...n, selected: !n.selected }))
        : nodes,
    }),
  );
}

/**
 * Stacks the cards `ids` onto `targetId`: onto its stack when it is one, else into a new stack where it stands.
 * Stacks among `ids` give up their cards and go. `front` is the card shown afterwards (default: the first of
 * `ids`). Returns the stack's id, or null when there was nothing to stack.
 */
export function stackOnto(targetId: string, ids: string[], front?: string): string | null {
  const { nodes } = state();
  const { byId, stackOf } = stackIndex(nodes);
  const target = byId.get(targetId);
  if (!target || stackOf.has(targetId) || !(isCard(target) || isStack(target))) return null;

  const absorbed = new Set<string>();
  const incoming: string[] = [];
  for (const id of ids) {
    const node = byId.get(id);
    if (!node || id === targetId || stackOf.has(id)) continue;
    if (isStack(node)) {
      absorbed.add(id);
      incoming.push(...membersOf(node, nodes).map((m) => m.id));
    } else if (isCard(node)) incoming.push(id);
  }
  if (incoming.length === 0) return null;

  let stackId = targetId;
  let next: AppNode[];
  if (isStack(target)) {
    const members = [...membersOf(target, nodes).map((m) => m.id), ...incoming];
    next = nodes.flatMap((n) =>
      absorbed.has(n.id) ? [] : n.id === targetId ? [{ ...target, data: { ...target.data, members } }] : [n],
    );
  } else {
    const cards = [target, ...incoming.map((id) => byId.get(id) as AppNode)];
    const stack = createNode('stack', target.position, { members: cards.map((c) => c.id) }, stackSize(cards));
    stackId = stack.id;
    // The stack takes the target's place in the drawing order.
    next = nodes.flatMap((n) => (absorbed.has(n.id) ? [] : n.id === targetId ? [stack, n] : [n]));
  }
  commit(next, stackId);
  state().setFront(stackId, front ?? incoming[0]);
  return stackId;
}

/** Stacks the selected cards (and stacks) where the top-left one stands, showing that one. */
export function stackSelection(): string | null {
  const picked = placedNodes(state().nodes).filter((n) => n.selected && (isCard(n) || isStack(n)));
  if (picked.length < 2) return null;
  const [anchor, ...rest] = [...picked].sort(
    (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
  );
  const front = isStack(anchor) ? frontOf(anchor, state().nodes, state().fronts) : anchor.id;
  return stackOnto(
    anchor.id,
    rest.map((n) => n.id),
    front,
  );
}

/** Lays `cards` out from `from` and removes `stackId` (or leaves it with `keep`), gliding the cards out of it. */
function release(stackId: string, cards: AppNode[], to: Map<string, XYPosition>, keep?: string[]) {
  const { nodes } = state();
  const stack = stackIndex(nodes).byId.get(stackId);
  if (!isStack(stack)) return;
  const next = nodes.flatMap((n): AppNode[] => {
    if (n.id === stackId) return keep ? [{ ...stack, data: { ...stack.data, members: keep } }] : [];
    const at = to.get(n.id);
    return at ? [{ ...n, position: at } as AppNode] : [n];
  });
  const from = new Map(cards.map((c) => [c.id, stack.position]));
  glide(() => commit(next), from);
}

/**
 * Takes card `memberId` out of its stack, to `at` or else beside it. A stack left with one card dissolves into it.
 */
export function takeOut(stackId: string, memberId: string, at?: XYPosition): void {
  const { nodes } = state();
  const stack = stackIndex(nodes).byId.get(stackId);
  if (!isStack(stack)) return;
  const members = membersOf(stack, nodes);
  const card = members.find((m) => m.id === memberId);
  if (!card) return;
  const rest = members.filter((m) => m.id !== memberId);
  if (rest.length < 2) {
    unstack(stackId);
    return;
  }
  const box = nodeRect(stack);
  const to = new Map([[memberId, at ?? { x: box.x + box.width + UNSTACK_GAP, y: box.y }]]);
  release(
    stackId,
    [card],
    to,
    rest.map((m) => m.id),
  );
}

/** Lays every card of the stack out in a row from where it stood, and removes the stack. */
export function unstack(stackId: string): void {
  const { nodes } = state();
  const stack = stackIndex(nodes).byId.get(stackId);
  if (!isStack(stack)) return;
  const members = membersOf(stack, nodes);
  release(stackId, members, rowFrom(stack.position, members));
}

/** Shows the next card (`step` 1) or the previous one (-1), going round. */
export function cycleFront(stackId: string, step: 1 | -1): void {
  const { nodes, fronts, setFront } = state();
  const stack = stackIndex(nodes).byId.get(stackId);
  if (!isStack(stack)) return;
  const ids = membersOf(stack, nodes).map((m) => m.id);
  if (ids.length < 2) return;
  const at = ids.indexOf(frontOf(stack, nodes, fronts) ?? ids[0]);
  setFront(stackId, ids[(at + step + ids.length) % ids.length]);
}

/** Moves card `memberId` to position `index` among its stack's cards. */
export function moveCard(stackId: string, memberId: string, index: number): void {
  const { nodes } = state();
  const stack = stackIndex(nodes).byId.get(stackId);
  if (!isStack(stack)) return;
  const ids = membersOf(stack, nodes).map((m) => m.id);
  const from = ids.indexOf(memberId);
  const to = Math.max(0, Math.min(ids.length - 1, index));
  if (from < 0 || from === to) return;
  ids.splice(from, 1);
  ids.splice(to, 0, memberId);
  commit(nodes.map((n) => (n.id === stackId ? { ...stack, data: { ...stack.data, members: ids } } : n)));
}

/** Pins the stack open with its cards laid out in `layout`, or back behind tabs when undefined. */
export function setStackLayout(stackId: string, layout: StackLayout | undefined): void {
  const { nodes } = state();
  const stack = stackIndex(nodes).byId.get(stackId);
  if (!isStack(stack) || stack.data.layout === layout) return;
  const { members } = stack.data;
  if (useUiStore.getState().fanned === stackId) useUiStore.getState().closeFan();
  commit(
    nodes.map((n) => (n.id === stackId ? { ...stack, data: layout ? { members, layout } : { members } } : n)),
  );
}

/** The ids of a stack's cards, in order. */
export function stackCardIds(stackId: string): string[] {
  const { nodes } = state();
  const stack = stackIndex(nodes).byId.get(stackId);
  return isStack(stack) ? membersOf(stack, nodes).map((m) => m.id) : [];
}

/** Spreads out the cards of stack `stackId` to pick from, highlighting the one shown. A pinned stack shows them all. */
export function openFan(stackId: string): void {
  const { nodes, fronts } = state();
  const stack = stackIndex(nodes).byId.get(stackId);
  if (!isStack(stack) || stack.data.layout) return;
  const ids = membersOf(stack, nodes).map((m) => m.id);
  useUiStore.getState().openFan(stackId, Math.max(0, ids.indexOf(frontOf(stack, nodes, fronts) ?? '')));
}

/** Shows card `memberId` of the fanned stack and folds the fan up. */
export function pickFromFan(stackId: string, memberId: string): void {
  state().setFront(stackId, memberId);
  useUiStore.getState().closeFan();
}

/** The one selected stack, if exactly one node is selected and it is a stack. */
export function selectedStack(): string | null {
  const selected = state().nodes.filter((n) => n.selected);
  return selected.length === 1 && isStack(selected[0]) ? selected[0].id : null;
}
