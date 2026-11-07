import { z } from 'zod';
import { alias, resolveAlias } from '../aliases';
import { defineTool } from '../defineTool';
import { ToolError } from '../errors';
import { buildGuide } from '../guide';
import { getAgentView } from '../view';
import { currentGroups, groupHandleSchema, handleSchema, requireGroup, requireNode } from './shared';

export const getGuide = defineTool({
  name: 'get_guide',
  title: 'Guide',
  description:
    'How Unlined works: the node kinds and their fields, how to lay out a derivation, colour rules, coordinates, groups and a workflow. Read it once in each session.',
  input: z.object({}),
  readOnly: true,
  handler: () => ({ text: buildGuide(), summary: 'Read the guide' }),
});

export const focusNodes = defineTool({
  name: 'focus_nodes',
  title: 'Show nodes to the user',
  description:
    'Pan and zoom the view of the user to nodes or a group. Use it to show what you changed. It does not change the canvas.',
  input: z.object({ ids: z.array(handleSchema).max(200).optional(), group: groupHandleSchema.optional() }),
  readOnly: true,
  handler: ({ ids, group }) => {
    const targets = group
      ? requireGroup(group, currentGroups().groups).nodeIds
      : (ids ?? []).map((id) => requireNode(id).id);
    if (targets.length === 0) throw new ToolError('nothing_to_focus', 'Give ids or a group.');
    const view = getAgentView();
    if (!view) throw new ToolError('no_view', 'The canvas is not on the screen now.');
    view.fitNodes(targets.map(resolveAlias));
    return {
      text: 'Done.',
      summary: `Showed ${group ?? targets.map((id) => alias(id)).join(', ')}`,
      affectedNodeIds: targets,
    };
  },
});
