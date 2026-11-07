import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VIEWPORT } from '@/model/types';
import { createNode } from '@/nodes/factory';
import * as repo from '@/persistence/canvasRepo';
import { db } from '@/persistence/db';
import { exportCanvases, exportNodes } from '@/persistence/io';
import { useCanvasStore } from './canvasStore';
import {
  exportAllCanvases,
  exportCurrentCanvas,
  exportSelectedNodes,
  flushSave,
  importFile,
  initWorkspace,
  newCanvas,
  openCanvas,
  removeCanvas,
  useWorkspace,
} from './workspace';

const current = () => useWorkspace.getState().currentId as string;
const canvas = () => useCanvasStore.getState();

beforeEach(async () => {
  await db.canvases.clear();
  await db.contents.clear();
  canvas().load({ nodes: [], viewport: DEFAULT_VIEWPORT });
  useWorkspace.setState({ currentId: null });
});

describe('workspace', () => {
  it('init creates a first canvas and is idempotent', async () => {
    await Promise.all([initWorkspace(), initWorkspace()]);
    expect(await repo.listCanvases()).toHaveLength(1);
    expect(current()).toBeTruthy();
  });

  it('persists edits of the open canvas', async () => {
    await newCanvas('A');
    canvas().addNodes([createNode('math', { x: 0, y: 0 }, { latex: 'x' })]);
    await flushSave();
    expect((await repo.loadContent(current())).nodes).toHaveLength(1);
  });

  it('saves the old canvas when switching', async () => {
    await newCanvas('A');
    const a = current();
    canvas().addNodes([createNode('math', { x: 0, y: 0 })]);
    await newCanvas('B');
    expect(canvas().nodes).toHaveLength(0);
    await openCanvas(a);
    expect(canvas().nodes).toHaveLength(1);
  });

  it('opening the canvas that is already open keeps its undo history', async () => {
    await newCanvas('A');
    canvas().addNodes([createNode('math', { x: 0, y: 0 })]);
    const steps = useCanvasStore.temporal.getState().pastStates.length;
    expect(steps).toBeGreaterThan(0);
    await openCanvas(current());
    expect(useCanvasStore.temporal.getState().pastStates).toHaveLength(steps);
    expect(canvas().nodes).toHaveLength(1);
  });

  it('stays on a canvas that cannot be saved, so its edits are not lost', async () => {
    await newCanvas('A');
    const a = current();
    await newCanvas('B');
    canvas().addNodes([createNode('math', { x: 0, y: 0 })]);
    const failing = vi.spyOn(repo, 'saveContent').mockRejectedValueOnce(new Error('quota'));
    await openCanvas(a);
    expect(current()).not.toBe(a);
    expect(canvas().nodes).toHaveLength(1);
    failing.mockRestore();
    await openCanvas(a);
    expect(current()).toBe(a);
  });

  it('removing the open canvas opens another, or a fresh one', async () => {
    await newCanvas('A');
    const a = current();
    await newCanvas('B');
    await removeCanvas(current());
    expect(current()).toBe(a);
    await removeCanvas(a);
    const remaining = await repo.listCanvases();
    expect(remaining).toHaveLength(1);
    expect(current()).toBe(remaining[0].id);
    expect(await db.contents.count()).toBe(1);
  });

  it('imports loose nodes at a position with new ids', async () => {
    await newCanvas('A');
    const node = createNode('math', { x: 100, y: 200 });
    expect(await importFile(exportNodes([node]), { x: 5, y: 5 })).toBe('Imported 1 node');
    expect(canvas().nodes[0].position).toEqual({ x: 5, y: 5 });
    expect(canvas().nodes[0].id).not.toBe(node.id);
  });

  it('imports canvases as new canvases and opens the first', async () => {
    await newCanvas('Existing');
    const file = exportCanvases([
      { name: 'X', nodes: [createNode('text', { x: 0, y: 0 })], viewport: DEFAULT_VIEWPORT },
      { name: 'Y', nodes: [], viewport: DEFAULT_VIEWPORT },
    ]);
    expect(await importFile(file, { x: 0, y: 0 })).toBe('Imported 2 canvases');
    expect((await repo.listCanvases()).map((c) => c.name).sort()).toEqual(['Existing', 'X', 'Y']);
    expect((await repo.getCanvas(current()))?.name).toBe('X');
    expect(canvas().nodes).toHaveLength(1);
  });

  it('exports the current canvas including unsaved edits, and all canvases', async () => {
    await newCanvas('A');
    canvas().addNodes([createNode('math', { x: 0, y: 0 })]);
    const single = await exportCurrentCanvas();
    expect(single.kind === 'canvases' && single.canvases[0]).toMatchObject({
      name: 'A',
      nodes: [{ type: 'math' }],
    });
    await newCanvas('B');
    const all = await exportAllCanvases();
    expect(all.kind === 'canvases' && all.canvases.map((c) => c.name).sort()).toEqual(['A', 'B']);
  });

  it('saves a change that only touches links', async () => {
    await newCanvas('A');
    const [a, b] = [createNode('math', { x: 0, y: 0 }), createNode('math', { x: 200, y: 0 })];
    canvas().addNodes([a, b]);
    await flushSave();
    canvas().linkNodes(a.id, b.id, { label: 'k' });
    await flushSave();
    expect((await repo.loadContent(current())).edges).toEqual([
      { id: expect.any(String), source: a.id, target: b.id, data: { label: 'k' } },
    ]);
  });

  it('imports links with loose nodes under new ids', async () => {
    await newCanvas('A');
    const [a, b] = [createNode('math', { x: 0, y: 0 }), createNode('math', { x: 200, y: 0 })];
    await importFile(exportNodes([a, b], [{ id: 'l', source: a.id, target: b.id }]), { x: 0, y: 0 });
    expect(canvas().edges).toHaveLength(1);
    const ids = canvas().nodes.map((n) => n.id);
    expect(ids).not.toContain(a.id);
    expect(ids).toContain(canvas().edges[0].source);
  });

  it('drops dangling links when importing canvases', async () => {
    await newCanvas('Existing');
    const [a, b] = [createNode('math', { x: 0, y: 0 }), createNode('math', { x: 200, y: 0 })];
    const file = exportCanvases([
      {
        name: 'X',
        nodes: [a, b],
        viewport: DEFAULT_VIEWPORT,
        edges: [
          { id: 'ok', source: a.id, target: b.id },
          { id: 'bad', source: a.id, target: 'gone' },
        ],
      },
    ]);
    await importFile(file, { x: 0, y: 0 });
    expect(canvas().edges.map((e) => e.id)).toEqual(['ok']);
  });

  it('exports only the links among the selected nodes', () => {
    const [a, b, c] = [0, 1, 2].map((x) => createNode('math', { x: x * 200, y: 0 }));
    canvas().load({
      nodes: [{ ...a, selected: true }, { ...b, selected: true }, c],
      viewport: DEFAULT_VIEWPORT,
      edges: [
        { id: 'ab', source: a.id, target: b.id },
        { id: 'bc', source: b.id, target: c.id },
      ],
    });
    const file = exportSelectedNodes();
    expect(file.kind === 'nodes' && file.edges?.map((e) => e.id)).toEqual(['ab']);
  });
});
