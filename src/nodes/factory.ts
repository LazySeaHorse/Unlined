import type { XYPosition } from '@xyflow/react';
import { type AppNode, isCard, type NodeDataMap, type NodeKind, type NodeOf } from '@/model/types';
import { nodeSpecs } from './catalog';

export const newId = (): string => crypto.randomUUID();

export function createNode<K extends NodeKind>(
  kind: K,
  position: XYPosition,
  data?: Partial<NodeDataMap[K]>,
  size?: { width: number; height: number },
): NodeOf<K> {
  const spec = nodeSpecs[kind];
  const dimensions = size ?? spec.size;
  return {
    id: newId(),
    type: kind,
    position,
    data: { ...spec.defaults(), ...data },
    ...dimensions,
  } as unknown as NodeOf<K>;
}

/** Copies nodes with fresh ids, shifted by `offset`. A copied stack holds the copies of its cards that came along. */
export function cloneNodes(nodes: AppNode[], offset: XYPosition): AppNode[] {
  const ids = new Map(nodes.map((n) => [n.id, newId()]));
  return nodes.map((node) => {
    const data = structuredClone(node.data);
    if (node.type === 'stack')
      (data as NodeDataMap['stack']).members = node.data.members.flatMap((id) => ids.get(id) ?? []);
    return {
      ...stripTransient(node),
      id: ids.get(node.id),
      position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
      data,
    } as AppNode;
  });
}

/** Drops React Flow's runtime-only fields so a node can be saved, exported, or diffed for undo. */
export function stripTransient(node: AppNode): AppNode {
  const { id, type, position, data, width, height } = node;
  return { id, type, position, data, ...(width && height ? { width, height } : {}) } as AppNode;
}

/** What search and the AI see of a node: its content, led by its title when it has one besides a section's. */
export function searchTextOf(node: AppNode): string {
  const spec = nodeSpecs[node.type] as { searchText: (d: AppNode['data']) => string };
  const text = spec.searchText(node.data);
  return isCard(node) && node.data.title ? `${node.data.title}\n${text}` : text;
}
