import type { NodeProps, NodeTypes } from '@xyflow/react';
import type { ComponentType } from 'react';
import { LinkHandle } from '@/canvas/links/LinkHandle';
import type { AppNode } from '@/model/types';
import { cardComponents } from './cards';
import { SectionNode } from './section/SectionNode';
import { StackNode } from './stack/StackNode';

const kinds = {
  ...cardComponents,
  section: SectionNode,
  stack: StackNode,
} satisfies Record<AppNode['type'], unknown>;

/**
 * Gives a node the connection point links need. It sits outside the lazy loader, so a node that is still
 * loading (or failed to) can already take part in a link.
 */
function withLinkHandle(Node: ComponentType<NodeProps>) {
  return function Linkable(props: NodeProps) {
    return (
      <>
        <Node {...props} />
        <LinkHandle connectable={props.isConnectable} />
      </>
    );
  };
}

export const nodeTypes = Object.fromEntries(
  (Object.entries(kinds) as [string, ComponentType<NodeProps>][]).map(([kind, Node]) => [
    kind,
    withLinkHandle(Node),
  ]),
) as NodeTypes;
