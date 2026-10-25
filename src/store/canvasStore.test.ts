import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VIEWPORT } from '@/model/types';
import { createNode } from '@/nodes/factory';
import { getCanvasContent, redo, undo, useCanvasStore } from './canvasStore';
import { useUiStore } from './uiStore';

const state = () => useCanvasStore.getState();

beforeEach(() => {
  vi.useFakeTimers();
  state().load({ nodes: [], viewport: DEFAULT_VIEWPORT });
});
afterEach(() => vi.useRealTimers());

/** Lets the history debounce window elapse so the next edit becomes its own undo step. */
const settle = () => vi.advanceTimersByTime(1000);

describe('canvasStore', () => {
  it('adds nodes selected and deselects the rest', () => {
    const a = createNode('math', { x: 0, y: 0 });
    const b = createNode('math', { x: 0, y: 0 });
    state().addNodes([a]);
    state().addNodes([b]);
    expect(state().nodes.map((n) => [n.id, n.selected])).toEqual([
      [a.id, false],
      [b.id, true],
    ]);
  });

  it('updates node data immutably', () => {
    const node = createNode('math', { x: 0, y: 0 });
    state().addNodes([node]);
    const before = state().nodes[0];
    state().updateNodeData<'math'>(node.id, { latex: 'y' });
    expect(state().nodes[0].data).toEqual({ latex: 'y' });
    expect(before.data).toEqual({ latex: '' });
  });

  it('duplicates the selection with an offset', () => {
    state().addNodes([createNode('text', { x: 10, y: 10 })]);
    state().duplicateSelected();
    expect(state().nodes).toHaveLength(2);
    expect(state().nodes[1].position).toEqual({ x: 40, y: 40 });
    expect(state().nodes[1].selected).toBe(true);
    expect(state().nodes[0].selected).toBe(false);
  });

  it('undoes and redoes content changes', () => {
    const node = createNode('math', { x: 0, y: 0 });
    state().addNodes([node]);
    settle();
    state().updateNodeData<'math'>(node.id, { latex: 'a' });
    settle();
    undo();
    expect(state().nodes[0].data).toEqual({ latex: '' });
    undo();
    expect(state().nodes).toHaveLength(0);
    redo();
    redo();
    expect(state().nodes[0].data).toEqual({ latex: 'a' });
  });

  it('coalesces rapid edits into one undo step', () => {
    const node = createNode('math', { x: 0, y: 0 });
    state().addNodes([node]);
    settle();
    for (const latex of ['a', 'ab', 'abc']) state().updateNodeData<'math'>(node.id, { latex });
    settle();
    undo();
    expect(state().nodes[0].data).toEqual({ latex: '' });
  });

  it('keeps rapid edits to different nodes, or a new node after typing, as separate steps', () => {
    const [a, b] = [0, 1].map((x) => createNode('math', { x, y: 0 }));
    state().load({ nodes: [a, b], viewport: DEFAULT_VIEWPORT });
    state().updateNodeData<'math'>(a.id, { latex: 'a' });
    state().updateNodeData<'math'>(b.id, { latex: 'b' });
    state().addNodes([createNode('text', { x: 0, y: 0 })]);
    undo();
    expect(state().nodes).toHaveLength(2);
    undo();
    expect(state().nodes.map((n) => n.data)).toEqual([{ latex: 'a' }, { latex: '' }]);
    undo();
    expect(state().nodes.map((n) => n.data)).toEqual([{ latex: '' }, { latex: '' }]);
  });

  it('records a drag as one step, and a pause in typing as the end of one', () => {
    const node = createNode('math', { x: 0, y: 0 });
    state().load({ nodes: [node], viewport: DEFAULT_VIEWPORT });
    for (const x of [10, 20, 30]) {
      state().onNodesChange([{ type: 'position', id: node.id, position: { x, y: 0 }, dragging: true }]);
      vi.advanceTimersByTime(100);
    }
    state().updateNodeData<'math'>(node.id, { latex: 'a' });
    settle();
    state().updateNodeData<'math'>(node.id, { latex: 'ab' });
    undo();
    expect(state().nodes[0].data).toEqual({ latex: 'a' });
    undo();
    expect(state().nodes[0].position).toEqual({ x: 30, y: 0 });
    undo();
    expect(state().nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it('does not record selection-only changes', () => {
    const node = createNode('math', { x: 0, y: 0 });
    state().addNodes([node]);
    settle();
    const pastLength = useCanvasStore.temporal.getState().pastStates.length;
    state().onNodesChange([{ type: 'select', id: node.id, selected: false }]);
    settle();
    expect(useCanvasStore.temporal.getState().pastStates.length).toBe(pastLength);
  });

  it('does not record edits that change nothing, or a node being measured', () => {
    const node = createNode('math', { x: 0, y: 0 });
    state().addNodes([node]);
    settle();
    const pastLength = useCanvasStore.temporal.getState().pastStates.length;
    const before = state().nodes;
    state().updateNodeData<'math'>(node.id, { latex: '' });
    expect(state().nodes).toBe(before);
    state().onNodesChange([{ type: 'dimensions', id: node.id, dimensions: { width: 100, height: 50 } }]);
    settle();
    expect(useCanvasStore.temporal.getState().pastStates.length).toBe(pastLength);
  });

  it('sets the selection by predicate and deletes it as one undo step', () => {
    const [a, b, c] = [0, 1, 2].map((x) => createNode('math', { x, y: 0 }));
    state().load({ nodes: [a, b, c], viewport: DEFAULT_VIEWPORT });
    state().setSelection((n) => n.id !== b.id);
    expect(state().nodes.map((n) => !!n.selected)).toEqual([true, false, true]);
    const before = state().nodes;
    state().setSelection((n) => n.id !== b.id);
    expect(state().nodes).toBe(before);

    state().deleteSelected();
    expect(state().nodes.map((n) => n.id)).toEqual([b.id]);
    undo();
    expect(state().nodes).toHaveLength(3);
  });

  it('load replaces content and clears history', () => {
    state().addNodes([createNode('math', { x: 0, y: 0 })]);
    state().load({ nodes: [], viewport: { x: 1, y: 2, zoom: 3 } });
    expect(useCanvasStore.temporal.getState().pastStates).toHaveLength(0);
    expect(getCanvasContent()).toEqual({ nodes: [], viewport: { x: 1, y: 2, zoom: 3 } });
  });

  it('exports content without transient fields', () => {
    state().addNodes([createNode('math', { x: 0, y: 0 })]);
    expect(getCanvasContent().nodes[0]).not.toHaveProperty('selected');
  });

  describe('links', () => {
    const three = () => {
      const [a, b, c] = [0, 1, 2].map((x) => createNode('math', { x: x * 100, y: 0 }));
      state().load({ nodes: [a, b, c], viewport: DEFAULT_VIEWPORT });
      return [a.id, b.id, c.id];
    };
    const past = () => useCanvasStore.temporal.getState().pastStates.length;

    it('links nodes as one undo step and selects only the new link', () => {
      const [a, b] = three();
      state().setSelection((n) => n.id === a);
      const id = state().linkNodes(a, b, { label: 'k', head: 'arrow' });
      expect(id).toBeTruthy();
      expect(state().edges).toEqual([{ id, source: a, target: b, selected: true, data: { label: 'k' } }]);
      expect(state().nodes.some((n) => n.selected)).toBe(false);
      expect(getCanvasContent().edges).toEqual([{ id, source: a, target: b, data: { label: 'k' } }]);
      settle();
      undo();
      expect(state().edges).toHaveLength(0);
      redo();
      expect(state().edges).toHaveLength(1);
    });

    it('refuses self links, missing nodes and same-direction duplicates, selecting the existing one', () => {
      const [a, b] = three();
      expect(state().linkNodes(a, a)).toBeNull();
      expect(state().linkNodes(a, 'nope')).toBeNull();
      const id = state().linkNodes(a, b);
      state().setSelection(() => false);
      expect(state().linkNodes(a, b)).toBeNull();
      expect(state().edges).toHaveLength(1);
      expect(state().edges[0]).toMatchObject({ id, selected: true });
      expect(state().linkNodes(b, a)).toBeTruthy();
    });

    it('deleting a node removes its links and one undo restores both', () => {
      const [a, b, c] = three();
      state().linkNodes(a, b);
      state().linkNodes(b, c);
      settle();
      state().deleteNodes([b]);
      expect(state().edges).toHaveLength(0);
      settle();
      undo();
      expect(state().nodes).toHaveLength(3);
      expect(state().edges).toHaveLength(2);
    });

    it('deletes selected nodes and links together as one step', () => {
      const [a, b, c] = three();
      state().linkNodes(a, b);
      const keep = state().linkNodes(b, c);
      settle();
      state().setSelection(
        (n) => n.id === a,
        (e) => e.id === keep,
      );
      const before = past();
      state().deleteSelected();
      expect(past()).toBe(before + 1);
      expect(state().nodes.map((n) => n.id)).toEqual([b, c]);
      expect(state().edges).toHaveLength(0);
      undo();
      expect(state().nodes).toHaveLength(3);
      expect(state().edges).toHaveLength(2);
    });

    it('cascades when React Flow removes nodes directly', () => {
      const [a, b] = three();
      state().linkNodes(a, b);
      state().onNodesChange([{ type: 'remove', id: a }]);
      expect(state().edges).toHaveLength(0);
    });

    it('routes edge removals through the undoable delete', () => {
      const [a, b] = three();
      const id = state().linkNodes(a, b) as string;
      settle();
      state().onEdgesChange([{ type: 'remove', id }]);
      expect(state().edges).toHaveLength(0);
      settle();
      undo();
      expect(state().edges).toHaveLength(1);
    });

    it('does not record a selection-only change to a link', () => {
      const [a, b] = three();
      const id = state().linkNodes(a, b) as string;
      settle();
      const before = past();
      state().onEdgesChange([{ type: 'select', id, selected: false }]);
      settle();
      expect(past()).toBe(before);
    });

    it('edits and reverses a link, keeping only non-default fields', () => {
      const [a, b] = three();
      const id = state().linkNodes(a, b, { head: 'dot' }) as string;
      state().updateEdgeData(id, { color: 'blue', dashed: true });
      expect(state().edges[0].data).toEqual({ head: 'dot', color: 'blue', dashed: true });
      state().updateEdgeData(id, { head: 'arrow', dashed: false, color: undefined });
      expect(state().edges[0].data).toBeUndefined();
      state().updateEdgeData(id, { tail: 'bar' });
      state().reverseEdge(id);
      expect(state().edges[0]).toMatchObject({ source: b, target: a, data: { tail: 'bar' } });
    });

    it('refuses to reverse a link when the other way is linked already, selecting that one', () => {
      const [a, b] = three();
      const first = state().linkNodes(a, b) as string;
      const second = state().linkNodes(b, a) as string;
      state().setSelection(() => false);
      expect(state().reverseEdge(second)).toBe(false);
      expect(state().edges.map((e) => [e.id, e.source, e.target])).toEqual([
        [first, a, b],
        [second, b, a],
      ]);
      expect(state().edges.find((e) => e.id === first)?.selected).toBe(true);
      expect(state().reverseEdge(first)).toBe(false);
    });

    it('closes the label editor of a link that is deleted, and undo does not reopen it', () => {
      const [a, b] = three();
      const id = state().linkNodes(a, b) as string;
      settle();
      useUiStore.getState().renameLink(id);
      state().deleteNodes([b]);
      expect(useUiStore.getState().renamingLink).toBeNull();
      undo();
      expect(state().edges).toHaveLength(1);
      expect(useUiStore.getState().renamingLink).toBeNull();
    });

    it('leaves the editor of another link open', () => {
      const [a, b, c] = three();
      const keep = state().linkNodes(a, b) as string;
      const gone = state().linkNodes(b, c) as string;
      useUiStore.getState().renameLink(keep);
      state().deleteElements([], [gone]);
      expect(useUiStore.getState().renamingLink).toBe(keep);
    });

    it('load drops dangling links, and an empty canvas has none to save', () => {
      const [a, b] = three();
      state().load({
        nodes: state().nodes,
        viewport: DEFAULT_VIEWPORT,
        edges: [
          { id: '1', source: a, target: b },
          { id: '2', source: a, target: 'gone' },
          { id: '3', source: a, target: a },
        ],
      });
      expect(state().edges.map((e) => e.id)).toEqual(['1']);
      state().clear();
      expect(getCanvasContent()).not.toHaveProperty('edges');
    });

    it('duplicates the selection with its internal links under new ids', () => {
      const [a, b, c] = three();
      state().linkNodes(a, b);
      state().linkNodes(b, c);
      state().setSelection((n) => n.id !== c);
      state().duplicateSelected();
      expect(state().nodes).toHaveLength(5);
      expect(state().edges).toHaveLength(3);
      const copies = state()
        .nodes.slice(3)
        .map((n) => n.id);
      const dup = state().edges.find((e) => copies.includes(e.source));
      expect(dup && copies.includes(dup.target)).toBe(true);
    });
  });
});
