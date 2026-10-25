import { describe, expect, it } from 'vitest';
import { SECTION_Z } from '@/lib/sections';
import type { AppEdge } from '@/model/types';
import { createNode } from '@/nodes/factory';
import { projectEdges, projectNodes, type View } from './project';

const view = (over: Partial<View> = {}): View => ({ matches: null, query: '', marks: new Map(), ...over });

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
