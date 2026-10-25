import type { LucideIcon } from 'lucide-react';
import { Tooltip } from 'radix-ui';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'ghost' | 'danger';
type Size = 'xs' | 'sm' | 'default';

const base =
  'inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap font-medium transition-all ease-spring motion-safe:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  // Danger is a quiet text action; it tints on hover.
  danger: 'text-danger hover:bg-danger/10',
};

const sizes: Record<Size, string> = {
  xs: 'h-7 gap-1 rounded-lg px-2 text-xs',
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-xs',
  default: 'gap-1.5 rounded-lg px-3 py-1.5 text-sm',
};

export function Button({
  variant = 'ghost',
  size = 'default',
  className,
  ...props
}: ComponentPropsWithRef<'button'> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}

export function WithTooltip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={6}
          className="pop z-50 rounded-lg bg-fg px-2 py-1 text-xs text-canvas shadow-md"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

interface IconButtonProps extends ComponentPropsWithRef<'button'> {
  icon: LucideIcon;
  label: string;
  /** Shown after the label in the tooltip, e.g. a keyboard shortcut. */
  hint?: string;
  active?: boolean;
  size?: 'sm' | 'md';
  /** Fully round instead of rounded-xl. */
  round?: boolean;
}

export function IconButton({
  icon: Icon,
  label,
  hint,
  active,
  size = 'md',
  round,
  className,
  ...props
}: IconButtonProps) {
  return (
    <WithTooltip label={hint ? `${label} · ${hint}` : label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        className={cn(
          'inline-flex cursor-pointer items-center justify-center transition-all ease-spring motion-safe:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
          round ? 'rounded-full' : 'rounded-xl',
          size === 'md' ? 'size-9' : 'size-7',
          active ? 'bg-accent text-accent-fg' : 'text-fg hover:bg-accent/10 hover:text-accent',
          className,
        )}
        {...props}
      >
        <Icon className={size === 'md' ? 'size-[18px]' : 'size-4'} />
      </button>
    </WithTooltip>
  );
}
