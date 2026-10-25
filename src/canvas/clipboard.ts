import { useReactFlow, type XYPosition } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { copyText } from '@/lib/clipboard';
import { internalEdges } from '@/lib/links';
import { nodeRect } from '@/lib/nodeRect';
import { expandWithContents } from '@/lib/sections';
import { placedNodes, withStackMembers } from '@/lib/stacks';
import type { AppEdge, AppNode, CanvasEdge } from '@/model/types';
import { exportNodes, ImportError, parseExportFile } from '@/persistence/io';
import { useCanvasStore } from '@/store/canvasStore';
import { pasteNodes } from '@/store/workspace';
import { isTyping } from './keyboard';

const MIME = 'application/x-unlined+json';
/** Repeated pastes in the same spot step down-right by this much so copies do not hide each other. */
const PASTE_STEP = 30;

/** The selected nodes; a selected section brings what is inside it, and a stack its cards. */
function copiedNodes(nodes: AppNode[]): AppNode[] {
  const placed = placedNodes(nodes);
  const ids = withStackMembers(
    nodes,
    expandWithContents(
      new Set(placed.filter((n) => n.selected).map((n) => n.id)),
      new Set(placed.filter((n) => n.type === 'section').map((n) => n.id)),
      placed.map(nodeRect),
    ),
  );
  return nodes.filter((n) => ids.has(n.id));
}

/** The selected nodes and the links among them as one export file, or null if no node is selected. */
function copyFile(nodes: AppNode[], edges: AppEdge[]) {
  const picked = copiedNodes(nodes);
  if (picked.length === 0) return null;
  return {
    file: exportNodes(picked, internalEdges(edges, new Set(picked.map((n) => n.id)))),
    count: picked.length,
  };
}

/** The selected nodes (with the links among them) as clipboard text, or null if none. */
export function serializeSelection(nodes: AppNode[], edges: AppEdge[] = []): string | null {
  const copy = copyFile(nodes, edges);
  return copy ? JSON.stringify(copy.file) : null;
}

/** Nodes and links in clipboard text, or null when it is anything else (plain text, a canvases export, garbage). */
export function parseClipboard(text: string): { nodes: AppNode[]; edges: CanvasEdge[] } | null {
  try {
    const file = parseExportFile(text);
    return file.kind === 'nodes' && file.nodes.length > 0
      ? { nodes: file.nodes, edges: file.edges ?? [] }
      : null;
  } catch (error) {
    if (error instanceof ImportError) return null;
    throw error;
  }
}

/** Copies the selected nodes like Ctrl+C does, for menus. */
export async function copySelection(): Promise<void> {
  const { nodes, edges } = useCanvasStore.getState();
  const copy = copyFile(nodes, edges);
  if (copy) await copyText(JSON.stringify(copy.file), copy.count === 1 ? 'node' : 'nodes');
}

/** Pastes nodes from the system clipboard with their top-left corner at `at`, for menus. */
export async function pasteAt(at: XYPosition): Promise<void> {
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    toast.error('Could not read the clipboard');
    return;
  }
  const pasted = parseClipboard(text);
  if (pasted) pasteNodes(pasted.nodes, at, pasted.edges);
  else toast.error('No nodes on the clipboard');
}

/**
 * Ctrl+C / Ctrl+V for whole nodes, through the system clipboard so it works across canvases and tabs.
 * Only acts when a node itself is selected; inside a field, native copy and paste are left alone.
 */
export function useClipboard(readOnly: boolean) {
  const { screenToFlowPosition } = useReactFlow();
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const lastPaste = useRef<{ x: number; y: number; count: number } | null>(null);

  useEffect(() => {
    if (readOnly) return;
    const onPointerMove = (event: PointerEvent) => {
      const over = (event.target as Element | null)?.closest?.('.react-flow');
      pointer.current = over ? { x: event.clientX, y: event.clientY } : null;
    };
    const ownsEvent = () => !isTyping(document.activeElement) && window.getSelection()?.isCollapsed !== false;

    const onCopy = (event: ClipboardEvent) => {
      if (!ownsEvent() || !event.clipboardData) return;
      const payload = serializeSelection(useCanvasStore.getState().nodes, useCanvasStore.getState().edges);
      if (!payload) return;
      event.clipboardData.setData(MIME, payload);
      event.clipboardData.setData('text/plain', payload);
      event.preventDefault();
    };

    const onPaste = (event: ClipboardEvent) => {
      if (!ownsEvent() || !event.clipboardData) return;
      const text = event.clipboardData.getData(MIME) || event.clipboardData.getData('text/plain');
      const pasted = text ? parseClipboard(text) : null;
      if (!pasted) return; // not ours: let images and text through untouched
      event.preventDefault();

      const screen = pointer.current ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const base = screenToFlowPosition(screen);
      const again = lastPaste.current;
      const count =
        again && Math.abs(again.x - base.x) < 1 && Math.abs(again.y - base.y) < 1 ? again.count + 1 : 0;
      lastPaste.current = { ...base, count };
      pasteNodes(
        pasted.nodes,
        { x: base.x + count * PASTE_STEP, y: base.y + count * PASTE_STEP },
        pasted.edges,
      );
    };

    window.addEventListener('pointermove', onPointerMove);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, [readOnly, screenToFlowPosition]);
}
