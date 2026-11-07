import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VIEWPORT } from '@/model/types';
import { createNode } from '@/nodes/factory';
import { exportCanvases } from '@/persistence/io';
import { undo, useCanvasStore } from '@/store/canvasStore';
import { pasteNodes } from '@/store/workspace';
import { parseClipboard, pasteAt, serializeSelection } from './clipboard';

const state = () => useCanvasStore.getState();
const at = (x: number, y: number) => ({ x, y });

beforeEach(() => state().load({ nodes: [], viewport: DEFAULT_VIEWPORT }));

describe('clipboard', () => {
  it('round-trips the selected nodes', () => {
    const a = createNode('math', at(10, 20), { latex: 'x^2' });
    const b = createNode('text', at(500, 20));
    const payload = serializeSelection([{ ...a, selected: true }, b]);
    const pasted = payload ? parseClipboard(payload) : null;
    expect(pasted?.nodes).toHaveLength(1);
    expect(pasted?.nodes[0]).toMatchObject({ id: a.id, type: 'math', data: { latex: 'x^2' } });
  });

  it('has nothing to copy without a selection', () => {
    expect(serializeSelection([createNode('math', at(0, 0))])).toBeNull();
  });

  it('brings the nodes inside a selected section', () => {
    const section = createNode('section', at(0, 0), {}, { width: 400, height: 300 });
    const inside = createNode('math', at(50, 80));
    const outside = createNode('math', at(2000, 0));
    const payload = serializeSelection([{ ...section, selected: true }, inside, outside]);
    expect(
      parseClipboard(payload ?? '')
        ?.nodes.map((n) => n.id)
        .sort(),
    ).toEqual([section.id, inside.id].sort());
  });

  it('carries the links among the copied nodes and leaves out the rest', () => {
    const [a, b, c] = [0, 1, 2].map((x) => createNode('math', at(x * 100, 0)));
    const edges = [
      { id: 'ab', source: a.id, target: b.id, data: { label: 'k' } },
      { id: 'bc', source: b.id, target: c.id },
    ];
    const payload = serializeSelection([{ ...a, selected: true }, { ...b, selected: true }, c], edges);
    expect(parseClipboard(payload ?? '')?.edges).toEqual(edges.slice(0, 1));
  });

  it('still reads clipboards from before links existed', () => {
    const old = JSON.stringify({
      app: 'unlined',
      version: 1,
      kind: 'nodes',
      nodes: [createNode('math', at(0, 0))],
    });
    expect(parseClipboard(old)?.edges).toEqual([]);
  });

  it('ignores anything that is not copied nodes', () => {
    expect(parseClipboard('hello')).toBeNull();
    expect(parseClipboard('{"a":1}')).toBeNull();
    expect(parseClipboard(JSON.stringify(exportCanvases([])))).toBeNull();
  });
});

describe('pasteNodes', () => {
  it('places copies with fresh ids at the target, selected, as one undo step', () => {
    const a = createNode('math', at(100, 100));
    const b = createNode('math', at(300, 160));
    state().load({ nodes: [a], viewport: DEFAULT_VIEWPORT });
    pasteNodes([a, b], at(1000, 500));
    const { nodes } = state();
    expect(nodes).toHaveLength(3);
    expect(nodes.slice(1).map((n) => n.position)).toEqual([at(1000, 500), at(1200, 560)]);
    expect(nodes.map((n) => n.id)).not.toContain(b.id);
    expect(nodes.filter((n) => n.selected)).toHaveLength(2);
    undo();
    expect(state().nodes).toHaveLength(1);
  });

  it('remaps pasted links to the copies, with fresh ids each time', () => {
    const a = createNode('math', at(0, 0));
    const b = createNode('math', at(200, 0));
    const edges = [{ id: 'ab', source: a.id, target: b.id, data: { head: 'dot' as const } }];
    pasteNodes([a, b], at(0, 500), edges);
    pasteNodes([a, b], at(0, 900), edges);
    const links = state().edges;
    expect(links).toHaveLength(2);
    expect(new Set(links.map((e) => e.id)).size).toBe(2);
    for (const e of links) {
      expect([a.id, b.id]).not.toContain(e.source);
      expect(state().nodes.some((n) => n.id === e.source)).toBe(true);
      expect(e.data).toEqual({ head: 'dot' });
    }
    undo();
    expect(state().edges).toHaveLength(1);
  });

  it('drops self links from a crafted clipboard', () => {
    const a = createNode('math', at(0, 0));
    const b = createNode('math', at(200, 0));
    const text = JSON.stringify({
      app: 'unlined',
      version: 2,
      kind: 'nodes',
      nodes: [a, b],
      edges: [
        { id: 'self', source: a.id, target: a.id },
        { id: 'ok', source: a.id, target: b.id },
      ],
    });
    const pasted = parseClipboard(text);
    pasteNodes(pasted?.nodes ?? [], at(0, 400), pasted?.edges);
    expect(state().edges).toHaveLength(1);
    expect(state().edges[0].source).not.toBe(state().edges[0].target);
  });
});

describe('pasteAt', () => {
  const clipboard = (read: () => Promise<string>) =>
    vi.stubGlobal('navigator', { clipboard: { readText: read } });
  const error = vi.spyOn(toast, 'error').mockImplementation(() => '');

  beforeEach(() => error.mockClear());
  afterEach(() => vi.unstubAllGlobals());

  it('says so when the clipboard is empty, and when it holds something that is not nodes', async () => {
    clipboard(async () => '  ');
    await pasteAt(at(0, 0));
    clipboard(async () => 'just some words');
    await pasteAt(at(0, 0));
    expect(error.mock.calls.map(([message]) => message)).toEqual([
      'The clipboard is empty',
      'The clipboard has no Unlined nodes to paste',
    ]);
    expect(state().nodes).toHaveLength(0);
  });

  it('points to the paste key when the browser will not let the page read the clipboard', async () => {
    clipboard(async () => {
      throw new Error('denied');
    });
    await pasteAt(at(0, 0));
    expect(error.mock.calls[0][0]).toMatch(/Ctrl\+V/);
  });

  it('pastes nodes from the clipboard', async () => {
    const node = createNode('math', at(0, 0), { latex: 'x' });
    const payload = serializeSelection([{ ...node, selected: true }]) ?? '';
    clipboard(async () => payload);
    await pasteAt(at(300, 300));
    expect(state().nodes).toHaveLength(1);
    expect(error).not.toHaveBeenCalled();
  });
});
