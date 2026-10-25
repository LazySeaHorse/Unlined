import { describe, expect, it } from 'vitest';
import type { AppNode } from '@/model/types';
import { createNode } from '@/nodes/factory';
import {
  cardFor,
  frontOf,
  membersOf,
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
