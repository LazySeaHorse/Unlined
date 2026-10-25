import { beforeEach, describe, expect, it } from 'vitest';
import { membersOf, type StackNodeT } from '@/lib/stacks';
import { DEFAULT_VIEWPORT } from '@/model/types';
import { createNode } from '@/nodes/factory';
import { getCanvasContent, undo, useCanvasStore } from './canvasStore';
import { cycleFront, moveCard, stackOnto, stackSelection, takeOut, unstack } from './stacks';

const state = () => useCanvasStore.getState();
const card = (x: number, y = 0) => createNode('text', { x, y }, {}, { width: 100, height: 50 });
const stack = (id: string) => state().nodes.find((n) => n.id === id) as StackNodeT;
const cards = (id: string) => membersOf(stack(id), state().nodes).map((m) => m.id);

beforeEach(() => state().load({ nodes: [], viewport: DEFAULT_VIEWPORT }));

describe('stacks in the store', () => {
  it('stacks a card onto another where that one stands, showing the one dropped, as one undo step', () => {
    const [a, b] = [card(0), card(300)];
    state().load({ nodes: [a, b], viewport: DEFAULT_VIEWPORT });
    const id = stackOnto(a.id, [b.id]) as string;
    expect(stack(id).position).toEqual(a.position);
    expect(cards(id)).toEqual([a.id, b.id]);
    expect(state().fronts[id]).toBe(b.id);
    expect(
      state()
        .nodes.filter((n) => n.selected)
        .map((n) => n.id),
    ).toEqual([id]);
    undo();
    expect(state().nodes.map((n) => n.id)).toEqual([a.id, b.id]);
  });

  it('adds to an existing stack and absorbs stacks dropped on it', () => {
    const [a, b, c, d] = [card(0), card(100), card(200), card(300)];
    state().load({ nodes: [a, b, c, d], viewport: DEFAULT_VIEWPORT });
    const first = stackOnto(a.id, [b.id]) as string;
    const second = stackOnto(c.id, [d.id]) as string;
    expect(stackOnto(first, [second])).toBe(first);
    expect(cards(first)).toEqual([a.id, b.id, c.id, d.id]);
    expect(state().nodes.some((n) => n.id === second)).toBe(false);
  });

  it('stacks the selection where its top-left node stands, showing that one', () => {
    const [a, b] = [card(300, 0), card(0, 200)];
    state().load({ nodes: [a, b], viewport: DEFAULT_VIEWPORT });
    state().setSelection(() => true);
    const id = stackSelection() as string;
    expect(stack(id).position).toEqual(a.position);
    expect(state().fronts[id]).toBe(a.id);
  });

  it('never selects the cards inside a stack', () => {
    const [a, b] = [card(0), card(100)];
    state().load({ nodes: [a, b], viewport: DEFAULT_VIEWPORT });
    const id = stackOnto(a.id, [b.id]) as string;
    state().setSelection(() => true);
    expect(
      state()
        .nodes.filter((n) => n.selected)
        .map((n) => n.id),
    ).toEqual([id]);
  });

  it('cycles the card shown without an undo step, and saves it', () => {
    const [a, b, c] = [card(0), card(100), card(200)];
    state().load({ nodes: [a, b, c], viewport: DEFAULT_VIEWPORT });
    const id = stackOnto(a.id, [b.id, c.id], a.id) as string;
    const past = useCanvasStore.temporal.getState().pastStates.length;
    cycleFront(id, 1);
    expect(state().fronts[id]).toBe(b.id);
    cycleFront(id, -1);
    cycleFront(id, -1);
    expect(state().fronts[id]).toBe(c.id);
    expect(useCanvasStore.temporal.getState().pastStates.length).toBe(past);
    expect(getCanvasContent().fronts).toEqual({ [id]: c.id });
  });

  it('takes a card out beside the stack, and dissolves a stack of two', () => {
    const [a, b, c] = [card(0), card(100), card(200)];
    state().load({ nodes: [a, b, c], viewport: DEFAULT_VIEWPORT });
    const id = stackOnto(a.id, [b.id, c.id]) as string;
    takeOut(id, c.id);
    expect(cards(id)).toEqual([a.id, b.id]);
    const out = state().nodes.find((n) => n.id === c.id);
    expect(out?.position.x).toBeGreaterThan(stack(id).position.x);
    takeOut(id, b.id);
    expect(state().nodes.some((n) => n.id === id)).toBe(false);
  });

  it('unstacks every card into a row from where the stack stood', () => {
    const [a, b] = [card(0, 40), card(500)];
    state().load({ nodes: [a, b], viewport: DEFAULT_VIEWPORT });
    const id = stackOnto(a.id, [b.id]) as string;
    unstack(id);
    expect(state().nodes.map((n) => [n.id, n.position.y])).toEqual([
      [a.id, 40],
      [b.id, 40],
    ]);
  });

  it('reorders cards', () => {
    const [a, b, c] = [card(0), card(100), card(200)];
    state().load({ nodes: [a, b, c], viewport: DEFAULT_VIEWPORT });
    const id = stackOnto(a.id, [b.id, c.id]) as string;
    moveCard(id, c.id, 0);
    expect(cards(id)).toEqual([c.id, a.id, b.id]);
  });

  it('deleting a stack deletes its cards and their links; duplicating copies them', () => {
    const [a, b, c] = [card(0), card(100), card(200)];
    state().load({ nodes: [a, b, c], viewport: DEFAULT_VIEWPORT });
    state().linkNodes(a.id, c.id);
    const id = stackOnto(a.id, [b.id]) as string;
    state().duplicateSelected();
    const copy = state().nodes.find((n) => n.type === 'stack' && n.id !== id) as StackNodeT;
    expect(membersOf(copy, state().nodes)).toHaveLength(2);
    expect(cards(copy.id)).not.toContain(a.id);
    state().deleteNodes([id]);
    expect(state().nodes.some((n) => n.id === a.id || n.id === b.id)).toBe(false);
    expect(state().edges).toHaveLength(0);
  });

  it('links to a stack go to the card it shows', () => {
    const [a, b, c] = [card(0), card(100), card(200)];
    state().load({ nodes: [a, b, c], viewport: DEFAULT_VIEWPORT });
    const id = stackOnto(a.id, [b.id]) as string;
    state().linkNodes(c.id, id);
    expect(state().edges[0]).toMatchObject({ source: c.id, target: b.id });
  });
});
