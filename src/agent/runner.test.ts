import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AppNode, DEFAULT_VIEWPORT } from '@/model/types';
import { useMarks } from '@/motion/marks';
import { createNode } from '@/nodes/factory';
import { undo, useCanvasStore } from '@/store/canvasStore';
import { alias, resetAliases } from './aliases';
import { agentEvents, selectAgentCalls } from './events';
import { getAgentTools, runAgentTool } from './runner';
import { releaseLock, useAgentStore } from './store';

vi.mock('@/nodes/code/sandbox', () => ({
  runScript: (source: string, onLine: (l: { level: string; text: string }) => void, onDone: () => void) => {
    queueMicrotask(() => {
      onLine({ level: 'log', text: `ran ${source.length} chars` });
      onLine({ level: 'result', text: '10' });
      onDone();
    });
    return () => {};
  },
}));

const canvas = () => useCanvasStore.getState();
const at = (x: number, y: number) => ({ x, y });

/** Runs a tool and returns its text, failing the test on an error result. */
async function call(name: string, input: unknown = {}): Promise<string> {
  const result = await runAgentTool(name, input);
  const text = result.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
  if (result.isError) throw new Error(text);
  return text;
}

async function callError(name: string, input: unknown = {}): Promise<{ error: string; message: string }> {
  const result = await runAgentTool(name, input);
  expect(result.isError).toBe(true);
  return JSON.parse(result.content[0].type === 'text' ? result.content[0].text : '{}');
}

function load(nodes: AppNode[]) {
  canvas().load({ nodes, viewport: DEFAULT_VIEWPORT });
  nodes.forEach((n) => {
    alias(n.id);
  });
}

beforeEach(() => {
  resetAliases();
  agentEvents.clear();
  useAgentStore.getState().setEnabled(true);
  load([]);
});
afterEach(() => {
  useAgentStore.getState().setEnabled(false);
  releaseLock();
});

describe('runner', () => {
  it('refuses every call while AI control is off', async () => {
    useAgentStore.getState().setEnabled(false);
    expect((await callError('get_overview')).error).toBe('agent_disabled');
  });

  it('reports invalid input with the path', async () => {
    const { error, message } = await callError('read_nodes', { ids: [] });
    expect(error).toBe('invalid_input');
    expect(message).toContain('ids');
  });

  it('logs one activity entry per call with its outcome', async () => {
    load([createNode('math', at(0, 0), { latex: 'x' })]);
    await call('update_nodes', { updates: [{ id: 'n1', set: { latex: 'y' } }] });
    const [entry] = selectAgentCalls(agentEvents.getLog());
    expect(entry).toMatchObject({ tool: 'update_nodes', phase: 'succeeded', summary: 'Updated 1 node' });
    expect(entry.affectedNodeIds).toEqual([canvas().nodes[0].id]);
  });

  it('exposes every tool with an object JSON schema', () => {
    const tools = getAgentTools();
    expect(tools.length).toBeGreaterThan(10);
    for (const t of tools) expect(t.inputSchema.type).toBe('object');
  });

  it('locks the canvas after a write but not after a read', async () => {
    load([createNode('math', at(0, 0))]);
    await call('get_overview');
    expect(useAgentStore.getState().locked).toBe(false);
    await call('move_nodes', { moves: [{ id: 'n1', dx: 10 }] });
    expect(useAgentStore.getState().locked).toBe(true);
    expect(useMarks.getState().marks.get(canvas().nodes[0].id)).toBe('ai-touched');
  });
});

describe('reading', () => {
  it('summarises the canvas in groups', async () => {
    load([
      createNode('text', at(0, 0), { markdown: '# Fourier\nseries' }),
      createNode('math', at(260, 0), { latex: 'e^{i\\pi}' }),
      createNode('graph', at(5000, 0)),
    ]);
    const text = await call('get_overview');
    expect(text).toContain('3 nodes (text 1, math 1, graph 1), 2 groups');
    expect(text).toMatch(/g1 2 0,0 \d+×\d+ text 1, math 1 "# Fourier series"/);
    expect(text).toContain('g2 1 5000,0');
    expect(canvas().groups).toHaveLength(2);
  });

  it('lists nodes in a group as compact lines, with paging', async () => {
    load(Array.from({ length: 5 }, (_, i) => createNode('math', at(i * 250, 0), { latex: `x_${i}` })));
    await call('get_overview');
    const text = await call('list_nodes', { group: 'g1', limit: 2 });
    expect(text.split('\n')).toEqual([
      'n1 math 0,0 240×120 g1 "x_0"',
      'n2 math 250,0 240×120 g1 "x_1"',
      '(1-2 of 5; pass offset=2 for more)',
    ]);
  });

  it('lists only the selection', async () => {
    load([createNode('math', at(0, 0)), { ...createNode('math', at(0, 500)), selected: true }]);
    expect(await call('list_nodes', { scope: 'selected' })).toMatch(/^n2 math/);
  });

  it('reads full content, cut at maxChars with a pointer to the rest', async () => {
    load([createNode('text', at(0, 0), { markdown: 'a'.repeat(250) })]);
    const text = await call('read_nodes', { ids: ['n1'], maxChars: 100 });
    expect(text).toContain('## n1 text 0,0');
    expect(text).toContain(`${'a'.repeat(100)}\n[chars 0-100 of 250; pass offset=100 for more]`);
  });

  it('reads sheets as grids with A1 labels', async () => {
    load([createNode('sheet', at(0, 0), { cells: [['1', '=A1*2']] })]);
    expect(await call('read_nodes', { ids: ['n1'] })).toContain('  | A | B\n1 | 1 | =A1*2');
  });

  it('reads Math+ with results that flow between nodes in reading order', async () => {
    load([
      createNode('mathPlus', at(0, 300), { latex: 'a+1' }),
      createNode('mathPlus', at(0, 0), { latex: 'a:=2' }),
    ]);
    const text = await call('read_nodes', { ids: ['n1'] });
    expect(text).toContain('a+1  ⟶ 3');
  }, 20_000);

  it('never sends image data', async () => {
    load([createNode('image', at(0, 0), { src: `data:image/png;base64,${'A'.repeat(4000)}` })]);
    const text = await call('read_nodes', { ids: ['n1'] });
    expect(text).toContain('uploaded image, 3 KB');
    expect(text).not.toContain('AAAA');
  });

  it('describes a pdf by its pinned pages and, unconnected, shares no text', async () => {
    load([
      createNode('pdf', at(0, 0), { fileId: 'f', fileName: 'paper.pdf', pageCount: 12, pinned: [4, 7] }),
    ]);
    const text = await call('read_nodes', { ids: ['n1'] });
    expect(text).toContain('paper.pdf, 12 pages');
    expect(text).toContain('pinned pages 4, 7');
    expect(text).toContain('PDF file not connected; ask the user to click Reconnect on the node.');
    expect(await call('search_nodes', { query: 'paper' })).toContain('n1 pdf');
  });

  it('searches with snippets', async () => {
    load([createNode('text', at(0, 0), { markdown: 'The quick brown fox' }), createNode('math', at(0, 400))]);
    expect(await call('search_nodes', { query: 'BROWN' })).toBe('n1 text g1: The quick brown fox');
  });
});

describe('writing', () => {
  it('creates nodes next to a node without touching the selection, as one undo step', async () => {
    load([{ ...createNode('math', at(0, 0)), selected: true }]);
    const text = await call('create_nodes', {
      nodes: [
        { kind: 'text', markdown: 'hi', near: 'n1' },
        { kind: 'math', latex: 'y', near: 'n1' },
      ],
    });
    expect(text).toBe('Created n2 text at 264,0; n3 math at 0,144.');
    expect(canvas().nodes.map((n) => !!n.selected)).toEqual([true, false, false]);
    undo();
    expect(canvas().nodes).toHaveLength(1);
  });

  it('places nodes right of everything by default and validates kinds', async () => {
    load([createNode('math', at(0, 0))]);
    expect(await call('create_nodes', { nodes: [{ kind: 'graph', functions: ['x'] }] })).toContain(
      'at 400,0',
    );
    expect((await callError('create_nodes', { nodes: [{ kind: 'image', src: 'x' }] })).error).toBe(
      'invalid_input',
    );
    expect((await callError('create_nodes', { nodes: [{ kind: 'video', url: 'nope' }] })).error).toBe(
      'invalid_url',
    );
    expect(
      (await callError('create_nodes', { nodes: [{ kind: 'text', markdown: '', width: 300 }] })).error,
    ).toBe('not_resizable');
  });

  it('creates web nodes with a normalised address and refuses other schemes', async () => {
    await call('create_nodes', { nodes: [{ kind: 'web', url: 'example.com', width: 700 }] });
    expect(canvas().nodes[0]).toMatchObject({
      type: 'web',
      data: { url: 'https://example.com/' },
      width: 700,
    });
    expect(
      (await callError('create_nodes', { nodes: [{ kind: 'web', url: 'javascript:alert(1)' }] })).error,
    ).toBe('invalid_url');
    await call('update_nodes', { updates: [{ id: 'n1', set: { url: 'http://localhost:3000' } }] });
    expect(canvas().nodes[0].data).toMatchObject({ url: 'http://localhost:3000/' });
    expect((await callError('update_nodes', { updates: [{ id: 'n1', set: { url: 'data:x' } }] })).error).toBe(
      'invalid_url',
    );
  });

  it('cannot create pdf nodes or change which pages one shows', async () => {
    load([createNode('pdf', at(0, 0), { fileId: 'f', fileName: 'paper.pdf', pinned: [4] })]);
    expect((await callError('create_nodes', { nodes: [{ kind: 'pdf', fileId: 'x' }] })).error).toBe(
      'invalid_input',
    );
    expect((await callError('update_nodes', { updates: [{ id: 'n1', set: { url: 'x' } }] })).error).toBe(
      'invalid_field',
    );
    await call('update_nodes', { updates: [{ id: 'n1', set: { pinned: [2, 3] } }] });
    expect(canvas().nodes[0].data).toMatchObject({ pinned: [4] });
    await call('update_nodes', { updates: [{ id: 'n1', set: { title: 'Reading' } }] });
    expect(canvas().nodes[0].data).toMatchObject({ pinned: [4], title: 'Reading' });
  });

  it('applies exact find/replace edits and rejects missing or ambiguous ones', async () => {
    load([createNode('text', at(0, 0), { markdown: 'one two two' })]);
    await call('update_nodes', { updates: [{ id: 'n1', edits: [{ find: 'one', replace: '1' }] }] });
    expect(canvas().nodes[0].data).toEqual({ markdown: '1 two two' });
    expect(
      (await callError('update_nodes', { updates: [{ id: 'n1', edits: [{ find: 'two', replace: '2' }] }] }))
        .error,
    ).toBe('edit_ambiguous');
    expect(
      (await callError('update_nodes', { updates: [{ id: 'n1', edits: [{ find: 'zzz', replace: '' }] }] }))
        .error,
    ).toBe('edit_not_found');
    await call('update_nodes', {
      updates: [{ id: 'n1', edits: [{ find: 'two', replace: '2', all: true }] }],
    });
    expect(canvas().nodes[0].data).toEqual({ markdown: '1 2 2' });
  });

  it('stores multi-line Math+ the way MathLive does', async () => {
    await call('create_nodes', { nodes: [{ kind: 'mathPlus', latex: 'a:=2 \\\\ a+1' }] });
    expect(canvas().nodes[0].data).toEqual({ latex: '\\displaylines{a:=2 \\\\ a+1}' });
    await call('update_nodes', { updates: [{ id: 'n1', edits: [{ find: 'a+1', replace: 'a+2' }] }] });
    expect(canvas().nodes[0].data).toEqual({ latex: '\\displaylines{a:=2 \\\\ a+2}' });
    await call('update_nodes', { updates: [{ id: 'n1', set: { latex: 'x' } }] });
    expect(canvas().nodes[0].data).toEqual({ latex: 'x' });
  });

  it('sets cells by reference, growing the grid', async () => {
    load([createNode('sheet', at(0, 0), { cells: [['a']] })]);
    await call('update_nodes', { updates: [{ id: 'n1', cells: [{ cell: 'C2', value: '=A1' }] }] });
    expect(canvas().nodes[0].data).toEqual({
      cells: [
        ['a', '', ''],
        ['', '', '=A1'],
      ],
    });
  });

  it('rejects fields that do not belong to the kind, applying nothing', async () => {
    load([createNode('math', at(0, 0), { latex: 'x' }), createNode('text', at(0, 400), { markdown: 'm' })]);
    const { error } = await callError('update_nodes', {
      updates: [
        { id: 'n2', set: { markdown: 'changed' } },
        { id: 'n1', set: { markdown: 'nope' } },
      ],
    });
    expect(error).toBe('invalid_field');
    expect(canvas().nodes[1].data).toEqual({ markdown: 'm' });
  });

  it('moves, resizes and deletes nodes', async () => {
    load([createNode('graph', at(0, 0)), createNode('math', at(0, 500))]);
    await call('move_nodes', { moves: [{ id: 'n1', x: 50, dy: 5, width: 500 }] });
    expect(canvas().nodes[0]).toMatchObject({ position: { x: 50, y: 5 }, width: 500 });
    expect((await callError('move_nodes', { moves: [{ id: 'n2', width: 500 }] })).error).toBe(
      'not_resizable',
    );
    await call('delete_nodes', { ids: ['n2'] });
    expect(canvas().nodes).toHaveLength(1);
    expect((await callError('delete_nodes', { ids: ['n2'] })).error).toBe('node_not_found');
  });

  it('deleting a node also removes its links, as one undo step', async () => {
    load([createNode('math', at(0, 0)), createNode('math', at(300, 0))]);
    const [a, b] = canvas().nodes.map((n) => n.id);
    canvas().linkNodes(a, b);
    await call('delete_nodes', { ids: ['n1'] });
    expect(canvas().edges).toHaveLength(0);
    undo();
    expect(canvas().nodes).toHaveLength(2);
    expect(canvas().edges).toHaveLength(1);
  });

  it('runs scripts and returns their output', async () => {
    load([createNode('code', at(0, 0), { source: '1+9' })]);
    expect(await call('run_code', { id: 'n1' })).toBe('ran 3 chars\n=> 10');
    expect((await callError('run_code', { id: 'n9' })).error).toBe('node_not_found');
  });
});

describe('sections', () => {
  const section = () => createNode('section', at(0, 0), { title: 'Plan' }, { width: 400, height: 300 });

  it('lists sections and the nodes inside them in the overview', async () => {
    load([section(), createNode('math', at(50, 80)), createNode('math', at(2000, 0))]);
    const text = await call('get_overview');
    expect(text).toContain('Sections');
    expect(text).toMatch(/n1 "Plan" .* n2/);
  });

  it('renames and recolours a section', async () => {
    load([section()]);
    await call('update_nodes', { updates: [{ id: 'n1', set: { title: 'Ideas', color: 'blue' } }] });
    expect(canvas().nodes[0].data).toEqual({ title: 'Ideas', color: 'blue' });
  });

  it('moving a section moves what is inside it', async () => {
    load([section(), createNode('math', at(50, 80)), createNode('math', at(2000, 0))]);
    await call('move_nodes', { moves: [{ id: 'n1', dx: 100, dy: 10 }] });
    expect(canvas().nodes.map((n) => n.position)).toEqual([at(100, 10), at(150, 90), at(2000, 0)]);
  });

  it('cannot create sections', async () => {
    expect((await callError('create_nodes', { nodes: [{ kind: 'section', title: 'x' }] })).error).toBe(
      'invalid_input',
    );
  });
});

describe('links', () => {
  const three = () =>
    load([createNode('math', at(0, 0)), createNode('text', at(300, 0)), createNode('math', at(600, 0))]);
  const past = () => useCanvasStore.temporal.getState().pastStates.length;

  it('links nodes in one undo step, keeping the user selection, and says what it made', async () => {
    three();
    canvas().setSelection((n) => n.id === canvas().nodes[2].id);
    const before = past();
    const text = await call('link_nodes', {
      links: [
        { from: 'n1', to: 'n2', label: '$k$', color: 'blue', dashed: true, head: 'dot' },
        { from: 'n2', to: 'n3' },
      ],
    });
    expect(text).toBe('Linked l1 n1 -> n2 "$k$" head=dot color=blue dashed; l2 n2 -> n3.');
    expect(canvas().edges.map((e) => e.data)).toEqual([
      { label: '$k$', color: 'blue', dashed: true, head: 'dot' },
      undefined,
    ]);
    expect(canvas().nodes.map((n) => !!n.selected)).toEqual([false, false, true]);
    expect(past()).toBe(before + 1);
    undo();
    expect(canvas().edges).toHaveLength(0);
  });

  it('refuses unknown nodes, self links and repeats, applying nothing', async () => {
    three();
    expect((await callError('link_nodes', { links: [{ from: 'n1', to: 'n9' }] })).error).toBe(
      'node_not_found',
    );
    expect((await callError('link_nodes', { links: [{ from: 'n1', to: 'n1' }] })).error).toBe('self_link');
    await call('link_nodes', { links: [{ from: 'n1', to: 'n2' }] });
    expect((await callError('link_nodes', { links: [{ from: 'n1', to: 'n2' }] })).error).toBe('link_exists');
    expect(
      (
        await callError('link_nodes', {
          links: [
            { from: 'n2', to: 'n3' },
            { from: 'n2', to: 'n3' },
          ],
        })
      ).error,
    ).toBe('link_exists');
    expect((await callError('link_nodes', { links: [{ from: 'n1', to: 'n2', head: 'star' }] })).error).toBe(
      'invalid_input',
    );
    expect(canvas().edges).toHaveLength(1);
    await call('link_nodes', { links: [{ from: 'n2', to: 'n1' }] });
    expect(canvas().edges).toHaveLength(2);
  });

  it('warns when a link closes a Math+ loop', async () => {
    load([createNode('mathPlus', at(0, 0)), createNode('mathPlus', at(300, 0))]);
    await call('link_nodes', { links: [{ from: 'n1', to: 'n2' }] });
    expect(await call('link_nodes', { links: [{ from: 'n2', to: 'n1' }] })).toContain('closes a Math+ loop');
  });

  it('escapes quote marks in labels it prints', async () => {
    three();
    await call('link_nodes', { links: [{ from: 'n1', to: 'n2', label: 'say "hi"' }] });
    expect(await call('list_links')).toBe('l1 n1 -> n2 "say \\"hi\\""');
    expect(await call('read_nodes', { ids: ['n2'] })).toContain('Links: <- n1 "say \\"hi\\""');
  });

  it('lists links, for one node and with paging', async () => {
    three();
    await call('link_nodes', {
      links: [
        { from: 'n1', to: 'n2', label: 'a' },
        { from: 'n2', to: 'n3' },
        { from: 'n3', to: 'n1' },
      ],
    });
    expect((await call('list_links')).split('\n')).toEqual(['l1 n1 -> n2 "a"', 'l2 n2 -> n3', 'l3 n3 -> n1']);
    expect(await call('list_links', { node: 'n1' })).toBe('l1 n1 -> n2 "a"\nl3 n3 -> n1');
    expect(await call('list_links', { limit: 1 })).toBe(
      'l1 n1 -> n2 "a"\n(1-1 of 3; pass offset=1 for more)',
    );
    load([]);
    expect(await call('list_links')).toBe('No links.');
  });

  it('updates looks and direction in one step, checking everything first', async () => {
    three();
    await call('link_nodes', {
      links: [
        { from: 'n1', to: 'n2', label: 'x', color: 'blue' },
        { from: 'n2', to: 'n3' },
      ],
    });
    const before = past();
    await call('update_links', {
      updates: [
        { id: 'l1', set: { label: '', color: 'auto', tail: 'bar' } },
        { id: 'l2', set: { dashed: true }, reverse: true },
      ],
    });
    expect(past()).toBe(before + 1);
    expect(canvas().edges[0].data).toEqual({ tail: 'bar' });
    expect(canvas().edges[1]).toMatchObject({
      source: canvas().nodes[2].id,
      target: canvas().nodes[1].id,
      data: { dashed: true },
    });

    expect(
      (await callError('update_links', { updates: [{ id: 'l1', set: { label: 'z' } }, { id: 'l9' }] })).error,
    ).toBe('link_not_found');
    expect(canvas().edges[0].data).toEqual({ tail: 'bar' });
    expect((await callError('update_links', { updates: [{ id: 'l1' }, { id: 'l1' }] })).error).toBe(
      'duplicate_update',
    );
  });

  it('refuses to reverse a link into a duplicate, applying nothing', async () => {
    three();
    await call('link_nodes', {
      links: [
        { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n1' },
        { from: 'n2', to: 'n3' },
      ],
    });
    const err = await callError('update_links', {
      updates: [
        { id: 'l3', reverse: true },
        { id: 'l2', reverse: true },
      ],
    });
    expect(err.error).toBe('link_exists');
    expect(canvas().edges.map((e) => [e.source, e.target])).toEqual([
      [canvas().nodes[0].id, canvas().nodes[1].id],
      [canvas().nodes[1].id, canvas().nodes[0].id],
      [canvas().nodes[1].id, canvas().nodes[2].id],
    ]);
    await call('update_links', { updates: [{ id: 'l3', reverse: true }] });
    expect(canvas().edges[2].source).toBe(canvas().nodes[2].id);
  });

  it('deletes links as one undo step, leaving the nodes', async () => {
    three();
    await call('link_nodes', {
      links: [
        { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n3' },
      ],
    });
    await call('delete_links', { ids: ['l1', 'l2'] });
    expect(canvas().edges).toHaveLength(0);
    expect(canvas().nodes).toHaveLength(3);
    undo();
    expect(canvas().edges).toHaveLength(2);
    expect((await callError('delete_links', { ids: ['l7'] })).error).toBe('link_not_found');
  });

  it('shows links in the overview and when reading a node', async () => {
    three();
    await call('link_nodes', {
      links: [
        { from: 'n1', to: 'n2', label: 'k' },
        { from: 'n3', to: 'n2' },
      ],
    });
    expect(await call('get_overview')).toContain('3 nodes (math 2, text 1), 1 group, 2 links.');
    const read = await call('read_nodes', { ids: ['n2'] });
    expect(read).toContain('Links: <- n1 "k"; <- n3');
    expect(await call('read_nodes', { ids: ['n1'] })).toContain('Links: -> n2 "k"');
  });

  it('shows what a Math+ link brings in when reading the target', async () => {
    load([
      createNode('mathPlus', at(0, 0), { latex: '\\frac{1}{3}' }),
      createNode('mathPlus', at(0, 300), { latex: 'k*6' }),
      createNode('mathPlus', at(0, 600), { latex: 'ans+1' }),
    ]);
    await call('link_nodes', {
      links: [
        { from: 'n1', to: 'n2', label: 'k' },
        { from: 'n2', to: 'n3' },
        { from: 'n1', to: 'n3', label: 'x' },
      ],
    });
    const read = await call('read_nodes', { ids: ['n2', 'n3'] });
    expect(read).toContain('inputs: k = \\frac{1}{3} (from n1)\nk*6  ⟶ 2');
    expect(read).toContain('inputs: ans = 2 (from n2); x = \\frac{1}{3} (from n1, unused)\nans+1  ⟶ 3');
  });

  it('removes the links of a deleted node and tells the agent the tools exist', async () => {
    three();
    await call('link_nodes', { links: [{ from: 'n1', to: 'n2' }] });
    await call('delete_nodes', { ids: ['n2'] });
    expect(canvas().edges).toHaveLength(0);
    expect(getAgentTools().map((t) => t.name)).toEqual(
      expect.arrayContaining(['link_nodes', 'list_links', 'update_links', 'delete_links']),
    );
  });
});
