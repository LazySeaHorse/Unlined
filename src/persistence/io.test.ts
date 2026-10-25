import { describe, expect, it } from 'vitest';
import { createNode } from '@/nodes/factory';
import { exportCanvases, exportNodes, ImportError, parseExportFile } from './io';

const sampleNodes = () => [
  { ...createNode('text', { x: 0, y: 0 }), selected: true },
  createNode('graph', { x: 100, y: 50 }),
  createNode('sheet', { x: -20, y: 10 }),
];

describe('io', () => {
  it('round-trips canvases', () => {
    const file = exportCanvases([{ name: 'A', nodes: sampleNodes(), viewport: { x: 1, y: 2, zoom: 0.5 } }]);
    const parsed = parseExportFile(JSON.stringify(file));
    expect(parsed).toEqual(file);
    expect(parsed.kind === 'canvases' && parsed.canvases[0].nodes[0]).not.toHaveProperty('selected');
  });

  it('round-trips canvas groups', () => {
    const nodes = sampleNodes();
    const groups = [{ id: 'g', nodeIds: nodes.map((n) => n.id) }];
    const file = exportCanvases([{ name: 'A', nodes, viewport: { x: 0, y: 0, zoom: 1 }, groups }]);
    const parsed = parseExportFile(JSON.stringify(file));
    expect(parsed.kind === 'canvases' && parsed.canvases[0].groups).toEqual(groups);
  });

  it('round-trips nodes', () => {
    const file = exportNodes(sampleNodes());
    expect(parseExportFile(JSON.stringify(file))).toEqual(file);
  });

  it('round-trips pdf nodes as metadata only', () => {
    const pdf = createNode(
      'pdf',
      { x: 0, y: 0 },
      { fileId: 'f', fileName: 'a.pdf', pinned: [3, 8], pageCount: 20 },
    );
    const file = exportNodes([pdf]);
    expect(parseExportFile(JSON.stringify(file))).toEqual(file);
    expect(Object.keys(file.nodes[0].data).sort()).toEqual(
      ['direction', 'fileId', 'fileName', 'pageCount', 'pinned'].sort(),
    );
  });

  it('round-trips web nodes', () => {
    const web = createNode('web', { x: 0, y: 0 }, { url: 'https://example.com/', pageTitle: 'Example' });
    const file = exportNodes([web]);
    expect(parseExportFile(JSON.stringify(file))).toEqual(file);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseExportFile('{nope')).toThrow(ImportError);
  });

  it('rejects files from other apps or versions', () => {
    expect(() => parseExportFile(JSON.stringify({ version: 4, fields: [] }))).toThrow(
      /Not an Unlined export/,
    );
    expect(() => parseExportFile(JSON.stringify({ ...exportNodes([]), version: 4 }))).toThrow(ImportError);
  });

  it('rejects nodes whose data does not match their kind', () => {
    const file = exportNodes([createNode('math', { x: 0, y: 0 })]);
    const broken = { ...file, nodes: [{ ...file.nodes[0], data: { markdown: 'x' } }] };
    expect(() => parseExportFile(JSON.stringify(broken))).toThrow(ImportError);
  });

  it('rejects unknown node kinds', () => {
    const file = exportNodes([createNode('math', { x: 0, y: 0 })]);
    const broken = { ...file, nodes: [{ ...file.nodes[0], type: 'hologram' }] };
    expect(() => parseExportFile(JSON.stringify(broken))).toThrow(ImportError);
  });

  describe('links', () => {
    const nodes = () => [createNode('text', { x: 0, y: 0 }), createNode('graph', { x: 300, y: 0 })];

    it('round-trips links on canvases and nodes, as version 2', () => {
      const [a, b] = nodes();
      const edges = [
        {
          id: 'l',
          source: a.id,
          target: b.id,
          data: { label: '$k$', head: 'dot' as const, color: 'blue' as const },
        },
      ];
      const canvases = exportCanvases([
        { name: 'A', nodes: [a, b], edges, viewport: { x: 0, y: 0, zoom: 1 } },
      ]);
      expect(canvases.version).toBe(2);
      expect(parseExportFile(JSON.stringify(canvases))).toEqual(canvases);
      const loose = exportNodes([a, b], edges);
      expect(loose.version).toBe(2);
      expect(parseExportFile(JSON.stringify(loose))).toEqual(loose);
    });

    it('writes version 1 and no edges key without links', () => {
      const file = exportCanvases([
        { name: 'A', nodes: nodes(), edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      ]);
      expect(file.version).toBe(1);
      expect(file.canvases[0]).not.toHaveProperty('edges');
      expect(exportNodes(nodes())).not.toHaveProperty('edges');
    });

    it('reads files from before links', () => {
      const old = { ...exportNodes(nodes()), version: 1 };
      expect(parseExportFile(JSON.stringify(old))).toMatchObject({ kind: 'nodes', version: 1 });
    });

    it('rejects a link with a bad end', () => {
      const [a, b] = nodes();
      const file = { ...exportNodes([a, b], [{ id: 'l', source: a.id, target: b.id }]) };
      const bad = { ...file, edges: [{ id: 'l', source: a.id, target: b.id, data: { head: 'star' } }] };
      expect(() => parseExportFile(JSON.stringify(bad))).toThrow(ImportError);
    });
  });

  describe('stacks', () => {
    it('round-trips stacks and the card each shows, as version 3', () => {
      const [a, b] = [createNode('text', { x: 0, y: 0 }), createNode('graph', { x: 0, y: 0 })];
      const stack = createNode('stack', { x: 0, y: 0 }, { members: [a.id, b.id] });
      const file = exportCanvases([
        { name: 'A', nodes: [a, b, stack], fronts: { [stack.id]: b.id }, viewport: { x: 0, y: 0, zoom: 1 } },
      ]);
      expect(file.version).toBe(3);
      expect(parseExportFile(JSON.stringify(file))).toEqual(file);
      expect(exportNodes([a, b, stack]).version).toBe(3);
    });
  });
});
