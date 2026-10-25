import { Layers } from 'lucide-react';
import { z } from 'zod';
import type { NodeSpec } from '../spec';

export const stackSpec: NodeSpec<'stack'> = {
  kind: 'stack',
  label: 'Stack',
  description: 'Several nodes on one spot behind tabs, one shown at a time; made from the selection',
  icon: Layers,
  placement: 'wrap',
  schema: z.object({ members: z.array(z.string()) }),
  defaults: () => ({ members: [] }),
  size: { width: 420, height: 320 },
  // Its cards are searched one by one.
  searchText: () => '',
};
