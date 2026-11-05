import type { XYPosition } from '@xyflow/react';
import { create } from 'zustand';
import { cloneGraph, internalEdges, sanitizeEdges, stripEdge } from '@/lib/links';
import { placedNodes, withStackMembers } from '@/lib/stacks';
import type { AppNode, CanvasContent, CanvasEdge } from '@/model/types';
import { createAutosave } from '@/persistence/autosave';
import * as repo from '@/persistence/canvasRepo';
import { type ExportFile, exportCanvases, exportNodes, type NamedCanvas } from '@/persistence/io';
import { asUndoStep, getCanvasContent, useCanvasStore } from './canvasStore';

/**
 * Coordinates the open canvas with storage: opening, creating, deleting, autosaving, import/export.
 * UI talks to this module rather than to the repository and canvas store separately.
 */

const DEFAULT_NAME = 'Untitled canvas';

interface WorkspaceState {
  currentId: string | null;
}

export const useWorkspace = create<WorkspaceState>(() => ({ currentId: null }));

const currentId = () => useWorkspace.getState().currentId;

/** Whether anything but the view changed since the last save: panning and zooming are saved, but are not edits. */
let edited = false;

const autosave = createAutosave(async () => {
  const id = currentId();
  const wasEdited = edited;
  edited = false;
  if (id) await repo.saveContent(id, getCanvasContent(), wasEdited);
});

useCanvasStore.subscribe((state, prev) => {
  const changed =
    state.nodes !== prev.nodes ||
    state.edges !== prev.edges ||
    state.groups !== prev.groups ||
    state.fronts !== prev.fronts;
  if (changed) edited = true;
  if (changed || state.viewport !== prev.viewport) autosave.schedule();
});

if (typeof window !== 'undefined') {
  const flushNow = () => void autosave.flush();
  window.addEventListener('pagehide', flushNow);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushNow());
}

/** Drops a save still waiting, and the edits it would have carried. */
const cancelSave = () => {
  autosave.cancel();
  edited = false;
};

export const flushSave = () => autosave.flush();

export async function openCanvas(id: string): Promise<void> {
  if (id !== currentId()) await autosave.flush();
  const content = await repo.loadContent(id);
  useCanvasStore.getState().load(content);
  cancelSave();
  useWorkspace.setState({ currentId: id });
}

let initialized: Promise<void> | undefined;

/** Opens the most recently edited canvas, creating one on first run. Safe to call more than once. */
export function initWorkspace(): Promise<void> {
  initialized ??= (async () => {
    const [latest] = await repo.listCanvases();
    await openCanvas(latest?.id ?? (await repo.createCanvas(DEFAULT_NAME)));
  })();
  return initialized;
}

export async function newCanvas(name: string): Promise<void> {
  await openCanvas(await repo.createCanvas(name.trim() || DEFAULT_NAME));
}

export const renameCanvas = (id: string, name: string) => repo.renameCanvas(id, name.trim() || DEFAULT_NAME);

export async function removeCanvas(id: string): Promise<void> {
  if (id === currentId()) {
    cancelSave();
    useWorkspace.setState({ currentId: null });
  }
  await repo.deleteCanvas(id);
  if (currentId() === null) {
    const [next] = await repo.listCanvases();
    await openCanvas(next?.id ?? (await repo.createCanvas(DEFAULT_NAME)));
  }
}

/**
 * Stores a canvas that came from the cloud. If it is the open one, a save still waiting would put the old
 * content back over it, so that is dropped and the canvas on screen is replaced.
 */
export async function savePulledCanvas(
  id: string,
  name: string,
  content: CanvasContent,
  rev: string,
): Promise<void> {
  const open = id === currentId();
  if (open) cancelSave();
  await repo.savePulled(id, name, content, rev);
  if (open) useCanvasStore.getState().load(content);
}

async function namedCanvas(id: string): Promise<NamedCanvas> {
  const meta = await repo.getCanvas(id);
  return { name: meta?.name ?? DEFAULT_NAME, ...(await repo.loadContent(id)) };
}

export async function exportCurrentCanvas(): Promise<ExportFile> {
  await autosave.flush();
  const id = currentId();
  return exportCanvases(id ? [await namedCanvas(id)] : []);
}

/** Any canvas, not just the open one. */
export async function exportCanvasById(id: string): Promise<ExportFile> {
  await autosave.flush();
  return exportCanvases([await namedCanvas(id)]);
}

export async function exportAllCanvases(): Promise<ExportFile> {
  await autosave.flush();
  const metas = await repo.listCanvases();
  return exportCanvases(await Promise.all(metas.map((m) => namedCanvas(m.id))));
}

export function exportSelectedNodes(): ExportFile {
  const { nodes, edges } = useCanvasStore.getState();
  const ids = withStackMembers(nodes, new Set(nodes.filter((n) => n.selected).map((n) => n.id)));
  const picked = nodes.filter((n) => ids.has(n.id));
  return exportNodes(picked, internalEdges(edges, new Set(picked.map((n) => n.id))).map(stripEdge));
}

/**
 * Adds copies of `nodes` (and the `edges` among them) to the open canvas with their top-left corner at `at`,
 * as one undo step.
 */
export function pasteNodes(nodes: AppNode[], at: XYPosition, edges: CanvasEdge[] = []): void {
  if (nodes.length === 0) return;
  // Cards inside a stack keep their own old place, which does not count: the stack's does.
  const placed = placedNodes(nodes);
  const minX = Math.min(...placed.map((n) => n.position.x));
  const minY = Math.min(...placed.map((n) => n.position.y));
  const copy = cloneGraph(nodes, edges, { x: at.x - minX, y: at.y - minY });
  asUndoStep(() => useCanvasStore.getState().addNodes(copy.nodes, copy.edges));
}

/**
 * Imports a parsed file. Canvases are added (never overwritten) and the first one is opened;
 * loose nodes are pasted into the open canvas with their top-left corner at `at`.
 * Returns a short description of what was imported.
 */
export async function importFile(file: ExportFile, at: XYPosition): Promise<string> {
  if (file.kind === 'nodes') {
    if (file.nodes.length === 0) return 'No nodes in file';
    pasteNodes(file.nodes, at, file.edges);
    return `Imported ${file.nodes.length} node${file.nodes.length === 1 ? '' : 's'}`;
  }
  if (file.canvases.length === 0) return 'No canvases in file';
  const ids: string[] = [];
  for (const { name, edges: raw = [], ...content } of file.canvases) {
    const edges = sanitizeEdges(
      raw,
      content.nodes.map((n) => n.id),
    );
    ids.push(await repo.createCanvas(name, { ...content, ...(edges.length > 0 ? { edges } : {}) }));
  }
  await openCanvas(ids[0]);
  return `Imported ${ids.length} canvas${ids.length === 1 ? '' : 'es'}`;
}
