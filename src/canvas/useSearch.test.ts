import { describe, expect, it } from 'vitest';
import type { AppNode } from '@/model/types';
import { createNode } from '@/nodes/factory';
import { foundCount } from './useSearch';

describe('foundCount', () => {
  it('counts a stack once however many of its cards match', () => {
    const [a, b, c] = [0, 1, 2].map((x) => createNode('text', { x: x * 100, y: 0 }));
    const stack = createNode('stack', { x: 0, y: 200 }, { members: [a.id, b.id] }) as AppNode;
    const nodes = [a, b, c, stack];
    expect(foundCount(nodes, new Set([a.id, b.id, c.id]))).toBe(2);
    expect(foundCount(nodes, new Set([a.id]))).toBe(1);
    expect(foundCount(nodes, new Set())).toBe(0);
  });
});
