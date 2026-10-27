import { ChartSpline } from 'lucide-react';
import { z } from 'zod';
import { SECTION_COLORS } from '@/model/types';
import { colorField, type NodeSpec, titleField } from '../spec';

export const graphSpec: NodeSpec<'graph'> = {
  kind: 'graph',
  label: 'Graph',
  description: 'Plot functions and equations',
  icon: ChartSpline,
  placement: 'place',
  schema: z.object({
    equations: z.array(z.object({ latex: z.string(), color: z.enum(SECTION_COLORS) })),
    title: titleField,
    color: colorField,
  }),
  defaults: () => ({ equations: [{ latex: 'y=x^2', color: 'blue' }] }),
  size: { width: 380, height: 360 },
  searchText: (d) => d.equations.map((e) => e.latex).join(' '),
};
