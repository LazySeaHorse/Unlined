import { nodeRect } from '@/lib/nodeRect';
import { sectionContents, wrapBounds } from '@/lib/sections';
import { placedNodes } from '@/lib/stacks';
import { createNode } from '@/nodes/factory';
import { asUndoStep, useCanvasStore } from './canvasStore';
import { useUiStore } from './uiStore';

/** Wraps the selected nodes in a new section and opens its title for editing, as one undo step. */
export function wrapSelectionInSection(): void {
  const { nodes, addNodes } = useCanvasStore.getState();
  const selected = nodes.filter((n) => n.selected);
  if (selected.length === 0) return;
  const box = wrapBounds(selected.map(nodeRect));
  const section = createNode(
    'section',
    { x: box.x, y: box.y },
    { title: 'Section' },
    { width: box.width, height: box.height },
  );
  asUndoStep(() => addNodes([section]));
  useUiStore.getState().renameSection(section.id);
}

/** Deletes a section together with the nodes inside it, as one undo step. */
export function deleteSectionWithContents(id: string): void {
  const { nodes, deleteNodes } = useCanvasStore.getState();
  const section = nodes.find((n) => n.id === id);
  if (!section) return;
  deleteNodes([id, ...sectionContents(nodeRect(section), placedNodes(nodes).map(nodeRect))]);
}
