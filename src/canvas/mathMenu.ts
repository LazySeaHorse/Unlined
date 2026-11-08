import { Grid3x3, PaintBucket, Palette, SquareFunction } from 'lucide-react';
import type { MathfieldElement } from 'mathlive';
import { mathFieldOf } from '@/lib/math/fields';
import { type NodeOf, SECTION_COLORS } from '@/model/types';
import { afterRender } from '@/motion/motion';
import { useCanvasStore } from '@/store/canvasStore';
import type { MenuEntry } from '@/ui/Menu';

const titleCase = (word: string) => word[0].toUpperCase() + word.slice(1).replace('-', ' ');

/** Templates from MathLive's own Insert menu; `#?` is a placeholder the caret jumps between. */
const TEMPLATES: (MenuEntry | { label: string; latex: string })[] = [
  { label: 'Absolute value', latex: '|#?|' },
  { label: 'nth root', latex: '\\sqrt[#?]{#?}' },
  { label: 'Log base', latex: '\\log_{#?}{#?}' },
  { heading: 'Calculus' },
  { label: 'Derivative', latex: '\\dfrac{\\mathrm{d}}{\\mathrm{d}x}#?\\bigm|_{x=#?}' },
  { label: 'nth derivative', latex: '\\dfrac{\\mathrm{d}^#?}{\\mathrm{d}x^#?}#?\\bigm|_{x=#?}' },
  { label: 'Integral', latex: '\\int_#?^#?#?\\,\\mathrm{d}#?' },
  { label: 'Sum', latex: '\\sum_#?^#?#?' },
  { label: 'Product', latex: '\\prod_#?^#?#?' },
  { heading: 'Complex numbers' },
  { label: 'Modulus', latex: '\\lvert#?\\rvert' },
  { label: 'Argument', latex: '\\arg(#?)' },
  { label: 'Real part', latex: '\\Re(#?)' },
  { label: 'Imaginary part', latex: '\\Im(#?)' },
  { label: 'Conjugate', latex: '\\overline{#?}' },
];

/** The most rows or columns a matrix is inserted with. */
const MATRIX_MAX = 12;

/** MathLive's named text colours, with the swatches its own menu shows. The neutrals follow the theme (lib/math/ink.ts). */
const TEXT_COLORS = {
  red: '#d7170b',
  orange: '#fe8a2b',
  yellow: '#ffc02b',
  lime: '#63b215',
  green: '#21ba3a',
  teal: '#17cfcf',
  cyan: '#13a7ec',
  blue: '#0d80f2',
  indigo: '#63c',
  purple: '#a219e6',
  magenta: '#eb4799',
  black: 'var(--ink-black)',
  'dark-grey': 'var(--ink-dark-grey)',
  grey: 'var(--ink-grey)',
} as const;

const matrix = (rows: number, cols: number) =>
  `\\begin{pmatrix}${Array(rows).fill(Array(cols).fill('#?').join(' & ')).join('\\\\')}\\end{pmatrix}`;

/**
 * The editing part of MathLive's own context menu that works on our canvas, acting on the node's field:
 * insert a template or matrix, colour the selected math. Plus a background tint for the node itself.
 */
export function mathMenu(node: NodeOf<'math' | 'mathPlus'>): MenuEntry[] {
  const field = mathFieldOf(node.id);
  // The menu holds on to focus until it has closed; then the field gets it back, so the edit lands at the caret
  // and the user can carry on typing.
  const edit = (fn: (field: MathfieldElement) => void) => () => {
    if (!field) return;
    afterRender(() => {
      field.focus();
      fn(field);
    });
  };
  const background: MenuEntry = {
    label: 'Background',
    icon: PaintBucket,
    items: [
      {
        label: 'None',
        checked: !node.data.color,
        onSelect: () => useCanvasStore.getState().updateNodeData(node.id, { color: undefined }),
      },
      ...SECTION_COLORS.map((color) => ({
        label: titleCase(color),
        swatch: `var(--section-${color})`,
        checked: color === node.data.color,
        onSelect: () => useCanvasStore.getState().updateNodeData<'math'>(node.id, { color }),
      })),
    ],
  };
  if (!field || field.readOnly) return [background];

  return [
    {
      label: 'Insert',
      icon: SquareFunction,
      items: TEMPLATES.map((t) =>
        'latex' in t ? { label: t.label, onSelect: edit((f) => f.insert(t.latex, { focus: true })) } : t,
      ),
    },
    {
      label: 'Insert matrix',
      icon: Grid3x3,
      items: [
        {
          size: {
            max: { rows: MATRIX_MAX, columns: MATRIX_MAX },
            onPick: (rows, cols) =>
              edit((f) => f.insert(matrix(rows, cols), { selectionMode: 'item', focus: true }))(),
          },
        },
      ],
    },
    {
      label: 'Text colour',
      icon: Palette,
      items: Object.entries(TEXT_COLORS).map(([color, swatch]) => ({
        label: titleCase(color),
        swatch,
        checked: field.queryStyle({ color }) === 'all',
        // Toggle, as MathLive does: picking the current colour again clears it.
        onSelect: edit((f) => f.applyStyle({ color }, { operation: 'toggle' })),
      })),
    },
    background,
  ];
}
