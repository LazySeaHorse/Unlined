import { beforeEach, describe, expect, it } from 'vitest';
import { createNode } from '@/nodes/factory';
import {
  createCanvas,
  deleteCanvas,
  forgetSyncRecord,
  getCanvas,
  getSyncRecord,
  listCanvases,
  listSyncRecords,
  loadContent,
  putSyncRecord,
  renameCanvas,
  saveContent,
  savePulled,
} from './canvasRepo';
import { db } from './db';

beforeEach(async () => {
  await db.canvases.clear();
  await db.contents.clear();
  await db.syncRecords.clear();
});

describe('canvasRepo', () => {
  it('creates an empty canvas', async () => {
    const id = await createCanvas('First');
    expect(await getCanvas(id)).toMatchObject({ id, name: 'First' });
    expect(await loadContent(id)).toEqual({ nodes: [], viewport: { x: 0, y: 0, zoom: 1 } });
  });

  it('saves and loads content, bumping updatedAt', async () => {
    const id = await createCanvas('A');
    const before = (await getCanvas(id))?.updatedAt ?? 0;
    await new Promise((r) => setTimeout(r, 5));
    const content = {
      nodes: [createNode('math', { x: 1, y: 2 }, { latex: 'x' })],
      viewport: { x: 5, y: 6, zoom: 2 },
    };
    await saveContent(id, content);
    expect(await loadContent(id)).toEqual(content);
    expect((await getCanvas(id))?.updatedAt).toBeGreaterThan(before);
  });

  it('keeps a moved view without counting it as an edit', async () => {
    const id = await createCanvas('View');
    const before = (await getCanvas(id))?.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const content = { nodes: [], viewport: { x: 40, y: -20, zoom: 2 } };
    await saveContent(id, content, false);
    expect(await loadContent(id)).toEqual(content);
    expect((await getCanvas(id))?.updatedAt).toBe(before);
  });

  it('lists most recently updated first', async () => {
    const a = await createCanvas('A');
    await new Promise((r) => setTimeout(r, 5));
    await createCanvas('B');
    await new Promise((r) => setTimeout(r, 5));
    await saveContent(a, { nodes: [], viewport: { x: 0, y: 0, zoom: 1 } });
    expect((await listCanvases()).map((c) => c.name)).toEqual(['A', 'B']);
  });

  it('renames and deletes', async () => {
    const id = await createCanvas('Old');
    await renameCanvas(id, 'New');
    expect((await getCanvas(id))?.name).toBe('New');
    await deleteCanvas(id);
    expect(await getCanvas(id)).toBeUndefined();
    expect(await db.contents.get(id)).toBeUndefined();
  });

  it('stores a pulled canvas, adding or replacing, and remembers the cloud revision it matches', async () => {
    const content = { nodes: [createNode('text', { x: 1, y: 2 })], viewport: { x: 0, y: 0, zoom: 2 } };
    await savePulled('cloud-id', 'From cloud', content, 'r1');
    const meta = await getCanvas('cloud-id');
    expect(meta).toMatchObject({ id: 'cloud-id', name: 'From cloud' });
    expect(await loadContent('cloud-id')).toEqual(content);
    expect(await listSyncRecords()).toEqual([{ id: 'cloud-id', rev: 'r1', localUpdatedAt: meta?.updatedAt }]);

    await savePulled('cloud-id', 'Renamed', { nodes: [], viewport: content.viewport }, 'r2');
    expect(await listCanvases()).toHaveLength(1);
    expect((await listSyncRecords())[0].rev).toBe('r2');
  });

  it('keeps the sync record of a deleted canvas, until it is forgotten', async () => {
    const id = await createCanvas('A');
    await putSyncRecord({ id, rev: 'r', localUpdatedAt: 1 });
    await deleteCanvas(id);
    expect(await getCanvas(id)).toBeUndefined();
    expect(await getSyncRecord(id)).toEqual({ id, rev: 'r', localUpdatedAt: 1 });
    await forgetSyncRecord(id);
    expect(await listSyncRecords()).toEqual([]);
  });

  it('keeps links with the content', async () => {
    const id = await createCanvas('A');
    const edges = [{ id: 'l', source: 'a', target: 'b', data: { label: 'k' } }];
    await saveContent(id, { nodes: [], viewport: { x: 0, y: 0, zoom: 1 }, edges });
    expect((await loadContent(id)).edges).toEqual(edges);
  });
});
