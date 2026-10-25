import { type CanvasContent, type CanvasMeta, DEFAULT_VIEWPORT } from '@/model/types';
import { newId } from '@/nodes/factory';
import type { SyncRecord } from '@/sync/status';
import { db } from './db';

const EMPTY_CONTENT: CanvasContent = { nodes: [], viewport: DEFAULT_VIEWPORT };

/** All canvases, most recently modified first. */
export const listCanvases = (): Promise<CanvasMeta[]> => db.canvases.orderBy('updatedAt').reverse().toArray();

export const getCanvas = (id: string): Promise<CanvasMeta | undefined> => db.canvases.get(id);

export async function createCanvas(name: string, content: CanvasContent = EMPTY_CONTENT): Promise<string> {
  const id = newId();
  await db.transaction('rw', db.canvases, db.contents, async () => {
    await db.canvases.add({ id, name, updatedAt: Date.now() });
    await db.contents.add({ id, ...content });
  });
  return id;
}

export async function loadContent(id: string): Promise<CanvasContent> {
  const row = await db.contents.get(id);
  if (!row) return EMPTY_CONTENT;
  return {
    nodes: row.nodes,
    viewport: row.viewport,
    ...(row.groups ? { groups: row.groups } : {}),
    ...(row.edges ? { edges: row.edges } : {}),
    ...(row.fronts ? { fronts: row.fronts } : {}),
  };
}

export async function saveContent(id: string, content: CanvasContent): Promise<void> {
  await db.transaction('rw', db.canvases, db.contents, async () => {
    await db.contents.put({ id, ...content });
    await db.canvases.update(id, { updatedAt: Date.now() });
  });
}

export async function renameCanvas(id: string, name: string): Promise<void> {
  await db.canvases.update(id, { name, updatedAt: Date.now() });
}

/** The canvas goes; its sync record stays, so a sync can tell it was deleted here rather than never pulled. */
export async function deleteCanvas(id: string): Promise<void> {
  await db.transaction('rw', db.canvases, db.contents, async () => {
    await db.canvases.delete(id);
    await db.contents.delete(id);
  });
}

export const getSyncRecord = (id: string): Promise<SyncRecord | undefined> => db.syncRecords.get(id);

export const forgetSyncRecord = (id: string): Promise<void> => db.syncRecords.delete(id);

export const listSyncRecords = (): Promise<SyncRecord[]> => db.syncRecords.toArray();

export const putSyncRecord = (record: SyncRecord): Promise<unknown> => db.syncRecords.put(record);

/**
 * Stores a canvas that came from the cloud, adding it or replacing the local one with the same id, and
 * notes that it now matches cloud revision `rev`.
 */
export async function savePulled(
  id: string,
  name: string,
  content: CanvasContent,
  rev: string,
): Promise<void> {
  const updatedAt = Date.now();
  await db.transaction('rw', db.canvases, db.contents, db.syncRecords, async () => {
    await db.canvases.put({ id, name, updatedAt });
    await db.contents.put({ id, ...content });
    await db.syncRecords.put({ id, rev, localUpdatedAt: updatedAt });
  });
}
