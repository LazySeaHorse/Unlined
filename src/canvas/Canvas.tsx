import {
  Background,
  BackgroundVariant,
  type Connection,
  ConnectionMode,
  type NodeChange,
  ReactFlow,
  type ReactFlowProps,
  SelectionMode,
  useKeyPress,
  useReactFlow,
} from '@xyflow/react';
import { type DragEvent, type MouseEvent, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { setAgentView } from '@/agent';
import { cn } from '@/lib/cn';
import { closesMathPlusLoop, findLink } from '@/lib/links';
import type { AppNode } from '@/model/types';
import { nodeSpecs } from '@/nodes/catalog';
import { nodeTypes } from '@/nodes/nodeTypes';
import { dragHasPdf } from '@/nodes/pdf/drop';
import { useCanvasStore } from '@/store/canvasStore';
import { useUiStore } from '@/store/uiStore';
import { ContextMenu } from '@/ui/ContextMenu';
import { useClipboard } from './clipboard';
import { ALREADY_LINKED } from './links/actions';
import { edgeTypes } from './links/LinkEdge';
import { LinkPreview } from './links/LinkPreview';
import { LinkToolbar } from './links/LinkToolbar';
import { useProjection, useView } from './project';
import { GRID, withSnappedResize } from './snap';
import { useCanvasActions } from './useCanvasActions';
import { useContextMenu } from './useContextMenu';
import { useFitToMatches } from './useSearch';
import { useSections } from './useSections';
import { useShortcuts } from './useShortcuts';
import { useZoomTier } from './zoomTier';

const proOptions = { hideAttribution: true };
/** Diameter of a background dot. */
const DOT = 1.5;

/** Desktop: left-drag selects, middle/right-drag or Shift+scroll pans, scroll / pinch zooms. */
const editableProps: Partial<ReactFlowProps<AppNode>> = {
  selectionOnDrag: true,
  selectionMode: SelectionMode.Partial,
  panOnDrag: [1, 2],
  // Delete is handled in useShortcuts, so removing nodes and links is one undo step.
  deleteKeyCode: null,
  // Nodes only connect in linking mode (see below); the invisible handle on each would otherwise take every click.
  nodesConnectable: false,
  // Set explicitly: React Flow ignores an undefined prop, so linking mode's `false` would otherwise stick.
  nodesDraggable: true,
  multiSelectionKeyCode: 'Shift',
  snapToGrid: true,
  snapGrid: [GRID, GRID],
  // Arrow keys would otherwise nudge the selected nodes.
  disableKeyboardA11y: true,
};

/** Linking mode: dragging from a node to another links them, and nodes stay where they are. */
const linkingProps: Partial<ReactFlowProps<AppNode>> = {
  nodesConnectable: true,
  nodesDraggable: false,
  // A plain click would otherwise arm a hidden link that outlives linking mode.
  connectOnClick: false,
  connectionLineComponent: LinkPreview,
  isValidConnection: (c) => c.source !== c.target,
};

/** Mobile: look, don't touch. */
const readOnlyProps: Partial<ReactFlowProps<AppNode>> = {
  nodesDraggable: false,
  nodesConnectable: false,
  nodesFocusable: false,
  elementsSelectable: false,
  deleteKeyCode: null,
  selectionKeyCode: null,
  multiSelectionKeyCode: null,
  panOnDrag: true,
  zoomOnPinch: true,
};

/** Creates the link a drag ended on, or says why it was not made. */
function connect({ source, target }: Connection) {
  const { nodes, edges, linkNodes } = useCanvasStore.getState();
  const existing = findLink(edges, source, target);
  const loop = closesMathPlusLoop(nodes, edges, source, target);
  const id = linkNodes(source, target);
  if (existing) toast(ALREADY_LINKED);
  else if (id && loop)
    toast.warning(
      'This closes a Math+ loop. It is broken at the node earliest in reading order, whose link from the loop is ignored when calculating.',
    );
}

/** The open canvas. Remount (via `key`) when switching canvases so the stored viewport is applied. */
export function Canvas({ readOnly }: { readOnly: boolean }) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const theme = useUiStore((s) => s.theme);
  const linkingOn = useUiStore((s) => s.linking);
  const linking = linkingOn && !readOnly;
  const view = useView(nodes);
  useFitToMatches(view.matches);
  const { displayNodes, displayEdges } = useProjection(nodes, edges, view);
  const multipleSelected = useMemo(() => nodes.filter((n) => n.selected).length > 1, [nodes]);
  const sectionHandlers = useSections();
  const { onNodesChange: applyChanges } = sectionHandlers;
  const onNodesChange = useCallback(
    (changes: NodeChange<AppNode>[]) =>
      applyChanges(withSnappedResize(changes, useCanvasStore.getState().nodes)),
    [applyChanges],
  );
  const tier = useZoomTier();
  // Figma-style wheel: scroll zooms, holding Shift pans instead.
  const panningScroll = useKeyPress('Shift');
  const { addNode, dropPdfs } = useCanvasActions();
  const { screenToFlowPosition, fitView } = useReactFlow();

  useEffect(() => {
    setAgentView({
      fitNodes: (ids) =>
        void fitView({ nodes: ids.map((id) => ({ id })), duration: 400, padding: 0.3, maxZoom: 1.2 }),
    });
    return () => setAgentView(null);
  }, [fitView]);
  // The AI lock (or any other reason to go read-only) ends linking mode rather than pausing it.
  useEffect(() => {
    if (readOnly && linkingOn) useUiStore.getState().setLinking(false);
  }, [readOnly, linkingOn]);
  useShortcuts(readOnly);
  useClipboard(readOnly);
  const { menu, close: closeMenu } = useContextMenu(readOnly);

  const placeNode = (event: MouseEvent) => {
    const target = event.target as Element;
    if (readOnly || !target.classList.contains('react-flow__pane')) return;
    addNode(useUiStore.getState().tool, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };

  // Only kinds this browser supports take drops, so other browsers keep their default for dragged files.
  const pdfDroppable = (event: DragEvent) =>
    !readOnly && nodeSpecs.pdf.available?.() !== false && dragHasPdf(event.dataTransfer);
  const onDragOver = (event: DragEvent) => {
    if (!pdfDroppable(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (event: DragEvent) => {
    if (!pdfDroppable(event)) return;
    event.preventDefault();
    void dropPdfs(event.dataTransfer, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };

  return (
    <>
      <ReactFlow<AppNode>
        nodes={displayNodes}
        nodeTypes={nodeTypes}
        edges={displayEdges}
        edgeTypes={edgeTypes}
        onEdgesChange={onEdgesChange}
        connectionMode={ConnectionMode.Loose}
        edgesReconnectable={false}
        {...sectionHandlers}
        onNodesChange={onNodesChange}
        defaultViewport={useCanvasStore.getState().viewport}
        onMoveEnd={(_, viewport) => setViewport(viewport)}
        onDoubleClick={placeNode}
        onDragOver={onDragOver}
        onDrop={onDrop}
        zoomOnDoubleClick={false}
        zoomOnScroll={!panningScroll}
        panOnScroll={panningScroll}
        minZoom={0.1}
        maxZoom={4}
        colorMode={theme}
        proOptions={proOptions}
        onConnect={connect}
        onEdgeDoubleClick={readOnly ? undefined : (_, edge) => useUiStore.getState().renameLink(edge.id)}
        className={cn(readOnly && 'read-only', multipleSelected && 'multi-select', linking && 'linking')}
        data-zoom={tier}
        {...(readOnly ? readOnlyProps : linking ? { ...editableProps, ...linkingProps } : editableProps)}
      >
        {/* Offset so the dots sit on the grid lines that nodes snap to. */}
        {!readOnly && <LinkToolbar />}
        <Background variant={BackgroundVariant.Dots} gap={GRID} size={DOT} offset={(DOT - GRID) / 2} />
      </ReactFlow>
      <ContextMenu at={menu?.at ?? null} items={menu?.items ?? []} onClose={closeMenu} />
    </>
  );
}
