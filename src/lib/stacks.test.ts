import { describe, expect, it } from 'vitest';
import type { AppNode } from '@/model/types';
import { createNode } from '@/nodes/factory';
import {
  cardFor,
  FAN_GAP,
  FAN_SCALE,
  fanLayout,
  frontOf,
  keepInView,
  membersOf,
  nearestSlot,
  placedId,
  placedNodes,
  placedPosition,
  removeNodes,
  rowFrom,
  type StackNodeT,
  withStackMembers,
} from './stacks';

const card = (x = 0) => createNode('text', { x, y: 0 }, {}, { width: 100, height: 50 });
const stackOf = (members: AppNode[], at = { x: 500, y: 300 }) =>
  createNode('stack', at, { members: members.map((m) => m.id) }) as StackNodeT;

describe('stacks', () => {
  it('leaves the cards in a stack out of the placed nodes and finds them by stack', () => {
    const [a, b, c] = [card(), card(), card()];
    const s = stackOf([a, b]);
    const nodes = [a, b, c, s];
    expect(placedNodes(nodes).map((n) => n.id)).toEqual([c.id, s.id]);
    expect(placedId(nodes, a.id)).toBe(s.id);
    expect(placedId(nodes, c.id)).toBe(c.id);
    expect(placedPosition(nodes, b)).toEqual({ x: 500, y: 300 });
  });

  it('ignores members that are missing, listed twice, or not cards', () => {
    const [a, b] = [card(), card()];
    const section = createNode('section', { x: 0, y: 0 });
    const first = stackOf([a, b]);
    const second = createNode('stack', { x: 0, y: 0 }, { members: [a.id, section.id, 'gone'] }) as StackNodeT;
    const nodes = [a, b, section, first, second];
    expect(membersOf(first, nodes).map((m) => m.id)).toEqual([a.id, b.id]);
    expect(membersOf(second, nodes)).toEqual([]);
    expect(placedNodes(nodes)).toContain(section);
  });

  it('shows the chosen card while it is a member, else the first; a link to a stack means its card', () => {
    const [a, b] = [card(), card()];
    const s = stackOf([a, b]);
    const nodes = [a, b, s];
    expect(frontOf(s, nodes, {})).toBe(a.id);
    expect(frontOf(s, nodes, { [s.id]: b.id })).toBe(b.id);
    expect(frontOf(s, nodes, { [s.id]: 'gone' })).toBe(a.id);
    expect(cardFor(nodes, { [s.id]: b.id }, s.id)).toBe(b.id);
    expect(cardFor(nodes, {}, a.id)).toBe(a.id);
  });

  it('adds the cards of selected stacks', () => {
    const [a, b, c] = [card(), card(), card()];
    const s = stackOf([a, b]);
    expect([...withStackMembers([a, b, c, s], new Set([s.id, c.id]))].sort()).toEqual(
      [s.id, c.id, a.id, b.id].sort(),
    );
  });

  describe('removeNodes', () => {
    it('takes a stack’s cards with it', () => {
      const [a, b, c] = [card(), card(), card()];
      const s = stackOf([a, b]);
      expect(removeNodes([a, b, c, s], new Set([s.id])).map((n) => n.id)).toEqual([c.id]);
    });

    it('drops a removed card from its stack', () => {
      const [a, b, c] = [card(), card(), card()];
      const s = stackOf([a, b, c]);
      const next = removeNodes([a, b, c, s], new Set([b.id]));
      expect(next.find((n) => n.id === s.id)?.data).toEqual({ members: [a.id, c.id] });
    });

    it('dissolves a stack left with one card, which takes its place', () => {
      const [a, b] = [card(10), card(20)];
      const s = stackOf([a, b]);
      const next = removeNodes([a, b, s], new Set([a.id]));
      expect(next.map((n) => n.id)).toEqual([b.id]);
      expect(next[0].position).toEqual({ x: 500, y: 300 });
    });
  });

  it('lays cards out in a row with a gap', () => {
    const [a, b] = [card(), card()];
    expect([...rowFrom({ x: 0, y: 10 }, [a, b]).values()]).toEqual([
      { x: 0, y: 10 },
      { x: 148, y: 10 },
    ]);
  });
});

describe('fanLayout', () => {
  it('scales cards down into a row centred on the stack', () => {
    const slots = fanLayout(3, { width: 400, height: 300 }, 10_000);
    expect(slots.map((s) => s.scale)).toEqual([FAN_SCALE, FAN_SCALE, FAN_SCALE]);
    const w = 400 * FAN_SCALE;
    const row = 3 * w + 2 * FAN_GAP;
    expect(slots[0].x).toBeCloseTo((400 - row) / 2);
    expect(slots[2].x + w).toBeCloseTo((400 + row) / 2);
    expect(slots[1].y).toBeCloseTo((300 - 300 * FAN_SCALE) / 2);
  });

  it('shrinks the row to fit', () => {
    const slots = fanLayout(4, { width: 400, height: 300 }, 1000);
    const right = slots[3].x + 400 * slots[3].scale;
    expect(right - slots[0].x).toBeCloseTo(1000);
  });

  it('slides a row into view, or centres one too wide for it', () => {
    const slots = fanLayout(2, { width: 100, height: 100 }, 10_000);
    const w = 100 * FAN_SCALE;
    const moved = keepInView(slots, 100, 0, 0, 1000);
    expect(moved[0].x).toBeCloseTo(0);
    expect(keepInView(slots, 100, 500, 0, 1000)).toBe(slots);
    const narrow = keepInView(slots, 100, 0, 0, w);
    expect((narrow[0].x + narrow[1].x + w) / 2).toBeCloseTo(w / 2);
  });

  it('finds the slot nearest a point', () => {
    const slots = fanLayout(3, { width: 400, height: 300 }, 10_000);
    expect(nearestSlot(slots, 400, -1000)).toBe(0);
    expect(nearestSlot(slots, 400, 200)).toBe(1);
    expect(nearestSlot(slots, 400, 5000)).toBe(2);
  });
});
