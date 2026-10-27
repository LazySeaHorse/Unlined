import { Check } from 'lucide-react';
import { SECTION_COLORS, type SectionColor } from '@/model/types';

export const swatch = (color: SectionColor) => `var(--section-${color})`;
export const linkSwatch = (color: SectionColor) => `var(--link-${color})`;

/**
 * A row of colour buttons. With `onClear`, a plain swatch first restores the default.
 * Pressing a swatch keeps focus where it was, so a title being typed stays in its field.
 * `links` shows the stronger colours links are drawn in, and the clear swatch as their automatic grey.
 */
export function ColorSwatches({
  value,
  onChange,
  onClear,
  links,
}: {
  value?: SectionColor;
  onChange: (color: SectionColor) => void;
  onClear?: () => void;
  links?: boolean;
}) {
  const fill = links ? linkSwatch : swatch;
  const button = 'flex size-6 cursor-pointer items-center justify-center rounded-full border border-fg/20';
  const check = <Check className="size-3.5 text-slate-900/70" />;
  return (
    <div className="flex gap-1.5">
      {onClear && (
        <button
          type="button"
          aria-label={links ? 'Auto' : 'Default'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClear}
          className={`${button} ${links ? '' : 'bg-surface'}`}
          style={links ? { backgroundColor: 'var(--link-auto)' } : undefined}
        >
          {!value && <Check className={links ? 'size-3.5 text-white' : 'size-3.5 text-fg/70'} />}
        </button>
      )}
      {SECTION_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={color}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(color)}
          className={button}
          style={{ backgroundColor: fill(color) }}
        >
          {color === value && check}
        </button>
      ))}
    </div>
  );
}
