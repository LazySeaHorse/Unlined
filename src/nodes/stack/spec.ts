import { Columns3, Layers, LayoutDashboard, type LucideIcon, Rows3 } from 'lucide-react';
import { z } from 'zod';
import { STACK_LAYOUTS, type StackLayout } from '@/model/types';
import type { NodeSpec } from '../spec';

export const stackSpec: NodeSpec<'stack'> = {
  kind: 'stack',
  label: 'Stack',
  description: 'Several nodes on one spot behind tabs, one shown at a time; made from the selection',
  icon: Layers,
  placement: 'wrap',
  schema: z.object({ members: z.array(z.string()), layout: z.enum(STACK_LAYOUTS).optional() }),
  defaults: () => ({ members: [] }),
  size: { width: 420, height: 320 },
  // Its cards are searched one by one.
  searchText: () => '',
};

/** The ways to pin a stack open, as its bar and its menu offer them. */
export const stackLayouts: { layout: StackLayout; label: string; icon: LucideIcon }[] = [
  { layout: 'row', label: 'Horizontal', icon: Columns3 },
  { layout: 'column', label: 'Vertical', icon: Rows3 },
  { layout: 'masonry', label: 'Masonry grid', icon: LayoutDashboard },
];
