import { describe, expect, it } from 'vitest';
import { SECTION_Z } from '@/lib/sections';
import type { AppEdge } from '@/model/types';
import { createNode } from '@/nodes/factory';
import { projectEdges, projectNodes, type View } from './project';

const view = (over: Partial<View> = {}): View => ({
  matches: null,
  query: '',
  marks: new Map(),
  dropTarget: null,
  fanned: null,
  ...over,
});

describe('projectNodes', () => {
  it('passes untouched nodes through as the same objects', () => {
    const nodes = [createNode('math', { x: 0, y: 0 })];
    expect(projectNodes(nodes, view())[0]).toBe(nodes[0]);
  });

  it('dims search misses and keeps their marks', () => {
    const [a, b] = [createNode('math', { x: 0, y: 0 }), createNode('math', { x: 0, y: 0 })];
    const out = projectNodes(
      [a, b],
      view({ matches: new Set([a.id]), marks: new Map([[b.id, 'ai-touched']]) }),
    );
    expect(out.map((n) => n.className)).toEqual([undefined, 'search-miss ai-touched']);
  });

  it('puts sections behind everything with only their tab taking the pointer', () => {
    const section = createNode('section', { x: 0, y: 0 });
    expect(projectNodes([section], view())[0]).toMatchObject({
      zIndex: SECTION_Z,
      dragHandle: '.section-handle',
      style: { pointerEvents: 'none' },
    });
  });
});

describe('projectEdges', () => {
  it('dims links unless an end or the label matches', () => {
    const [a, b, c] = [0, 1, 2].map((x) => createNode('math', { x, y: 0 }));
    const edges: AppEdge[] = [
      { id: 'ab', source: a.id, target: b.id },
      { id: 'bc', source: b.id, target: c.id, data: { label: 'Force' } },
      { id: 'cb', source: c.id, target: b.id },
    ];
    const out = projectEdges(edges, [a, b, c], view({ matches: new Set([a.id]), query: 'force' }));
    expect(out.map((e) => e.className)).toEqual([undefined, undefined, 'search-miss']);
  });
});

describe('stacks', () => {
  const card = () => createNode('text', { x: 0, y: 0 });

  it('draws a stack in place of its cards, dimmed only when no card matches', () => {
    const [a, b, c] = [card(), card(), card()];
    const stack = createNode('stack', { x: 0, y: 0 }, { members: [a.id, b.id] });
    const nodes = [a, b, c, stack];
    expect(projectNodes(nodes, view()).map((n) => n.id)).toEqual([c.id, stack.id]);
    const searched = projectNodes(nodes, view({ matches: new Set([b.id]) }));
    expect(searched.map((n) => n.className)).toEqual(['search-miss', undefined]);
  });

  it('lets a pinned stack take the size of its cards, keeping its own for the tabs', () => {
    const [a, b] = [card(), card()];
    const tabbed = createNode(
      'stack',
      { x: 0, y: 0 },
      { members: [a.id, b.id] },
      { width: 400, height: 300 },
    );
    const pinned = { ...tabbed, data: { ...tabbed.data, layout: 'row' as const } };
    expect(projectNodes([a, b, tabbed], view())[0]).toBe(tabbed);
    const [drawn] = projectNodes([a, b, pinned], view());
    expect([drawn.width, drawn.height]).toEqual([undefined, undefined]);
    expect(pinned.width).toBe(400);
  });

  it('draws links to a card to its stack, and none between cards of one stack', () => {
    const [a, b, c] = [card(), card(), card()];
    const stack = createNode('stack', { x: 0, y: 0 }, { members: [a.id, b.id] });
    const edges: AppEdge[] = [
      { id: 'ca', source: c.id, target: a.id },
      { id: 'ab', source: a.id, target: b.id },
    ];
    expect(projectEdges(edges, [a, b, c, stack], view())).toEqual([
      { id: 'ca', source: c.id, target: stack.id },
    ]);
  });
});

it('shows the marks of a card on its stack', () => {
  const [a, b] = [createNode('text', { x: 0, y: 0 }), createNode('text', { x: 0, y: 0 })];
  const stack = createNode('stack', { x: 0, y: 0 }, { members: [a.id, b.id] });
  const out = projectNodes([a, b, stack], view({ marks: new Map([[b.id, 'ai-touched']]) }));
  expect(out[0].className).toBe('ai-touched');
});
